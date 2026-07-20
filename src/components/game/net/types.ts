/**
 * Client-side mirrors of the server's `@colyseus/schema` shapes
 * (server/src/schema/RoomState.ts).
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
  z: number;
  vz: number;
  aimAngle: number;
  cameraYaw: number;
  health: number;
  energy: number;
  role: PlayerRole;
  isAlive: boolean;
  hasFinished: boolean;
  isCrouching: boolean;
  isGrounded: boolean;
  isSprinting: boolean;
  isReady: boolean;
}

export interface NetPlatformState {
  id: string;
  kind: 'solid' | 'checkpoint' | 'jumpPad' | 'finish';
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  boost?: number;
}

export interface NetObstacleState {
  id: string;
  kind: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  intervalMs: number;
  activeMs: number;
  active: boolean;
  damage?: number;
  alwaysActive?: boolean;
}

export interface NetRoomState {
  phase: MatchPhase;
  countdownMs: number;
  matchTimeRemainingMs: number;
  trapperSessionId: string;
  winnerRole: string;
  courseStartX?: number;
  courseFinishX?: number;
}

export interface PlayerInputMessage {
  moveX: number;
  moveY: number;
  aimAngle: number;
  cameraYaw: number;
  crouch: boolean;
  sprint: boolean;
  jumpPressed: boolean;
  shootPressed: boolean;
  interactPressed: boolean;
}
