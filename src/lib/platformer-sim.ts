/**
 * Plain (non-Colyseus) platformer step used by Map Play Test so preview
 * matches DeathrunRoom / applyMovement behavior as closely as practical.
 *
 * Tunables: `shared/sim-constants.ts` (same source as the Colyseus server).
 */

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
  WALL_JUMP_HORIZ_VEL,
  WALL_JUMP_LOCKOUT_MS,
  WALL_JUMP_SAME_WALL_COOLDOWN_MS,
  WALL_JUMP_VERT_VEL,
  WALL_SLIDE_GRAV_MULT,
} from '@shared/sim-constants';
import type { CustomMoveDef } from '@shared/custom-moves';
import { PadSpatialIndex } from '@shared/platform-spatial';

export interface SimPad {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  /** True analytic ramp support — dz per unit of local x/y. Ramps are never
   * authored rotated today, so this stays in world axes regardless of rotYaw. */
  slopeGradX?: number;
  slopeGradY?: number;
  /** Yaw in radians (sim XY) — mirrors server/src/sim/platforms.ts OBB support. */
  rotYaw?: number;
  kind?: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' | 'ice' | 'conveyor' | 'water' | 'sand';
  /** True for pads meant to be walked over, never blocked against sideways —
   * floors, stair/ramp treads, jump pads, ice/conveyor/sand. A pad WITHOUT
   * this flag (any regular solid prop: wall, crate, slab, whatever) always
   * blocks horizontal movement in resolveSolids, no matter how short it is —
   * see the comment there for why height alone used to decide this. */
  topOnly?: boolean;
  boost?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
  /** Moving platform (optional). */
  id?: string;
  entityId?: string;
  homeX?: number;
  homeY?: number;
  homeZ?: number;
  motionPeriodMs?: number;
  motionPhaseMs?: number;
  motionAmpX?: number;
  motionAmpY?: number;
  motionAmpZ?: number;
  /** Wired Solid door — skipped by collision while `open`. */
  doorControlled?: boolean;
  open?: boolean;
}

function padBlocksMovement(pad: SimPad): boolean {
  return !(pad.doorControlled && pad.open);
}

export interface SimBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SimBody {
  x: number;
  y: number;
  z: number;
  vz: number;
  isGrounded: boolean;
  energy: number;
}

export interface SimScratch {
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
  /** Moving-platform carry (pad id / entityId under feet). */
  supportPadId: string | null;
  /** Remaining ms of an active slide (0 = not sliding). */
  slideMs: number;
  /** Remaining ms before a new slide can start. */
  slideCooldownMs: number;
  /** How long the current slide has been held (for tap vs hold coast). */
  slideHeldMs: number;
  /** Edge-detects the crouch button so holding it doesn't retrigger every tick. */
  wasCrouchHeld: boolean;
  /** Edge-detects the dedicated slide key (see SimInput.slidePressed). */
  wasSlideKeyHeld: boolean;
  /** Remaining ms of an active back flip (0 = not flipping). */
  flipMs: number;
  /** Remaining ms before a new flip can start. */
  flipCooldownMs: number;
  /** Edge-detects the flip button so holding it doesn't retrigger every tick. */
  wasFlipHeld: boolean;
  /** Counts down while a flip's backward kick is active; wish input doesn't
   * override velX/velY until this expires (same pattern as wall jump). */
  flipLockoutMs: number;
  /** Local (non-networked) custom-move state — Play Test has no server, so
   * this scratch object IS the source of truth, unlike movement.ts where
   * the equivalent lives on the synced PlayerState.customMoves schema. */
  customMoveWasHeld: Map<string, boolean>;
  customMoveActiveId: string;
  customMoveActiveUntil: number;
  customMoveCooldownEndsAt: Map<string, number>;
  /** Remaining shop/power extra air jumps (consumed like server ability.extraAirJumps). */
  extraAirJumps: number;
  /** Lowest vz while airborne this flight (for landing fall damage). */
  minAirVz: number;
  /** HP to subtract after this step when a hard landing is detected. */
  fallDamageThisTick: number;
  /** Epoch ms — while in the future, maxSpeed is halved (slow trapper). */
  slowUntil: number;
}

