'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getKillStreakTierLabel, getKillStreakEscalation, getSoundEventForTierLabel } from '../effects/kill-streak-tiers';
import { playSound } from '../effects/soundboard';

const BANNER_MS = 2200;

interface QueuedBanner {
  key: number;
  label: string;
  escalation: number;
}

/**
 * Personal "First Blood / Double Kill / ... / Rampage" announcement — shown
 * at the top of the screen only to the player who earned it. Watches
 * killStreak for increases and looks up the milestone label for each newly
 * crossed value (handles more than +1 in one tick defensively, though a
 * streak only ever increments by 1 per kill server-side).
 */
export const KillStreakBanner: React.FC<{ killStreak: number }> = ({ killStreak }) => {
  const lastSeenRef = useRef(0);
  const nextKeyRef = useRef(0);
  const queueRef = useRef<QueuedBanner[]>([]);
  const [current, setCurrent] = useState<QueuedBanner | null>(null);

  useEffect(() => {
    // First mount / rejoin: adopt the current value without replaying every
    // milestone from 0, so late HUD mounts don't spam a backlog of banners.
    if (lastSeenRef.current === 0 && killStreak > 1) {
      lastSeenRef.current = killStreak;
      return;
    }
    if (killStreak < lastSeenRef.current) {
      // Died and streak reset — nothing to announce.
      lastSeenRef.current = killStreak;
      return;
    }
    for (let s = lastSeenRef.current + 1; s <= killStreak; s++) {
      const label = getKillStreakTierLabel(s);
      if (label) {
        queueRef.current.push({ key: nextKeyRef.current++, label, escalation: getKillStreakEscalation(s) });
        const soundEvent = getSoundEventForTierLabel(label);
        if (soundEvent) playSound(soundEvent);
      }
    }
    lastSeenRef.current = killStreak;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killStreak]);

  useEffect(() => {
    if (current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    setCurrent(next);
    const t = setTimeout(() => setCurrent(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [current, killStreak]);

  // Drain the queue on an interval too, in case a banner finishes while no
  // new killStreak change re-triggers the effect above.
  useEffect(() => {
    const t = setInterval(() => {
      if (!current && queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        if (next) setCurrent(next);
      }
    }, 250);
    return () => clearInterval(t);
  }, [current]);

  if (!current) return null;

  const shakeAmp = Math.min(6, current.escalation * 1.4);
  const scale = 1 + Math.min(0.5, current.escalation * 0.08);
  const glow = current.escalation >= 3 ? '0 0 26px rgba(255,196,60,0.85), 0 0 52px rgba(255,120,40,0.5)' : '0 0 16px rgba(255,255,255,0.35)';
  const color = current.escalation >= 4 ? '#ffcc33' : current.escalation >= 2 ? '#ff9a3d' : '#ffffff';

  return (
    <div
      key={current.key}
      className="pointer-events-none absolute left-1/2 top-[64px] z-[160] select-none"
      style={{
        transform: 'translateX(-50%)',
        animation: `killStreakSlideFade ${BANNER_MS}ms ease-out forwards`,
      }}
    >
      <style>{`
        @keyframes killStreakSlideFade {
          0% { transform: translate(-50%, -28px) scale(0.82); opacity: 0; }
          14% { transform: translate(-50%, 0) scale(${scale}); opacity: 1; }
          22% { transform: translate(-50%, 0) scale(1); opacity: 1; }
          78% { transform: translate(-50%, 0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -14px) scale(0.94); opacity: 0; }
        }
        @keyframes killStreakShakeX {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(calc(-1 * var(--ks-shake))); }
          40% { transform: translateX(var(--ks-shake)); }
          60% { transform: translateX(calc(-0.6 * var(--ks-shake))); }
          80% { transform: translateX(calc(0.6 * var(--ks-shake))); }
        }
      `}</style>
      <div
        style={
          {
            '--ks-shake': `${shakeAmp}px`,
            animation: shakeAmp > 0 ? 'killStreakShakeX 0.42s ease-in-out 3' : undefined,
          } as React.CSSProperties
        }
      >
        <p
          className="text-center font-black uppercase tracking-[0.12em] whitespace-nowrap"
          style={{
            fontFamily: 'var(--font-space-grotesk), "Oswald", Impact, sans-serif',
            fontSize: `${26 + current.escalation * 3}px`,
            color,
            textShadow: `0 2px 4px rgba(0,0,0,0.9), ${glow}`,
          }}
        >
          {current.label}
        </p>
      </div>
    </div>
  );
};
