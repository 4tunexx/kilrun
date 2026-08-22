/**
 * Shared platformer collision + movement core — the ONE implementation of
 * pad support, solid push-out, ledge assist, ground glue, and the Foundry
 * movement tick (wish-speed, jump, slide, flip, wall-jump, fall damage).
 *
 * The authoritative server (`server/src/sim/movement.ts`) and the client
 * predictor / Play Test (`src/lib/platformer-sim.ts`) are thin adapters that
 * map their state containers onto these types and call `stepSim`. Collision
 * helpers stay here too so neither side can disagree about where the ground is.
 *
 * Structural typing is deliberate: `CorePad` / `CoreGameplayPad` are read-only
 * surfaces satisfied by both the Colyseus `PlatformState` schema instance and
 * the plain `SimPad` object literal, so neither side has to convert or copy
 * pads per tick.
 *
 * Tunables live in `shared/sim-constants.ts`.
 */

import type { CustomMoveDef } from './custom-moves.js';
import {
  APEX_GRAVITY_MULT,
  APEX_VZ_THRESHOLD,
  COLLISION_SKIN,
  COYOTE_TIME_MS,
  CROUCH_SPEED_MULTIPLIER,
  DOUBLE_JUMP_VELOCITY,
  ENERGY_DRAIN_RATE,
  ENERGY_EXHAUSTED_SPEED_MULT,
  ENERGY_EXHAUSTED_THRESHOLD,
  ENERGY_REGEN_RATE,
  FALL_DAMAGE_PER_MS,
  FALL_DAMAGE_SPEED,
  FLIP_COOLDOWN_MS,
  FLIP_DURATION_MS,
  FLIP_ENERGY_COST,
  FLIP_PUSH_SPEED,
  FLIP_VELOCITY,
  GRAVITY,
  GROUND_FOLLOW_SPEED,
  JUMP_BUFFER_MS,
  JUMP_CUT_MULTIPLIER,
  JUMP_ENERGY_COST,
  JUMP_PAD_BOOST,
  JUMP_VELOCITY,
  LAND_SNAP_FAST,
  LAND_SNAP_SLOW,
  LAND_STEP_CLIMB,
  LAND_STEP_DESCEND,
  LEDGE_ASSIST,
  MAX_ENERGY,
  MAX_FALL_SPEED,
  MAX_GROUND_SPEED,
  MELEE_MOVE_MULT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SLIDE_COOLDOWN_MS,
  SLIDE_DURATION_MS,
  SLIDE_ENERGY_COST,
  SLIDE_HOLD_COAST_MS,
  SLIDE_HOLD_SNAP_AFTER_MS,
  SPRINT_MULTIPLIER,
  WALL_JUMP_ENABLED_DEFAULT,
  WALL_JUMP_HORIZ_VEL,
  WALL_JUMP_LOCKOUT_MS,
  WALL_JUMP_SAME_WALL_COOLDOWN_MS,
  WALL_JUMP_VERT_VEL,
  WALL_SLIDE_GRAV_MULT,
} from './sim-constants.js';

/** Minimum pad surface both `SimPad` and `PlatformState` satisfy. */
export interface CorePad {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Vertical thickness below the top face. Falsy/0 is treated as 0.2. */
  height?: number;
  /** Analytic ramp slope, dz per unit of PAD-LOCAL x/y (see padTopZAt). */
  slopeGradX?: number;
  slopeGradY?: number;
  /** Yaw in radians (sim XY plane) — enables OBB support and side collision. */
  rotYaw?: number;
  /** Walk-over pad (floor, tread, jump pad, ice/conveyor/sand): never blocks sideways. */
  topOnly?: boolean;
  /** Button-wired door: passes straight through while open. */
  doorControlled?: boolean;
  open?: boolean;
}

export interface CoreSupportHit<T> {
  pad: T;
  topZ: number;
}

export interface CoreSolidResult {
  x: number;
  y: number;
  z: number;
  touchingWall: boolean;
  wallNormalX: number;
  wallNormalY: number;
}

/** A door that is currently open must not support or block the player. */
export function padBlocksMovement(pad: CorePad): boolean {
  return !(pad.doorControlled && pad.open);
}

/** Effective vertical thickness of a pad's solid body. */
export function padBoxHeight(pad: CorePad): number {
  return pad.height && pad.height > 0 ? pad.height : 0.2;
}

/** World XY -> pad-local XY (rotYaw around the Z-up sim axis). */
export function toPadLocal(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rotYaw: number
): { lx: number; ly: number } {
  const dx = x - cx;
  const dy = y - cy;
  if (!rotYaw) return { lx: dx, ly: dy };
  const c = Math.cos(-rotYaw);
  const s = Math.sin(-rotYaw);
  return { lx: dx * c - dy * s, ly: dx * s + dy * c };
}