export interface SimInput {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
  meleeActive?: boolean;
  flipPressed?: boolean;
  /** Dedicated slide key (default G) — hold Sprint + press. Replaces the
   *  old crouch+sprint combo trigger below. */
  slidePressed?: boolean;
  customMoveKeysHeld?: string[];
  /** Camera yaw (radians) — only needed for flip's backward kick direction. */
  cameraYaw?: number;
}

/** === Tunables from shared/sim-constants.ts === */
const BASE_GRAVITY = GRAVITY;
const BASE_APEX_GRAVITY_MULT = APEX_GRAVITY_MULT;
const BASE_JUMP_VELOCITY = JUMP_VELOCITY;
const BASE_DOUBLE_JUMP_VELOCITY = DOUBLE_JUMP_VELOCITY;
const BASE_JUMP_CUT = JUMP_CUT_MULTIPLIER;
const BASE_COYOTE_MS = COYOTE_TIME_MS;
const BASE_JUMP_BUFFER_MS = JUMP_BUFFER_MS;
const BASE_MAX_GROUND_SPEED = MAX_GROUND_SPEED;
const BASE_SPRINT_MULT = SPRINT_MULTIPLIER;
const BASE_MAX_FALL = MAX_FALL_SPEED;
const BASE_CROUCH_MULT = CROUCH_SPEED_MULTIPLIER;
const ENERGY_DRAIN = ENERGY_DRAIN_RATE;
const ENERGY_REGEN = ENERGY_REGEN_RATE;
const JUMP_ENERGY = JUMP_ENERGY_COST;
const SKIN = COLLISION_SKIN;

/** Optional per-map physics overrides from CombatSettings (passed via stepPlatformer opts). */
export interface SimPhysicsOpts {
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
  /** Map-authored custom moves (Player Model Studio → Moves tab). */
  customMoves?: CustomMoveDef[];
  /** 0–0.9, same clamp as server ability.fallDamageReduction. */
  fallDamageReduction?: number;
}

export function createSimScratch(): SimScratch {
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
  };
}

