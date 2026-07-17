/**
 * Client-side mirrors of the server's `@colyseus/schema` shapes
 * (server/src/schema/RoomState.ts). These are plain duck-typed interfaces --
 * colyseus.js v0.16's schema "reflection" means the client never needs to
 * import the server's decorated classes directly.
 */

export type PlayerRole = 'trapper' | 'runner';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';

export interface NetPlayerState {
  sessionId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  x: number;
  y: number;
  aimAngle: number;
  health: number;
  role: PlayerRole;
  isAlive: boolean;
  hasFinished: boolean;
  isCrouching: boolean;
  isReady: boolean;
}

export interface NetObstacleState {
  id: string;
  kind: 'saw' | 'laser' | 'crusher' | 'spike';
  x: number;
  y: number;
  width: number;
  height: number;
  intervalMs: number;
  activeMs: number;
  active: boolean;
}

export interface NetRoomState {
  phase: MatchPhase;
  countdownMs: number;
  matchTimeRemainingMs: number;
  trapperSessionId: string;
  winnerRole: string;
}

export interface PlayerInputMessage {
  moveX: number;
  moveY: number;
  aimAngle: number;
  crouch: boolean;
  shootPressed: boolean;
  interactPressed: boolean;
}
