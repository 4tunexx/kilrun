'use client';

import React, { useEffect, useState } from 'react';

/**
 * Screen-center confirmation when local damage lands. Independent of the
 * aim reticle so hipfire still shows a marker.
 */
export function HitMarker({
  token,
  kind,
}: {
  token: number;
  kind: 'player' | 'monster';
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (token <= 0) return;
    setShown(true);
    const t = window.setTimeout(() => setShown(false), 150);
    return () => window.clearTimeout(t);
  }, [token]);

  if (!shown) return null;

  const color = kind === 'monster' ? 'rgba(255,214,110,0.95)' : 'rgba(255,255,255,0.95)';

  return (
    <svg
      className="absolute top-1/2 left-1/2 pointer-events-none z-[122]"
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden
      style={{
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
      }}
    >
      <g
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="square"
        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.85))' }}
      >
        <line x1="8" y1="8" x2="16" y2="16" />
        <line x1="36" y1="8" x2="28" y2="16" />
        <line x1="8" y1="36" x2="16" y2="28" />
        <line x1="36" y1="36" x2="28" y2="28" />
      </g>
    </svg>
  );
}
