import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export type PlayerRole = 'trapper' | 'runner' | 'survivor' | 'team_a' | 'team_b';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';
export type MatchOutcome = 'win' | 'loss' | 'survived' | 'eliminated';

/**
 * IN-GAME power upgrades (Health/Speed/Jump/Energy/Punch) fetched from the
 * account's persisted ability levels at join — see
 * shared/ability-progression.ts. Neutral defaults (0 bonus / 1x mult) if
 * the trusted lookup fails, so gameplay is unaffected.
 *
 * Nested in its own Schema class (not flattened onto PlayerState) because
 * Colyseus schema instances are hard-capped at 64 @type() fields each —
 * the limit is per-class, so this sub-object gets its own budget.
 */
export class AbilityLoadoutState extends Schema {
  @type('number') maxHealthBonus = 0;
  @type('number') speedMult = 1;
  @type('number') jumpMult = 1;
  @type('number') maxEnergyBonus = 0;
  @type('number') punchDamageMult = 1;
  @type('number') reloadSpeedMult = 1;
  /** 0–1 fraction of fall damage ignored. */
  @type('number') fallDamageReduction = 0;
  /** Extra mid-air jumps remaining (Deathrun double_jump power-up). */
  @type('number') extraAirJumps = 0;
  /** Until this timestamp, this player is slowed (Deathrun slow_trapper). */
  @type('number') slowUntil = 0;
  @type('string') levelsJson = '{}';
  @type('number') visibilityEndsAt = 0;
  @type('number') flyEndsAt = 0;
  @type('number') hookEndsAt = 0;
  @type('number') berserkEndsAt = 0;
  @type('number') bulletEndsAt = 0;
  @type('number') thunderEndsAt = 0;
  @type('number') backflipEndsAt = 0;
  /** Timestamp (Date.now() ms) each power can be activated again — drives
   * the HUD's radial recharge ring. 0 = not on cooldown. */
  @type('number') visibilityCooldownEndsAt = 0;
  @type('number') flyCooldownEndsAt = 0;
  @type('number') hookCooldownEndsAt = 0;
  @type('number') berserkCooldownEndsAt = 0;
  @type('number') bulletCooldownEndsAt = 0;
  @type('number') thunderCooldownEndsAt = 0;
  @type('number') backflipCooldownEndsAt = 0;
}

/**
 * Map-authored custom move state (Player Model Studio → Moves tab) — only
 * one custom move can play at a time per player, so this tracks just the
 * currently-active one plus a per-move-id cooldown map. Own Schema class
 * (not flattened onto PlayerState) for the same 64-field-budget reason as
 * AbilityLoadoutState above.
 */
export class CustomMoveState extends Schema {
  /** id of the CustomMoveDef currently playing (empty = none). */
  @type('string') activeMoveId = '';
  @type('number') activeUntil = 0;
  /** CustomMoveDef.id -> timestamp (Date.now() ms) it can be used again. */
  @type({ map: 'number' }) cooldownEndsAt = new MapSchema<number>();
}

