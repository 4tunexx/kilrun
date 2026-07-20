'use client';

import React from 'react';
import { Loader2, Users } from 'lucide-react';

export const HordeLobbyOverlay: React.FC<{ playerCount: number }> = ({ playerCount }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[130]">
    <div className="bg-slate-900/90 border border-rose-700/40 rounded-3xl p-8 sm:p-10 flex flex-col items-center gap-4 shadow-2xl mx-4 max-w-md">
      <Loader2 className="w-12 h-12 text-rose-400 animate-spin" />
      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight text-center">
        Horde lobby
      </h3>
      <div className="flex items-center gap-2 text-slate-300 font-bold">
        <Users className="w-5 h-5" />
        <span className="tabular-nums">{playerCount} / 4 survivors</span>
      </div>
      <p className="text-slate-500 text-sm text-center max-w-xs">
        Clear escalating waves. Health floors heal you, revive pads bring teammates back, red zones
        hurt. Match starts automatically.
      </p>
    </div>
  </div>
);
