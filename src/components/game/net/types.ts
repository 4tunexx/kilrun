/**
 * Client-side mirrors of the server's `@colyseus/schema` shapes
 * (server/src/schema/RoomState.ts).
 */

export type PlayerRole = 'trapper' | 'runner' | 'survivor' | 'team_a' | 'team_b';
export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'results';

/** Mirrors server AbilityLoadoutState — power buff/cooldown timestamps
 * (Date.now() ms) used to drive the HUD's radial recharge ring. */
export interface NetAbilityLoadoutState {
  maxHealthBonus?: number;
  speedMult?: number;
  jumpMult?: number;
  maxEnergyBonus?: number;
  punchDamageMult?: number;
  reloadSpeedMult?: number;
  fallDamageReduction?: number;
  extraAirJumps?: number;
  slowUntil?: number;
  visibilityEndsAt?: number;
  flyEndsAt?: number;
  hookEndsAt?: number;
  berserkEndsAt?: number;
  bulletEndsAt?: number;
  thunderEndsAt?: number;
  backflipEndsAt?: number;
  visibilityCooldownEndsAt?: number;
  flyCooldownEndsAt?: number;
  hookCooldownEndsAt?: number;
  berserkCooldownEndsAt?: number;
  bulletCooldownEndsAt?: number;
  thunderCooldownEndsAt?: number;
  backflipCooldownEndsAt?: number;
}

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
  isSliding: boolean;
  isFlipping: boolean;
  /** Timestamp (Date.now() ms) each move can be used again — HUD cooldown rings. */
  slideCooldownEndsAt?: number;
  flipCooldownEndsAt?: number;
  /** Map-authored custom move state (mirrors server CustomMoveState). */
  customMoves?: {
    activeMoveId: string;
    activeUntil: number;
    /** CustomMoveDef.id -> cooldown-ends-at timestamp. Real object is a
     * Colyseus MapSchema<number> — use .get(id), not bracket access. */
    cooldownEndsAt: { get(key: string): number | undefined };
  };
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
  /** Increments on mag-less / melee shots so remotes can hear and animate them. */
  attackSeq?: number;
  /** Temporary shield from power-up. */
  shieldHp?: number;
  /** Per-match telemetry / server-authored rewards. */
  kills?: number;
  deaths?: number;
  /** Consecutive kills (any source, including monsters) without dying. */
  killStreak?: number;
  score?: number;
  distance?: number;
  xpEarned?: number;
  vpEarned?: number;
  kpDelta?: number;
  /** Power buff/cooldown timestamps — see NetAbilityLoadoutState. */
  ability?: NetAbilityLoadoutState;
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
  depth?: number;
  intervalMs: number;
  activeMs: number;
  active: boolean;
  damage?: number;
  alwaysActive?: boolean;
  /** When true, hazard only arms while a linked button is held. */
  buttonControlled?: boolean;
  instantKill?: boolean;
  /** Horde custom monster: GLB to render instead of the generic kind-based prefab. */
  modelUrl?: string;
  /** Horde custom monster: catalog model id (used when modelUrl is a custom upload). */
  modelId?: string;
  /** Horde custom monster: name shown on a floating nameplate above the mesh. */
  displayName?: string;
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
  /** Admin froze the match via the website Live dashboard. */
  adminPaused?: boolean;
  /** Match ended via admin cancel, not a real conclusion — no rewards granted. */
  wasCancelled?: boolean;
  /** Last admin broadcast message (empty = none this match). */
  adminMessage?: string;
  /** Increments each time adminMessage is set — detects a repeat of the same text. */
  adminMessageSeq?: number;
  /**
   * Server match clock driving moving-platform motion. Client prediction feeds
   * this into shared/moving-platform.ts so predicted pads sit exactly where the
   * authoritative ones do.
   */
  motionElapsedMs?: number;
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
  /** Held state for the back-flip move (V) — server edge-detects like crouch. */
  flipPressed?: boolean;
  /** Dedicated slide key (default G, held while sprinting) — server edge-detects. */
  slidePressed?: boolean;
  /** ids of map-authored CustomMoveDef entries whose key is currently held. */
  customMoveKeysHeld?: string[];
}

/** Broadcast in-match chat message (server/src/lib/chat.ts). */
export interface ChatMessage {
  sessionId: string;
  username: string;
  text: string;
  scope: 'all' | 'team';
  /** Server Date.now() at send time. */
  at: number;
}

/** Sent to the ATTACKER only (never broadcast) when their hit lands — drives
 * the floating damage-number popup at the hit's server world position. */
export interface HitFxMessage {
  x: number;
  y: number;
  z: number;
  amount: number;
  kind: 'player' | 'monster';
}

export type { KillFeedEvent as KillFeedMessage } from '@shared/kill-feed';
