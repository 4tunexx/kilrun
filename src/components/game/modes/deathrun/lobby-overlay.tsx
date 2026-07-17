'use client';

import React from 'react';
import { Loader2, Users } from 'lucide-react';
import { MIN_PLAYERS_TO_START } from '../../utils/constants';

export const LobbyOverlay: React.FC<{ playerCount: number }> = ({ playerCount }) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[130]">
      <div className="bg-slate-900/90 border border-slate-700 rounded-3xl p-10 flex flex-col items-center gap-4 shadow-2xl">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <h3 className="text-2xl font-black text-white uppercase tracking-tight">Waiting for Runners &amp; a Trapper</h3>
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <Users className="w-5 h-5" />
          <span className="tabular-nums">
            {playerCount} / {MIN_PLAYERS_TO_START} minimum
          </span>
        </div>
        <p className="text-slate-500 text-sm text-center max-w-xs">
          The match starts automatically once enough players have joined. One of you will be randomly chosen as the Trapper.
        </p>
      </div>
    </div>
  );
};
