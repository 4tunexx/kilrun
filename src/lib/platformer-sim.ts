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
  SPRINT_MULTIPLIER,
  WALL_JUMP_HORIZ_VEL,
  WALL_JUMP_LOCKOUT_MS,
  WALL_JUMP_SAME_WALL_COOLDOWN_MS,
  WALL_JUMP_VERT_VEL,
  WALL_SLIDE_GRAV_MULT,
} from '@shared/sim-constants';

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
  /** Edge-detects the crouch button so holding it doesn't retrigger every tick. */
  wasCrouchHeld: boolean;
}

export interface SimInput {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
  meleeActive?: boolean;
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
    wasCrouchHeld: false,
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
  const playerBottom = body.z;
  const playerTop = body.z + PLAYER_HEIGHT;
  let touchingWall = false;
  let wallNormalX = 0;
  let wallNormalY = 0;
  for (const pad of pads) {
    const boxH = pad.height ?? 0.2;
    if (boxH <= 0.35) continue;
    const topZ = pad.z;
    const bottomZ = topZ - boxH;
    // Step-up allowance: a ledge within LAND_STEP_CLIMB of the player's feet
    // is a walkable step, not a wall (fixes Play Test matching the live
    // "stuck at ramp-to-platform seam" bug). This only makes sense for a
    // genuinely short pad (boxH <= LAND_STEP_CLIMB) — without that guard, a
    // full-height solid whose top merely happens to land within climbing
    // range of the player's current feet (e.g. a ~1-unit doorway post while
    // standing on a raised floor) got waved through as if it were a curb,
    // even though its base runs all the way to the ground. Mirrors the same
    // duplicated logic in server/src/sim/platforms.ts.
    if (boxH <= LAND_STEP_CLIMB && playerBottom >= topZ - LAND_STEP_CLIMB) continue;
    if (playerTop <= bottomZ + SKIN || playerBottom >= topZ - SKIN) continue;
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = pad.depth / 2 + PLAYER_RADIUS;
    const yaw = pad.rotYaw || 0;
    const { lx, ly } = toPadLocal(x, y, pad.x, pad.y, yaw);
    if (Math.abs(lx) >= halfW || Math.abs(ly) >= halfD) continue;
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
  return { x, y, touchingWall, wallNormalX, wallNormalY };
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
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

  const wasGroundedLastTick = body.isGrounded;
  let support = findSupport(
    body.x,
    body.y,
    body.z,
    pads,
    wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
  );
  if (!support && wasGroundedLastTick && body.vz >= -0.5) {
    support = findSupport(body.x, body.y, body.z, pads, LAND_STEP_CLIMB);
  }
  if (!support) {
    const nudged = tryLedgeAssist(body.x, body.y, body.z, pads);
    if (nudged) {
      body.x = nudged.x;
      body.y = nudged.y;
      support = findSupport(
        body.x,
        body.y,
        body.z,
        pads,
        wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
      );
      if (!support && wasGroundedLastTick && body.vz >= -0.5) {
        support = findSupport(body.x, body.y, body.z, pads, LAND_STEP_CLIMB);
      }
    }
  }

  let grounded = !!support && body.vz <= 0.2;
  body.isGrounded = grounded;

  // Slide (crouch while sprinting) — mirrors server/src/sim/movement.ts so
  // Play Test and live prediction show the same speed-boosted burst instead
  // of the toggle silently doing nothing. Slide-jump falls out for free:
  // jumping only ever sets vz, so a jump mid-slide keeps the boosted
  // velX/velY the player already had.
  const SLIDE_ENABLED = physOpts?.slideEnabled ?? false;
  const SLIDE_MULT = physOpts?.slideMult ?? 2.2;
  const SLIDE_DURATION_MS = physOpts?.slideDurationMs ?? 600;
  const SLIDE_COOLDOWN_MS = physOpts?.slideCooldownMs ?? 1000;
  const crouchEdge = input.crouch && !scratch.wasCrouchHeld;
  scratch.wasCrouchHeld = input.crouch;
  if (
    SLIDE_ENABLED &&
    crouchEdge &&
    input.sprint &&
    grounded &&
    wishMag > 0.2 &&
    !scratch.exhausted &&
    scratch.slideMs <= 0 &&
    scratch.slideCooldownMs <= 0
  ) {
    scratch.slideMs = SLIDE_DURATION_MS;
  }
  if (scratch.slideMs > 0) {
    maxSpeed = MAX_GROUND_SPEED * SLIDE_MULT;
    scratch.slideMs = Math.max(0, scratch.slideMs - dt * 1000);
    if (scratch.slideMs <= 0) scratch.slideCooldownMs = SLIDE_COOLDOWN_MS;
  } else if (scratch.slideCooldownMs > 0) {
    scratch.slideCooldownMs = Math.max(0, scratch.slideCooldownMs - dt * 1000);
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
      scratch.jumpBufferMs = JUMP_BUFFER_MS;
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
  } else if (scratch.wallJumpLockoutMs <= 0) {
    scratch.velX = wishX * maxSpeed;
    scratch.velY = wishY * maxSpeed;
  }

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
  const pushed = resolveSolids(body, pads);
  body.x = clamp(pushed.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  body.y = clamp(pushed.y, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  if (Math.abs(body.x - beforePushX) > 1e-5) scratch.velX = 0;
  if (Math.abs(body.y - beforePushY) > 1e-5) scratch.velY = 0;
  scratch.touchingWallX = pushed.touchingWall ? pushed.wallNormalX : 0;
  scratch.touchingWallY = pushed.touchingWall ? pushed.wallNormalY : 0;

  // Same-frame re-stick after XY move so feet follow the next ramp cell now,
  // not one tick late (that lag was a big part of the bumpy-road feel).
  if (body.isGrounded) {
    let post = findSupport(body.x, body.y, body.z, pads, LAND_STEP_DESCEND);
    if (!post) {
      post = findSupport(body.x, body.y, body.z, pads, LAND_STEP_CLIMB);
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
    let land = findSupport(body.x, body.y, body.z, pads, softSnap);
    if (!land && body.vz >= -0.5) {
      land = findSupport(body.x, body.y, body.z, pads, LAND_STEP_CLIMB);
    }
    if (!land) {
      const nudged = tryLedgeAssist(body.x, body.y, body.z, pads);
      if (nudged) {
        body.x = nudged.x;
        body.y = nudged.y;
        land = findSupport(body.x, body.y, body.z, pads, softSnap);
        if (!land && body.vz >= -0.5) {
          land = findSupport(body.x, body.y, body.z, pads, LAND_STEP_CLIMB);
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
    const under = findSupport(body.x, body.y, body.z, pads, LAND_STEP_DESCEND);
    scratch.supportPadId = under?.pad.id ?? under?.pad.entityId ?? null;
  } else {
    scratch.supportPadId = null;
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
