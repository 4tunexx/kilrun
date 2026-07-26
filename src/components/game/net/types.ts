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
  /** Look pitch (radians, up positive). */
  aimPitch?: number;
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
  /** Compact SkinAttachment[] JSON for remote cosmetics. */
  equippedSkinsJson?: string;
  /**
   * Gameplay body color (Body_001–008). -1 = no override.
   * Keep in sync with server PlayerState.bodyColorIndex.
   */
  bodyColorIndex?: number;
  /** Authoritative weapon combat from equipped loadout (clamped on join). */
  weaponKind?: string;
  weaponRange?: number;
  weaponDamage?: number;
  weaponCooldownMs?: number;
  weaponConeRadians?: number;
  /** auto | semi | bolt */
  weaponFireMode?: string;
  weaponPellets?: number;
  weaponAdsZoomFov?: number;
  weaponAdsConeScale?: number;
  weaponHipfireConeScale?: number;
  /** In-match shop credits. */
  credits?: number;
  /** Equipped shop weapon id. */
  weaponId?: string;
  /** Equipped in-match weapon skin id (texture painted on weapon mesh). */
  weaponSkinId?: string;
  /** Public catalog/http weapon mesh URL for remotes (never data:). */
  weaponModelUrl?: string;
  weaponMagSize?: number;
  ammoInMag?: number;
  reserveAmmo?: number;
  weaponReloadMs?: number;
  reloadEndsAt?: number;
  /** Temporary shield from power-up. */
  shieldHp?: number;
  /** Per-match telemetry / server-authored rewards. */
  kills?: number;
  deaths?: number;
  score?: number;
  distance?: number;
  xpEarned?: number;
  vpEarned?: number;
  kpDelta?: number;
}

/** Keep in sync with server PlatformState.kind / SimPlatformKind. */
export type NetPlatformKind =
  | 'solid'
  | 'checkpoint'
  | 'jumpPad'
  | 'finish'
  | 'ice'
  | 'conveyor'
  | 'water'
  | 'sand';

export interface NetPlatformState {
  id: string;
  kind: NetPlatformKind;
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
  rotYaw?: number;
  entityId?: string;
  motionEnabled?: boolean;
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
  /** When true, hazard only arms while a linked button is held. */
  buttonControlled?: boolean;
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
  /** Remaining buy-phase ms (0 = closed). */
  buyPhaseMs?: number;
  /** Server-authored match id for reward idempotency. */
  matchId?: string;
  /** True once Colyseus applied awards (or local display fallback). */
  rewardsReady?: boolean;
}

export interface PlayerInputMessage {
  moveX: number;
  moveY: number;
  aimAngle: number;
  aimPitch: number;
  cameraYaw: number;
  crouch: boolean;
  sprint: boolean;
  jumpPressed: boolean;
  shootPressed: boolean;
  /** True while RMB / aim stick held — server uses for ADS cone scale. */
  aimHeld?: boolean;
  interactPressed: boolean;
  /** Foundry melee speed_mod 0.5 while swing is active. */
  meleeActive?: boolean;
}