/** Pad-local XY -> world XY. */
export function fromPadLocal(
  lx: number,
  ly: number,
  cx: number,
  cy: number,
  rotYaw: number
): { x: number; y: number } {
  if (!rotYaw) return { x: cx + lx, y: cy + ly };
  const c = Math.cos(rotYaw);
  const s = Math.sin(rotYaw);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

/**
 * Standing height on a (possibly sloped, possibly rotated) pad.
 *
 * The slope gradients are defined in the pad's LOCAL frame, so they must be
 * applied to local offsets. Feeding world-space deltas here instead silently
 * produces the right answer only while rotYaw is 0 — which is why a rotated
 * ramp used to put the client a full meter off the server's answer.
 */
export function padTopZAt(pad: CorePad, x: number, y: number): number {
  const gradX = pad.slopeGradX || 0;
  const gradY = pad.slopeGradY || 0;
  if (!gradX && !gradY) return pad.z;
  const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, pad.rotYaw || 0);
  return pad.z + gradX * lx + gradY * ly;
}

/**
 * Highest pad at or under the feet, else the lowest overlapping step we could
 * climb onto. Preferring "at/under feet" avoids the ramp hop you get from a
 * plain highest-wins search, while the climb fallback stops a lower pad from
 * capturing the player forever.
 */
export function findSupportPad<T extends CorePad>(
  x: number,
  y: number,
  z: number,
  pads: Iterable<T>,
  radius: number = PLAYER_RADIUS,
  maxSnapDown: number = LAND_SNAP_SLOW
): CoreSupportHit<T> | null {
  let bestBelow: CoreSupportHit<T> | null = null;
  let bestClimb: CoreSupportHit<T> | null = null;
  for (const pad of pads) {
    if (!padBlocksMovement(pad)) continue;
    const halfW = pad.width / 2;
    const halfD = pad.depth / 2;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, pad.rotYaw || 0);
    if (lx < -halfW - radius || lx > halfW + radius) continue;
    if (ly < -halfD - radius || ly > halfD + radius) continue;
    const topZ = pad.z + (pad.slopeGradX || 0) * lx + (pad.slopeGradY || 0) * ly;
    if (z < topZ - maxSnapDown || z > topZ + 0.55) continue;
    if (topZ <= z + 0.05) {
      if (!bestBelow || topZ > bestBelow.topZ) bestBelow = { pad, topZ };
    } else if (!bestClimb || topZ < bestClimb.topZ) {
      bestClimb = { pad, topZ };
    }
  }
  return bestBelow ?? bestClimb;
}

/**
 * Pull the feet back onto a pad when barely off the rim (ledge forgiveness).
 * Intentionally uses the world-axis footprint rather than the OBB — this is a
 * forgiveness nudge, not a collision result.
 */
export function tryLedgeAssistPads<T extends CorePad>(
  x: number,
  y: number,
  z: number,
  pads: Iterable<T>
): { x: number; y: number } | null {
  for (const pad of pads) {
    if (!padBlocksMovement(pad)) continue;
    const topZ = pad.z;
    if (z < topZ - LAND_SNAP_SLOW || z > topZ + 0.55) continue;
    const halfW = pad.width / 2;
    const halfD = pad.depth / 2;
    const ox = Math.max(0, Math.abs(x - pad.x) - halfW);
    const oy = Math.max(0, Math.abs(y - pad.y) - halfD);
    if (ox > LEDGE_ASSIST || oy > LEDGE_ASSIST) continue;
    if (ox <= 0 && oy <= 0) continue;
    return {
      x: clampCore(x, pad.x - halfW + 0.04, pad.x + halfW - 0.04),
      y: clampCore(y, pad.y - halfD + 0.04, pad.y + halfD - 0.04),
    };
  }
  return null;
}

/**
 * Push the player out of tall solid volumes and report the last wall normal
 * touched (for wall slide / wall jump).
 *
 * Short solids the player's feet are already near get stepped onto instead of
 * blocking. Raising z here rather than leaving it to findSupportPad matters:
 * that function prefers whatever is already under the feet, so a step sitting
 * on a floor would otherwise keep resolving to the floor and the player would
 * walk through the step's body at floor height.
 */
