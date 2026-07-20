import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export type PlayerRole = 'trapper' | 'runner';
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
  /** Last checkpoint touch (sim space). 0 = unset. */
  @type('number') checkpointX = 0;
  @type('number') checkpointY = 0;
  @type('number') checkpointZ = 0;
  @type('boolean') hasCheckpoint = false;
}

/** Solid walkable surface for the shared platformer physics. */
export class PlatformState extends Schema {
  @type('string') id = '';
  @type('string') kind: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' = 'solid';
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
}
