import { Client, Room, getStateCallbacks } from 'colyseus.js';
import type {
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
  /** Allows pushing MAIN custom maps into the room. */
  isAdmin?: boolean;
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
}

export type GameRoomName = 'deathrun' | 'horde' | 'competitive' | 'competitive_ranked';



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
}

function resolveGameServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:2567`;
  }
  return 'ws://localhost:2567';
}

export class GameConnection {
  private client: Client;
  private room: Room | null = null;
  private mmTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(endpoint: string = resolveGameServerUrl()) {
    this.client = new Client(endpoint);
  }

  public get sessionId(): string | undefined {
    return this.room?.sessionId;
  }

  public async connect(
    roomName: GameRoomName,
    options: JoinOptions,
    callbacks: RoomCallbacks
  ): Promise<void> {
    this.disposed = false;
    const isRanked = roomName === 'competitive_ranked';
    const preferredKey =
      options.rankKey && options.rankKey !== 'open' ? options.rankKey : null;
    const waitSec = Math.max(3, options.mmWaitSec ?? 12);
    const minSame = Math.max(2, options.minSameRankPlayers ?? 4);

    this.room = await this.client.joinOrCreate(roomName, {
      ...options,
      rankKey: preferredKey ?? 'open',
    });
    this.bindRoom(callbacks);

    if (isRanked && preferredKey) {
      this.mmTimer = setTimeout(() => {
        void this.maybeFallbackToOpenLobby(roomName, options, callbacks, minSame);
      }, waitSec * 1000);
    }
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

    let count = 0;
    try {
      const players = (this.room.state as { players?: { size?: number } }).players;
      count = typeof players?.size === 'number' ? players.size : 0;
    } catch {
      count = 0;
    }
    if (count >= minSame) return;

    try {
      await this.room.leave();
    } catch {
      // ignore
    }
    this.room = null;
    if (this.disposed) return;

    this.room = await this.client.joinOrCreate(roomName, {
      ...options,
      rankKey: 'open',
    });
    this.bindRoom(callbacks);
  }

  private bindRoom(callbacks: RoomCallbacks) {
    if (!this.room) return;
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
    ].forEach((field) => {
      proxy.listen(field, emitRoomChange);
    });
    emitRoomChange();
  }

  public sendInput(input: PlayerInputMessage): void {
    this.room?.send('input', input);
  }

  /** Admin-only: start competitive matchmaking countdown even with 1 player. */
  public sendForceStart(): void {
    this.room?.send('forceStart', {});
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
    }[];
    obstacles?: {
      id?: string;
      kind?: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
      x: number;
      y: number;
      z: number;
      width: number;
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
      monsterType?: 'basic' | 'fast' | 'brute' | 'boss';
      waveMin?: number;
      waveMax?: number;
      countPerWave?: number;
      spawnIntervalSec?: number;
    }[];
    teamASpawns?: { x: number; y: number; z: number }[];
    teamBSpawns?: { x: number; y: number; z: number }[];
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
    }[];
    worldBounds?: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
    modeSettings?: {
      deathrun?: {
        warmupSec?: number;
        roundTimeSec?: number;
        maxRunners?: number;
        trapperEnabled?: boolean;
      };
      horde?: {
        warmupSec?: number;
        waveTimeSec?: number;
        intermissionSec?: number;
        maxPlayers?: number;
        startingWave?: number;
      };
      competitive?: {
        warmupSec?: number;
        buyTimeSec?: number;
        roundTimeSec?: number;
        roundCount?: number;
        overtimeSec?: number;
      };
    };
  }): void {
    this.room?.send('loadCustomMap', payload);
  }

  public disconnect(): void {
    this.disposed = true;
    if (this.mmTimer) {
      clearTimeout(this.mmTimer);
      this.mmTimer = null;
    }
    this.room?.leave();
    this.room = null;
  }
}
