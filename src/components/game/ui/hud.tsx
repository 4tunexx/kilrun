
'use client';

import React from 'react';
import { Trophy, Activity, Heart } from 'lucide-react';
import { GameState } from '../types';

export const HUD: React.FC<{ state: GameState; speed: number }> = ({ state, speed }) => {
  const speedPercentage = Math.min((speed / 0.4) * 100, 100);

  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans">
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <Trophy className="text-yellow-400 w-6 h-6" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Score</p>
            <p className="text-xl font-black text-white">{state.score}</p>
          </div>
        </div>
        <div className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-4">
          <Activity className="text-primary w-6 h-6" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Distance</p>
            <p className="text-xl font-black text-white">{state.distance}m</p>
          </div>
        </div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
            <div className={`w-1 h-1 bg-primary rounded-full shadow-[0_0_5px_#ef4444] ${speed > 0.1 ? 'scale-150' : 'scale-100'}`} />
            <div className={`absolute -inset-4 border border-white/20 rounded-full transition-all ${speed > 0.1 ? 'scale-125 opacity-100' : 'scale-75 opacity-0'}`} />
        </div>
      </div>

      <div className="absolute bottom-8 left-8 w-48 bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
        <div className="flex justify-between items-end mb-2">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Velocity</p>
            <p className="text-lg font-black text-white">{Math.floor(speed * 1000)}</p>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-100" style={{ width: `${speedPercentage}%` }} />
        </div>
      </div>

      <div className="absolute bottom-8 right-8 bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-3">
        {[...Array(3)].map((_, i) => (
            <Heart key={i} className={`w-6 h-6 ${i < state.health ? 'text-red-500 fill-current' : 'text-slate-800'}`} />
        ))}
      </div>
    </div>
  );
};
