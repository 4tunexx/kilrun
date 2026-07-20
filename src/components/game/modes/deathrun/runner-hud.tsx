'use client';

import React from 'react';
import { Flag } from 'lucide-react';
import type { NetPlayerState, NetRoomState } from '../../net/types';
import { FINISH_X, SPAWN_X } from '../../utils/constants';

/** Runner-specific HUD: progress from Start → Finish (custom map aware). */
export const RunnerHud: React.FC<{
  player: NetPlayerState;
  room?: NetRoomState;
}> = ({ player, room }) => {
  const startX = room?.courseStartX ?? SPAWN_X;
  const finishX = room?.courseFinishX ?? FINISH_X;
  const span = Math.max(1, finishX - startX);
  const progress = Math.max(0, Math.min(1, (player.x - startX) / span));

  return (
    <div className="pointer-events-none bg-slate-900/80 backdrop-blur-xl px-3 py-2 rounded-xl border border-cyan-500/20 w-[min(16rem,70vw)]">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
          Course
        </p>
        <Flag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <p className="text-right text-[10px] text-slate-500 mt-1 font-bold">
        {Math.round(progress * 100)}%
      </p>
    </div>
  );
};
