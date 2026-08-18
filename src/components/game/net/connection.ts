import { Client, Room, getStateCallbacks } from 'colyseus.js';
import type {
  ChatMessage,
  HitFxMessage,
  NetObstacleState,
  NetPlatformKind,
  NetPlatformState,
  NetPlayerState,
  NetRoomState,
  PlayerInputMessage,
} from './types';

export interface JoinOptions {
  userId: string;
  username: string;
  avatarUrl?: string;
  /**
   * HMAC join token minted by the hub (`mintMyGameJoinToken`).
   * Required when the game server has a join secret configured.
   */
  token?: string;
  /** Allows pushing MAIN custom maps into the room. */
  isAdmin?: boolean;
  /** Admin OR moderator — eligible for the reserved staff join seat. */
  isStaff?: boolean;
  /** Competitive KP snapshot (optional). */
  kp?: number;
  /** Premium membership — required for Ranked Competitive. */
  isPremium?: boolean;
  /** Premium or free Ranked week. */
  rankedAccess?: boolean;
  /**
   * Ranked matchmaking bracket (tier name) or `open` for mixed lobby.
   * Used with Colyseus filterBy on competitive_ranked.
   */
  rankKey?: string;
  /**
   * When set, join this Colyseus room by id (party members following the leader)
   * instead of joinOrCreate.
   */
  joinByRoomId?: string;
  /** Seconds to wait for same-rank peers before falling back to open. */
  mmWaitSec?: number;
  /** Keep same-rank lobby if at least this many players. */
  minSameRankPlayers?: number;
  /** Compact SkinAttachment[] JSON for remote cosmetics sync. */
  equippedSkinsJson?: string;
  /** Weapon combat from equipped loadout (server clamps). */
  weaponCombat?: {
    kind: string;
    range: number;
    damage: number;
    cooldownMs: number;
    coneRadians?: number;
  };
  /** Clan Wars: explicit team seat request so both clan lobbies land on
   * opposite sides of a Competitive match. */
  teamRequest?: 'team_a' | 'team_b';
  /** Clan Wars: ClanLobby id the joining player belongs to. */
  clanLobbyId?: string;
}

export type GameRoomName =
  | 'deathrun'
  | 'deathrun_practice'
  | 'horde'
  | 'horde_practice'
  | 'competitive'
  | 'competitive_practice'
  | 'competitive_ranked';



export interface RoomCallbacks {
  onPlayerAdd?: (player: NetPlayerState, sessionId: string) => void;
  onPlayerChange?: (player: NetPlayerState, sessionId: string) => void;
  onPlayerRemove?: (sessionId: string) => void;
  onObstacleAdd?: (obstacle: NetObstacleState, index: number) => void;
  onObstacleChange?: (obstacle: NetObstacleState, index: number) => void;
  onObstacleRemove?: (index: number) => void;
  onPlatformAdd?: (platform: NetPlatformState, index: number) => void;
  onPlatformChange?: (platform: NetPlatformState, index: number) => void;
  onPlatformRemove?: (index: number) => void;
  onRoomChange?: (room: NetRoomState) => void;
  /**
   * Fired every time a room is (re)bound — initial join AND every automatic
   * reconnect — with the full set of session ids the new room actually has.
   * A reconnect's `players.onAdd` only replays currently-present players; a
   * player who left during the disconnect gap never gets an onRemove for the
   * old room, so callers should prune anything not in this list.
   */
  onRoomBound?: (sessionIds: string[]) => void;
  /**
   * Fired whenever the underlying WebSocket connection state changes.
   * 'reconnecting' means the socket dropped and GameConnection is attempting
   * to recover automatically; 'lost' means all reconnect attempts failed and
   * the caller should surface an error / stop sending input.
   */
  onConnectionState?: (state: 'connected' | 'reconnecting' | 'lost') => void;
}

function resolveGameServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    warnMissingGameServerUrlOnce();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:2567`;
  }
  return 'ws://localhost:2567';
}

let warnedMissingGameServerUrl = false;
function warnMissingGameServerUrlOnce() {
  if (warnedMissingGameServerUrl) return;
  warnedMissingGameServerUrl = true;
  console.warn(
    '[kilrun] NEXT_PUBLIC_GAME_SERVER_URL is unset — falling back to local ws host:2567. Set it for production.'
  );
}

/** Colyseus close code used when the client leaves on purpose (tab close, unmount, etc). */
const CONSENTED_CLOSE_CODE = 4000;
/** Close code CompetitiveRoom sends for a deliberate @abandonMatch — never
 * worth auto-reconnecting or offering a manual rejoin for. */
const ABANDONED_CLOSE_CODE = 4002;
/** How many automatic reconnect attempts before giving up and reporting 'lost'. */
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 800;

/** localStorage key for the "rejoin after crash" reconnection token. */
const REJOIN_STORAGE_KEY = 'kilrun_rejoin_v1';
/** Matches CompetitiveRoom's RECONNECT_WINDOW_SEC — a stored token past this
 * age is certainly stale, so don't bother offering it. */
const REJOIN_WINDOW_MS = 120_000;

interface StoredRejoin {
  roomName: GameRoomName;
  reconnectionToken: string;
  savedAt: number;
}

function saveRejoinToken(roomName: GameRoomName, reconnectionToken: string) {
  if (typeof window === 'undefined') return;
  try {
    const data: StoredRejoin = { roomName, reconnectionToken, savedAt: Date.now() };
    window.localStorage.setItem(REJOIN_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode, quota) — rejoin just won't be offered.
  }
}

function clearRejoinToken() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REJOIN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Returns a still-fresh stored rejoin token, or null if none/expired. Call
 * this on app load to decide whether to show a "Rejoin Match" button. */
export function getStoredRejoin(): { roomName: GameRoomName } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REJOIN_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredRejoin;
    if (!data?.reconnectionToken || Date.now() - data.savedAt > REJOIN_WINDOW_MS) {
      clearRejoinToken();
      return null;
    }
    return { roomName: data.roomName };
  } catch {
    return null;
  }
}

export class GameConnection {
  private client: Client;
  private room: Room | null = null;
  private mmTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastJoin: {
    roomName: GameRoomName;
    options: JoinOptions;
    callbacks: RoomCallbacks;
  } | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Re-registered onto every new Room in bindRoom() — onChat/onHitFx used to
  // bind directly to `this.room` at call time, so a reconnect (which swaps in
  // a brand-new Room instance) silently orphaned them: chat and hit-fx popups
  // just stopped after any network blip, with no visible error.
  private chatCallback: ((msg: ChatMessage) => void) | null = null;
  private hitFxCallback: ((msg: HitFxMessage) => void) | null = null;

  constructor(endpoint: string = resolveGameServerUrl()) {
    this.client = new Client(endpoint);
  }

  public get sessionId(): string | undefined {
    return this.room?.sessionId;
  }

  /** True only when the underlying WebSocket is actually open — safe to send on. */
  public get isOpen(): boolean {
    return Boolean(this.room?.connection?.isOpen);
  }

  public async connect(
    roomName: GameRoomName,
    options: JoinOptions,
    callbacks: RoomCallbacks
  ): Promise<void> {
    this.disposed = false;
    this.lastJoin = { roomName, options, callbacks };
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const isRanked = roomName === 'competitive_ranked';
    const preferredKey =
      options.rankKey && options.rankKey !== 'open' ? options.rankKey : null;
    const waitSec = Math.max(3, options.mmWaitSec ?? 12);
    const minSame = Math.max(2, options.minSameRankPlayers ?? 4);
    const { joinByRoomId, ...joinPayload } = options;

    if (joinByRoomId) {
      const room = await this.client.joinById(joinByRoomId, {
        ...joinPayload,
        rankKey: preferredKey ?? 'open',
      });
      // A disconnect() (e.g. React StrictMode's dev-only mount → unmount →
      // remount cycle, or the user closing Play Test before the join
      // finished) can land while this await was pending. Leave immediately
      // instead of binding a room this connection no longer owns — without
      // this, two joins can both land server-side (e.g. a maxClients:1
      // practice room) and produce a stray/duplicate player.
      if (this.disposed) {
        room.leave();
        return;
      }
      this.room = room;
      this.bindRoom(callbacks);
      callbacks.onConnectionState?.('connected');
      return;
    }

    const room = await this.client.joinOrCreate(roomName, {
      ...joinPayload,
      rankKey: preferredKey ?? 'open',
    });
    if (this.disposed) {
      room.leave();
      return;
    }
    this.room = room;
    this.bindRoom(callbacks);
    callbacks.onConnectionState?.('connected');

    if (isRanked && preferredKey) {
      this.mmTimer = setTimeout(() => {
        void this.maybeFallbackToOpenLobby(roomName, options, callbacks, minSame);
      }, waitSec * 1000);
    }
  }

  /**
   * Called when the room's WebSocket closes unexpectedly (server restart, load
   * balancer dropping an idle/misrouted connection, network blip, etc). Without
   * this, `sendInput` would keep calling `.send()` on a dead socket forever —
   * which is exactly the "WebSocket is already in CLOSING or CLOSED state"
   * console flood this was written to fix. Retries a few times with backoff,
   * then gives up and reports 'lost' so the UI can stop pretending input works.
   */
  private scheduleReconnect(code: number) {
    if (this.disposed || !this.lastJoin) return;
    if (code === CONSENTED_CLOSE_CODE) return; // we left on purpose
    const { roomName, options, callbacks } = this.lastJoin;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      callbacks.onConnectionState?.('lost');
      return;
    }
    this.reconnectAttempts += 1;
    callbacks.onConnectionState?.('reconnecting');

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(1.6, this.reconnectAttempts - 1);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return;
      // Prefer Colyseus's native seamless reconnect (keeps the same session)
      // when we have a token for it; otherwise fall back to a fresh join.
      const token = this.room?.reconnectionToken;
      const { joinByRoomId: _joinByRoomId, ...joinPayload } = options;
      // The reconnect/join promise below can resolve after disconnect() has
      // already run (e.g. the user left mid-reconnect-attempt) — without a
      // post-await disposed check, it would silently rejoin server-side and
      // rebind callbacks onto a torn-down UI, leaking a live room.
      const bindIfStillLive = (room: Room) => {
        if (this.disposed) {
          room.leave();
          return;
        }
        this.room = room;
        this.bindRoom(callbacks);
      };
      const attempt = token
        ? this.client.reconnect(token).then(bindIfStillLive)
        : this.client
            .joinOrCreate(roomName, {
              ...joinPayload,
              rankKey:
                options.rankKey && options.rankKey !== 'open' ? options.rankKey : 'open',
            })
            .then(bindIfStillLive);

      attempt
        .then(() => {
          this.reconnectAttempts = 0;
          callbacks.onConnectionState?.('connected');
        })
        .catch(() => {
          this.scheduleReconnect(code);
        });
    }, delay);
  }

  /** Join an existing room by id (party follow). */
  public async joinById(
    roomId: string,
    options: JoinOptions,
    callbacks: RoomCallbacks
  ): Promise<void> {
    return this.connect(
      // roomName unused when joinByRoomId is set
      'deathrun',
      { ...options, joinByRoomId: roomId },
      callbacks
    );
  }

  private async maybeFallbackToOpenLobby(
    roomName: GameRoomName,
    options: JoinOptions,
    callbacks: RoomCallbacks,
    minSame: number
  ) {
    if (this.disposed || !this.room) return;
    const state = this.room.state as unknown as NetRoomState;
    // Never tear down a room that already started countdown / match.
    if (state.phase !== 'lobby') return;

    // A read failure here (unexpected schema shape, room mid-teardown, etc)
    // must NOT be treated as "lobby is empty" — that would silently evict
    // everyone to an open lobby even when same-rank players are already
    // present. Bail out of the fallback entirely instead of guessing.
    let count: number;
    try {
      const players = (this.room.state as { players?: { size?: number } }).players;
      if (typeof players?.size !== 'number') return;
      count = players.size;
    } catch {
      return;
    }
    if (count >= minSame) return;

    try {
      await this.room.leave();
    } catch {
      // ignore
    }
    this.room = null;
    if (this.disposed) return;

    const room = await this.client.joinOrCreate(roomName, {
      ...options,
      rankKey: 'open',
    });
    if (this.disposed) {
      room.leave();
      return;
    }
    this.room = room;
    this.bindRoom(callbacks);
  }

  private bindRoom(callbacks: RoomCallbacks) {
    if (!this.room) return;
    if (this.room.reconnectionToken) {
      saveRejoinToken(this.lastJoin?.roomName ?? 'competitive', this.room.reconnectionToken);
    }
    // A dropped/killed WebSocket surfaces here as onLeave (with a non-consented
    // close code) — reconnect automatically instead of leaving `sendInput`
    // hammering a closed socket every frame.
    this.room.onLeave((code: number) => {
      if (code === CONSENTED_CLOSE_CODE || code === ABANDONED_CLOSE_CODE) {
        clearRejoinToken();
      }
      if (this.disposed) return;
      this.scheduleReconnect(code);
    });
    this.room.onError((code: number) => {
      if (this.disposed) return;
      console.warn('[kilrun] game room error', code);
    });
    if (this.chatCallback) this.room.onMessage('chat', this.chatCallback);
    if (this.hitFxCallback) this.room.onMessage('hitFx', this.hitFxCallback);
    const state = this.room.state as never;
    const $ = getStateCallbacks(this.room) as <T>(instance: T) => never;
    const proxy = $(state) as unknown as {
      players: {
        onAdd: (cb: (player: NetPlayerState, sessionId: string) => void) => void;
        onRemove: (cb: (player: NetPlayerState, sessionId: string) => void) => void;
      };
      obstacles: {
        onAdd: (cb: (obstacle: NetObstacleState, index: number) => void) => void;
        onRemove: (cb: (obstacle: NetObstacleState, index: number) => void) => void;
      };
      platforms: {
        onAdd: (cb: (platform: NetPlatformState, index: number) => void) => void;
        onRemove: (cb: (platform: NetPlatformState, index: number) => void) => void;
      };
      listen: (prop: string, cb: (value: unknown) => void) => void;
    };

    proxy.players.onAdd((player, sessionId) => {
      callbacks.onPlayerAdd?.(player, sessionId);
      const playerProxy = $(player as never) as unknown as { onChange: (cb: () => void) => void };
      playerProxy.onChange(() => callbacks.onPlayerChange?.(player, sessionId));
    });
    proxy.players.onRemove((_player, sessionId) => {
      callbacks.onPlayerRemove?.(sessionId);
    });
    proxy.obstacles.onAdd((obstacle, index) => {
      callbacks.onObstacleAdd?.(obstacle, index);
      const obstacleProxy = $(obstacle as never) as unknown as { onChange: (cb: () => void) => void };
      obstacleProxy.onChange(() => callbacks.onObstacleChange?.(obstacle, index));
    });
    proxy.obstacles.onRemove?.((_obstacle, index) => {
      callbacks.onObstacleRemove?.(index);
    });
    proxy.platforms?.onAdd?.((platform, index) => {
      callbacks.onPlatformAdd?.(platform, index);
      const platformProxy = $(platform as never) as unknown as { onChange: (cb: () => void) => void };
      platformProxy.onChange(() => callbacks.onPlatformChange?.(platform, index));
    });
    proxy.platforms?.onRemove?.((_platform, index) => {
      callbacks.onPlatformRemove?.(index);
    });

    const emitRoomChange = () => {
      if (!this.room) return;
      const s = this.room.state as unknown as NetRoomState;
      callbacks.onRoomChange?.({
        phase: s.phase,
        countdownMs: s.countdownMs,
        matchTimeRemainingMs: s.matchTimeRemainingMs,
        trapperSessionId: s.trapperSessionId,
        winnerRole: s.winnerRole,
        courseStartX: s.courseStartX,
        courseFinishX: s.courseFinishX,
        modeTag: s.modeTag,
        wave: s.wave,
        monstersAlive: s.monstersAlive,
        teamKills: s.teamKills,
        roundIndex: s.roundIndex,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        buyPhaseMs: (s as { buyPhaseMs?: number }).buyPhaseMs ?? 0,
        matchId: s.matchId,
        rewardsReady: s.rewardsReady,
        adminPaused: s.adminPaused,
        wasCancelled: s.wasCancelled,
        adminMessage: s.adminMessage,
        adminMessageSeq: s.adminMessageSeq,
        motionElapsedMs: s.motionElapsedMs,
      });
    };
    [
      'phase',
      'countdownMs',
      'matchTimeRemainingMs',
      'trapperSessionId',
      'winnerRole',
      'courseStartX',
      'courseFinishX',
      'modeTag',
      'wave',
      'monstersAlive',
      'teamKills',
      'roundIndex',
      'scoreA',
      'scoreB',
      'buyPhaseMs',
      'matchId',
      'rewardsReady',
      'adminPaused',
      'wasCancelled',
      'adminMessage',
      'adminMessageSeq',
    ].forEach((field) => {
      proxy.listen(field, emitRoomChange);
    });
    emitRoomChange();

    // See onRoomBound doc comment: tell the caller exactly who's in the room
    // right now so it can drop any session that left during a reconnect gap
    // (players.onAdd alone never fires a removal for those).
    const playersMap = (this.room.state as unknown as { players?: Map<string, unknown> })
      .players;
    if (playersMap && typeof playersMap.keys === 'function') {
      callbacks.onRoomBound?.(Array.from(playersMap.keys()));
    }
  }

  /**
   * Guarded send: no-ops (instead of throwing / spamming console) when the
   * room isn't joined or the underlying socket isn't OPEN. Every public
   * send* method below routes through this — this is the fix for the
   * "WebSocket is already in CLOSING or CLOSED state" flood, which happened
   * because `room.send()` was called unconditionally every network tick
   * even after the socket had died.
   */
  private safeSend(type: string, payload: unknown): void {
    if (!this.room || !this.isOpen) return;
    try {
      this.room.send(type, payload);
    } catch (err) {
      console.warn('[kilrun] send failed', type, err);
    }
  }

  public sendInput(input: PlayerInputMessage): void {
    this.safeSend('input', input);
  }

  /** Admin-only: start matchmaking countdown even with 1 player (competitive / horde / deathrun). */
  public sendForceStart(): void {
    this.safeSend('forceStart', {});
  }

  /**
   * Request a weapon swap during the buy phase (competitive countdown or horde intermission).
   * Server validates and applies the new loadout for the current round/wave.
   */
  public sendBuyWeapon(weaponPreset: {
    itemId?: string;
    kind: 'hitscan' | 'melee';
    damage: number;
    range: number;
    cooldownMs: number;
    coneRadians: number;
    fireMode?: 'auto' | 'semi' | 'bolt';
    pellets?: number;
    adsZoomFov?: number;
    adsConeScale?: number;
    hipfireConeScale?: number;
    magSize?: number;
    reserveAmmo?: number;
    reloadMs?: number;
    modelUrl?: string;
  }): void {
    this.safeSend('buyWeapon', weaponPreset);
  }

  public sendBuyPowerUp(powerUpId: string): void {
    this.safeSend('buyPowerUp', { powerUpId });
  }

  public sendBuyWeaponSkin(skinId: string): void {
    this.safeSend('buyWeaponSkin', { skinId });
  }

  public sendReload(): void {
    this.safeSend('reload', {});
  }

  public sendActivateAbility(ability: string): void {
    this.safeSend('activateAbility', { ability });
  }

  public sendChat(text: string, scope: 'all' | 'team'): void {
    this.safeSend('chat', { text, scope });
  }

  /** 'deathrun_practice' room only — forces the solo player's role since
   * there's no second player for the server to auto-assign trapper to. */
  public sendPracticeSetRole(role: 'runner' | 'trapper'): void {
    this.safeSend('practiceSetRole', { role });
  }

  /** Subscribe to broadcast in-match chat. Re-attached to every room bindRoom()
   *  binds (including reconnects), so it survives a dropped socket. */
  public onChat(callback: (msg: ChatMessage) => void): void {
    this.chatCallback = callback;
    this.room?.onMessage('chat', callback);
  }

  /** Subscribe to this client's own hit-landed events (damage-number popups).
   * Only ever sent to the attacker, never broadcast. Re-attached on reconnect
   * like onChat above. */
  public onHitFx(callback: (msg: HitFxMessage) => void): void {
    this.hitFxCallback = callback;
    this.room?.onMessage('hitFx', callback);
  }

  /** Drop the hit-fx listener so an unmounted engine cannot spawn into a destroyed overlay. */
  public offHitFx(): void {
    this.hitFxCallback = null;
  }

  /** Admin-only — server re-checks adminSessions, this is UI convenience only. */
  public sendAdminKick(targetSessionId: string): void {
    this.safeSend('adminKick', { targetSessionId });
  }

  public sendAdminMute(targetSessionId: string, minutes: number): void {
    this.safeSend('adminMute', { targetSessionId, minutes });
  }

  public sendAdminBan(targetSessionId: string, reason?: string): void {
    this.safeSend('adminBan', { targetSessionId, reason });
  }

  /** Deliberate mid-match leave (Competitive only) — triggers the escalating
   * abandon-cooldown server-side. See ABANDONED_CLOSE_CODE. */
  public sendAbandonMatch(): void {
    this.safeSend('abandonMatch', {});
  }

  /**
   * Attempts to resume a match using a rejoin token saved from a previous
   * session (crash/tab close). Returns false if there's no usable token or
   * the reconnect fails (e.g. the 2-minute window already expired).
   */
  public async rejoin(callbacks: RoomCallbacks): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    let stored: StoredRejoin;
    try {
      const raw = window.localStorage.getItem(REJOIN_STORAGE_KEY);
      if (!raw) return false;
      stored = JSON.parse(raw) as StoredRejoin;
    } catch {
      return false;
    }
    if (!stored?.reconnectionToken || Date.now() - stored.savedAt > REJOIN_WINDOW_MS) {
      clearRejoinToken();
      return false;
    }
    this.disposed = false;
    this.lastJoin = { roomName: stored.roomName, options: {} as JoinOptions, callbacks };
    try {
      const room = await this.client.reconnect(stored.reconnectionToken);
      if (this.disposed) {
        room.leave();
        return false;
      }
      this.room = room;
      this.bindRoom(callbacks);
      callbacks.onConnectionState?.('connected');
      return true;
    } catch {
      clearRejoinToken();
      return false;
    }
  }

  /** Colyseus room id after a successful connect (for party queue sync). */
  public get roomId(): string | undefined {
    return this.room?.roomId;
  }

  public sendLoadCustomMap(payload: {
    platforms: {
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      kind?: NetPlatformKind;
      boost?: number;
      height?: number;
      conveyorSpeed?: number;
      conveyorDirX?: number;
      conveyorDirY?: number;
      rotYaw?: number;
      entityId?: string;
      doorControlled?: boolean;
      motionPeriodMs?: number;
      motionPhaseMs?: number;
      motionAmpX?: number;
      motionAmpY?: number;
      motionAmpZ?: number;
    }[];
    obstacles?: {
      id?: string;
      kind?: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
      x: number;
      y: number;
      z: number;
      width: number;
      depth?: number;
      height: number;
      intervalMs?: number;
      activeMs?: number;
      damage?: number;
      alwaysActive?: boolean;
      buttonControlled?: boolean;
      instantKill?: boolean;
    }[];
    finishes?: {
      id: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
    }[];
    buttons?: {
      id: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      activatesObstacleIds: string[];
      holdMs: number;
      cooldownMs: number;
    }[];
    actions?: {
      id: string;
      x: number;
      y: number;
      z: number;
      radius: number;
      trigger: 'proximity' | 'interact' | 'collide' | 'always';
      activatesObstacleIds: string[];
      holdMs: number;
      cooldownMs: number;
    }[];
    teleports?: {
      id: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      targetX: number;
      targetY: number;
      targetZ: number;
      cooldownMs: number;
    }[];
    spawn?: { x: number; y: number; z: number };
    trapperSpawn?: { x: number; y: number; z: number };
    playerSpawns?: { x: number; y: number; z: number }[];
    monsterSpawns?: {
      id: string;
      x: number;
      y: number;
      z: number;
      monsterType?: 'basic' | 'fast' | 'brute' | 'boss' | 'custom';
      displayName?: string;
      modelUrl?: string;
      modelId?: string;
      level?: number;
      hp?: number;
      damage?: number;
      speed?: number;
      radius?: number;
      waveMin?: number;
      waveMax?: number;
      countPerWave?: number;
      spawnIntervalSec?: number;
    }[];
    waveAnchors?: { waveNumber: number; difficultyMultiplier: number }[];
    teamASpawns?: { x: number; y: number; z: number }[];
    teamBSpawns?: { x: number; y: number; z: number }[];
    pushPayloads?: {
      railId: string;
      blockId: string;
      x: number;
      y: number;
      z: number;
      yaw: number;
      length: number;
      width: number;
      t: number;
      pushStrength: number;
      pushRadius: number;
      winEpsilon: number;
      blockModelUrl?: string;
      blockModelId?: string;
    }[];
    healthFloors?: {
      id: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      healPerTick?: number;
      intervalMs?: number;
      maxHealPercent?: number;
    }[];
    redZones?: {
      id: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      damagePerTick?: number;
      intervalMs?: number;
      instantKill?: number;
    }[];
    revivePads?: {
      id: string;
      x: number;
      y: number;
      z: number;
      width: number;
      depth: number;
      height: number;
      reviveTimeMs?: number;
      capacity?: number;
    }[];
    worldBounds?: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
    modeSettings?: Record<string, unknown>;
    combatSettings?: Record<string, unknown>;
    shopSettings?: Record<string, unknown>;
    customMoves?: Record<string, unknown>[];
  }): void {
    this.safeSend('loadCustomMap', payload);
  }

  public disconnect(): void {
    this.disposed = true;
    this.lastJoin = null;
    if (this.mmTimer) {
      clearTimeout(this.mmTimer);
      this.mmTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.isOpen) {
      this.room?.leave();
    }
    this.room = null;
  }
}
