/**
 * Plain (non-Colyseus) platformer step used by Map Play Test so preview
 * matches DeathrunRoom / applyMovement behavior as closely as practical.
 *
 * Keep tunables in sync with `server/src/sim/constants.ts` + `movement.ts`.
 * Feel ported from The Foundry Godot Player.gd.
 */

export interface SimPad {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  kind?: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' | 'ice' | 'conveyor' | 'water' | 'sand';
  boost?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
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
}

export interface SimInput {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
  meleeActive?: boolean;
}

/** === Tunables (mirror server/src/sim/constants.ts — Foundry) === */
const BASE_GRAVITY = 20;
const BASE_JUMP_VELOCITY = 10;
const BASE_DOUBLE_JUMP_VELOCITY = BASE_JUMP_VELOCITY / 1.25;
const BASE_JUMP_CUT = 0.5;
const JUMP_PAD_BOOST = 14;
const BASE_COYOTE_MS = 1000 / 6;
const BASE_JUMP_BUFFER_MS = 200;
const BASE_MAX_GROUND_SPEED = 5;
const BASE_SPRINT_MULT = 1.35;
const BASE_MAX_FALL = 40;
/** Horizontal capsule radius — keep in sync with visual CapsuleGeometry(0.35). */
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.7;
const MAX_ENERGY = 100;
const ENERGY_DRAIN = 28;
const ENERGY_REGEN = 18;
const JUMP_ENERGY = 4;
const SKIN = 0.02;
const ENERGY_EXHAUSTED_THRESHOLD = 50;
const ENERGY_EXHAUSTED_SPEED_MULT = 0.72;
const LAND_SNAP_FAST = 0.7;
const LAND_SNAP_SLOW = 0.4;
const LEDGE_ASSIST = 0.55;
const MELEE_MOVE_MULT = 0.5;
const BASE_CROUCH_MULT = 0.55;

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
  };
}

function findSupport(
  x: number,
  y: number,
  z: number,
  pads: SimPad[],
  maxSnapDown = LAND_SNAP_SLOW,
  radius = PLAYER_RADIUS
) {
  let best: { pad: SimPad; topZ: number } | null = null;
  for (const pad of pads) {
    const halfW = pad.width / 2;
    const halfD = pad.depth / 2;
    if (x < pad.x - halfW - radius || x > pad.x + halfW + radius) continue;
    if (y < pad.y - halfD - radius || y > pad.y + halfD + radius) continue;
    const topZ = pad.z;
    if (z >= topZ - maxSnapDown && z <= topZ + 0.55) {
      if (!best || topZ > best.topZ) best = { pad, topZ };
    }
  }
  return best;
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
  for (const pad of pads) {
    const boxH = pad.height ?? 0.2;
    if (boxH <= 0.35) continue;
    const topZ = pad.z;
    const bottomZ = topZ - boxH;
    if (playerTop <= bottomZ + SKIN || playerBottom >= topZ - SKIN) continue;
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = pad.depth / 2 + PLAYER_RADIUS;
    const dx = x - pad.x;
    const dy = y - pad.y;
    if (Math.abs(dx) >= halfW || Math.abs(dy) >= halfD) continue;
    const pushX = halfW - Math.abs(dx);
    const pushY = halfD - Math.abs(dy);
    if (pushX < pushY) x = pad.x + Math.sign(dx || 1) * halfW;
    else y = pad.y + Math.sign(dy || 1) * halfD;
  }
  return { x, y };
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

  let support = findSupport(body.x, body.y, body.z, pads);
  if (!support) {
    const nudged = tryLedgeAssist(body.x, body.y, body.z, pads);
    if (nudged) {
      body.x = nudged.x;
      body.y = nudged.y;
      support = findSupport(body.x, body.y, body.z, pads);
    }
  }

  let grounded = !!support && body.vz <= 0.2;
  body.isGrounded = grounded;

  if (grounded && support) {
    scratch.coyoteMs = COYOTE_MS;
    scratch.jumpCount = 0;
    body.z = support.topZ;
    body.vz = 0;
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

  if (jumpEdge) {
    if (scratch.jumpCount === 0 || scratch.jumpCount === 2) {
      scratch.jumpBufferMs = JUMP_BUFFER_MS;
    } else if (scratch.jumpCount === 1 && body.energy >= JUMP_ENERGY * 0.2) {
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
  } else {
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

  if (!body.isGrounded) {
    body.vz = Math.max(-MAX_FALL, body.vz - GRAVITY * dt);
    body.z += body.vz * dt;

    const snap = body.vz < -4 ? LAND_SNAP_FAST : LAND_SNAP_SLOW;
    let land = findSupport(body.x, body.y, body.z, pads, snap);
    if (!land) {
      const nudged = tryLedgeAssist(body.x, body.y, body.z, pads);
      if (nudged) {
        body.x = nudged.x;
        body.y = nudged.y;
        land = findSupport(body.x, body.y, body.z, pads, snap);
      }
    }
    if (land && body.vz <= 0 && body.z <= land.topZ + 0.08) {
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
