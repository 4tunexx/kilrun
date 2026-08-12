'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GameConnection,
  getStoredRejoin,
  type GameRoomName,
  type JoinOptions,
  type RoomCallbacks,
} from './connection';
import type { NetObstacleState, NetPlatformState, NetPlayerState, NetRoomState } from './types';

const DEFAULT_ROOM_STATE: NetRoomState = {
  phase: 'lobby',
  countdownMs: 0,
  matchTimeRemainingMs: 0,
  trapperSessionId: '',
  winnerRole: '',
  modeTag: 'deathrun',
  wave: 0,
  monstersAlive: 0,
  teamKills: 0,
  roundIndex: 0,
  scoreA: 0,
  scoreB: 0,
  buyPhaseMs: 0,
};

export function useRoomState(
  joinOptions: JoinOptions | null,
  roomName: GameRoomName = 'deathrun'
) {
  const connectionRef = useRef<GameConnection | null>(null);
  const playersRef = useRef<Map<string, NetPlayerState>>(new Map());
  const obstaclesRef = useRef<Map<number, NetObstacleState>>(new Map());
  const platformsRef = useRef<Map<number, NetPlatformState>>(new Map());
  const rendererCallbacksRef = useRef<RoomCallbacks>({});
  const [room, setRoom] = useState<NetRoomState>(DEFAULT_ROOM_STATE);
  const [localPlayer, setLocalPlayer] = useState<NetPlayerState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    'connected' | 'reconnecting' | 'lost'
  >('connected');

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
      onObstacleRemove: (index) => {
        obstaclesRef.current.delete(index);
        rendererCallbacksRef.current.onObstacleRemove?.(index);
      },
      onPlatformAdd: (platform, index) => {
        platformsRef.current.set(index, platform);
        rendererCallbacksRef.current.onPlatformAdd?.(platform, index);
      },
      onPlatformChange: (platform, index) => {
        platformsRef.current.set(index, platform);
        rendererCallbacksRef.current.onPlatformChange?.(platform, index);
      },
      onPlatformRemove: (index) => {
        platformsRef.current.delete(index);
        rendererCallbacksRef.current.onPlatformRemove?.(index);
      },
      onRoomChange: (r) => setRoom(r),
      onConnectionState: (state) => {
        if (disposed) return;
        setConnectionState(state);
        if (state === 'lost') {
          setConnectionError(
            'Lost connection to the game server and could not reconnect. Check that the realtime server is deployed and NEXT_PUBLIC_GAME_SERVER_URL is set correctly.'
          );
        } else if (state === 'connected') {
          setConnectionError(null);
        }
      },
    };

    // If a rejoin token is still fresh for this exact room (crash/tab close
    // during the previous session), resume that match instead of starting a
    // brand-new join/queue — mirrors the "rejoin" button's underlying flow,
    // but happens automatically whenever this mode is opened again in time.
    const storedRejoin = getStoredRejoin();
    const rejoinAttempt =
      storedRejoin?.roomName === roomName ? connection.rejoin(callbacks) : Promise.resolve(false);

    rejoinAttempt
      .then((rejoined) => {
        if (disposed || rejoined) return;
        return connection.connect(roomName, joinOptions, callbacks);
      })
      .catch((err) => {
        if (!disposed)
          setConnectionError(err instanceof Error ? err.message : 'Failed to connect to game server');
      });

    return () => {
      disposed = true;
      connection.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOptions?.userId, joinOptions?.joinByRoomId, roomName]);

  return {
    connectionRef,
    playersRef,
    obstaclesRef,
    platformsRef,
    rendererCallbacksRef,
    room,
    localPlayer,
    playerCount,
    connectionError,
    connectionState,
  };
}