/** A single networked player -- position/aim are authoritative (server-simulated). */
export class PlayerState extends Schema {
  @type('string') sessionId = '';
  @type('string') userId = '';
  @type('string') username = 'Player';
  @type('string') avatarUrl = '';
  /** Forward along the track. */
  @type('number') x = 0;
  /** Lateral lane position. */
  @type('number') y = 0;
  /** Height (platformer jump axis). */
  @type('number') z = 0;
  @type('number') vz = 0;
  @type('number') aimAngle = 0;
  /** Client look pitch (radians, up positive) — used for 3D hitscan. */
  @type('number') aimPitch = 0;
  /** Client camera yaw (radians) — movement is camera-relative. */
  @type('number') cameraYaw = 0;
  @type('number') health = 100;
  @type('number') energy = 100;
  @type('string') role: PlayerRole = 'runner';
  @type('boolean') isAlive = true;
  @type('boolean') hasFinished = false;
  @type('boolean') isCrouching = false;
  @type('boolean') isGrounded = true;
  @type('boolean') isSprinting = false;
  @type('boolean') isSliding = false;
  @type('boolean') isFlipping = false;
  /** Timestamp (Date.now() ms) each move can be used again — drives the HUD
   * movement cooldown rings. 0 = not on cooldown. */
  @type('number') slideCooldownEndsAt = 0;
  @type('number') flipCooldownEndsAt = 0;
  @type(CustomMoveState) customMoves = new CustomMoveState();
  @type('boolean') isReady = false;
  @type('boolean') isInvisible = false;
  /** Last checkpoint touch (sim space). 0 = unset. */
  @type('number') checkpointX = 0;
  @type('number') checkpointY = 0;
  @type('number') checkpointZ = 0;
  @type('boolean') hasCheckpoint = false;
  /** Competitive KP snapshot at join (optional). */
  @type('number') kp = 1000;
  /** Compact JSON of equipped SkinAttachment[] for remote cosmetics. */
  @type('string') equippedSkinsJson = '[]';
  /**
   * Gameplay body color index (Body_001–008). -1 = no override.
   * Deathrun trapper = 0 (Red); runners = unique 1–7; Horde unique;
   * Competitive team_a = 0 (Red), team_b = 1 (Blue).
   */
  @type('number') bodyColorIndex = -1;
  /** Authoritative weapon combat from equipped loadout (clamped on join). */
  @type('string') weaponKind = 'hitscan';
  @type('number') weaponRange = 14;
  @type('number') weaponDamage = 25;
  @type('number') weaponCooldownMs = 350;
  @type('number') weaponConeRadians = 0.18;
  /** auto | semi | bolt */
  @type('string') weaponFireMode = 'semi';
  /** Hitscan pellet count (shotgun). */
  @type('number') weaponPellets = 1;
  /** ADS FOV target for client zoom (0 = none). */
  @type('number') weaponAdsZoomFov = 0;
  @type('number') weaponAdsConeScale = 0.85;
  @type('number') weaponHipfireConeScale = 1;
  /** In-match shop credits (Horde / Competitive buy phase). */
  @type('number') credits = 0;
  /** Last purchased shop weapon id (for equipped highlight). */
  @type('string') weaponId = '';
  /** Equipped weapon skin id from map buy menu (looked up client-side for texture). */
  @type('string') weaponSkinId = '';
  /** Public weapon mesh URL for remote clients (catalog path; never a data: URL). */
  @type('string') weaponModelUrl = '';
  /** Mag capacity (0 = unlimited / melee). */
  @type('number') weaponMagSize = 0;
  @type('number') ammoInMag = 0;
  @type('number') reserveAmmo = 0;
  @type('number') weaponReloadMs = 0;
  /** Timestamp ms when reload finishes (0 = not reloading). */
  @type('number') reloadEndsAt = 0;
  /**
   * Bumps when a mag-less shot actually fires (melee / unlimited). Guns with
   * a magazine already signal fire via ammoInMag dropping — don't double-count.
   */
  @type('number') attackSeq = 0;
  /** Temporary shield HP from power-up shop. */
  @type('number') shieldHp = 0;
  /** Per-match telemetry / server-authored rewards. */
  @type('number') kills = 0;
  @type('number') deaths = 0;
  /** Consecutive kills (any source, including monsters) without dying — reset to 0 on death. Drives the kill-streak HUD banner. */
  @type('number') killStreak = 0;
  @type('number') score = 0;
  @type('number') distance = 0;
  @type('number') xpEarned = 0;
  @type('number') vpEarned = 0;
  @type('number') kpDelta = 0;
  /**
   * IN-GAME power upgrades (Health/Speed/Jump/Energy/Punch) fetched from the
   * account's persisted ability levels at join — see
   * shared/ability-progression.ts. Neutral defaults (0 bonus / 1x mult) if
   * the trusted lookup fails, so gameplay is unaffected.
   *
   * Nested in its own Schema class (not flattened onto PlayerState) because
   * Colyseus schema instances are hard-capped at 64 @type() fields each —
   * the limit is per-class, so this sub-object gets its own budget.
   */
  @type(AbilityLoadoutState) ability = new AbilityLoadoutState();
}

/** Solid walkable surface for the shared platformer physics. */
export class PlatformState extends Schema {
  @type('string') id = '';
  @type('string') kind:
    | 'solid'
    | 'checkpoint'
    | 'jumpPad'
    | 'finish'
    | 'ice'
    | 'conveyor'
    | 'water'
    | 'sand' = 'solid';
  @type('number') x = 0;
  @type('number') y = 0;
  /** Top surface height. */
  @type('number') z = 0;
  @type('number') width = 1;
  @type('number') depth = 1;
  /**
   * Vertical thickness below top. Thin pads (~0.2) are top-only;
   * taller values enable side/wall AABB push-out.
   */
  @type('number') height = 0.2;
  /** Jump-pad vertical boost (sim vz). 0 = use default. */
  @type('number') boost = 0;
  /** Conveyor push speed (units/sec). */
  @type('number') conveyorSpeed = 0;
  @type('number') conveyorDirX = 1;
  @type('number') conveyorDirY = 0;
  /** Moving platform — home pose + amplitude (sim space). */
  @type('boolean') motionEnabled = false;
  @type('number') motionPeriodMs = 4000;
  @type('number') motionPhaseMs = 0;
  @type('number') motionHomeX = 0;
  @type('number') motionHomeY = 0;
  @type('number') motionHomeZ = 0;
  @type('number') motionAmpX = 0;
  @type('number') motionAmpY = 0;
  @type('number') motionAmpZ = 0;
  /** Yaw rotation in radians (sim XY plane). Used for rotated pad colliders. */
  @type('number') rotYaw = 0;
  /**
   * True analytic ramp support: dz per unit of LOCAL x/y (post-rotYaw,
   * relative to this pad's own center) — lets a single pad be a genuinely
   * continuous sloped surface instead of one of many small flat shelves.
   * 0/0 = flat (all existing pads; fully backward compatible).
   */
  @type('number') slopeGradX = 0;
  @type('number') slopeGradY = 0;
  /** Editor entity id for client mesh sync (custom maps). */
  @type('string') entityId = '';
  /** When true, only a wired Button can open this door (no collision by default). */
  @type('boolean') doorControlled = false;
  /** Door open state — while true, doorControlled platforms are skipped by collision. */
  @type('boolean') open = false;
  /**
   * True for pads meant to be walked over, never blocked against sideways —
   * floors, stair/ramp treads, jump pads, ice/conveyor/sand. false (default)
   * means a regular solid prop: it always blocks horizontal movement in
   * resolveSolidCollisions, no matter how short it is — see the comment
   * there for why inferring this from `height` alone let any short solid
   * prop become a walk-through auto-step.
   */
  @type('boolean') topOnly = false;
}