export function resolveSolidPads<T extends CorePad>(
  pos: { x: number; y: number; z: number },
  pads: Iterable<T>,
  radius: number = PLAYER_RADIUS,
  height: number = PLAYER_HEIGHT,
  isGrounded = false
): CoreSolidResult {
  let { x, y } = pos;
  let z = pos.z;
  let touchingWall = false;
  let wallNormalX = 0;
  let wallNormalY = 0;

  for (const pad of pads) {
    if (!padBlocksMovement(pad)) continue;
    if (pad.topOnly) continue;
    const boxH = padBoxHeight(pad);
    const topZ = pad.z;
    const bottomZ = topZ - boxH;

    const halfW = pad.width / 2 + radius;
    const halfD = pad.depth / 2 + radius;
    const yaw = pad.rotYaw || 0;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, yaw);
    if (Math.abs(lx) >= halfW || Math.abs(ly) >= halfD) continue;

    if (isGrounded && boxH <= LAND_STEP_CLIMB && z >= topZ - LAND_STEP_CLIMB) {
      if (z < topZ) z = topZ;
      continue;
    }

    const playerBottom = z;
    const playerTop = z + height;
    if (playerTop <= bottomZ + COLLISION_SKIN || playerBottom >= topZ - COLLISION_SKIN) {
      continue;
    }

    const pushX = halfW - Math.abs(lx);
    const pushY = halfD - Math.abs(ly);
    touchingWall = true;
    let outLx = lx;
    let outLy = ly;
    let nLx = 0;
    let nLy = 0;
    if (pushX < pushY) {
      const sign = Math.sign(lx || 1);
      outLx = sign * halfW;
      nLx = sign;
    } else {
      const sign = Math.sign(ly || 1);
      outLy = sign * halfD;
      nLy = sign;
    }
    const world = fromPadLocal(outLx, outLy, pad.x, pad.y, yaw);
    x = world.x;
    y = world.y;
    const nWorld = fromPadLocal(nLx, nLy, 0, 0, yaw);
    wallNormalX = nWorld.x;
    wallNormalY = nWorld.y;
  }

  return { x, y, z, touchingWall, wallNormalX, wallNormalY };
}

/**
 * When ascending (the Fly power — nothing else moves `z` freely upward),
 * stop the player's head just below the underside of any solid pad overhead
 * instead of passing straight through it. Same box test `resolveSolidPads`
 * uses, resolved vertically (clamp z) instead of horizontally (push x/y).
 */
export function clampAscendingZ<T extends CorePad>(
  x: number,
  y: number,
  fromZ: number,
  toZ: number,
  pads: Iterable<T>,
  radius: number = PLAYER_RADIUS,
  height: number = PLAYER_HEIGHT
): number {
  if (toZ <= fromZ) return toZ;
  let clamped = toZ;
  for (const pad of pads) {
    if (!padBlocksMovement(pad) || pad.topOnly) continue;
    const bottomZ = pad.z - padBoxHeight(pad);
    if (bottomZ <= fromZ + height) continue; // no headroom to protect at the start
    const halfW = pad.width / 2 + radius;
    const halfD = pad.depth / 2 + radius;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, pad.rotYaw || 0);
    if (Math.abs(lx) >= halfW || Math.abs(ly) >= halfD) continue;
    if (bottomZ < clamped + height) {
      clamped = Math.min(clamped, bottomZ - height - COLLISION_SKIN);
    }
  }
  return Math.max(fromZ, clamped);
}

/**
 * Rate-limited vertical stick to a support top.
 *
 * Stepped ramp pads change topZ by small amounts per cell; hard-assigning z
 * every tick reads as a bumpy road once the camera amplifies it. Fresh
 * landings are allowed a bigger correction than continuous ground following.
 */
export function glueToSupport(
  body: { z: number; vz: number },
  supportTopZ: number,
  dtSeconds: number,
  freshLanding: boolean
): void {
  const delta = supportTopZ - body.z;
  if (freshLanding) {
    if (delta > 0) body.z += Math.min(delta, LAND_STEP_CLIMB);
    else if (delta < 0) body.z += Math.max(delta, -LAND_STEP_DESCEND);
    else body.z = supportTopZ;
  } else {
    const maxStep = Math.max(GROUND_FOLLOW_SPEED * Math.max(dtSeconds, 1 / 240), 0.002);
    if (Math.abs(delta) <= 0.0015) {
      body.z = supportTopZ;
    } else if (delta > 0) {
      body.z += Math.min(delta, Math.min(maxStep, LAND_STEP_CLIMB));
    } else {
      body.z += Math.max(delta, -Math.min(maxStep, LAND_STEP_DESCEND));
    }
  }
  body.vz = 0;
}

