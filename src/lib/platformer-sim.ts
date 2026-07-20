/**
 * Plain (non-Colyseus) platformer step used by Map Play Test so preview
 * matches DeathrunRoom / applyMovement behavior as closely as practical.
 *
 * Keep tunables in sync with `server/src/sim/constants.ts` + `movement.ts`.
 */

export interface SimPad {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  kind?: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' | 'ice' | 'conveyor';
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
}

export interface SimInput {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
  sprint: boolean;
  crouch: boolean;
}

/** === Tunables (mirror server/src/sim/constants.ts) === */
const GRAVITY = 32;
const APEX_GRAVITY_MULT = 0.52;
const APEX_VZ_THRESHOLD = 2.2;
const JUMP_VELOCITY = 10.4;
const JUMP_CUT = 0.4;
const JUMP_PAD_BOOST = 14;
const COYOTE_MS = 125;
const JUMP_BUFFER_MS = 150;
const GROUND_ACCEL = 40;
const GROUND_FRICTION = 18;
const AIR_ACCEL = 14;
const AIR_CONTROL = 0.88;
const MAX_GROUND_SPEED = 6.8;
const SPRINT_MULT = 1.42;
const MAX_AIR_MULT = 1.12;
const MAX_FALL = 26;
const PLAYER_RADIUS = 0.4;
const PLAYER_HEIGHT = 1.7;
const MAX_ENERGY = 100;
const ENERGY_DRAIN = 28;
const ENERGY_REGEN = 18;
const JUMP_ENERGY = 5;
const SKIN = 0.02;
const ENERGY_EXHAUSTED_THRESHOLD = 50;
const ENERGY_EXHAUSTED_SPEED_MULT = 0.72;
const LAND_SNAP_FAST = 0.7;
const LAND_SNAP_SLOW = 0.4;
/** Past pad rim (beyond capsule radius) we still pull feet back on. */
const LEDGE_ASSIST = 0.55;

export function createSimScratch(): SimScratch {
  return {
    velX: 0,
    velY: 0,
    coyoteMs: 0,
    jumpBufferMs: 0,
    wasJumpHeld: false,
    exhausted: false,
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

/**
 * Mario / Celeste-style ledge forgiveness: if you're barely off a pad edge
 * but still near the top surface, nudge feet back onto the pad.
 */
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
    if (ox <= 0 && oy <= 0) continue; // already inside
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
  bounds: SimBounds
): SimBody {
  let wishX = input.moveX;
  let wishY = input.moveY;
  const wishMag = Math.hypot(wishX, wishY);
  if (wishMag > 1) {
    wishX /= wishMag;
    wishY /= wishMag;
  }

  let maxSpeed = MAX_GROUND_SPEED;
  if (input.crouch) maxSpeed *= 0.55;
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
    body.z = support.topZ;
    body.vz = 0;
  } else {
    scratch.coyoteMs = Math.max(0, scratch.coyoteMs - dt * 1000);
  }

  if (grounded && support?.pad.kind === 'jumpPad') {
    body.vz = support.pad.boost && support.pad.boost > 0 ? support.pad.boost : JUMP_PAD_BOOST;
    body.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
  }

  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  const jumpReleased = !input.jumpPressed && scratch.wasJumpHeld;
  if (jumpReleased && body.vz > 0) body.vz *= JUMP_CUT;
  scratch.wasJumpHeld = input.jumpPressed;
  if (jumpEdge) scratch.jumpBufferMs = JUMP_BUFFER_MS;
  else scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dt * 1000);

  if (
    (body.isGrounded || scratch.coyoteMs > 0) &&
    scratch.jumpBufferMs > 0 &&
    body.energy >= JUMP_ENERGY * 0.2
  ) {
    body.vz = JUMP_VELOCITY;
    body.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    body.energy = Math.max(0, body.energy - JUMP_ENERGY);
  }

  if (grounded) {
    const onIce = support?.pad.kind === 'ice';
    const friction = onIce ? GROUND_FRICTION * 0.18 : GROUND_FRICTION;
    const accel = onIce ? GROUND_ACCEL * 0.45 : GROUND_ACCEL;
    const speed = Math.hypot(scratch.velX, scratch.velY);
    if (speed > 0.01) {
      const drop = Math.min(speed, friction * dt);
      const scale = (speed - drop) / speed;
      scratch.velX *= scale;
      scratch.velY *= scale;
    } else {
      scratch.velX = 0;
      scratch.velY = 0;
    }
    scratch.velX += wishX * accel * dt;
    scratch.velY += wishY * accel * dt;
    if (support?.pad.kind === 'conveyor' && (support.pad.conveyorSpeed ?? 0) > 0) {
      const spd = support.pad.conveyorSpeed ?? 4;
      scratch.velX += (support.pad.conveyorDirX ?? 1) * spd * dt * 2.2;
      scratch.velY += (support.pad.conveyorDirY ?? 0) * spd * dt * 2.2;
    }
    const ns = Math.hypot(scratch.velX, scratch.velY);
    const cap = onIce ? maxSpeed * 1.35 : maxSpeed;
    if (ns > cap && ns > 0) {
      scratch.velX *= cap / ns;
      scratch.velY *= cap / ns;
    }
  } else {
    // Stronger air steer near apex (Celeste / modern platformer)
    const apexBoost = Math.abs(body.vz) < APEX_VZ_THRESHOLD ? 1.18 : 1;
    scratch.velX += wishX * AIR_ACCEL * AIR_CONTROL * apexBoost * dt;
    scratch.velY += wishY * AIR_ACCEL * AIR_CONTROL * apexBoost * dt;
    const airMax = maxSpeed * MAX_AIR_MULT;
    const ns = Math.hypot(scratch.velX, scratch.velY);
    if (ns > airMax && ns > 0) {
      scratch.velX *= airMax / ns;
      scratch.velY *= airMax / ns;
    }
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
    let g = GRAVITY;
    if (Math.abs(body.vz) < APEX_VZ_THRESHOLD) g *= APEX_GRAVITY_MULT;
    body.vz = Math.max(-MAX_FALL, body.vz - g * dt);
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
      } else {
        body.vz = 0;
        body.isGrounded = true;
        scratch.coyoteMs = COYOTE_MS;
        // Same-frame buffered jump on landing (feels like Celeste / modern platformers)
        if (scratch.jumpBufferMs > 0 && body.energy >= JUMP_ENERGY * 0.2) {
          body.vz = JUMP_VELOCITY;
          body.isGrounded = false;
          scratch.coyoteMs = 0;
          scratch.jumpBufferMs = 0;
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