/** A hazard that toggles on/off on a fixed interval (or stays on when alwaysActive). */
export class ObstacleState extends Schema {
  @type('string') id = '';
  @type('string') kind: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage' = 'spike';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') width = 1;
  /** Sim Y half-extent counterpart. 0 = same as width (legacy circular traps). */
  @type('number') depth = 0;
  @type('number') height = 1;
  @type('number') intervalMs = 2000;
  @type('number') activeMs = 1000;
  @type('boolean') active = false;
  /** HP removed per hit. 0 = use room default OBSTACLE_DAMAGE. */
  @type('number') damage = 0;
  /** When true, stays active (editor death zones). */
  @type('boolean') alwaysActive = false;
  /** When true, only buttons arm this obstacle (no auto pulse). */
  @type('boolean') buttonControlled = false;
  /** One-shot kill on overlap (editor Instant kill). */
  @type('boolean') instantKill = false;
  /** Horde custom monster: GLB to render instead of the generic kind-based prefab. */
  @type('string') modelUrl = '';
  /** Horde custom monster: catalog model id (used when modelUrl is a custom upload). */
  @type('string') modelId = '';
  /** Horde custom monster: name shown on a floating nameplate above the mesh. */
  @type('string') displayName = '';
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();
  @type([PlatformState]) platforms = new ArraySchema<PlatformState>();

  @type('string') phase: MatchPhase = 'lobby';
  @type('number') countdownMs = 0;
  @type('number') matchTimeRemainingMs = 0;
  @type('string') trapperSessionId = '';
  @type('string') winnerRole = '';
  /** Course progress HUD anchors (sim X). */
  @type('number') courseStartX = 2;
  @type('number') courseFinishX = 46;

  /** deathrun | horde | competitive — informational for clients. */
  @type('string') modeTag = 'deathrun';
  /** Horde: current wave number (1-based). */
  @type('number') wave = 0;
  /** Horde: monsters still alive this wave. */
  @type('number') monstersAlive = 0;
  /** Horde: team kill count this match. */
  @type('number') teamKills = 0;
  /** Competitive: current round (1–6). */
  @type('number') roundIndex = 0;
  /** Competitive: Team A rounds won. */
  @type('number') scoreA = 0;
  /** Competitive: Team B rounds won. */
  @type('number') scoreB = 0;
  /**
   * Buy-phase remaining ms (Horde between-wave window + Competitive buy countdown).
   * 0 = shop closed. Synced so clients can show WeaponShop without guessing.
   */
  @type('number') buyPhaseMs = 0;
  /** Unique id for this match — used for reward idempotency. */
  @type('string') matchId = '';
  /** True once server (or local display) awards are written onto players. */
  @type('boolean') rewardsReady = false;
  /** Admin froze the match — clients stop local prediction, show a hold overlay. */
  @type('boolean') adminPaused = false;
  /** Match ended via admin cancel, not a real conclusion — no rewards granted. */
  @type('boolean') wasCancelled = false;
  /** Last admin broadcast (empty = none this match). Client shows it once and clears its own copy. */
  @type('string') adminMessage = '';
  /** Increments each time adminMessage is set, so the client can detect a repeat message. */
  @type('number') adminMessageSeq = 0;
  /**
   * Match elapsed ms as the moving-platform clock sees it. Platform position is
   * a pure function of this value (see shared/moving-platform.ts), so syncing it
   * lets the client predict platform motion instead of predicting against a
   * frozen pad and rubber-banding whenever the server carries the player.
   */
  @type('number') motionElapsedMs = 0;
}
