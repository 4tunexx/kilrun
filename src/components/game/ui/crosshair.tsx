'use client';

import React from 'react';
import type { TpsCrosshairSettings } from '../tps/tps-view-settings';
import { DEFAULT_TPS_VIEW } from '../tps/tps-view-settings';

/**
 * Center reticle — screen center = camera aim ray.
 * Style comes from the 3rd View tool (`TpsCrosshairSettings`).
 */
export const Crosshair: React.FC<{
  visible: boolean;
  offsetX?: number;
  offsetY?: number;
  style?: Partial<TpsCrosshairSettings>;
}> = ({ visible, offsetX = 0, offsetY = 0, style }) => {
  if (!visible) return null;

  const s = { ...DEFAULT_TPS_VIEW.crosshair, ...style };
  const half = s.size / 2;
  const lineLen = s.size;
  const color = s.color;
  const op = s.opacity;

  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none z-[120]"
      style={{
        transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
        color,
        opacity: op,
      }}
      aria-hidden
    >
      {s.showRing && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current"
          style={{
            width: s.size * 2.4 + s.gap,
            height: s.size * 2.4 + s.gap,
            opacity: 0.35,
          }}
        />
      )}
      {s.showDot && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current shadow-[0_0_3px_rgba(0,0,0,0.9)]"
          style={{ width: Math.max(2, s.thickness + 1), height: Math.max(2, s.thickness + 1) }}
        />
      )}
      {s.showLines && (
        <>
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-current"
            style={{
              width: s.thickness,
              height: lineLen,
              top: -(half + s.gap + lineLen),
              boxShadow: '0 0 2px rgba(0,0,0,0.8)',
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 bg-current"
            style={{
              width: s.thickness,
              height: lineLen,
              top: half + s.gap,
              boxShadow: '0 0 2px rgba(0,0,0,0.8)',
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 bg-current"
            style={{
              height: s.thickness,
              width: lineLen,
              left: -(half + s.gap + lineLen),
              boxShadow: '0 0 2px rgba(0,0,0,0.8)',
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 bg-current"
            style={{
              height: s.thickness,
              width: lineLen,
              left: half + s.gap,
              boxShadow: '0 0 2px rgba(0,0,0,0.8)',
            }}
          />
        </>
      )}
    </div>
  );
};
