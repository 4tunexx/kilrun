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
  GROUND_FOLLOW_SPEED,
  LAND_STEP_CLIMB,
  LAND_STEP_DESCEND,
  LEDGE_ASSIST,
  MAX_FALL_SPEED,
  MAX_GROUND_SPEED,
  MELEE_MOVE_MULT,
  PLAYER_RADIUS,
  SPRINT_MULTIPLIER,
  TRAPPER_MOVE_SPEED,
  VOID_Z,
  WALL_JUMP_ENABLED_DEFAULT,
  WALL_JUMP_HORIZ_VEL,
  WALL_JUMP_LOCKOUT_MS,
  WALL_JUMP_SAME_WALL_COOLDOWN_MS,
  WALL_JUMP_VERT_VEL,
  WALL_SLIDE_GRAV_MULT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants.js';
import { findSupportPlatform, resolveSolidCollisions } from './platforms.js';
import { getMaxEnergyFor } from './ability-stats.js';
  const flyActive = isFlyActive(player, Date.now());
  if (flyActive) {
    player.isGrounded = false;
    player.vz = 0;
    player.z += (input.jumpPressed ? 1.4 : input.crouch ? -1.4 : 0) * dtSeconds;
    scratch.coyoteMs = 0;
    scratch.jumpCount = 0;
    scratch.jumpBufferMs = 0;
  } else {
    // Soft ground glue: stepped ramp pads change topZ in small increments.
    // Hard-assigning player.z each tick (or absorbing the full delta in one
    // frame) made walking ramps feel like a bumpy road; the client camera
    // amplified those hops. Rate-limit while already grounded; allow a larger
    // snap only on fresh landings.
    if (grounded && support) {
      const delta = support.topZ - player.z;
      if (!wasGroundedLastTick) {
        if (delta > 0) player.z += Math.min(delta, LAND_STEP_CLIMB);
        else if (delta < 0) player.z += Math.max(delta, -LAND_STEP_DESCEND);
        else player.z = support.topZ;
      } else {
        const maxStep = Math.max(GROUND_FOLLOW_SPEED * Math.max(dtSeconds, 1 / 240), 0.002);
        if (Math.abs(delta) <= 0.0015) {
          player.z = support.topZ;
        } else if (delta > 0) {
          player.z += Math.min(delta, Math.min(maxStep, LAND_STEP_CLIMB));
        } else {
          player.z += Math.max(delta, -Math.min(maxStep, LAND_STEP_DESCEND));
        }
      }
      player.vz = 0;
      scratch.coyoteMs = effCoyoteMs;
      scratch.jumpCount = 0;
    } else {
      if (scratch.jumpCount === 0 && scratch.coyoteMs <= 0) {
        scratch.jumpCount = 1;
      }
      scratch.coyoteMs = Math.max(0, scratch.coyoteMs - dtSeconds * 1000);
    }
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
  // Wall-jump gets first say when airborne and touching a wall — takes
  // priority over the double-jump slot but doesn't consume it (jumpCount
  // resets to 1 after a wall jump, so a normal double jump is still available).
  const jumpEdge = input.jumpPressed && !scratch.wasJumpHeld;
  const jumpReleased = !input.jumpPressed && scratch.wasJumpHeld;
  if (jumpReleased && player.vz > 0 && scratch.jumpCount === 1) {
    player.vz *= effJumpCut;
    scratch.coyoteMs = 0;
  }
  scratch.wasJumpHeld = input.jumpPressed;

  const wasTouchingWall = scratch.touchingWallX !== 0 || scratch.touchingWallY !== 0;
  const onCooldownWall =
    scratch.wallJumpCooldownMs > 0 &&
    scratch.wallJumpCooldownNormalX === scratch.touchingWallX &&
    scratch.wallJumpCooldownNormalY === scratch.touchingWallY;
  const canWallJump = effWallJumpEnabled && !grounded && wasTouchingWall && !onCooldownWall;

  if (jumpEdge) {
    if (canWallJump) {
      player.vz = effWallJumpVertVel;
      scratch.velX = scratch.touchingWallX * effWallJumpHorizVel;
      scratch.velY = scratch.touchingWallY * effWallJumpHorizVel;
      scratch.wallJumpLockoutMs = WALL_JUMP_LOCKOUT_MS;
      scratch.wallJumpCooldownMs = WALL_JUMP_SAME_WALL_COOLDOWN_MS;
      scratch.wallJumpCooldownNormalX = scratch.touchingWallX;
      scratch.wallJumpCooldownNormalY = scratch.touchingWallY;
      player.isGrounded = false;
      grounded = false;
      scratch.coyoteMs = 0;
      scratch.jumpBufferMs = 0;
      scratch.jumpCount = 1;
    } else if (scratch.jumpCount === 0 || scratch.jumpCount === 2) {
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
  scratch.wallJumpLockoutMs = Math.max(0, scratch.wallJumpLockoutMs - dtSeconds * 1000);
  scratch.wallJumpCooldownMs = Math.max(0, scratch.wallJumpCooldownMs - dtSeconds * 1000);

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
  } else if (scratch.wallJumpLockoutMs <= 0) {
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
  scratch.touchingWallX = pushed.touchingWall ? pushed.wallNormalX : 0;
  scratch.touchingWallY = pushed.touchingWall ? pushed.wallNormalY : 0;

  // Same-frame re-stick after XY move so feet follow the next ramp cell now.
  if (player.isGrounded) {
    let post = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      LAND_STEP_DESCEND
    );
    if (!post) {
      post = findSupportPlatform(
        player.x,
        player.y,
        player.z,
        platforms,
        PLAYER_RADIUS,
        LAND_STEP_CLIMB
      );
    }
    if (post) {
      support = post;
      const delta = post.topZ - player.z;
      const maxStep = Math.max(GROUND_FOLLOW_SPEED * Math.max(dtSeconds, 1 / 240), 0.002);
      if (Math.abs(delta) <= 0.0015) {
        player.z = post.topZ;
      } else if (delta > 0) {
        player.z += Math.min(delta, Math.min(maxStep, LAND_STEP_CLIMB));
      } else {
        player.z += Math.max(delta, -Math.min(maxStep, LAND_STEP_DESCEND));
      }
      player.vz = 0;
      player.isGrounded = true;
      scratch.coyoteMs = effCoyoteMs;
      scratch.jumpCount = 0;
    } else {
      player.isGrounded = false;
    }
  }

  // Vertical — constant Foundry gravity
  if (!player.isGrounded) {
    const slidingOnWall =
      effWallJumpEnabled &&
      pushed.touchingWall &&
      player.vz <= 0 &&
      scratch.wallJumpLockoutMs <= 0;
    const gravityThisTick = slidingOnWall ? effGravity * effWallSlideGravMult : effGravity;
    player.vz = Math.max(-effMaxFall, player.vz - gravityThisTick * dtSeconds);
    player.z += player.vz * dtSeconds;

    const baseSnap = player.vz < -4 ? LAND_SNAP_FAST : LAND_SNAP_SLOW;
    const softSnap = player.vz > -2 ? Math.max(baseSnap, LAND_STEP_CLIMB) : baseSnap;
    let land = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      softSnap
    );
    if (!land && player.vz >= -0.5) {
      land = findSupportPlatform(
        player.x,
        player.y,
        player.z,
        platforms,
        PLAYER_RADIUS,
        LAND_STEP_CLIMB
      );
    }
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
          softSnap
        );
        if (!land && player.vz >= -0.5) {
          land = findSupportPlatform(
            player.x,
            player.y,
            player.z,
            platforms,
            PLAYER_RADIUS,
            LAND_STEP_CLIMB
          );
        }
      }
    }
    if (land && player.vz <= 0 && player.z <= land.topZ + 0.15) {
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

  if (player.isGrounded) {
    const grounded = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      LAND_STEP_DESCEND
    );
    scratch.supportPlatformId = grounded?.platform.id ?? null;
  } else {
    scratch.supportPlatformId = null;
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
