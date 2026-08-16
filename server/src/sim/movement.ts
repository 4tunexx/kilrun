import { PlatformState, PlayerState } from '../schema/RoomState.js';
import {
  APEX_GRAVITY_MULT,
  APEX_VZ_THRESHOLD,
  COYOTE_TIME_MS,
  CROUCH_SPEED_MULTIPLIER,
  DOUBLE_JUMP_VELOCITY,
  ENERGY_DRAIN_RATE,
  ENERGY_EXHAUSTED_SPEED_MULT,
  ENERGY_EXHAUSTED_THRESHOLD,
  ENERGY_REGEN_RATE,
  FLIP_COOLDOWN_MS,
  FLIP_DURATION_MS,
  FLIP_ENERGY_COST,
  FLIP_PUSH_SPEED,
  FLIP_VELOCITY,
  GRAVITY,
  JUMP_BUFFER_MS,
  JUMP_CUT_MULTIPLIER,
  JUMP_ENERGY_COST,
  JUMP_PAD_BOOST,
  SLIDE_ENERGY_COST,
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
  PLAYER_HEIGHT,
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
import { isFlyActive, getPlayerAbilityLevels } from './active-abilities.js';
import type { CustomMoveDef } from '../../../shared/custom-moves.js';

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
  /** ADS / RMB — used for sniper cone tighten. */
  aimHeld?: boolean;
  interactPressed: boolean;
  /** True while melee swing is active (Foundry speed_mod 0.5). */
  meleeActive?: boolean;
  /** Held state for the back-flip move (V) — edge-detected here like crouch. */
  flipPressed?: boolean;
  /** Dedicated slide key (default G, held while sprinting) — edge-detected
   *  here. Replaced the old crouch+sprint combo trigger. */
  slidePressed?: boolean;
  /** ids of map-authored CustomMoveDef entries whose key is currently held. */
  customMoveKeysHeld?: string[];
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
  aimHeld: false,
  interactPressed: false,
  meleeActive: false,
  flipPressed: false,
  slidePressed: false,
};

