'use client';

import React from 'react';
import { Loader2, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HORDE_SQUAD_SIZE = 4;

export const HordeLobbyOverlay: React.FC<{
  playerCount: number;
  isAdmin?: boolean;
  onForceStart?: () => void;
}> = ({ playerCount, isAdmin = false, onForceStart }) => {
  const waiting = playerCount < HORDE_SQUAD_SIZE;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-[130]">
      <div className="bg-slate-900/90 border border-rose-700/40 rounded-3xl p-8 sm:p-10 flex flex-col items-center gap-4 shadow-2xl mx-4 max-w-md w-full">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-rose-400 animate-spin" />
          {waiting && (
            <span className="absolute inset-0 rounded-full border-2 border-rose-400/40 animate-ping" />
          )}
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight text-center">
          {waiting ? 'Finding squad…' : 'Squad ready'}
        </h3>
        <div className="flex items-center gap-2 text-slate-300 font-bold">
          <Users className="w-5 h-5" />
          <span className="tabular-nums">
            {playerCount} / {HORDE_SQUAD_SIZE}
          </span>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs">
          {waiting
            ? 'Searching for survivors… Match starts at 4 players.'
            : 'Lobby full — match starting soon.'}
        </p>
        <p className="text-slate-500 text-xs text-center max-w-xs">
          Clear escalating waves. Health floors heal you, revive pads bring teammates back, red zones
          hurt.
        </p>
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
