import { Client, Room, getStateCallbacks } from 'colyseus.js';
import type { NetObstacleState, NetPlayerState, NetRoomState, PlayerInputMessage } from './types';

export interface JoinOptions {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export interface RoomCallbacks {
  onPlayerAdd?: (player: NetPlayerState, sessionId: string) => void;
  onPlayerChange?: (player: NetPlayerState, sessionId: string) => void;
  onPlayerRemove?: (sessionId: string) => void;
  onObstacleAdd?: (obstacle: NetObstacleState, index: number) => void;
  onObstacleChange?: (obstacle: NetObstacleState, index: number) => void;
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

/**
 * Thin wrapper around a single Colyseus room connection for a Deathrun
 * match. Owns the raw `colyseus.js` room + its schema callback proxy so
 * both the imperative PixiJS renderer and the React HUD can subscribe to
 * the same authoritative state without duplicating connection logic.
 */
export class GameConnection {
  private client: Client;
  private room: Room | null = null;

  constructor(endpoint: string = resolveGameServerUrl()) {
    this.client = new Client(endpoint);
  }

  public get sessionId(): string | undefined {
    return this.room?.sessionId;
  }

  public async connect(roomName: 'deathrun', options: JoinOptions, callbacks: RoomCallbacks): Promise<void> {
    this.room = await this.client.joinOrCreate(roomName, options);
    const state = this.room.state as never;
    const $ = getStateCallbacks(this.room) as <T>(instance: T) => never;
    const proxy = $(state) as unknown as {
      players: {
        onAdd: (cb: (player: NetPlayerState, sessionId: string) => void) => void;
        onRemove: (cb: (player: NetPlayerState, sessionId: string) => void) => void;
      };
      obstacles: {
        onAdd: (cb: (obstacle: NetObstacleState, index: number) => void) => void;
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

    const emitRoomChange = () => {
      const s = this.room!.state as unknown as NetRoomState;
      callbacks.onRoomChange?.({
        phase: s.phase,
        countdownMs: s.countdownMs,
        matchTimeRemainingMs: s.matchTimeRemainingMs,
        trapperSessionId: s.trapperSessionId,
        winnerRole: s.winnerRole,
      });
    };
    ['phase', 'countdownMs', 'matchTimeRemainingMs', 'trapperSessionId', 'winnerRole'].forEach((field) => {
      proxy.listen(field, emitRoomChange);
    });
    emitRoomChange();
  }

  public sendInput(input: PlayerInputMessage): void {
    this.room?.send('input', input);
  }

  public disconnect(): void {
    this.room?.leave();
    this.room = null;
  }
}