export function defaultInput(): PlayerInput {
  return { ...EMPTY_INPUT };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates a raw client 'input' message before it's merged into
 * latestInputs. Two real bugs this closes:
 *  - `new Set(input.customMoveKeysHeld ?? [])` below throws on any non-array
 *    truthy value (e.g. a number or plain object) — uncaught, that crashes
 *    the whole Node process (every room, not just this match) since the sim
 *    tick has no surrounding try/catch.
 *  - moveX/moveY/cameraYaw/aimAngle/aimPitch were assigned with no finite
 *    check; msgpack (unlike JSON) can carry NaN/Infinity over the wire, and
 *    once one lands here it permanently corrupts that player's x/y/z for
 *    the rest of the match (collision/hit-detection math propagates it).
 * Invalid fields are OMITTED (not zeroed) so the merge in each room's
 * onMessage('input', ...) — `{...defaultInput(), ...latestInputs.get(id),
 * ...sanitizeInput(input)}` — falls through to the last known-good value
 * instead of snapping to a fallback a client could exploit as a signal.
 */
export function sanitizeInput(raw: unknown): Partial<PlayerInput> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PlayerInput> = {};
  if (isFiniteNumber(r.moveX)) out.moveX = r.moveX;
  if (isFiniteNumber(r.moveY)) out.moveY = r.moveY;
  if (isFiniteNumber(r.aimAngle)) out.aimAngle = r.aimAngle;
  if (isFiniteNumber(r.aimPitch)) out.aimPitch = r.aimPitch;
  if (isFiniteNumber(r.cameraYaw)) out.cameraYaw = r.cameraYaw;
  if (typeof r.crouch === 'boolean') out.crouch = r.crouch;
  if (typeof r.sprint === 'boolean') out.sprint = r.sprint;
  if (typeof r.jumpPressed === 'boolean') out.jumpPressed = r.jumpPressed;
  if (typeof r.shootPressed === 'boolean') out.shootPressed = r.shootPressed;
  if (typeof r.aimHeld === 'boolean') out.aimHeld = r.aimHeld;
  if (typeof r.interactPressed === 'boolean') out.interactPressed = r.interactPressed;
  if (typeof r.meleeActive === 'boolean') out.meleeActive = r.meleeActive;
  if (typeof r.flipPressed === 'boolean') out.flipPressed = r.flipPressed;
  if (typeof r.slidePressed === 'boolean') out.slidePressed = r.slidePressed;
  if (Array.isArray(r.customMoveKeysHeld)) {
    out.customMoveKeysHeld = r.customMoveKeysHeld
      .filter((k): k is string => typeof k === 'string')
      .slice(0, 32);
  }
  return out;
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
  /** Wall normal touched THIS tick's collision pass (0,0 if not touching). Read
   * next tick when deciding whether a jump press should wall-jump. */
  touchingWallX: number;
  touchingWallY: number;
  /** Counts down after a wall jump; while active, wish input doesn't override
   * the outward kick velocity (so holding into the wall doesn't cancel it). */
  wallJumpLockoutMs: number;
  /** Stops chain-jumping the SAME wall in place for infinite height; a
   * different wall (or same wall after this expires) is unaffected. */
  wallJumpCooldownMs: number;
  wallJumpCooldownNormalX: number;
  wallJumpCooldownNormalY: number;
  /** Platform id under feet last tick (moving-platform carry). */
  supportPlatformId: string | null;
  /** Remaining ms of an active slide (0 = not sliding). */
  slideMs: number;
  /** Remaining ms before a new slide can start. */
  slideCooldownMs: number;
  /** Edge-detects the crouch button so holding it doesn't retrigger every tick. */
  wasCrouchHeld: boolean;
  /** Edge-detects the dedicated slide key (see PlayerInput.slidePressed). */
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
  /** Edge-detects each custom move's key (CustomMoveDef.id -> was held last tick). */
  customMoveWasHeld: Map<string, boolean>;
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
    touchingWallX: 0,
    touchingWallY: 0,
    wallJumpLockoutMs: 0,
    wallJumpCooldownMs: 0,
    wallJumpCooldownNormalX: 0,
    wallJumpCooldownNormalY: 0,
    supportPlatformId: null,
    slideMs: 0,
    slideCooldownMs: 0,
    wasCrouchHeld: false,
    wasSlideKeyHeld: false,
    flipMs: 0,
    flipCooldownMs: 0,
    wasFlipHeld: false,
    flipLockoutMs: 0,
    customMoveWasHeld: new Map(),
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
  wallJumpEnabled?: boolean;
  wallJumpHorizVel?: number;
  wallJumpVertVel?: number;
  wallSlideGravMult?: number;
  slideEnabled?: boolean;
  slideMult?: number;
  slideDurationMs?: number;
  slideCooldownMs?: number;
  /** Map-authored custom moves (Player Model Studio → Moves tab). */
  customMoves?: CustomMoveDef[];
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
  const effJumpVel = (physOpts?.jumpVelocity ?? JUMP_VELOCITY) * (player.ability.jumpMult || 1);
  const effDoubleJumpVel =
    (physOpts?.doubleJumpVelocity ?? DOUBLE_JUMP_VELOCITY) * (player.ability.jumpMult || 1);
  const effDoubleJumpEnabled = physOpts?.doubleJumpEnabled ?? true;
  const effJumpCut = physOpts?.jumpCutMult ?? JUMP_CUT_MULTIPLIER;
  const effCoyoteMs = physOpts?.coyoteMs ?? COYOTE_TIME_MS;
  const effJumpBufferMs = physOpts?.jumpBufferMs ?? JUMP_BUFFER_MS;
  const effWalkSpeed = (physOpts?.walkSpeed ?? MAX_GROUND_SPEED) * (player.ability.speedMult || 1);
  const effSprintMult = physOpts?.sprintMult ?? SPRINT_MULTIPLIER;
  const effCrouchMult = physOpts?.crouchMult ?? CROUCH_SPEED_MULTIPLIER;
  const effMaxFall = physOpts?.maxFallSpeed ?? MAX_FALL_SPEED;
  const effApexGravMult = physOpts?.apexGravMult ?? APEX_GRAVITY_MULT;
  const effWallJumpEnabled = physOpts?.wallJumpEnabled ?? WALL_JUMP_ENABLED_DEFAULT;
  const effWallJumpHorizVel = physOpts?.wallJumpHorizVel ?? WALL_JUMP_HORIZ_VEL;
  const effWallJumpVertVel = physOpts?.wallJumpVertVel ?? WALL_JUMP_VERT_VEL;
  const effWallSlideGravMult = physOpts?.wallSlideGravMult ?? WALL_SLIDE_GRAV_MULT;

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
    player.energy = Math.min(getMaxEnergyFor(player), player.energy + ENERGY_REGEN_RATE * dtSeconds);
    if (player.energy >= ENERGY_EXHAUSTED_THRESHOLD) scratch.exhausted = false;
  }
  if (scratch.exhausted) maxSpeed *= ENERGY_EXHAUSTED_SPEED_MULT;

  const wasGroundedLastTick = player.isGrounded;

  let support = findSupportPlatform(
    player.x,
    player.y,
    player.z,
    platforms,
    PLAYER_RADIUS,
    wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
  );
  if (!support && wasGroundedLastTick && player.vz >= -0.5) {
    support = findSupportPlatform(
      player.x,
      player.y,
      player.z,
      platforms,
      PLAYER_RADIUS,
      LAND_STEP_CLIMB
    );
  }
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
        wasGroundedLastTick ? LAND_STEP_DESCEND : LAND_SNAP_SLOW
      );
      if (!support && wasGroundedLastTick && player.vz >= -0.5) {
        support = findSupportPlatform(
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

  let grounded = !!support && player.vz <= 0.2;
  player.isGrounded = grounded;

  // Slide (dedicated key, default G, held while sprinting) — see
  // CombatSettings.slideEnabled doc. A speed-boosted burst for
  // slideDurationMs, then a cooldown before it can retrigger. Slide-jump
  // falls out naturally without extra logic: jumping only ever sets vz, so
  // a jump mid-slide keeps whatever slide-boosted velX/velY the player
  // already had (momentum carries into the air).
  const effSlideEnabled = physOpts?.slideEnabled ?? true;
  const effSlideMult = physOpts?.slideMult ?? 2.2;
  const effSlideDurationMs = physOpts?.slideDurationMs ?? 600;
  const effSlideCooldownMs = physOpts?.slideCooldownMs ?? 1000;
  const crouchKeyEdge = !!input.crouch && !scratch.wasCrouchHeld;
  scratch.wasCrouchHeld = !!input.crouch;
  const slideKeyEdge = !!input.slidePressed && !scratch.wasSlideKeyHeld;
  scratch.wasSlideKeyHeld = !!input.slidePressed;
  const slideTriggered = slideKeyEdge || (crouchKeyEdge && input.sprint);
  if (
    effSlideEnabled &&
    slideTriggered &&
    grounded &&
    wishMag > 0.2 &&
    !scratch.exhausted &&
    scratch.slideMs <= 0 &&
    scratch.slideCooldownMs <= 0 &&
    player.energy >= SLIDE_ENERGY_COST
  ) {
    scratch.slideMs = effSlideDurationMs;
    player.energy = Math.max(0, player.energy - SLIDE_ENERGY_COST);
  }
  player.isSliding = scratch.slideMs > 0;
  if (scratch.slideMs > 0) {
    maxSpeed = baseMax * effSlideMult;
    scratch.slideMs = Math.max(0, scratch.slideMs - dtSeconds * 1000);
    if (scratch.slideMs <= 0) {
      scratch.slideCooldownMs = effSlideCooldownMs;
      player.slideCooldownEndsAt = Date.now() + effSlideCooldownMs;
    }
  } else if (scratch.slideCooldownMs > 0) {
    scratch.slideCooldownMs = Math.max(0, scratch.slideCooldownMs - dtSeconds * 1000);
  }

  // Back flip (V) — grounded acrobatic hop, energy-gated + cooldown like
  // slide but independent of sprint/crouch state. Mirrors the same
  // edge-detect + duration/cooldown pattern as slide above.
  const flipEdge = (input.flipPressed ?? false) && !scratch.wasFlipHeld;
  scratch.wasFlipHeld = input.flipPressed ?? false;
  if (
    flipEdge &&
    grounded &&
    !scratch.exhausted &&
    scratch.flipMs <= 0 &&
    scratch.flipCooldownMs <= 0 &&
    player.energy >= FLIP_ENERGY_COST
  ) {
    scratch.flipMs = FLIP_DURATION_MS;
    player.energy = Math.max(0, player.energy - FLIP_ENERGY_COST);
    player.vz = FLIP_VELOCITY;
    player.isGrounded = false;
    grounded = false;
    // Kick backward (opposite of camera-forward) — same forward-vector
    // convention as the client's wish-vector rotation, negated.
    scratch.velX = -Math.cos(player.cameraYaw) * FLIP_PUSH_SPEED;
    scratch.velY = -Math.sin(player.cameraYaw) * FLIP_PUSH_SPEED;
    scratch.flipLockoutMs = FLIP_DURATION_MS;
  }
  player.isFlipping = scratch.flipMs > 0;
  if (scratch.flipMs > 0) {
    scratch.flipMs = Math.max(0, scratch.flipMs - dtSeconds * 1000);
    if (scratch.flipMs <= 0) {
      scratch.flipCooldownMs = FLIP_COOLDOWN_MS;
      player.flipCooldownEndsAt = Date.now() + FLIP_COOLDOWN_MS;
    }
  } else if (scratch.flipCooldownMs > 0) {
    scratch.flipCooldownMs = Math.max(0, scratch.flipCooldownMs - dtSeconds * 1000);
  }

  // Map-authored custom moves (Player Model Studio → Moves tab). Only one
  // can be active at a time (like attack). Cooldown is stamped immediately
  // at trigger time (activeUntil + cooldownMs) rather than on expiry, so
  // there's no separate "just finished" transition to detect.
  if (physOpts?.customMoves?.length) {
    const now = Date.now();
    const heldKeys = new Set(input.customMoveKeysHeld ?? []);
    const busy = now < player.customMoves.activeUntil;
    // Each custom move auto-creates a matching skill-tree PowerDefinition
    // ("custom_move_<id>", see player-model-studio.tsx's upsertMovePower) —
    // gate on it being unlocked (level > 0) so low-level players have
    // something to spend Skill Points on, same as any other power. Parsed
    // lazily (only when a move's key is actually held this tick) since
    // JSON.parse on every player every tick otherwise runs cold for maps
    // with no custom moves defined.
    let abilityLevels: ReturnType<typeof getPlayerAbilityLevels> | null = null;
    for (const move of physOpts.customMoves) {
      const wasHeld = scratch.customMoveWasHeld.get(move.id) ?? false;
      const isHeld = heldKeys.has(move.id);
      scratch.customMoveWasHeld.set(move.id, isHeld);
      const edge = isHeld && !wasHeld;
      const cooldownUntil = player.customMoves.cooldownEndsAt.get(move.id) ?? 0;
      if (edge && !abilityLevels) abilityLevels = getPlayerAbilityLevels(player);
      const unlocked = edge ? (abilityLevels?.[`custom_move_${move.id}`] ?? 0) > 0 : false;
      if (
        edge &&
        unlocked &&
        !busy &&
        now >= cooldownUntil &&
        (!move.groundedOnly || grounded) &&
        !scratch.exhausted &&
        player.energy >= move.energyCost
      ) {
        player.customMoves.activeMoveId = move.id;
        player.customMoves.activeUntil = now + move.durationMs;
        player.customMoves.cooldownEndsAt.set(move.id, now + move.durationMs + move.cooldownMs);
        player.energy = Math.max(0, player.energy - move.energyCost);
        if (move.vzBoost && grounded) {
          player.vz = move.vzBoost;
          player.isGrounded = false;
          grounded = false;
        }
        break;
      }
    }
    if (now >= player.customMoves.activeUntil) player.customMoves.activeMoveId = '';
  }

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
  } else if (scratch.wallJumpLockoutMs <= 0 && scratch.flipLockoutMs <= 0) {
    scratch.velX = wishX * maxSpeed;
    scratch.velY = wishY * maxSpeed;
  }
  scratch.flipLockoutMs = Math.max(0, scratch.flipLockoutMs - dtSeconds * 1000);

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
    platforms,
    PLAYER_RADIUS,
    PLAYER_HEIGHT,
    player.isGrounded
  );
  player.x = clamp(pushed.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  player.y = clamp(pushed.y, bounds.minY + PLAYER_RADIUS, bounds.maxY - PLAYER_RADIUS);
  player.z = pushed.z;
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
    // Apex softening: near the top of the arc (|vz| within the apex band),
    // scale gravity by the map's apexGravMult (<1 = floatier hang, >1 =
    // snappier). Neutral by default (mult 1, band 0) so maps that never set
    // apexGravMult are byte-identical to before this existed.
    const atApex = Math.abs(player.vz) <= Math.max(APEX_VZ_THRESHOLD, 1.5);
    const gravityThisTick = slidingOnWall
      ? effGravity * effWallSlideGravMult
      : atApex
        ? effGravity * effApexGravMult
        : effGravity;
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
