'use client';

import React from 'react';
import type { NetRoomState } from '../net/types';
import type { KilrunMode } from '@/lib/game-modes';

/** Compact in-match status for Horde waves / Competitive score. */
export const ModeStatusHud: React.FC<{ mode: KilrunMode; room: NetRoomState }> = ({
  mode,
  room,
}) => {
  if (mode === 'horde') {
    return (
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[120] pointer-events-none">
        <div className="rounded-xl border border-rose-500/40 bg-black/70 px-4 py-2 text-center backdrop-blur">
          <p className="text-[10px] uppercase tracking-widest text-rose-300/80 font-bold">
            Horde
          </p>
          <p className="text-lg font-black text-white tabular-nums">
            Wave {room.wave ?? 0}
            <span className="text-sm font-bold text-slate-400 ml-2">
              · {room.monstersAlive ?? 0} left · {room.teamKills ?? 0} kills
            </span>
          </p>
        </div>
      </div>
    );
  }
  if (mode === 'competitive') {
    return (
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[120] pointer-events-none">
        <div className="rounded-xl border border-sky-500/40 bg-black/70 px-4 py-2 text-center backdrop-blur">
          <p className="text-[10px] uppercase tracking-widest text-sky-300/80 font-bold">
            Round {room.roundIndex ?? 0} / 6
          </p>
          <p className="text-lg font-black text-white tabular-nums">
            <span className="text-sky-400">{room.scoreA ?? 0}</span>
            <span className="text-slate-500 mx-2">–</span>
            <span className="text-orange-400">{room.scoreB ?? 0}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};
