import { PlatformState, PlayerState } from '../schema/RoomState.js';
import {
  CROUCH_SPEED_MULTIPLIER,
  DOUBLE_JUMP_VELOCITY,
  JUMP_BUFFER_MS,
  JUMP_CUT_MULTIPLIER,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  MAX_GROUND_SPEED,
  SPRINT_MULTIPLIER,
  TRAPPER_MOVE_SPEED,
  VOID_Z,
  WALL_JUMP_ENABLED_DEFAULT,
  WALL_JUMP_HORIZ_VEL,
  WALL_JUMP_VERT_VEL,
  WALL_SLIDE_GRAV_MULT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants.js';
import { getMaxEnergyFor } from './ability-stats.js';
import { isFlyActive, getPlayerAbilityLevels } from './active-abilities.js';
import type { CustomMoveDef } from '../../../shared/custom-moves.js';
import {
  createCoreScratch,
  stepSim,
  type CorePhysOpts,
  type CoreScratch,
} from '../../../shared/sim-core.js';

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
  /** ADS / RMB â€” used for sniper cone tighten. */
  aimHeld?: boolean;
  interactPressed: boolean;
  /** True while melee swing is active (Foundry speed_mod 0.5). */
  meleeActive?: boolean;
  /** Held state for the back-flip move (V) â€” edge-detected here like crouch. */
  flipPressed?: boolean;
  /** Dedicated slide key (default G, held while sprinting) â€” edge-detected
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
 *    truthy value (e.g. a number or plain object) â€” uncaught, that crashes
 *    the whole Node process (every room, not just this match) since the sim
 *    tick has no surrounding try/catch.
 *  - moveX/moveY/cameraYaw/aimAngle/aimPitch were assigned with no finite
 *    check; msgpack (unlike JSON) can carry NaN/Infinity over the wire, and
 *    once one lands here it permanently corrupts that player's x/y/z for
 *    the rest of the match (collision/hit-detection math propagates it).
 * Invalid fields are OMITTED (not zeroed) so the merge in each room's
 * onMessage('input', ...) â€” `{...defaultInput(), ...latestInputs.get(id),
 * ...sanitizeInput(input)}` â€” falls through to the last known-good value
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

/**
 * Per-player ephemeral sim state. Same shape as the shared core scratch, plus
 * `supportPlatformId` which rooms already read for moving-platform carry
 * (kept as an alias of `supportPadId` so those call sites stay unchanged).
 */
export type PlayerSimScratch = CoreScratch & {
  supportPlatformId: string | null;
};

export function createSimScratch(): PlayerSimScratch {
  const scratch = createCoreScratch() as PlayerSimScratch;
  scratch.supportPlatformId = null;
  return scratch;
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
  /** Map-authored custom moves (Player Model Studio â†’ Moves tab). */
  customMoves?: CustomMoveDef[];
}

function copyCustomMoveCooldownsFromPlayer(player: PlayerState, scratch: CoreScratch): void {
  scratch.customMoveActiveId = player.customMoves.activeMoveId;
  scratch.customMoveActiveUntil = player.customMoves.activeUntil;
  scratch.customMoveCooldownEndsAt.clear();
  player.customMoves.cooldownEndsAt.forEach((until, id) => {
    scratch.customMoveCooldownEndsAt.set(id, until);
  });
}

function copyCustomMoveCooldownsToPlayer(player: PlayerState, scratch: CoreScratch): void {
  player.customMoves.activeMoveId = scratch.customMoveActiveId;
  player.customMoves.activeUntil = scratch.customMoveActiveUntil;
  player.customMoves.cooldownEndsAt.clear();
  scratch.customMoveCooldownEndsAt.forEach((until, id) => {
    player.customMoves.cooldownEndsAt.set(id, until);
  });
}

/**
 * Authoritative platformer step. Maps Colyseus `PlayerState` onto the shared
 * `stepSim` core â€” the same physics Play Test and client prediction run â€”
 * then writes server-only HUD flags back onto the schema.
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

  const nowMs = Date.now();
  player.cameraYaw = input.cameraYaw;
  player.aimAngle = input.aimAngle;
  player.aimPitch = Number.isFinite(input.aimPitch) ? input.aimPitch : 0;
  player.isCrouching = input.crouch;

  scratch.extraAirJumps = player.ability.extraAirJumps || 0;
  scratch.slowUntil = player.ability.slowUntil || 0;
  copyCustomMoveCooldownsFromPlayer(player, scratch);

  const jumpMult = player.ability.jumpMult || 1;
  const speedMult = player.ability.speedMult || 1;
  const walkSpeed =
    player.role === 'trapper'
      ? TRAPPER_MOVE_SPEED
      : (physOpts?.walkSpeed ?? MAX_GROUND_SPEED) * speedMult;

  const coreOpts: CorePhysOpts = {
    gravity: physOpts?.gravity,
    jumpVelocity: (physOpts?.jumpVelocity ?? JUMP_VELOCITY) * jumpMult,
    doubleJumpVelocity: (physOpts?.doubleJumpVelocity ?? DOUBLE_JUMP_VELOCITY) * jumpMult,
    doubleJumpEnabled: physOpts?.doubleJumpEnabled ?? true,
    jumpCutMult: physOpts?.jumpCutMult ?? JUMP_CUT_MULTIPLIER,
    coyoteMs: physOpts?.coyoteMs,
    jumpBufferMs: physOpts?.jumpBufferMs ?? JUMP_BUFFER_MS,
    walkSpeed,
    sprintMult: physOpts?.sprintMult ?? SPRINT_MULTIPLIER,
    crouchMult: physOpts?.crouchMult ?? CROUCH_SPEED_MULTIPLIER,
    maxFallSpeed: physOpts?.maxFallSpeed ?? MAX_FALL_SPEED,
    apexGravMult: physOpts?.apexGravMult,
    slideEnabled: physOpts?.slideEnabled,
    slideMult: physOpts?.slideMult,
    slideDurationMs: physOpts?.slideDurationMs,
    slideCooldownMs: physOpts?.slideCooldownMs,
    wallJumpEnabled: physOpts?.wallJumpEnabled ?? WALL_JUMP_ENABLED_DEFAULT,
    wallJumpHorizVel: physOpts?.wallJumpHorizVel ?? WALL_JUMP_HORIZ_VEL,
    wallJumpVertVel: physOpts?.wallJumpVertVel ?? WALL_JUMP_VERT_VEL,
    wallSlideGravMult: physOpts?.wallSlideGravMult ?? WALL_SLIDE_GRAV_MULT,
    customMoves: physOpts?.customMoves,
    fallDamageReduction: player.ability.fallDamageReduction || 0,
    maxEnergy: getMaxEnergyFor(player),
    nowMs,
    slowUntil: player.ability.slowUntil || 0,
    flyActive: isFlyActive(player, nowMs),
    voidZ: VOID_Z,
    canTriggerCustomMove: (move) => {
      const levels = getPlayerAbilityLevels(player);
      return (levels[`custom_move_${move.id}`] ?? 0) > 0;
    },
  };

  const wishMag = Math.hypot(input.moveX, input.moveY);
  const wantsSprint = input.sprint && !input.crouch && wishMag > 0.2 && !scratch.exhausted;
  const isSprinting = wantsSprint && player.energy > 0;

  stepSim(
    player,
    {
      moveX: input.moveX,
      moveY: input.moveY,
      jumpPressed: input.jumpPressed,
      sprint: input.sprint,
      crouch: input.crouch,
      meleeActive: input.meleeActive,
      flipPressed: input.flipPressed,
      slidePressed: input.slidePressed,
      customMoveKeysHeld: input.customMoveKeysHeld,
      cameraYaw: player.cameraYaw,
    },
    dtSeconds,
    platforms,
    scratch,
    bounds,
    coreOpts
  );

  player.ability.extraAirJumps = scratch.extraAirJumps;
  copyCustomMoveCooldownsToPlayer(player, scratch);
  scratch.supportPlatformId = scratch.supportPadId;

  player.isSprinting = isSprinting;
  player.isSliding = scratch.slideMs > 0;
  player.isFlipping = scratch.flipMs > 0;
  if (scratch.slideCooldownEndsAt) player.slideCooldownEndsAt = scratch.slideCooldownEndsAt;
  if (scratch.flipCooldownEndsAt) player.flipCooldownEndsAt = scratch.flipCooldownEndsAt;
}
