'use client';

import React, { useEffect, useRef, useState } from 'react';

const COMBO_WINDOW_MS = 4000;
const FADE_MS = 900;

interface ComboDisplay {
  combo: number;
  key: number;
  visible: boolean;
}

/**
 * Distinct from KillStreakBanner: that one announces named milestones off
 * the TOTAL consecutive-kills-without-dying count, no matter how far apart
 * in time. This counts kills landed within a short rolling time window
 * (COMBO_WINDOW_MS) — genuine "kills in rapid succession" — and resets if
 * the pace drops, independent of whether the player is still alive/streaking.
 * Derives everything from the same killStreak prop (no extra server field):
 * a same-tick increase in killStreak is a fresh kill timestamped client-side.
 */
export const MultiKillCounter: React.FC<{ killStreak: number }> = ({ killStreak }) => {
  const lastSeenRef = useRef(0);
  const windowStartRef = useRef(0);
  const comboRef = useRef(0);
  const nextKeyRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [display, setDisplay] = useState<ComboDisplay | null>(null);

  useEffect(() => {
    if (lastSeenRef.current === 0 && killStreak > 0) {
      // First mount / rejoin mid-streak — adopt baseline, don't fire a combo.
      lastSeenRef.current = killStreak;
      return;
    }
    if (killStreak <= lastSeenRef.current) {
      // Died (streak reset) or no change — combo lapses immediately.
      lastSeenRef.current = killStreak;
      comboRef.current = 0;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setDisplay(null);
      return;
    }

    const gained = killStreak - lastSeenRef.current;
    lastSeenRef.current = killStreak;
    const now = Date.now();
    for (let i = 0; i < gained; i++) {
      if (now - windowStartRef.current > COMBO_WINDOW_MS) comboRef.current = 0;
      comboRef.current += 1;
      windowStartRef.current = now;
    }

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (comboRef.current >= 2) {
      setDisplay({ combo: comboRef.current, key: nextKeyRef.current++, visible: true });
      hideTimerRef.current = setTimeout(() => {
        setDisplay((d) => (d ? { ...d, visible: false } : d));
      }, COMBO_WINDOW_MS);
    } else {
      setDisplay(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killStreak]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    []
  );

  if (!display) return null;

  return (
    <div
      key={display.key}
      className="pointer-events-none absolute left-1/2 top-[124px] z-[159] select-none"
      style={{
        transform: 'translateX(-50%)',
        opacity: display.visible ? 1 : 0,
        transition: display.visible ? 'opacity 0.12s ease-out' : `opacity ${FADE_MS}ms ease-in`,
      }}
    >
      <style>{`
        @keyframes multiKillPop {
          0% { transform: scale(0.55); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <p
        className="text-center font-black uppercase tracking-wide whitespace-nowrap"
        style={{
          fontFamily: 'var(--font-space-grotesk), "Oswald", Impact, sans-serif',
          fontSize: '20px',
          color: '#7ef0ff',
          textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 14px rgba(60,220,255,0.65)',
          animation: 'multiKillPop 0.26s ease-out',
        }}
      >
        {display.combo}× KILL COMBO
      </p>
    </div>
  );
};