/** World XY → pad-local XY (rotYaw around Z-up sim) — mirrors server/src/sim/platforms.ts. */
function toPadLocal(
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

function fromPadLocal(
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

function findSupport(
  x: number,
  y: number,
  z: number,
  pads: SimPad[],
  maxSnapDown = LAND_SNAP_SLOW,
  radius = PLAYER_RADIUS
) {
  // Prefer the highest pad at/under the feet. Only take a higher overlapping
  // step when nothing underfoot remains — otherwise "highest wins" hops you
  // up every ramp cell early, and "nearest" can stick you to a lower pad forever.
  let bestBelow: { pad: SimPad; topZ: number } | null = null;
  let bestClimb: { pad: SimPad; topZ: number } | null = null;
  for (const pad of pads) {
    if (!padBlocksMovement(pad)) continue;
    const halfW = pad.width / 2;
    const halfD = pad.depth / 2;
    const yaw = pad.rotYaw || 0;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, yaw);
    if (lx < -halfW - radius || lx > halfW + radius) continue;
    if (ly < -halfD - radius || ly > halfD + radius) continue;
    const topZ = pad.z + (pad.slopeGradX || 0) * (x - pad.x) + (pad.slopeGradY || 0) * (y - pad.y);
    if (z < topZ - maxSnapDown || z > topZ + 0.55) continue;
    if (topZ <= z + 0.05) {
      if (!bestBelow || topZ > bestBelow.topZ) bestBelow = { pad, topZ };
    } else if (!bestClimb || topZ < bestClimb.topZ) {
      bestClimb = { pad, topZ };
    }
  }
  return bestBelow ?? bestClimb;
}

/** Rate-limited vertical stick to a support top (shared by pre- and post-move glue). */
function softGlueToSupport(
  body: SimBody,
  supportTopZ: number,
  dt: number,
  freshLanding: boolean
) {
  const delta = supportTopZ - body.z;
  if (freshLanding) {
    if (delta > 0) body.z += Math.min(delta, LAND_STEP_CLIMB);
    else if (delta < 0) body.z += Math.max(delta, -LAND_STEP_DESCEND);
    else body.z = supportTopZ;
  } else {
    const maxStep = Math.max(GROUND_FOLLOW_SPEED * Math.max(dt, 1 / 240), 0.002);
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

function tryLedgeAssist(
  x: number,
  y: number,
  z: number,
  pads: SimPad[]
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
      x: clamp(x, pad.x - halfW + 0.04, pad.x + halfW - 0.04),
      y: clamp(y, pad.y - halfD + 0.04, pad.y + halfD - 0.04),
    };
  }
  return null;
}

function resolveSolids(body: SimBody, pads: SimPad[]) {
  let { x, y } = body;
  let z = body.z;
  let touchingWall = false;
  let wallNormalX = 0;
  let wallNormalY = 0;
  for (const pad of pads) {
    if (!padBlocksMovement(pad)) continue;
    // Walk-over pads (floors, stair/ramp treads, jump pads, ice/conveyor/
    // sand) never block sideways — that's what makes them walkable at all.
    if (pad.topOnly) continue;
    const boxH = pad.height ?? 0.2;
    const topZ = pad.z;
    const bottomZ = topZ - boxH;
    // Horizontal footprint test up front (used by both the auto-step and
    // the wall-block branches below) — a pad the player isn't even near has
    // no business touching their Z either way.
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = pad.depth / 2 + PLAYER_RADIUS;
    const yaw = pad.rotYaw || 0;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, yaw);
    if (Math.abs(lx) >= halfW || Math.abs(ly) >= halfD) continue;
    // Auto-step: a solid short enough to count as a curb/step (<=
    // LAND_STEP_CLIMB, the same threshold the rest of the sim already uses
    // for climbing/landing) AND whose top the player's feet are already
    // within climbing range of gets walked straight up onto instead of
    // forcing a jump — ordinary step-up behavior for a slab, a low crate, a
    // knee-high block. Lifting z directly here (not just skipping the block
    // and waiting for findSupport to notice) matters because findSupport
    // prefers whatever's already "at/under feet" — when a floor pad extends
    // underneath the step (the normal case: a block sitting ON a floor),
    // findSupport would keep tracking that lower floor forever and the
    // player would slide straight through the step's body at floor height
    // instead of climbing it. The z-proximity check keeps this from
    // firing on a short-but-elevated ledge (e.g. a windowsill) the player
    // isn't actually standing near yet — that still blocks like a wall
    // until they're within climbing range. A genuinely tall wall (boxH >
    // LAND_STEP_CLIMB) always blocks and must be jumped. Gated on
    // body.isGrounded so this only ever fires for grounded, walking-into-it
    // contact — airborne jump arcs / landings are untouched, handled
    // entirely by the existing findSupport-based landing logic below.
    // Mirrors the same duplicated logic in server/src/sim/platforms.ts.
    if (body.isGrounded && boxH <= LAND_STEP_CLIMB && z >= topZ - LAND_STEP_CLIMB) {
      if (z < topZ) z = topZ;
      continue;
    }
    const playerBottom = z;
    const playerTop = z + PLAYER_HEIGHT;
    if (playerTop <= bottomZ + SKIN || playerBottom >= topZ - SKIN) continue;
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
  body.z = z;
  return { x, y, touchingWall, wallNormalX, wallNormalY };
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

const SPATIAL_PAD_THRESHOLD = 40;
let padSpatialCache: { pads: SimPad[]; index: PadSpatialIndex<SimPad> } | null = null;

function padsNear(pads: SimPad[], x: number, y: number): SimPad[] {
  if (pads.length < SPATIAL_PAD_THRESHOLD) return pads;
  if (!padSpatialCache || padSpatialCache.pads !== pads) {
    padSpatialCache = { pads, index: new PadSpatialIndex<SimPad>().rebuild(pads) };
  }
  return padSpatialCache.index.nearby(x, y);
}

export function stepPlatformer(
  body: SimBody,
  input: SimInput,
  dt: number,
  pads: SimPad[],
  scratch: SimScratch,
  bounds: SimBounds,
  physOpts?: SimPhysicsOpts
): SimBody {
  // Resolve tunables — prefer per-map overrides, fall back to base constants.
  const GRAVITY = physOpts?.gravity ?? BASE_GRAVITY;
  const APEX_GRAV_MULT = physOpts?.apexGravMult ?? BASE_APEX_GRAVITY_MULT;
  const JUMP_VELOCITY = physOpts?.jumpVelocity ?? BASE_JUMP_VELOCITY;
  const DOUBLE_JUMP_VELOCITY = physOpts?.doubleJumpVelocity ?? BASE_DOUBLE_JUMP_VELOCITY;
  const JUMP_CUT = physOpts?.jumpCutMult ?? BASE_JUMP_CUT;
  const COYOTE_MS = physOpts?.coyoteMs ?? BASE_COYOTE_MS;
  const JUMP_BUFFER_MS = physOpts?.jumpBufferMs ?? BASE_JUMP_BUFFER_MS;
  const MAX_GROUND_SPEED = physOpts?.walkSpeed ?? BASE_MAX_GROUND_SPEED;
  const SPRINT_MULT = physOpts?.sprintMult ?? BASE_SPRINT_MULT;
  const MAX_FALL = physOpts?.maxFallSpeed ?? BASE_MAX_FALL;
  const CROUCH_MULT = physOpts?.crouchMult ?? BASE_CROUCH_MULT;
  const doubleJumpEnabled = physOpts?.doubleJumpEnabled ?? true;

  const near = padsNear(pads, body.x, body.y);

  let wishX = input.moveX;
  let wishY = input.moveY;
  const wishMag = Math.hypot(wishX, wishY);
  if (wishMag > 1) {
    wishX /= wishMag;
    wishY /= wishMag;
  }

  let maxSpeed = MAX_GROUND_SPEED;
  if (input.crouch) maxSpeed *= CROUCH_MULT;
  if (input.meleeActive) maxSpeed *= MELEE_MOVE_MULT;
  const wantsSprint =
    input.sprint && !input.crouch && wishMag > 0.2 && !scratch.exhausted;
  if (wantsSprint && body.energy > 0) {
    body.energy = Math.max(0, body.energy - ENERGY_DRAIN * dt);
    maxSpeed *= SPRINT_MULT;
    if (body.energy <= 0) scratch.exhausted = true;
  } else {
    body.energy = Math.min(MAX_ENERGY, body.energy + ENERGY_REGEN * dt);
    if (body.energy >= ENERGY_EXHAUSTED_THRESHOLD) scratch.exhausted = false;
  }
  if (scratch.exhausted) maxSpeed *= ENERGY_EXHAUSTED_SPEED_MULT;
  if ((scratch.slowUntil || 0) > Date.now()) maxSpeed *= 0.5;

  const wasGroundedLastTick = body.isGrounded;
  let support = findSupport(
    body.x,
    body.y,
    body.z,
    near,
    wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
  );
  if (!support && wasGroundedLastTick && body.vz >= -0.5) {
    support = findSupport(body.x, body.y, body.z, near, LAND_STEP_CLIMB);
  }
  if (!support) {
    const nudged = tryLedgeAssist(body.x, body.y, body.z, near);
    if (nudged) {
      body.x = nudged.x;
      body.y = nudged.y;
      support = findSupport(
        body.x,
        body.y,
        body.z,
        near,
        wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
      );
      if (!support && wasGroundedLastTick && body.vz >= -0.5) {
        support = findSupport(body.x, body.y, body.z, near, LAND_STEP_CLIMB);
      }
    }
  }

  let grounded = !!support && body.vz <= 0.2;
  body.isGrounded = grounded;

  // Slide (dedicated key, default G, held while sprinting) — mirrors
  // server/src/sim/movement.ts so Play Test and live prediction show the
  // same speed-boosted burst instead of the toggle silently doing nothing.
  // Slide-jump falls out for free: jumping only ever sets vz, so a jump
  // mid-slide keeps the boosted velX/velY the player already had.
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
    maxSpeed = MAX_GROUND_SPEED * SLIDE_MULT;
    if (holdingSlide) {
      scratch.slideHeldMs += dt * 1000;
    } else {
      if (scratch.slideHeldMs > SLIDE_HOLD_SNAP_AFTER_MS) {
        scratch.slideMs = Math.min(scratch.slideMs, SLIDE_HOLD_COAST_MS);
      }
      scratch.slideHeldMs = 0;
      scratch.slideMs = Math.max(0, scratch.slideMs - dt * 1000);
      if (scratch.slideMs <= 0) scratch.slideCooldownMs = slideCooldownMs;
    }
  } else if (scratch.slideCooldownMs > 0) {
    scratch.slideHeldMs = 0;
    scratch.slideCooldownMs = Math.max(0, scratch.slideCooldownMs - dt * 1000);
  }

  // Back flip (V) — mirrors server/src/sim/movement.ts's grounded acrobatic
  // hop: energy-gated, edge-triggered, brief cooldown, independent of
  // sprint/crouch.
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
    if (scratch.flipMs <= 0) scratch.flipCooldownMs = FLIP_COOLDOWN_MS;
  } else if (scratch.flipCooldownMs > 0) {
    scratch.flipCooldownMs = Math.max(0, scratch.flipCooldownMs - dt * 1000);
  }

  // Map-authored custom moves — mirrors movement.ts's generic loop, but
  // against local scratch state instead of the (nonexistent, in Play Test)
  // synced PlayerState.customMoves schema.
  if (physOpts?.customMoves?.length) {
    const now = Date.now();
    const heldKeys = new Set(input.customMoveKeysHeld ?? []);
    const busy = now < scratch.customMoveActiveUntil;
    for (const move of physOpts.customMoves) {
      const wasHeld = scratch.customMoveWasHeld.get(move.id) ?? false;
      const isHeld = heldKeys.has(move.id);
      scratch.customMoveWasHeld.set(move.id, isHeld);
      const edge = isHeld && !wasHeld;
      const cooldownUntil = scratch.customMoveCooldownEndsAt.get(move.id) ?? 0;
      if (
        edge &&
        !busy &&
        now >= cooldownUntil &&
        (!move.groundedOnly || grounded) &&
        !scratch.exhausted &&
        body.energy >= move.energyCost
      ) {
        scratch.customMoveActiveId = move.id;
        scratch.customMoveActiveUntil = now + move.durationMs;
        scratch.customMoveCooldownEndsAt.set(move.id, now + move.durationMs + move.cooldownMs);
        body.energy = Math.max(0, body.energy - move.energyCost);
        if (move.vzBoost && grounded) {
          body.vz = move.vzBoost;
          body.isGrounded = false;
          grounded = false;
        }
        break;
      }
    }
    if (now >= scratch.customMoveActiveUntil) scratch.customMoveActiveId = '';
  }

  // Soft ground glue (mirrors server movement.ts). Stepped ramp pads change
  // topZ by small amounts each cell — hard-assigning body.z caused one-frame
  // hops that the camera read as a bumpy road. Rate-limit vertical correction
  // while already grounded; allow a larger snap only on fresh landings.
  if (grounded && support) {
    softGlueToSupport(body, support.topZ, dt, !wasGroundedLastTick);
    scratch.coyoteMs = COYOTE_MS;
    scratch.jumpCount = 0;
  } else {
    if (scratch.jumpCount === 0 && scratch.coyoteMs <= 0) {
      scratch.jumpCount = 1;
    }
    scratch.coyoteMs = Math.max(0, scratch.coyoteMs - dt * 1000);
  }

  if (grounded && support?.pad.kind === 'jumpPad') {
    body.vz = support.pad.boost && support.pad.boost > 0 ? support.pad.boost : JUMP_PAD_BOOST;
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

  const wallJumpEnabled = physOpts?.wallJumpEnabled ?? false;
  const wallJumpHorizVel = physOpts?.wallJumpHorizVel ?? WALL_JUMP_HORIZ_VEL;
  const wallJumpVertVel = physOpts?.wallJumpVertVel ?? WALL_JUMP_VERT_VEL;
  const wallSlideGravMult = physOpts?.wallSlideGravMult ?? WALL_SLIDE_GRAV_MULT;
  const wasTouchingWall = scratch.touchingWallX !== 0 || scratch.touchingWallY !== 0;
  const onCooldownWall =
    scratch.wallJumpCooldownMs > 0 &&
    scratch.wallJumpCooldownNormalX === scratch.touchingWallX &&
    scratch.wallJumpCooldownNormalY === scratch.touchingWallY;
  const canWallJump = wallJumpEnabled && !grounded && wasTouchingWall && !onCooldownWall;

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
    } else if (scratch.jumpCount === 0 || scratch.jumpCount === 2) {
      if (
        !grounded &&
        (scratch.extraAirJumps || 0) > 0 &&
        body.energy >= JUMP_ENERGY * 0.2
      ) {
        scratch.extraAirJumps -= 1;
        body.vz = DOUBLE_JUMP_VELOCITY;
        body.isGrounded = false;
        grounded = false;
        scratch.coyoteMs = 0;
        scratch.jumpCount = 2;
        body.energy = Math.max(0, body.energy - JUMP_ENERGY);
      } else {
        scratch.jumpBufferMs = JUMP_BUFFER_MS;
      }
    } else if (
      scratch.jumpCount === 1 &&
      doubleJumpEnabled &&
      body.energy >= JUMP_ENERGY * 0.2
    ) {
      body.vz = DOUBLE_JUMP_VELOCITY;
      body.isGrounded = false;
      grounded = false;
      scratch.coyoteMs = 0;
      scratch.jumpCount = 2;
      body.energy = Math.max(0, body.energy - JUMP_ENERGY);
    }
  } else {
    scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dt * 1000);
  }
  scratch.wallJumpLockoutMs = Math.max(0, scratch.wallJumpLockoutMs - dt * 1000);
  scratch.wallJumpCooldownMs = Math.max(0, scratch.wallJumpCooldownMs - dt * 1000);

  if (
    scratch.coyoteMs > 0 &&
    scratch.jumpBufferMs > 0 &&
    body.energy >= JUMP_ENERGY * 0.2
  ) {
    body.vz = JUMP_VELOCITY;
    body.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    scratch.jumpCount = Math.max(1, scratch.jumpCount + 1);
    body.energy = Math.max(0, body.energy - JUMP_ENERGY);
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

  // Deep water: soften gravity while submerged in a tall water volume
  if (onWater && (support?.pad.height ?? 0) > 0.8 && body.vz < 0) {
    body.vz *= 0.85;
  }

  if (grounded && support?.pad.kind === 'conveyor' && (support.pad.conveyorSpeed ?? 0) > 0) {
    const spd = support.pad.conveyorSpeed ?? 4;
    scratch.velX += (support.pad.conveyorDirX ?? 1) * spd;
    scratch.velY += (support.pad.conveyorDirY ?? 0) * spd;
  }

  body.x = clamp(body.x + scratch.velX * dt, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  body.y = clamp(body.y + scratch.velY * dt, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  const beforePushX = body.x;
  const beforePushY = body.y;
  const pushed = resolveSolids(body, near);
  body.x = clamp(pushed.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  body.y = clamp(pushed.y, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  if (Math.abs(body.x - beforePushX) > 1e-5) scratch.velX = 0;
  if (Math.abs(body.y - beforePushY) > 1e-5) scratch.velY = 0;
  scratch.touchingWallX = pushed.touchingWall ? pushed.wallNormalX : 0;
  scratch.touchingWallY = pushed.touchingWall ? pushed.wallNormalY : 0;

  // Same-frame re-stick after XY move so feet follow the next ramp cell now,
  // not one tick late (that lag was a big part of the bumpy-road feel).
  if (body.isGrounded) {
    let post = findSupport(body.x, body.y, body.z, near, LAND_STEP_DESCEND);
    if (!post) {
      post = findSupport(body.x, body.y, body.z, near, LAND_STEP_CLIMB);
    }
    if (post) {
      support = post;
      softGlueToSupport(body, post.topZ, dt, false);
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
    // Apex softening — mirrors server/src/sim/movement.ts so Play Test shows
    // the same floaty-apex feel a map author dials in via apexGravMult.
    const atApex = Math.abs(body.vz) <= Math.max(APEX_VZ_THRESHOLD, 1.5);
    const gravityThisTick = slidingOnWall
      ? GRAVITY * wallSlideGravMult
      : atApex
        ? GRAVITY * APEX_GRAV_MULT
        : GRAVITY;
    body.vz = Math.max(-MAX_FALL, body.vz - gravityThisTick * dt);
    body.z += body.vz * dt;

    const baseSnap = body.vz < -4 ? LAND_SNAP_FAST : LAND_SNAP_SLOW;
    const softSnap = body.vz > -2 ? Math.max(baseSnap, LAND_STEP_CLIMB) : baseSnap;
    let land = findSupport(body.x, body.y, body.z, near, softSnap);
    if (!land && body.vz >= -0.5) {
      land = findSupport(body.x, body.y, body.z, near, LAND_STEP_CLIMB);
    }
    if (!land) {
      const nudged = tryLedgeAssist(body.x, body.y, body.z, near);
      if (nudged) {
        body.x = nudged.x;
        body.y = nudged.y;
        land = findSupport(body.x, body.y, body.z, near, softSnap);
        if (!land && body.vz >= -0.5) {
          land = findSupport(body.x, body.y, body.z, near, LAND_STEP_CLIMB);
        }
      }
    }
    if (land && body.vz <= 0 && body.z <= land.topZ + 0.15) {
      body.z = land.topZ;
      if (land.pad.kind === 'jumpPad') {
        body.vz = land.pad.boost && land.pad.boost > 0 ? land.pad.boost : JUMP_PAD_BOOST;
        body.isGrounded = false;
        scratch.coyoteMs = 0;
        scratch.jumpCount = 1;
      } else {
        body.vz = 0;
        body.isGrounded = true;
        scratch.coyoteMs = COYOTE_MS;
        scratch.jumpCount = 0;
        if (scratch.jumpBufferMs > 0 && body.energy >= JUMP_ENERGY * 0.2) {
          body.vz = JUMP_VELOCITY;
          body.isGrounded = false;
          scratch.coyoteMs = 0;
          scratch.jumpBufferMs = 0;
          scratch.jumpCount = 1;
          body.energy = Math.max(0, body.energy - JUMP_ENERGY);
        }
      }
    }
  }

  if (body.isGrounded) {
    const under = findSupport(body.x, body.y, body.z, near, LAND_STEP_DESCEND);
    scratch.supportPadId = under?.pad.id ?? under?.pad.entityId ?? null;
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

/** Editor Three (x,y,z) → sim */
export function threeToSim(x: number, y: number, z: number) {
  return { x: z, y: x, z: y };
}

/** Sim → Three */
export function simToThree(x: number, y: number, z: number): [number, number, number] {
  return [y, z, x];
}
