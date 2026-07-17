'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoomState } from './net/use-room-state';
import type { JoinOptions } from './net/connection';
import type { NetObstacleState, PlayerInputMessage } from './net/types';
import { createPixiApp, type PixiBootstrap } from './renderer/pixi-app';
import { TrackView } from './renderer/track-view';
import { PlayerView } from './entities/player-view';
import { ObstacleView } from './entities/obstacle-view';
import { InputManager } from './input/input-manager';
import { screenDirectionToWorld, worldToScreen, type IsoCamera } from './renderer/iso-camera';
import {
  detectTouchDevice,
  CAMERA_FOLLOW_LERP,
  NETWORK_SEND_INTERVAL_MS,
  SPAWN_X,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  FINISH_X,
} from './utils/constants';
import { HUD } from './ui/hud';
import { Crosshair } from './ui/crosshair';
import { LobbyOverlay } from './modes/deathrun/lobby-overlay';
import { CountdownOverlay } from './modes/deathrun/countdown-overlay';
import { ResultsScreen } from './modes/deathrun/results-screen';

interface KilrunEngineProps {
  joinOptions: JoinOptions;
  onExit: () => void;
}

/**
 * Root client component for a Deathrun match. Owns the Colyseus connection
 * (via `useRoomState`), the PixiJS scene, the input manager, and the fixed
 * send-rate network loop; renders phase-aware React overlays (lobby wait,
 * countdown, HUD, results) on top of the canvas.
 */
export default function KilrunEngine({ joinOptions, onExit }: KilrunEngineProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { connectionRef, playersRef, obstaclesRef, rendererCallbacksRef, room, localPlayer, playerCount, connectionError } =
    useRoomState(joinOptions);

  const [isAiming, setIsAiming] = useState(true);

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) return;

    let pixi: PixiBootstrap | null = null;
    let disposed = false;
    let removeTicker: (() => void) | null = null;

    const isMobile = detectTouchDevice();
    const inputManager = new InputManager(hostElement, isMobile);
    const camera: IsoCamera = { focusX: SPAWN_X, focusY: WORLD_HEIGHT / 2 };
    const playerViews = new Map<string, PlayerView>();
    const obstacleViews = new Map<number, ObstacleView>();
    let track: TrackView | null = null;
    let sendAccumulatorMs = 0;
    let shootHeld = false;

    createPixiApp(hostElement).then((bootstrap) => {
      if (disposed) {
        bootstrap.destroy();
        return;
      }
      pixi = bootstrap;
      track = new TrackView(WORLD_WIDTH, WORLD_HEIGHT, FINISH_X);
      bootstrap.worldLayer.addChild(track.container);

      const spawnPlayerView = (sessionId: string, username: string) => {
        const view = new PlayerView(username, sessionId === connectionRef.current?.sessionId);
        playerViews.set(sessionId, view);
        bootstrap.worldLayer.addChild(view.container);
      };
      const spawnObstacleView = (index: number, kind: NetObstacleState['kind']) => {
        const view = new ObstacleView(kind);
        obstacleViews.set(index, view);
        bootstrap.worldLayer.addChild(view.container);
      };

      rendererCallbacksRef.current = {
        onPlayerAdd: (player, sessionId) => spawnPlayerView(sessionId, player.username),
        onPlayerRemove: (sessionId) => {
          playerViews.get(sessionId)?.destroy();
          playerViews.delete(sessionId);
        },
        onObstacleAdd: (obstacle, index) => spawnObstacleView(index, obstacle.kind),
      };

      // Catch anything that arrived over the network while Pixi was still initializing.
      playersRef.current.forEach((player, sessionId) => {
        if (!playerViews.has(sessionId)) spawnPlayerView(sessionId, player.username);
      });
      obstaclesRef.current.forEach((obstacle, index) => {
        if (!obstacleViews.has(index)) spawnObstacleView(index, obstacle.kind);
      });

      const onTick = (ticker: { deltaMS: number }) => {
        const dtSeconds = ticker.deltaMS / 1000;
        const screenWidth = bootstrap.app.screen.width;
        const screenHeight = bootstrap.app.screen.height;

        const localSessionId = connectionRef.current?.sessionId;
        const localState = localSessionId ? playersRef.current.get(localSessionId) : undefined;

        if (localState) {
          camera.focusX += (localState.x - camera.focusX) * CAMERA_FOLLOW_LERP;
          camera.focusY += (localState.y - camera.focusY) * CAMERA_FOLLOW_LERP;
        }

        track?.update(camera, screenWidth, screenHeight);
        playerViews.forEach((view, sessionId) => {
          const player = playersRef.current.get(sessionId);
          if (player) view.update(player, camera, screenWidth, screenHeight);
        });
        obstacleViews.forEach((view, index) => {
          const obstacle = obstaclesRef.current.get(index);
          if (obstacle) view.update(obstacle, camera, screenWidth, screenHeight, dtSeconds);
        });

        setIsAiming(inputManager.isAiming());
        shootHeld = shootHeld || inputManager.isShootPressed();

        sendAccumulatorMs += ticker.deltaMS;
        if (sendAccumulatorMs >= NETWORK_SEND_INTERVAL_MS && localState) {
          sendAccumulatorMs = 0;
          const moveScreenVector = inputManager.getMoveVector();
          const moveWorldVector = screenDirectionToWorld(moveScreenVector);
          const localScreenPoint = worldToScreen(localState.x, localState.y, camera, screenWidth, screenHeight);
          const aimAngle = inputManager.getAimAngle(localScreenPoint);

          const message: PlayerInputMessage = {
            moveX: moveWorldVector.x,
            moveY: moveWorldVector.y,
            aimAngle,
            crouch: inputManager.isCrouchPressed(),
            shootPressed: shootHeld,
            interactPressed: inputManager.isInteractPressed(),
          };
          connectionRef.current?.sendInput(message);
          shootHeld = false;
        }
      };

      bootstrap.app.ticker.add(onTick);
      removeTicker = () => bootstrap.app.ticker.remove(onTick);
    });

    return () => {
      disposed = true;
      removeTicker?.();
      playerViews.forEach((view) => view.destroy());
      obstacleViews.forEach((view) => view.destroy());
      track?.destroy();
      pixi?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 overflow-hidden touch-none select-none">
      <div ref={hostRef} className="absolute inset-0 w-full h-full" />

      {room.phase === 'playing' && <Crosshair visible={isAiming} />}
      {room.phase === 'playing' && localPlayer && <HUD player={localPlayer} room={room} />}
      {room.phase === 'lobby' && <LobbyOverlay playerCount={playerCount} />}
      {room.phase === 'countdown' && <CountdownOverlay countdownMs={room.countdownMs} />}
      {room.phase === 'results' && localPlayer && <ResultsScreen room={room} player={localPlayer} onContinue={onExit} />}

      {connectionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-[300]">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
            <h3 className="text-2xl font-black text-red-400 mb-2">Connection Failed</h3>
            <p className="text-slate-400 mb-6">{connectionError}</p>
            <Button variant="destructive" onClick={onExit}>
              Back to Menu
            </Button>
          </div>
        </div>
      )}

      <div className="absolute top-6 right-6 pointer-events-auto z-[200]">
        <Button variant="destructive" size="icon" className="w-12 h-12 rounded-xl shadow-lg" onClick={onExit}>
          <X className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
