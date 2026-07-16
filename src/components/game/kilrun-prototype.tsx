
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { KilrunEngine } from './engine';
import { HUD } from './ui/hud';
import { Crosshair } from './ui/crosshair';
import { Button } from '@/components/ui/button';
import { X, MousePointer2, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { GameState } from './types';
import { recordMatchStat } from '@/lib/actions';

export default function KilrunPrototype({ onExit, userId }: { onExit: () => void; userId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<KilrunEngine | null>(null);
  const isMobile = useIsMobile();
  const [gameState, setGameState] = useState<GameState>({
    score: 0, distance: 0, health: 3, status: 'playing', speed: 0, combo: 0, maxCombo: 0, checkpointZ: 0
  });
  const [isLocked, setIsLocked] = useState(false);
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const engine = new KilrunEngine(canvas, (state) => setGameState({ ...state }));
    engineRef.current = engine;
    engine.start();

    const unsubscribeLock = engine.input.pointerLock.onChange(setIsLocked);

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      engine.stop();
      unsubscribeLock();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Persist the run to Prisma the moment it ends, replacing what used to be
  // a purely client-side, throwaway game-over state.
  useEffect(() => {
    if (gameState.status === 'gameover' && !hasRecordedRef.current && userId) {
      hasRecordedRef.current = true;
      recordMatchStat({
        userId,
        score: gameState.score,
        distance: gameState.distance,
        livesRemaining: Math.max(gameState.health, 0),
      }).catch(() => {
        // Non-fatal: the player still sees their result even if the write fails.
      });
    }
  }, [gameState.status, gameState.score, gameState.distance, gameState.health, userId]);

  const requestLock = () => {
    if (!isMobile) engineRef.current?.input.pointerLock.request();
  };

  const handleRespawn = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center overflow-hidden touch-none select-none">
      <canvas
        ref={canvasRef}
        onClick={requestLock}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {!isMobile && <Crosshair speed={gameState.speed} />}
      <HUD state={gameState} speed={gameState.speed} />

      <div className="absolute top-8 right-8 pointer-events-auto z-[200]">
        <Button variant="destructive" size="icon" className="w-12 h-12 rounded-xl shadow-lg" onClick={onExit}>
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Mobile Dynamic Joysticks Visual Feedback */}
      {isMobile && engineRef.current?.input.touch.leftStick.active && (
        <div className="absolute w-20 h-20 border-2 border-white/20 rounded-full pointer-events-none bg-white/5 backdrop-blur-sm z-[150]"
          style={{ left: engineRef.current.input.touch.leftStick.start.x - 40, top: engineRef.current.input.touch.leftStick.start.y - 40 }}>
          <div className="absolute w-10 h-10 bg-white/40 rounded-full"
            style={{
              transform: `translate(${Math.min(Math.max(engineRef.current.input.touch.leftStick.current.x - engineRef.current.input.touch.leftStick.start.x, -30), 30) + 20}px, ${Math.min(Math.max(engineRef.current.input.touch.leftStick.current.y - engineRef.current.input.touch.leftStick.start.y, -30), 30) + 20}px)`
            }} />
        </div>
      )}

      {isMobile && engineRef.current?.input.touch.rightStick.active && (
        <div className="absolute w-20 h-20 border-2 border-primary/20 rounded-full pointer-events-none bg-primary/5 backdrop-blur-sm z-[150]"
          style={{ left: engineRef.current.input.touch.rightStick.start.x - 40, top: engineRef.current.input.touch.rightStick.start.y - 40 }}>
          <div className="absolute w-10 h-10 bg-primary/40 rounded-full"
            style={{
              transform: `translate(${Math.min(Math.max(engineRef.current.input.touch.rightStick.current.x - engineRef.current.input.touch.rightStick.start.x, -30), 30) + 20}px, ${Math.min(Math.max(engineRef.current.input.touch.rightStick.current.y - engineRef.current.input.touch.rightStick.start.y, -30), 30) + 20}px)`
            }} />
        </div>
      )}

      {/* Desktop Focus Message */}
      {!isMobile && !isLocked && gameState.status === 'playing' && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center z-[250]" onClick={requestLock}>
            <div className="bg-slate-900 border border-slate-700 p-10 rounded-3xl flex flex-col items-center gap-6 animate-in zoom-in duration-300 shadow-2xl">
                <MousePointer2 className="w-16 h-16 text-primary animate-bounce" />
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Click to Play</h3>
                <div className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em] text-center space-y-2">
                    <p>WASD: Move &bull; SPACE: Jump</p>
                    <p>MOUSE: Look around</p>
                </div>
            </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState.status === 'gameover' && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-3xl flex flex-col items-center justify-center p-8 z-[300]">
          <h2 className="text-9xl font-black text-red-600 mb-4 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(220,38,38,0.5)]">WASTED</h2>
          <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 mb-12 text-center">
            <p className="text-slate-400 text-lg uppercase tracking-widest font-bold mb-2">Final Distance</p>
            <p className="text-6xl font-black text-white">{gameState.distance}m</p>
          </div>
          <div className="flex gap-6 w-full max-w-lg">
            <Button size="lg" className="flex-1 py-10 text-2xl font-black uppercase rounded-2xl gap-3 shadow-[0_0_20px_rgba(239,68,68,0.3)]" onClick={handleRespawn}>
              <RefreshCw className="w-8 h-8" /> Respawn
            </Button>
            <Button size="lg" variant="outline" className="flex-1 py-10 text-2xl font-black uppercase rounded-2xl" onClick={onExit}>
              Quit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
