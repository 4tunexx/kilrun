'use client';

import React from 'react';

/**
 * TPS reticle — screen center = camera aim ray (Fortnite-style).
 * Always on for desktop Play Test / match; mobile shows while look stick is held
 * when `visible` is driven by aiming state.
 */
export const Crosshair: React.FC<{
  visible: boolean;
  offsetX?: number;
  offsetY?: number;
}> = ({ visible, offsetX = 0, offsetY = 0 }) => {
  if (!visible) return null;

  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none z-[120]"
      style={{ transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))` }}
      aria-hidden
    >
      {/* Soft outer ring for readability on bright props */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white/25" />
      <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.85)] mix-blend-difference" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-[15px] w-[2px] h-2.5 bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
      <div className="absolute left-1/2 -translate-x-1/2 top-[9px] w-[2px] h-2.5 bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
      <div className="absolute top-1/2 -translate-y-1/2 -left-[15px] h-[2px] w-2.5 bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
      <div className="absolute top-1/2 -translate-y-1/2 left-[9px] h-[2px] w-2.5 bg-white/90 shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
    </div>
  );
};
