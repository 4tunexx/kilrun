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
import { findSupportPlatform } from './platforms.js';

export interface PlayerInput {
  moveX: number; // -1..1, camera-relative forward/back intent (world X after client rotates)
  moveY: number; // -1..1, camera-relative strafe
  aimAngle: number;
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

/**
 * Authoritative Deathrun platformer step — Quake-inspired accel/friction on
 * XY, gravity + coyote/buffer jump on Z, energy sprint. Shared by all modes.
 */
export function applyMovement(
  player: PlayerState,
  input: PlayerInput,
  dtSeconds: number,
  platforms: Iterable<PlatformState>,
  scratch: PlayerSimScratch
): void {
  if (!player.isAlive || player.hasFinished) return;

  player.cameraYaw = input.cameraYaw;
  player.aimAngle = input.aimAngle;
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

  // Jump buffer: edge-trigger on press.
  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  scratch.wasJumpHeld = input.jumpPressed;
  if (jumpEdge) scratch.jumpBufferMs = JUMP_BUFFER_MS;
  else scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dtSeconds * 1000);

  const canJump =
    player.isGrounded &&
    scratch.coyoteMs > 0 &&
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
    // Friction
    const speed = Math.hypot(scratch.velX, scratch.velY);
    if (speed > 0.01) {
      const drop = Math.min(speed, GROUND_FRICTION * dtSeconds);
      const scale = (speed - drop) / speed;
      scratch.velX *= scale;
      scratch.velY *= scale;
    } else {
      scratch.velX = 0;
      scratch.velY = 0;
    }
    // Accel toward wish
    scratch.velX += wishX * GROUND_ACCEL * dtSeconds;
    scratch.velY += wishY * GROUND_ACCEL * dtSeconds;
    const newSpeed = Math.hypot(scratch.velX, scratch.velY);
    if (newSpeed > maxSpeed && newSpeed > 0) {
      const s = maxSpeed / newSpeed;
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

  player.x = clamp(player.x + scratch.velX * dtSeconds, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(player.y + scratch.velY * dtSeconds, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

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

  if (player.z < VOID_Z) {
    player.health = 0;
    player.isAlive = false;
    player.vz = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