function clampCore(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

/** Gameplay fields both SimPad and PlatformState carry on top of CorePad. */
export interface CoreGameplayPad extends CorePad {
  kind?: string;
  boost?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
  id?: string;
  entityId?: string;
}

export interface CoreBody {
  x: number;
  y: number;
  z: number;
  vz: number;
  isGrounded: boolean;
  energy: number;
}

export interface CoreScratch {
  velX: number;
  velY: number;
  coyoteMs: number;
  jumpBufferMs: number;
  wasJumpHeld: boolean;
  exhausted: boolean;
  jumpCount: number;
  touchingWallX: number;
  touchingWallY: number;
  wallJumpLockoutMs: number;
  wallJumpCooldownMs: number;
  wallJumpCooldownNormalX: number;
  wallJumpCooldownNormalY: number;
  supportPadId: string | null;
  slideMs: number;
  slideCooldownMs: number;
  slideHeldMs: number;
  wasCrouchHeld: boolean;
  wasSlideKeyHeld: boolean;
  flipMs: number;
  flipCooldownMs: number;
  wasFlipHeld: boolean;
  flipLockoutMs: number;
  customMoveWasHeld: Map<string, boolean>;
  customMoveActiveId: string;
  customMoveActiveUntil: number;
  customMoveCooldownEndsAt: Map<string, number>;
  extraAirJumps: number;
  minAirVz: number;
  fallDamageThisTick: number;
  slowUntil: number;
  slideCooldownEndsAt: number;
  flipCooldownEndsAt: number;
}

export interface CoreInput {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
  meleeActive?: boolean;
  flipPressed?: boolean;
  slidePressed?: boolean;
  customMoveKeysHeld?: string[];
  cameraYaw?: number;
}

export interface CoreBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CorePhysOpts {
  gravity?: number;
  jumpVelocity?: number;
  doubleJumpVelocity?: number;
  doubleJumpEnabled?: boolean;
  jumpCutMult?: number;
  coyoteMs?: number;
  jumpBufferMs?: number;
  walkSpeed?: number;
  sprintMult?: number;
  crouchMult?: number;
  maxFallSpeed?: number;
  apexGravMult?: number;
  slideEnabled?: boolean;
  slideMult?: number;
  slideDurationMs?: number;
  slideCooldownMs?: number;
  wallJumpEnabled?: boolean;
  wallJumpHorizVel?: number;
  wallJumpVertVel?: number;
  wallSlideGravMult?: number;
  customMoves?: CustomMoveDef[];
  fallDamageReduction?: number;
  maxEnergy?: number;
  nowMs?: number;
  slowUntil?: number;
  /** Server fly power: skip glue, steer Z from jump/crouch, keep XY. */
  flyActive?: boolean;
  /** Below this Z, vertical velocity is killed (void). */
  voidZ?: number;
  /** Server custom-move unlock gate. Default: allow. */
  canTriggerCustomMove?: (move: CustomMoveDef) => boolean;
}

export function createCoreScratch(): CoreScratch {
  return {
    velX: 0,
    velY: 0,
    coyoteMs: 0,
    jumpBufferMs: 0,
    wasJumpHeld: false,
    exhausted: false,
    jumpCount: 0,
    touchingWallX: 0,
    touchingWallY: 0,
    wallJumpLockoutMs: 0,
    wallJumpCooldownMs: 0,
    wallJumpCooldownNormalX: 0,
    wallJumpCooldownNormalY: 0,
    supportPadId: null,
    slideMs: 0,
    slideCooldownMs: 0,
    slideHeldMs: 0,
    wasCrouchHeld: false,
    wasSlideKeyHeld: false,
    flipMs: 0,
    flipCooldownMs: 0,
    wasFlipHeld: false,
    flipLockoutMs: 0,
    customMoveWasHeld: new Map(),
    customMoveActiveId: '',
    customMoveActiveUntil: 0,
    customMoveCooldownEndsAt: new Map(),
    extraAirJumps: 0,
    minAirVz: 0,
    fallDamageThisTick: 0,
    slowUntil: 0,
    slideCooldownEndsAt: 0,
    flipCooldownEndsAt: 0,
  };
}

function padIdOf(pad: CoreGameplayPad): string | null {
  return pad.id || pad.entityId || null;
}

function jumpPadBoostOf(pad: CoreGameplayPad): number {
  return pad.boost && pad.boost > 0 ? pad.boost : JUMP_PAD_BOOST;
}

/**
 * One Foundry-style platformer tick. Mutates `body` and `scratch` in place.
 *
 * Callers that own a different state container (Colyseus PlayerState, Play
 * Test SimBody) map onto these types and call this. Do not fork the physics
 * here — that is how Play Test drifted from live matches.
 */
export function stepSim(
  body: CoreBody,
  input: CoreInput,
  dt: number,
  pads: Iterable<CoreGameplayPad>,
  scratch: CoreScratch,
  bounds: CoreBounds,
  physOpts?: CorePhysOpts
): CoreBody {
  const GRAVITY_EFF = physOpts?.gravity ?? GRAVITY;
  const APEX_GRAV_MULT = physOpts?.apexGravMult ?? APEX_GRAVITY_MULT;
  const JUMP_VEL = physOpts?.jumpVelocity ?? JUMP_VELOCITY;
  const DOUBLE_JUMP_VEL = physOpts?.doubleJumpVelocity ?? DOUBLE_JUMP_VELOCITY;
  const JUMP_CUT = physOpts?.jumpCutMult ?? JUMP_CUT_MULTIPLIER;
  const COYOTE_MS = physOpts?.coyoteMs ?? COYOTE_TIME_MS;
  const JUMP_BUFFER = physOpts?.jumpBufferMs ?? JUMP_BUFFER_MS;
  const WALK_SPEED = physOpts?.walkSpeed ?? MAX_GROUND_SPEED;
  const SPRINT_MULT = physOpts?.sprintMult ?? SPRINT_MULTIPLIER;
  const MAX_FALL = physOpts?.maxFallSpeed ?? MAX_FALL_SPEED;
  const CROUCH_MULT = physOpts?.crouchMult ?? CROUCH_SPEED_MULTIPLIER;
  const doubleJumpEnabled = physOpts?.doubleJumpEnabled ?? true;
  const energyCap = physOpts?.maxEnergy ?? MAX_ENERGY;
  const nowMs = physOpts?.nowMs ?? Date.now();
  const slowUntil = physOpts?.slowUntil ?? scratch.slowUntil;
  const flyActive = !!physOpts?.flyActive;

  let wishX = input.moveX;
  let wishY = input.moveY;
  const wishMag = Math.hypot(wishX, wishY);
  if (wishMag > 1) {
    wishX /= wishMag;
    wishY /= wishMag;
  }

  let maxSpeed = WALK_SPEED;
  if (input.crouch) maxSpeed *= CROUCH_MULT;
  if (input.meleeActive) maxSpeed *= MELEE_MOVE_MULT;
  const wantsSprint = input.sprint && !input.crouch && wishMag > 0.2 && !scratch.exhausted;
  if (wantsSprint && body.energy > 0) {
    body.energy = Math.max(0, body.energy - ENERGY_DRAIN_RATE * dt);
    maxSpeed *= SPRINT_MULT;
    if (body.energy <= 0) scratch.exhausted = true;
  } else {
    body.energy = Math.min(energyCap, body.energy + ENERGY_REGEN_RATE * dt);
    if (body.energy >= ENERGY_EXHAUSTED_THRESHOLD) scratch.exhausted = false;
  }
  if (scratch.exhausted) maxSpeed *= ENERGY_EXHAUSTED_SPEED_MULT;
  if (slowUntil > nowMs) maxSpeed *= 0.5;

  const wasGroundedLastTick = body.isGrounded;
  let support = findSupportPad(
    body.x,
    body.y,
    body.z,
    pads,
    PLAYER_RADIUS,
    wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
  );
  if (!support && wasGroundedLastTick && body.vz >= -0.5) {
    support = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_CLIMB);
  }
  if (!support) {
    const nudged = tryLedgeAssistPads(body.x, body.y, body.z, pads);
    if (nudged) {
      body.x = nudged.x;
      body.y = nudged.y;
      support = findSupportPad(
        body.x,
        body.y,
        body.z,
        pads,
        PLAYER_RADIUS,
        wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
      );
      if (!support && wasGroundedLastTick && body.vz >= -0.5) {
        support = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_CLIMB);
      }
    }
  }

  let grounded = !!support && body.vz <= 0.2;
  body.isGrounded = grounded;

  const SLIDE_ENABLED = physOpts?.slideEnabled ?? true;
  const SLIDE_MULT = physOpts?.slideMult ?? 2.2;
  const slideDurationMs = physOpts?.slideDurationMs ?? SLIDE_DURATION_MS;
  const slideCooldownMs = physOpts?.slideCooldownMs ?? SLIDE_COOLDOWN_MS;
  const crouchKeyEdge = !!input.crouch && !scratch.wasCrouchHeld;
  scratch.wasCrouchHeld = !!input.crouch;
  const slideKeyEdge = !!input.slidePressed && !scratch.wasSlideKeyHeld;
  scratch.wasSlideKeyHeld = !!input.slidePressed;
  const slideTriggered = slideKeyEdge || (crouchKeyEdge && input.sprint);
  const holdingSlide = !!(input.slidePressed || input.crouch);
  const slideCancel =
    scratch.slideMs > 0 &&
    (input.jumpPressed ||
      ((input.flipPressed ?? false) && !scratch.wasFlipHeld) ||
      wishMag < 0.15 ||
      scratch.exhausted);
  if (slideCancel) {
    scratch.slideMs = 0;
    scratch.slideHeldMs = 0;
    scratch.slideCooldownMs = slideCooldownMs;
    scratch.slideCooldownEndsAt = nowMs + slideCooldownMs;
  } else if (
    SLIDE_ENABLED &&
    slideTriggered &&
    grounded &&
    wishMag > 0.2 &&
    !scratch.exhausted &&
    scratch.slideMs <= 0 &&
    scratch.slideCooldownMs <= 0 &&
    body.energy >= SLIDE_ENERGY_COST
  ) {
    scratch.slideMs = slideDurationMs;
    scratch.slideHeldMs = 0;
    body.energy = Math.max(0, body.energy - SLIDE_ENERGY_COST);
  }
  if (scratch.slideMs > 0) {
    maxSpeed = WALK_SPEED * SLIDE_MULT;
    if (holdingSlide) {
      scratch.slideHeldMs += dt * 1000;
    } else {
      if (scratch.slideHeldMs > SLIDE_HOLD_SNAP_AFTER_MS) {
        scratch.slideMs = Math.min(scratch.slideMs, SLIDE_HOLD_COAST_MS);
      }
      scratch.slideHeldMs = 0;
      scratch.slideMs = Math.max(0, scratch.slideMs - dt * 1000);
      if (scratch.slideMs <= 0) {
        scratch.slideCooldownMs = slideCooldownMs;
        scratch.slideCooldownEndsAt = nowMs + slideCooldownMs;
      }
    }
  } else if (scratch.slideCooldownMs > 0) {
    scratch.slideHeldMs = 0;
    scratch.slideCooldownMs = Math.max(0, scratch.slideCooldownMs - dt * 1000);
  }

  const flipEdge = (input.flipPressed ?? false) && !scratch.wasFlipHeld;
  scratch.wasFlipHeld = input.flipPressed ?? false;
  if (
    flipEdge &&
    grounded &&
    !scratch.exhausted &&
    scratch.flipMs <= 0 &&
    scratch.flipCooldownMs <= 0 &&
    body.energy >= FLIP_ENERGY_COST
  ) {
    scratch.flipMs = FLIP_DURATION_MS;
    body.energy = Math.max(0, body.energy - FLIP_ENERGY_COST);
    body.vz = FLIP_VELOCITY;
    body.isGrounded = false;
    grounded = false;
    const camYaw = input.cameraYaw ?? 0;
    scratch.velX = -Math.cos(camYaw) * FLIP_PUSH_SPEED;
    scratch.velY = -Math.sin(camYaw) * FLIP_PUSH_SPEED;
    scratch.flipLockoutMs = FLIP_DURATION_MS;
  }
  if (scratch.flipMs > 0) {
    scratch.flipMs = Math.max(0, scratch.flipMs - dt * 1000);
    if (scratch.flipMs <= 0) {
      scratch.flipCooldownMs = FLIP_COOLDOWN_MS;
      scratch.flipCooldownEndsAt = nowMs + FLIP_COOLDOWN_MS;
    }
  } else if (scratch.flipCooldownMs > 0) {
    scratch.flipCooldownMs = Math.max(0, scratch.flipCooldownMs - dt * 1000);
  }

  if (physOpts?.customMoves?.length) {
    const heldKeys = new Set(input.customMoveKeysHeld ?? []);
    const busy = nowMs < scratch.customMoveActiveUntil;
    for (const move of physOpts.customMoves) {
      const wasHeld = scratch.customMoveWasHeld.get(move.id) ?? false;
      const isHeld = heldKeys.has(move.id);
      scratch.customMoveWasHeld.set(move.id, isHeld);
      const edge = isHeld && !wasHeld;
      const cooldownUntil = scratch.customMoveCooldownEndsAt.get(move.id) ?? 0;
      const unlocked =
        !edge || !physOpts.canTriggerCustomMove || physOpts.canTriggerCustomMove(move);
      if (
        edge &&
        unlocked &&
        !busy &&
        nowMs >= cooldownUntil &&
        (!move.groundedOnly || grounded) &&
        !scratch.exhausted &&
        body.energy >= move.energyCost
      ) {
        scratch.customMoveActiveId = move.id;
        scratch.customMoveActiveUntil = nowMs + move.durationMs;
        scratch.customMoveCooldownEndsAt.set(move.id, nowMs + move.durationMs + move.cooldownMs);
        body.energy = Math.max(0, body.energy - move.energyCost);
        if (move.vzBoost && grounded) {
          body.vz = move.vzBoost;
          body.isGrounded = false;
          grounded = false;
        }
        break;
      }
    }
    if (nowMs >= scratch.customMoveActiveUntil) scratch.customMoveActiveId = '';
  }

  if (flyActive) {
    body.isGrounded = false;
    body.vz = 0;
    const flyDz = (input.jumpPressed ? 1.4 : input.crouch ? -1.4 : 0) * dt;
    // Ascending flies straight into platform undersides with no check
    // otherwise — clamp so the player's head stops at the ceiling instead
    // of clipping through it. Descending is unaffected (findSupportPad
    // above already catches landing on something).
    body.z =
      flyDz > 0 ? clampAscendingZ(body.x, body.y, body.z, body.z + flyDz, pads) : body.z + flyDz;
    scratch.coyoteMs = 0;
    scratch.jumpCount = 0;
    scratch.jumpBufferMs = 0;
  } else if (grounded && support) {
    glueToSupport(body, support.topZ, dt, !wasGroundedLastTick);
    scratch.coyoteMs = COYOTE_MS;
    scratch.jumpCount = 0;
  } else {
    if (scratch.jumpCount === 0 && scratch.coyoteMs <= 0) {
      scratch.jumpCount = 1;
    }
    scratch.coyoteMs = Math.max(0, scratch.coyoteMs - dt * 1000);
  }

  if (grounded && support?.pad.kind === 'jumpPad') {
    body.vz = jumpPadBoostOf(support.pad);
    body.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    scratch.jumpCount = 1;
  }

  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  const jumpReleased = !input.jumpPressed && scratch.wasJumpHeld;
  if (jumpReleased && body.vz > 0 && scratch.jumpCount === 1) {
    body.vz *= JUMP_CUT;
    scratch.coyoteMs = 0;
  }
  scratch.wasJumpHeld = input.jumpPressed;

  const wallJumpEnabled = physOpts?.wallJumpEnabled ?? WALL_JUMP_ENABLED_DEFAULT;
  const wallJumpHorizVel = physOpts?.wallJumpHorizVel ?? WALL_JUMP_HORIZ_VEL;
  const wallJumpVertVel = physOpts?.wallJumpVertVel ?? WALL_JUMP_VERT_VEL;
  const wallSlideGravMult = physOpts?.wallSlideGravMult ?? WALL_SLIDE_GRAV_MULT;
  const wasTouchingWall = scratch.touchingWallX !== 0 || scratch.touchingWallY !== 0;
  const onCooldownWall =
    scratch.wallJumpCooldownMs > 0 &&
    scratch.wallJumpCooldownNormalX === scratch.touchingWallX &&
    scratch.wallJumpCooldownNormalY === scratch.touchingWallY;
  // Same energy gate as double-jump — unguarded, wall-jump had no stamina
  // cost at all, so alternating between two nearby walls (each on its own
  // cooldown) was a free, unlimited-height climb regardless of the energy
  // system every other form of extra verticality is balanced around.
  const canWallJump =
    wallJumpEnabled &&
    !grounded &&
    wasTouchingWall &&
    !onCooldownWall &&
    body.energy >= JUMP_ENERGY_COST * 0.2;

  if (jumpEdge) {
    if (canWallJump) {
      body.vz = wallJumpVertVel;
      scratch.velX = scratch.touchingWallX * wallJumpHorizVel;
      scratch.velY = scratch.touchingWallY * wallJumpHorizVel;
      scratch.wallJumpLockoutMs = WALL_JUMP_LOCKOUT_MS;
      scratch.wallJumpCooldownMs = WALL_JUMP_SAME_WALL_COOLDOWN_MS;
      scratch.wallJumpCooldownNormalX = scratch.touchingWallX;
      scratch.wallJumpCooldownNormalY = scratch.touchingWallY;
      body.isGrounded = false;
      grounded = false;
      scratch.coyoteMs = 0;
      scratch.jumpBufferMs = 0;
      scratch.jumpCount = 1;
      body.energy = Math.max(0, body.energy - JUMP_ENERGY_COST);
    } else if (scratch.jumpCount === 0 || scratch.jumpCount === 2) {
      if (!grounded && (scratch.extraAirJumps || 0) > 0 && body.energy >= JUMP_ENERGY_COST * 0.2) {
        scratch.extraAirJumps -= 1;
        body.vz = DOUBLE_JUMP_VEL;
        body.isGrounded = false;
        grounded = false;
        scratch.coyoteMs = 0;
        scratch.jumpCount = 2;
        body.energy = Math.max(0, body.energy - JUMP_ENERGY_COST);
      } else {
        scratch.jumpBufferMs = JUMP_BUFFER;
      }
    } else if (scratch.jumpCount === 1 && doubleJumpEnabled && body.energy >= JUMP_ENERGY_COST * 0.2) {
      body.vz = DOUBLE_JUMP_VEL;
      body.isGrounded = false;
      grounded = false;
      scratch.coyoteMs = 0;
      scratch.jumpCount = 2;
      body.energy = Math.max(0, body.energy - JUMP_ENERGY_COST);
    }
  } else {
    scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dt * 1000);
  }
  scratch.wallJumpLockoutMs = Math.max(0, scratch.wallJumpLockoutMs - dt * 1000);
  scratch.wallJumpCooldownMs = Math.max(0, scratch.wallJumpCooldownMs - dt * 1000);

  if (scratch.coyoteMs > 0 && scratch.jumpBufferMs > 0 && body.energy >= JUMP_ENERGY_COST * 0.2) {
    body.vz = JUMP_VEL;
    body.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    scratch.jumpCount = Math.max(1, scratch.jumpCount + 1);
    body.energy = Math.max(0, body.energy - JUMP_ENERGY_COST);
  }

  const onIce = grounded && support?.pad.kind === 'ice';
  const onSand = grounded && support?.pad.kind === 'sand';
  const onWater = grounded && support?.pad.kind === 'water';
  if (onSand) maxSpeed *= 0.62;
  if (onWater) maxSpeed *= 0.55;
  if (onIce) {
    scratch.velX += wishX * maxSpeed * 2.5 * dt;
    scratch.velY += wishY * maxSpeed * 2.5 * dt;
    const ns = Math.hypot(scratch.velX, scratch.velY);
    const cap = maxSpeed * 1.35;
    if (ns > cap && ns > 0) {
      scratch.velX *= cap / ns;
      scratch.velY *= cap / ns;
    }
    const speed = Math.hypot(scratch.velX, scratch.velY);
    if (wishMag < 0.05 && speed > 0.01) {
      const drop = Math.min(speed, 4 * dt);
      scratch.velX *= (speed - drop) / speed;
      scratch.velY *= (speed - drop) / speed;
    }
  } else if (scratch.wallJumpLockoutMs <= 0 && scratch.flipLockoutMs <= 0) {
    scratch.velX = wishX * maxSpeed;
    scratch.velY = wishY * maxSpeed;
  }
  scratch.flipLockoutMs = Math.max(0, scratch.flipLockoutMs - dt * 1000);

  if (onWater && (support?.pad.height ?? 0) > 0.8 && body.vz < 0) {
    body.vz *= 0.85;
  }

  if (grounded && support?.pad.kind === 'conveyor' && (support.pad.conveyorSpeed ?? 0) > 0) {
    const spd = support.pad.conveyorSpeed ?? 4;
    scratch.velX += (support.pad.conveyorDirX ?? 1) * spd;
    scratch.velY += (support.pad.conveyorDirY ?? 0) * spd;
  }

  body.x = clampCore(body.x + scratch.velX * dt, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  body.y = clampCore(body.y + scratch.velY * dt, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  const beforePushX = body.x;
  const beforePushY = body.y;
  const pushed = resolveSolidPads(body, pads, PLAYER_RADIUS, PLAYER_HEIGHT, body.isGrounded);
  body.z = pushed.z;
  body.x = clampCore(pushed.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  body.y = clampCore(pushed.y, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  if (Math.abs(body.x - beforePushX) > 1e-5) scratch.velX = 0;
  if (Math.abs(body.y - beforePushY) > 1e-5) scratch.velY = 0;
  scratch.touchingWallX = pushed.touchingWall ? pushed.wallNormalX : 0;
  scratch.touchingWallY = pushed.touchingWall ? pushed.wallNormalY : 0;

  if (body.isGrounded) {
    let post = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_DESCEND);
    if (!post) {
      post = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_CLIMB);
    }
    if (post) {
      support = post;
      glueToSupport(body, post.topZ, dt, false);
      body.isGrounded = true;
      scratch.coyoteMs = COYOTE_MS;
      scratch.jumpCount = 0;
    } else {
      body.isGrounded = false;
    }
  }

  if (!body.isGrounded) {
    const slidingOnWall =
      wallJumpEnabled && pushed.touchingWall && body.vz <= 0 && scratch.wallJumpLockoutMs <= 0;
    const atApex = Math.abs(body.vz) <= Math.max(APEX_VZ_THRESHOLD, 1.5);
    const gravityThisTick = slidingOnWall
      ? GRAVITY_EFF * wallSlideGravMult
      : atApex
        ? GRAVITY_EFF * APEX_GRAV_MULT
        : GRAVITY_EFF;
    body.vz = Math.max(-MAX_FALL, body.vz - gravityThisTick * dt);
    body.z += body.vz * dt;

    const baseSnap = body.vz < -4 ? LAND_SNAP_FAST : LAND_SNAP_SLOW;
    const softSnap = body.vz > -2 ? Math.max(baseSnap, LAND_STEP_CLIMB) : baseSnap;
    let land = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, softSnap);
    if (!land && body.vz >= -0.5) {
      land = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_CLIMB);
    }
    if (!land) {
      const nudged = tryLedgeAssistPads(body.x, body.y, body.z, pads);
      if (nudged) {
        body.x = nudged.x;
        body.y = nudged.y;
        land = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, softSnap);
        if (!land && body.vz >= -0.5) {
          land = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_CLIMB);
        }
      }
    }
    if (land && body.vz <= 0 && body.z <= land.topZ + 0.15) {
      body.z = land.topZ;
      if (land.pad.kind === 'jumpPad') {
        body.vz = jumpPadBoostOf(land.pad);
        body.isGrounded = false;
        scratch.coyoteMs = 0;
        scratch.jumpCount = 1;
      } else {
        body.vz = 0;
        body.isGrounded = true;
        scratch.coyoteMs = COYOTE_MS;
        scratch.jumpCount = 0;
        if (scratch.jumpBufferMs > 0 && body.energy >= JUMP_ENERGY_COST * 0.2) {
          body.vz = JUMP_VEL;
          body.isGrounded = false;
          scratch.coyoteMs = 0;
          scratch.jumpBufferMs = 0;
          scratch.jumpCount = 1;
          body.energy = Math.max(0, body.energy - JUMP_ENERGY_COST);
        }
      }
    }
  }

  if (physOpts?.voidZ !== undefined && body.z < physOpts.voidZ) {
    body.vz = 0;
  }

  if (body.isGrounded) {
    const under = findSupportPad(body.x, body.y, body.z, pads, PLAYER_RADIUS, LAND_STEP_DESCEND);
    scratch.supportPadId = under ? padIdOf(under.pad) : null;
  } else {
    scratch.supportPadId = null;
  }

  scratch.fallDamageThisTick = 0;
  if (!body.isGrounded) {
    scratch.minAirVz = wasGroundedLastTick ? body.vz : Math.min(scratch.minAirVz, body.vz);
  } else if (!wasGroundedLastTick) {
    if (scratch.minAirVz < -FALL_DAMAGE_SPEED) {
      const excess = -scratch.minAirVz - FALL_DAMAGE_SPEED;
      const red = Math.min(0.9, Math.max(0, physOpts?.fallDamageReduction || 0));
      scratch.fallDamageThisTick = excess * FALL_DAMAGE_PER_MS * (1 - red);
    }
    scratch.minAirVz = 0;
  }

  return body;
}
