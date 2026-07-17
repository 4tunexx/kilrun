import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export type PlayerRole = 'trapper' | 'runner';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';
export type MatchOutcome = 'win' | 'loss' | 'survived' | 'eliminated';

/** A single networked player -- position/aim are authoritative (server-simulated), never trusted from the client directly. */
export class PlayerState extends Schema {
  @type('string') sessionId = '';
  @type('string') userId = '';
  @type('string') username = 'Player';
  @type('string') avatarUrl = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') aimAngle = 0;
  @type('number') health = 100;
  @type('string') role: PlayerRole = 'runner';
  @type('boolean') isAlive = true;
  @type('boolean') hasFinished = false;
  @type('boolean') isCrouching = false;
  @type('boolean') isReady = false;
}

/** A hazard that automatically toggles on/off on a fixed interval -- the "automatic obstacles" from the design. */
export class ObstacleState extends Schema {
  @type('string') id = '';
  @type('string') kind: 'saw' | 'laser' | 'crusher' | 'spike' = 'spike';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') width = 1;
  @type('number') height = 1;
  @type('number') intervalMs = 2000;
  @type('number') activeMs = 1000;
  @type('boolean') active = false;
}

export class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([ObstacleState]) obstacles = new ArraySchema<ObstacleState>();

  @type('string') phase: MatchPhase = 'lobby';
  @type('number') countdownMs = 0;
  @type('number') matchTimeRemainingMs = 0;
  @type('string') trapperSessionId = '';
  @type('string') winnerRole = '';
}
