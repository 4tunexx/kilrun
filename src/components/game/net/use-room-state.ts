'use client';

import { useEffect, useRef, useState } from 'react';
import { GameConnection, type JoinOptions, type RoomCallbacks } from './connection';
import type { NetObstacleState, NetPlayerState, NetRoomState } from './types';

const DEFAULT_ROOM_STATE: NetRoomState = {
  phase: 'lobby',
  countdownMs: 0,
  matchTimeRemainingMs: 0,
  trapperSessionId: '',
  winnerRole: '',
};

/**
 * Bridges the imperative Colyseus connection into React state for the HUD
 * (health, role, match phase/timer) while keeping a live snapshot of every
 * player/obstacle in refs. `rendererCallbacksRef.current` is read on every
 * event, not captured once, so the PixiJS layer (mounted well after this
 * hook first connects) can attach its own add/change/remove handlers late
 * and still receive every future update -- it bootstraps its initial
 * scene from `playersRef`/`obstaclesRef` directly on mount.
 */
export function useRoomState(joinOptions: JoinOptions | null) {
  const connectionRef = useRef<GameConnection | null>(null);
  const playersRef = useRef<Map<string, NetPlayerState>>(new Map());
  const obstaclesRef = useRef<Map<number, NetObstacleState>>(new Map());
  const rendererCallbacksRef = useRef<RoomCallbacks>({});
  const [room, setRoom] = useState<NetRoomState>(DEFAULT_ROOM_STATE);
  const [localPlayer, setLocalPlayer] = useState<NetPlayerState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinOptions) return;
    let disposed = false;
    const connection = new GameConnection();
    connectionRef.current = connection;

    const callbacks: RoomCallbacks = {
      onPlayerAdd: (player, sessionId) => {
        playersRef.current.set(sessionId, player);
        setPlayerCount(playersRef.current.size);
        if (sessionId === connection.sessionId) setLocalPlayer({ ...player });
        rendererCallbacksRef.current.onPlayerAdd?.(player, sessionId);
      },
      onPlayerChange: (player, sessionId) => {
        playersRef.current.set(sessionId, player);
        if (sessionId === connection.sessionId) setLocalPlayer({ ...player });
        rendererCallbacksRef.current.onPlayerChange?.(player, sessionId);
      },
      onPlayerRemove: (sessionId) => {
        playersRef.current.delete(sessionId);
        setPlayerCount(playersRef.current.size);
        rendererCallbacksRef.current.onPlayerRemove?.(sessionId);
      },
      onObstacleAdd: (obstacle, index) => {
        obstaclesRef.current.set(index, obstacle);
        rendererCallbacksRef.current.onObstacleAdd?.(obstacle, index);
      },
      onObstacleChange: (obstacle, index) => {
        obstaclesRef.current.set(index, obstacle);
        rendererCallbacksRef.current.onObstacleChange?.(obstacle, index);
      },
      onRoomChange: (r) => setRoom(r),
    };

    connection.connect('deathrun', joinOptions, callbacks).catch((err) => {
      if (!disposed) setConnectionError(err instanceof Error ? err.message : 'Failed to connect to game server');
    });

    return () => {
      disposed = true;
      connection.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOptions?.userId]);

  return {
    connectionRef,
    playersRef,
    obstaclesRef,
    rendererCallbacksRef,
    room,
    localPlayer,
    playerCount,
    connectionError,
  };
}
