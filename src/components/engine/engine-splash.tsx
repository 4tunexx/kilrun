'use client';

import React from 'react';
import { ENGINE_BG, ENGINE_MARK } from '@/lib/engine/brand';

export function EngineBackdrop() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ENGINE_BG}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[#080b12]/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/45 to-slate-900/75" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-slate-900/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,61,74,0.28),transparent_55%)]" />
      <div className="absolute inset-0 engine-grid opacity-20" />
    </>
  );
}

export function EngineSplash({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#080b12] transition-opacity duration-700 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <EngineBackdrop />
      <div className="relative flex flex-col items-center gap-8 px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ENGINE_MARK}
          alt=""
          className="h-36 w-36 object-contain drop-shadow-[0_0_32px_rgba(226,61,74,0.55)] animate-engine-mark"
        />
        <p className="text-[11px] uppercase tracking-[0.42em] text-red-300/80">Engine</p>
        <div className="h-[3px] w-56 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#e23d4a] to-transparent animate-engine-load" />
        </div>
      </div>
    </div>
  );
}
