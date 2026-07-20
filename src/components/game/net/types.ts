/**
 * Client-side mirrors of the server's `@colyseus/schema` shapes
 * (server/src/schema/RoomState.ts).
 */

export type PlayerRole = 'trapper' | 'runner' | 'survivor' | 'team_a' | 'team_b';
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
  kp?: number;
}

export interface NetPlatformState {
  id: string;
  kind: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' | 'ice' | 'conveyor';
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  boost?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
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
  modeTag?: string;
  wave?: number;
  monstersAlive?: number;
  teamKills?: number;
  roundIndex?: number;
  scoreA?: number;
  scoreB?: number;
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
