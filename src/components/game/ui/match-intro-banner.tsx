'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { KilrunMode } from '@/lib/game-modes';
import type { MatchPhase, PlayerRole } from '../net/types';
import { playSound } from '../effects/soundboard';

const WARMUP_MS = 1800;
const GO_MS = 2200;

type Stage = { kind: 'warmup'; key: number } | { kind: 'go'; key: number };

function warmupSubtitle(
  mode: KilrunMode,
  competitiveQueue: 'casual' | 'ranked'
): string {
  if (mode === 'horde') return 'Survivors, gear up!';
  if (mode === 'competitive') {
    return competitiveQueue === 'ranked'
      ? 'Ranked match — be respectful, play your best.'
      : 'Casual match — have fun, play fair.';
  }
  return 'Roles assigning…';
}

function goHeadline(mode: KilrunMode, localRole?: PlayerRole): string {
  if (mode === 'horde') return 'SURVIVE THE HORDE!';
  if (mode === 'competitive') return 'FIGHT!';
  // deathrun
  return localRole === 'trapper' ? 'HUNT THEM DOWN!' : 'RUN FOR YOUR LIFE!';
}

/**
 * Mode-flavored match-intro banners — a small "WARMUP" pill when countdown
 * begins, then a big slide-in/out headline the instant the round actually
 * starts (lobby → countdown → playing, tracked via `phase`). Mounted once
 * for the whole match so it can observe phase transitions itself; renders
 * nothing outside those two brief windows.
 */
export const MatchIntroBanner: React.FC<{
  phase: MatchPhase;
  mode: KilrunMode;
  localRole?: PlayerRole;
  competitiveQueue?: 'casual' | 'ranked';
}> = ({ phase, mode, localRole, competitiveQueue = 'casual' }) => {
  const prevPhaseRef = useRef<MatchPhase | null>(null);
  const nextKeyRef = useRef(0);
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    // First mount (including rejoin mid-match) — adopt silently, no replay.
    if (prev === null) return;
    if (prev === 'lobby' && phase === 'countdown') {
      setStage({ kind: 'warmup', key: nextKeyRef.current++ });
    } else if (prev === 'countdown' && phase === 'playing') {
      playSound('match_start');
      setStage({ kind: 'go', key: nextKeyRef.current++ });
    }
  }, [phase]);

  useEffect(() => {
    if (!stage) return;
    const ms = stage.kind === 'warmup' ? WARMUP_MS : GO_MS;
    const t = setTimeout(() => setStage(null), ms);
    return () => clearTimeout(t);
  }, [stage]);

  if (!stage) return null;

  if (stage.kind === 'warmup') {
    return (
      <div
        key={stage.key}
        className="pointer-events-none absolute left-1/2 top-[18%] z-[135] select-none"
        style={{
          transform: 'translateX(-50%)',
          animation: `matchIntroWarmupSlide ${WARMUP_MS}ms ease-out forwards`,
        }}
      >
        <style>{`
          @keyframes matchIntroWarmupSlide {
            0% { transform: translate(-50%, -24px); opacity: 0; }
            15% { transform: translate(-50%, 0); opacity: 1; }
            80% { transform: translate(-50%, 0); opacity: 1; }
            100% { transform: translate(-50%, -16px); opacity: 0; }
          }
        `}</style>
        <div className="rounded-full border border-sky-400/50 bg-slate-950/80 backdrop-blur px-5 py-2 text-center shadow-xl whitespace-nowrap">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-sky-300">
            Warmup
          </p>
          <p className="text-xs font-semibold text-slate-300 mt-0.5">
            {warmupSubtitle(mode, competitiveQueue)}
          </p>
        </div>
      </div>
    );
  }

  const headline = goHeadline(mode, localRole);
  return (
    <div
      key={stage.key}
      className="pointer-events-none absolute inset-0 z-[135] flex items-center justify-center select-none"
    >
      <style>{`
        @keyframes matchIntroGoSlide {
          0% { transform: translateY(-60px) scale(0.85); opacity: 0; }
          16% { transform: translateY(0) scale(1.06); opacity: 1; }
          26% { transform: translateY(0) scale(1); opacity: 1; }
          82% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(40px) scale(0.92); opacity: 0; }
        }
      `}</style>
      <p
        className="text-center font-black uppercase tracking-[0.08em] px-6"
        style={{
          fontFamily: 'var(--font-space-grotesk), "Oswald", Impact, sans-serif',
          fontSize: 'clamp(2.25rem, 7vw, 5rem)',
          color: '#fff',
          textShadow:
            '0 2px 6px rgba(0,0,0,0.9), 0 0 24px rgba(56,189,248,0.55), 0 0 48px rgba(56,189,248,0.3)',
          animation: `matchIntroGoSlide ${GO_MS}ms ease-out forwards`,
        }}
      >
        {headline}
      </p>
    </div>
  );
};
