import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export type PlayerRole = 'trapper' | 'runner' | 'survivor' | 'team_a' | 'team_b';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';
export type MatchOutcome = 'win' | 'loss' | 'survived' | 'eliminated';

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
  @type('boolean') isReady = false;
  @type('string') abilityLevelsJson = '{}';
  @type('number') abilityVisibilityEndsAt = 0;
  @type('number') abilityFlyEndsAt = 0;
  @type('number') abilityHookEndsAt = 0;
  @type('number') abilityBerserkEndsAt = 0;
  @type('number') abilityBulletEndsAt = 0;
  @type('number') abilityThunderEndsAt = 0;
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
  /** Editor entity id for client mesh sync (custom maps). */
  @type('string') entityId = '';
}

/** A hazard that toggles on/off on a fixed interval (or stays on when alwaysActive). */
export class ObstacleState extends Schema {
  @type('string') id = '';
  @type('string') kind: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage' = 'spike';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') width = 1;
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
}
