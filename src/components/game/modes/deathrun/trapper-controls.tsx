'use client';

import React from 'react';
import { Crosshair as CrosshairIcon, Skull } from 'lucide-react';

/** Trapper-specific HUD element: a reminder of their win condition and how to eliminate Runners. */
export const TrapperControls: React.FC = () => {
  return (
    <div className="bg-slate-900/80 backdrop-blur-xl p-4 rounded-2xl border border-orange-500/30 w-64">
      <div className="flex items-center gap-2 mb-1">
        <Skull className="w-4 h-4 text-orange-400" />
        <p className="text-[10px] text-orange-300 uppercase font-black tracking-widest">Trapper</p>
      </div>
      <p className="text-sm text-slate-300 font-semibold">Eliminate every Runner before they reach the finish line.</p>
      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
        <CrosshairIcon className="w-3.5 h-3.5" /> Aim + click / double-tap to shoot
      </p>
    </div>
  );
};
