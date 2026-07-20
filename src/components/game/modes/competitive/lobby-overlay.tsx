'use client';

import React from 'react';
import { Loader2, Radio, Shield, Swords, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CompetitiveLobbyOverlay: React.FC<{
  playerCount: number;
  queue?: 'casual' | 'ranked';
  isAdmin?: boolean;
  searching?: boolean;
  onForceStart?: () => void;
}> = ({
  playerCount,
  queue = 'casual',
  isAdmin = false,
  searching = true,
  onForceStart,
}) => {
  const ranked = queue === 'ranked';
  const minToStart = 2;
  const waiting = searching && playerCount < minToStart;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[130]">
      <div className="bg-slate-900/90 border border-sky-700/40 rounded-3xl p-8 sm:p-10 flex flex-col items-center gap-4 shadow-2xl mx-4 max-w-md w-full">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-sky-400 animate-spin" />
          {waiting && (
            <span className="absolute inset-0 rounded-full border-2 border-sky-400/40 animate-ping" />
          )}
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight text-center flex items-center gap-2">
          <Swords className="w-6 h-6" />
          {ranked ? 'Ranked Competitive' : 'Casual Competitive'}
        </h3>
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <Users className="w-5 h-5" />
          <span className="tabular-nums">{playerCount} / 8 players</span>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs">
          {waiting
            ? ranked
              ? 'Searching for players in your rank bracket…'
              : 'Searching for players…'
            : 'Lobby filling — match starts when enough players connect.'}
        </p>
        <p className="text-slate-500 text-xs text-center max-w-xs">
          Best of 6 (first to 4).
          {ranked
            ? ' Wins and losses move Killrun Points (KP).'
            : ' Casual — XP / K-D only, no KP.'}
        </p>
        {ranked && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300/90">
            <Shield className="w-3.5 h-3.5" />
            Premium Ranked lobby
          </div>
        )}
        {isAdmin && waiting && onForceStart && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-1 font-semibold"
            onClick={onForceStart}
          >
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            Admin: Launch now
          </Button>
        )}
      </div>
    </div>
  );
};
