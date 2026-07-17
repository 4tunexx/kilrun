'use client';

import React from 'react';
import { Flag } from 'lucide-react';
import type { NetPlayerState } from '../../net/types';
import { FINISH_X, SPAWN_X } from '../../utils/constants';

/** Runner-specific HUD element: progress toward the finish line. */
export const RunnerHud: React.FC<{ player: NetPlayerState }> = ({ player }) => {
  const progress = Math.max(0, Math.min(1, (player.x - SPAWN_X) / (FINISH_X - SPAWN_X)));

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-cyan-500/20 w-64">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Distance to Finish</p>
        <Flag className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-yellow-400 transition-all duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="text-right text-xs text-slate-500 mt-1 font-bold">{Math.round(progress * 100)}%</p>
    </div>
  );
};
