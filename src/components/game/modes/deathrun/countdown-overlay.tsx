'use client';

import React from 'react';
import type { KilrunMode } from '@/lib/game-modes';

const MODE_LABELS: Record<string, string> = {
  deathrun: 'Roles assigned \u2014 get ready!',
  horde: 'Incoming wave \u2014 prepare!',
  competitive: 'Round starting \u2014 get ready!',
};

export const CountdownOverlay: React.FC<{
  countdownMs: number;
  mode?: KilrunMode;
}> = ({ countdownMs, mode = 'deathrun' }) => {
  const totalSec = Math.max(0, Math.ceil(countdownMs / 1000));
  // Show the last 5 seconds as a big countdown; before that show a "buy phase" banner.
  const isBuyPhase = countdownMs > 5000 && (mode === 'competitive' || mode === 'horde');
  const seconds = Math.max(1, Math.min(5, totalSec));

  if (isBuyPhase) {
    return (
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[130] pointer-events-none">
        <div className="rounded-2xl border border-amber-400/50 bg-slate-950/80 backdrop-blur px-6 py-3 text-center shadow-xl">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 mb-0.5">
            {mode === 'horde' ? 'Between Waves \u2014 Buy Phase' : 'Pre-Round \u2014 Buy Phase'}
          </p>
          <p className="text-3xl font-black text-white tabular-nums">
            {totalSec}s
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 z-[130] pointer-events-none">
      <p className="text-slate-300 uppercase font-black tracking-[0.3em] mb-4 text-center px-4">
        {MODE_LABELS[mode] ?? MODE_LABELS.deathrun}
      </p>
      <p
        key={seconds}
        className="text-[10rem] font-black text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-in zoom-in duration-300"
      >
        {seconds}
      </p>
    </div>
  );
};
