'use client';

import React from 'react';
import { Heart, Timer, Skull, Wind } from 'lucide-react';
import type { NetPlayerState, NetRoomState } from '../net/types';
import { RunnerHud } from '../modes/deathrun/runner-hud';
import { TrapperControls } from '../modes/deathrun/trapper-controls';

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const HUD: React.FC<{ player: NetPlayerState; room: NetRoomState }> = ({ player, room }) => {
  const isTrapper = player.role === 'trapper';

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans z-[110]">
      <div className="absolute top-6 left-6 flex flex-col gap-3">
        <div
          className={`px-4 py-2 rounded-xl border backdrop-blur-xl flex items-center gap-2 font-black uppercase tracking-widest text-sm ${
            isTrapper ? 'bg-orange-950/70 border-orange-500/40 text-orange-300' : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
          }`}
        >
          {isTrapper ? <Skull className="w-4 h-4" /> : <Wind className="w-4 h-4" />}
          {isTrapper ? 'Trapper' : 'Runner'}
        </div>
        <div className="bg-slate-900/80 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
          <Timer className="w-4 h-4 text-yellow-400" />
          <span className="text-lg font-black text-white tabular-nums">{formatClock(room.matchTimeRemainingMs)}</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-6">{isTrapper ? <TrapperControls /> : <RunnerHud player={player} />}</div>

      <div className="absolute bottom-6 right-6 w-56 bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Health</p>
          <Heart className="w-4 h-4 text-red-500" />
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-150"
            style={{ width: `${Math.max(0, player.health)}%` }}
          />
        </div>
      </div>

      {player.hasFinished && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center">
          <p className="text-4xl font-black text-yellow-400 uppercase tracking-tighter drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]">
            Finished!
          </p>
          <p className="text-slate-300 font-semibold">Waiting for the round to end...</p>
        </div>
      )}

      {!player.isAlive && !player.hasFinished && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center">
          <p className="text-4xl font-black text-red-500 uppercase tracking-tighter drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]">
            Eliminated
          </p>
          <p className="text-slate-400 font-semibold">Spectating until the round ends...</p>
        </div>
      )}
    </div>
  );
};
