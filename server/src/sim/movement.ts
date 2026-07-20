import { PlatformState, PlayerState } from '../schema/RoomState.js';
import {
  AIR_ACCEL,
  AIR_CONTROL,
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
 * XY, gravity + coyote/buffer jump on Z, energy sprint. Shared by all modes.
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

  const support = findSupportPlatform(
    player.x,
    player.y,
    player.z,
    platforms,
    PLAYER_RADIUS
  );
  const grounded = !!support && player.vz <= 0.15;
  player.isGrounded = grounded;

  if (grounded) {
    scratch.coyoteMs = COYOTE_TIME_MS;
    player.z = support!.topZ;
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
  if (canJump && player.energy >= JUMP_ENERGY_COST * 0.25) {
    player.vz = JUMP_VELOCITY;
    player.isGrounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    player.energy = Math.max(0, player.energy - JUMP_ENERGY_COST);
  }

  // Horizontal accel
  if (grounded) {
    const onIce = support!.platform.kind === 'ice';
    const friction = onIce ? GROUND_FRICTION * 0.18 : GROUND_FRICTION;
    const accel = onIce ? GROUND_ACCEL * 0.45 : GROUND_ACCEL;
    // Friction
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
    // Accel toward wish
    scratch.velX += wishX * accel * dtSeconds;
    scratch.velY += wishY * accel * dtSeconds;

    // Conveyor belt push
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
    // Air control
    scratch.velX += wishX * AIR_ACCEL * AIR_CONTROL * dtSeconds;
    scratch.velY += wishY * AIR_ACCEL * AIR_CONTROL * dtSeconds;
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

  // Side / wall AABB push-out for tall solids — kill velocity into the wall so we slide
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

  // Vertical
  if (!player.isGrounded) {
    player.vz = Math.max(-MAX_FALL_SPEED, player.vz - GRAVITY * dtSeconds);
    player.z += player.vz * dtSeconds;

    // Land on platform while falling
    const land = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      0.5
    );
    if (land && player.vz <= 0 && player.z <= land.topZ + 0.05) {
      player.z = land.topZ;
      if (land.platform.kind === 'jumpPad') {
        player.vz = land.platform.boost > 0 ? land.platform.boost : JUMP_PAD_BOOST;
        player.isGrounded = false;
        scratch.coyoteMs = 0;
      } else {
        player.vz = 0;
        player.isGrounded = true;
        scratch.coyoteMs = COYOTE_TIME_MS;
      }
    }
  }

  // Void fall is handled by the room (checkpoint soft-respawn vs eliminate).
  if (player.z < VOID_Z) {
    player.vz = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
