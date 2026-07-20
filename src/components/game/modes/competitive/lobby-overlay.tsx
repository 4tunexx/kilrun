'use client';

import React from 'react';
import { Loader2, Swords, Users } from 'lucide-react';

export const CompetitiveLobbyOverlay: React.FC<{ playerCount: number }> = ({
  playerCount,
}) => (
  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[130]">
    <div className="bg-slate-900/90 border border-sky-700/40 rounded-3xl p-8 sm:p-10 flex flex-col items-center gap-4 shadow-2xl mx-4 max-w-md">
      <Loader2 className="w-12 h-12 text-sky-400 animate-spin" />
      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight text-center flex items-center gap-2">
        <Swords className="w-6 h-6" /> Competitive 4v4
      </h3>
      <div className="flex items-center gap-2 text-slate-300 font-bold">
        <Users className="w-5 h-5" />
        <span className="tabular-nums">{playerCount} / 8 players</span>
      </div>
      <p className="text-slate-500 text-sm text-center max-w-xs">
        Best of 6 rounds (first to 4). Wins and losses move your Killrun Points (KP) and rank.
      </p>
    </div>
  </div>
);
