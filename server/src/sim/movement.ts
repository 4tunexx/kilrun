import { PlatformState, PlayerState } from '../schema/RoomState.js';
import {
  AIR_ACCEL,
  AIR_CONTROL,
  APEX_GRAVITY_MULT,
  APEX_VZ_THRESHOLD,
  COYOTE_TIME_MS,
  CROUCH_SPEED_MULTIPLIER,
  ENERGY_DRAIN_RATE,
  ENERGY_EXHAUSTED_SPEED_MULT,
  ENERGY_EXHAUSTED_THRESHOLD,
  ENERGY_REGEN_RATE,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_BUFFER_MS,
  JUMP_CUT_MULTIPLIER,
  JUMP_ENERGY_COST,
  JUMP_PAD_BOOST,
  JUMP_VELOCITY,
  LAND_SNAP_FAST,
  LAND_SNAP_SLOW,
  LEDGE_ASSIST,
  MAX_AIR_SPEED_MULT,
  MAX_ENERGY,
  MAX_FALL_SPEED,
  MAX_GROUND_SPEED,
  PLAYER_RADIUS,
  SPRINT_MULTIPLIER,
  TRAPPER_MOVE_SPEED,
  VOID_Z,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants.js';
import { findSupportPlatform, resolveSolidCollisions } from './platforms.js';

export interface PlayerInput {
  moveX: number; // -1..1, camera-relative forward/back intent (world X after client rotates)
  moveY: number; // -1..1, camera-relative strafe
  aimAngle: number;
  /** Look pitch (radians, up positive). */
  aimPitch: number;
  cameraYaw: number;
  crouch: boolean;
  sprint: boolean;
  jumpPressed: boolean;
  shootPressed: boolean;
  interactPressed: boolean;
}

const EMPTY_INPUT: PlayerInput = {
  moveX: 0,
  moveY: 0,
  aimAngle: 0,
  aimPitch: 0,
  cameraYaw: 0,
  crouch: false,
  sprint: false,
  jumpPressed: false,
  shootPressed: false,
  interactPressed: false,
};

export function defaultInput(): PlayerInput {
  return { ...EMPTY_INPUT };
}

/** Per-player ephemeral sim state that does not need to sync to clients. */
export interface PlayerSimScratch {
  velX: number;
  velY: number;
  coyoteMs: number;
  jumpBufferMs: number;
  wasJumpHeld: boolean;
  exhausted: boolean;
}

export function createSimScratch(): PlayerSimScratch {
  return {
    velX: 0,
    velY: 0,
    coyoteMs: 0,
    jumpBufferMs: 0,
    wasJumpHeld: false,
    exhausted: false,
  };
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const DEFAULT_WORLD_BOUNDS: WorldBounds = {
  minX: 0,
  maxX: WORLD_WIDTH,
  minY: 0,
  maxY: WORLD_HEIGHT,
};

/**
 * Authoritative Deathrun platformer step — Quake-inspired accel/friction on
 * XY, gravity + coyote/buffer jump + apex hang on Z, energy sprint.
 * Shared by all modes. Keep feel in sync with `src/lib/platformer-sim.ts`.
 */
export function applyMovement(
  player: PlayerState,
  input: PlayerInput,
  dtSeconds: number,
  platforms: Iterable<PlatformState>,
  scratch: PlayerSimScratch,
  bounds: WorldBounds = DEFAULT_WORLD_BOUNDS
): void {
  if (!player.isAlive || player.hasFinished) return;

  player.cameraYaw = input.cameraYaw;
  player.aimAngle = input.aimAngle;
  player.aimPitch = Number.isFinite(input.aimPitch) ? input.aimPitch : 0;
  player.isCrouching = input.crouch;

  // Wish direction (already camera-relative from client).
  let wishX = input.moveX;
  let wishY = input.moveY;
  const wishMag = Math.hypot(wishX, wishY);
  if (wishMag > 1) {
    wishX /= wishMag;
    wishY /= wishMag;
  }

  const baseMax =
    player.role === 'trapper' ? TRAPPER_MOVE_SPEED : MAX_GROUND_SPEED;
  let maxSpeed = baseMax;
  if (input.crouch) maxSpeed *= CROUCH_SPEED_MULTIPLIER;

  // Energy / sprint (Godot stamina model).
  const wantsSprint =
    input.sprint && !input.crouch && wishMag > 0.2 && !scratch.exhausted;
  if (wantsSprint && player.energy > 0) {
    player.energy = Math.max(0, player.energy - ENERGY_DRAIN_RATE * dtSeconds);
    player.isSprinting = true;
    maxSpeed *= SPRINT_MULTIPLIER;
    if (player.energy <= 0) scratch.exhausted = true;
  } else {
    player.isSprinting = false;
    player.energy = Math.min(MAX_ENERGY, player.energy + ENERGY_REGEN_RATE * dtSeconds);
    if (player.energy >= ENERGY_EXHAUSTED_THRESHOLD) scratch.exhausted = false;
  }
  if (scratch.exhausted) maxSpeed *= ENERGY_EXHAUSTED_SPEED_MULT;

  let support = findSupportPlatform(
    player.x,
    player.y,
    player.z,
    platforms,
    PLAYER_RADIUS,
    LAND_SNAP_SLOW
  );
  if (!support) {
    const nudged = tryLedgeAssist(player.x, player.y, player.z, platforms);
    if (nudged) {
      player.x = nudged.x;
      player.y = nudged.y;
      support = findSupportPlatform(
        player.x,
        player.y,
        player.z,
        platforms,
        PLAYER_RADIUS,
        LAND_SNAP_SLOW
      );
    }
  }

  let grounded = !!support && player.vz <= 0.2;
  player.isGrounded = grounded;

  if (grounded && support) {
    scratch.coyoteMs = COYOTE_TIME_MS;
    player.z = support.topZ;
    player.vz = 0;
  } else {
    scratch.coyoteMs = Math.max(0, scratch.coyoteMs - dtSeconds * 1000);
  }

  // Jump pads: launch as soon as we would be standing on them.
  if (grounded && support!.platform.kind === 'jumpPad') {
    const boost =
      support!.platform.boost > 0 ? support!.platform.boost : JUMP_PAD_BOOST;
    player.vz = boost;
    player.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
  }

  // Jump buffer: edge-trigger on press; variable height on release.
  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  const jumpReleased = !input.jumpPressed && scratch.wasJumpHeld;
  if (jumpReleased && player.vz > 0) {
    player.vz *= JUMP_CUT_MULTIPLIER;
  }
  scratch.wasJumpHeld = input.jumpPressed;
  if (jumpEdge) scratch.jumpBufferMs = JUMP_BUFFER_MS;
  else scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dtSeconds * 1000);

  const canJump =
    (player.isGrounded || scratch.coyoteMs > 0) &&
    scratch.jumpBufferMs > 0;
  if (canJump && player.energy >= JUMP_ENERGY_COST * 0.2) {
    player.vz = JUMP_VELOCITY;
    player.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    player.energy = Math.max(0, player.energy - JUMP_ENERGY_COST);
  }

  // Horizontal accel
  if (grounded) {
    const onIce = support!.platform.kind === 'ice';
    const friction = onIce ? GROUND_FRICTION * 0.18 : GROUND_FRICTION;
    const accel = onIce ? GROUND_ACCEL * 0.45 : GROUND_ACCEL;
    const speed = Math.hypot(scratch.velX, scratch.velY);
    if (speed > 0.01) {
      const drop = Math.min(speed, friction * dtSeconds);
      const scale = (speed - drop) / speed;
      scratch.velX *= scale;
      scratch.velY *= scale;
    } else {
      scratch.velX = 0;
      scratch.velY = 0;
    }
    scratch.velX += wishX * accel * dtSeconds;
    scratch.velY += wishY * accel * dtSeconds;

    if (support!.platform.kind === 'conveyor' && support!.platform.conveyorSpeed > 0) {
      const spd = support!.platform.conveyorSpeed;
      scratch.velX += support!.platform.conveyorDirX * spd * dtSeconds * 2.2;
      scratch.velY += support!.platform.conveyorDirY * spd * dtSeconds * 2.2;
    }

    const newSpeed = Math.hypot(scratch.velX, scratch.velY);
    const speedCap = onIce ? maxSpeed * 1.35 : maxSpeed;
    if (newSpeed > speedCap && newSpeed > 0) {
      const s = speedCap / newSpeed;
      scratch.velX *= s;
      scratch.velY *= s;
    }
  } else {
    const apexBoost = Math.abs(player.vz) < APEX_VZ_THRESHOLD ? 1.18 : 1;
    scratch.velX += wishX * AIR_ACCEL * AIR_CONTROL * apexBoost * dtSeconds;
    scratch.velY += wishY * AIR_ACCEL * AIR_CONTROL * apexBoost * dtSeconds;
    const airMax = maxSpeed * MAX_AIR_SPEED_MULT;
    const newSpeed = Math.hypot(scratch.velX, scratch.velY);
    if (newSpeed > airMax && newSpeed > 0) {
      const s = airMax / newSpeed;
      scratch.velX *= s;
      scratch.velY *= s;
    }
  }

  player.x = clamp(
    player.x + scratch.velX * dtSeconds,
    bounds.minX + PLAYER_RADIUS,
    bounds.maxX - PLAYER_RADIUS
  );
  player.y = clamp(
    player.y + scratch.velY * dtSeconds,
    bounds.minY + PLAYER_RADIUS,
    bounds.maxY - PLAYER_RADIUS
  );

  const beforePushX = player.x;
  const beforePushY = player.y;
  const pushed = resolveSolidCollisions(
    { x: player.x, y: player.y, z: player.z },
    platforms
  );
  player.x = clamp(pushed.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  player.y = clamp(pushed.y, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  if (Math.abs(player.x - beforePushX) > 1e-5) scratch.velX = 0;
  if (Math.abs(player.y - beforePushY) > 1e-5) scratch.velY = 0;

  // Vertical — apex hang for readable jump arcs
  if (!player.isGrounded) {
    let g = GRAVITY;
    if (Math.abs(player.vz) < APEX_VZ_THRESHOLD) g *= APEX_GRAVITY_MULT;
    player.vz = Math.max(-MAX_FALL_SPEED, player.vz - g * dtSeconds);
    player.z += player.vz * dtSeconds;

    const snap = player.vz < -4 ? LAND_SNAP_FAST : LAND_SNAP_SLOW;
    let land = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      snap
    );
    if (!land) {
      const nudged = tryLedgeAssist(player.x, player.y, player.z, platforms);
      if (nudged) {
        player.x = nudged.x;
        player.y = nudged.y;
        land = findSupportPlatform(
          player.x,
          player.y,
          player.z,
          platforms,
          PLAYER_RADIUS,
          snap
        );
      }
    }
    if (land && player.vz <= 0 && player.z <= land.topZ + 0.08) {
      player.z = land.topZ;
      if (land.platform.kind === 'jumpPad') {
        player.vz = land.platform.boost > 0 ? land.platform.boost : JUMP_PAD_BOOST;
        player.isGrounded = false;
        scratch.coyoteMs = 0;
      } else {
        player.vz = 0;
        player.isGrounded = true;
        scratch.coyoteMs = COYOTE_TIME_MS;
        // Same-frame buffered jump on landing
        if (scratch.jumpBufferMs > 0 && player.energy >= JUMP_ENERGY_COST * 0.2) {
          player.vz = JUMP_VELOCITY;
          player.isGrounded = false;
          scratch.coyoteMs = 0;
          scratch.jumpBufferMs = 0;
          player.energy = Math.max(0, player.energy - JUMP_ENERGY_COST);
        }
      }
    }
  }

  if (player.z < VOID_Z) {
    player.vz = 0;
  }
}

/** Pull feet back onto a pad when barely off the rim (ledge forgiveness). */
function tryLedgeAssist(
  x: number,
  y: number,
  z: number,
  platforms: Iterable<PlatformState>
): { x: number; y: number } | null {
  for (const platform of platforms) {
    const topZ = platform.z;
    if (z < topZ - LAND_SNAP_SLOW || z > topZ + 0.55) continue;
    const halfW = platform.width / 2;
    const halfD = platform.depth / 2;
    const ox = Math.max(0, Math.abs(x - platform.x) - halfW);
    const oy = Math.max(0, Math.abs(y - platform.y) - halfD);
    if (ox > LEDGE_ASSIST || oy > LEDGE_ASSIST) continue;
    if (ox <= 0 && oy <= 0) continue;
    return {
      x: clamp(x, platform.x - halfW + 0.04, platform.x + halfW - 0.04),
      y: clamp(y, platform.y - halfD + 0.04, platform.y + halfD - 0.04),
    };
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
