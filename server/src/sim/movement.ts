import { PlatformState, PlayerState } from '../schema/RoomState.js';
import {
  COYOTE_TIME_MS,
  CROUCH_SPEED_MULTIPLIER,
  DOUBLE_JUMP_VELOCITY,
  ENERGY_DRAIN_RATE,
  ENERGY_EXHAUSTED_SPEED_MULT,
  ENERGY_EXHAUSTED_THRESHOLD,
  ENERGY_REGEN_RATE,
  GRAVITY,
  JUMP_BUFFER_MS,
  JUMP_CUT_MULTIPLIER,
  JUMP_ENERGY_COST,
  JUMP_PAD_BOOST,
  JUMP_VELOCITY,
  LAND_SNAP_FAST,
  LAND_SNAP_SLOW,
  LEDGE_ASSIST,
  MAX_ENERGY,
  MAX_FALL_SPEED,
  MAX_GROUND_SPEED,
  MELEE_MOVE_MULT,
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
  /** True while melee swing is active (Foundry speed_mod 0.5). */
  meleeActive?: boolean;
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
  meleeActive: false,
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
  /** Foundry jump_count: 0 ground, 1 after first/walk-off, 2 after double. */
  jumpCount: number;
}

export function createSimScratch(): PlayerSimScratch {
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

/** Optional per-map physics overrides (from map combatSettings). */
export interface MovementPhysicsOpts {
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
}

/**
 * Authoritative Deathrun platformer step — Foundry (Godot) feel:
 * direct wish×speed on XY, gravity + coyote/buffer + double jump on Z, energy sprint.
 * Shared by all modes. Keep feel in sync with `src/lib/platformer-sim.ts`.
 */
export function applyMovement(
  player: PlayerState,
  input: PlayerInput,
  dtSeconds: number,
  platforms: Iterable<PlatformState>,
  scratch: PlayerSimScratch,
  bounds: WorldBounds = DEFAULT_WORLD_BOUNDS,
  physOpts?: MovementPhysicsOpts
): void {
  if (!player.isAlive || player.hasFinished) return;

  // Resolve per-map overrides over base constants.
  const effGravity = physOpts?.gravity ?? GRAVITY;
  const effJumpVel = physOpts?.jumpVelocity ?? JUMP_VELOCITY;
  const effDoubleJumpVel = physOpts?.doubleJumpVelocity ?? DOUBLE_JUMP_VELOCITY;
  const effDoubleJumpEnabled = physOpts?.doubleJumpEnabled ?? true;
  const effJumpCut = physOpts?.jumpCutMult ?? JUMP_CUT_MULTIPLIER;
  const effCoyoteMs = physOpts?.coyoteMs ?? COYOTE_TIME_MS;
  const effJumpBufferMs = physOpts?.jumpBufferMs ?? JUMP_BUFFER_MS;
  const effWalkSpeed = physOpts?.walkSpeed ?? MAX_GROUND_SPEED;
  const effSprintMult = physOpts?.sprintMult ?? SPRINT_MULTIPLIER;
  const effCrouchMult = physOpts?.crouchMult ?? CROUCH_SPEED_MULTIPLIER;
  const effMaxFall = physOpts?.maxFallSpeed ?? MAX_FALL_SPEED;

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
    player.role === 'trapper' ? TRAPPER_MOVE_SPEED : effWalkSpeed;
  let maxSpeed = baseMax;
  if (input.crouch) maxSpeed *= effCrouchMult;
  if (input.meleeActive) maxSpeed *= MELEE_MOVE_MULT;

  // Energy / sprint (Kilrun stamina on top of Foundry base speed).
  const wantsSprint =
    input.sprint && !input.crouch && wishMag > 0.2 && !scratch.exhausted;
  if (wantsSprint && player.energy > 0) {
    player.energy = Math.max(0, player.energy - ENERGY_DRAIN_RATE * dtSeconds);
    player.isSprinting = true;
    maxSpeed *= effSprintMult;
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
    scratch.coyoteMs = effCoyoteMs;
    scratch.jumpCount = 0;
    player.z = support.topZ;
    player.vz = 0;
  } else {
    if (scratch.jumpCount === 0 && scratch.coyoteMs <= 0) {
      scratch.jumpCount = 1;
    }
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
    scratch.jumpCount = 1;
  }

  // Foundry jump: buffer for ground/coyote; immediate double jump when jumpCount === 1.
  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  const jumpReleased = !input.jumpPressed && scratch.wasJumpHeld;
  if (jumpReleased && player.vz > 0 && scratch.jumpCount === 1) {
    player.vz *= effJumpCut;
    scratch.coyoteMs = 0;
  }
  scratch.wasJumpHeld = input.jumpPressed;

  if (jumpEdge) {
    if (scratch.jumpCount === 0 || scratch.jumpCount === 2) {
      scratch.jumpBufferMs = effJumpBufferMs;
    } else if (
      scratch.jumpCount === 1 &&
      effDoubleJumpEnabled &&
      player.energy >= JUMP_ENERGY_COST * 0.2
    ) {
      player.vz = effDoubleJumpVel;
      player.isGrounded = false;
      grounded = false;
      scratch.coyoteMs = 0;
      scratch.jumpCount = 2;
      player.energy = Math.max(0, player.energy - JUMP_ENERGY_COST);
    }
  } else {
    scratch.jumpBufferMs = Math.max(0, scratch.jumpBufferMs - dtSeconds * 1000);
  }

  if (
    scratch.coyoteMs > 0 &&
    scratch.jumpBufferMs > 0 &&
    player.energy >= JUMP_ENERGY_COST * 0.2
  ) {
    player.vz = effJumpVel;
    player.isGrounded = false;
    grounded = false;
    scratch.coyoteMs = 0;
    scratch.jumpBufferMs = 0;
    scratch.jumpCount = Math.max(1, scratch.jumpCount + 1);
    player.energy = Math.max(0, player.energy - JUMP_ENERGY_COST);
  }

  // Foundry: velocity.xz = move_direction * speed (ground + air). Ice keeps slip.
  const onIce = grounded && support?.platform.kind === 'ice';
  const onSand = grounded && support?.platform.kind === 'sand';
  const onWater = grounded && support?.platform.kind === 'water';
  if (onSand) maxSpeed *= 0.62;
  if (onWater) maxSpeed *= 0.55;
  if (onIce) {
    scratch.velX += wishX * maxSpeed * 2.5 * dtSeconds;
    scratch.velY += wishY * maxSpeed * 2.5 * dtSeconds;
    const ns = Math.hypot(scratch.velX, scratch.velY);
    const cap = maxSpeed * 1.35;
    if (ns > cap && ns > 0) {
      scratch.velX *= cap / ns;
      scratch.velY *= cap / ns;
    }
    const friction = 4 * dtSeconds;
    const speed = Math.hypot(scratch.velX, scratch.velY);
    if (wishMag < 0.05 && speed > 0.01) {
      const drop = Math.min(speed, friction);
      scratch.velX *= (speed - drop) / speed;
      scratch.velY *= (speed - drop) / speed;
    }
  } else {
    scratch.velX = wishX * maxSpeed;
    scratch.velY = wishY * maxSpeed;
  }

  if (onWater && support && support.platform.height > 0.8 && player.vz < 0) {
    player.vz *= 0.85;
  }

  if (grounded && support?.platform.kind === 'conveyor' && support.platform.conveyorSpeed > 0) {
    const spd = support.platform.conveyorSpeed;
    scratch.velX += support.platform.conveyorDirX * spd;
    scratch.velY += support.platform.conveyorDirY * spd;
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

  // Vertical — constant Foundry gravity
  if (!player.isGrounded) {
    player.vz = Math.max(-effMaxFall, player.vz - effGravity * dtSeconds);
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
        scratch.jumpCount = 1;
      } else {
        player.vz = 0;
        player.isGrounded = true;
        scratch.coyoteMs = effCoyoteMs;
        scratch.jumpCount = 0;
        // Same-frame buffered jump on landing
        if (scratch.jumpBufferMs > 0 && player.energy >= JUMP_ENERGY_COST * 0.2) {
          player.vz = effJumpVel;
          player.isGrounded = false;
          scratch.coyoteMs = 0;
          scratch.jumpBufferMs = 0;
          scratch.jumpCount = 1;
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
