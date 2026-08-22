'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Skull, Coins, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NetPlayerState, NetRoomState } from '../../net/types';
import { recordDeathrunResult } from '@/lib/actions';
import { notifyProgressionChanged } from '@/lib/game-progression-client';

interface ResultsScreenProps {
  room: NetRoomState;
  player: NetPlayerState;
  onContinue: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ room, player, onContinue }) => {
  const hasRecordedRef = useRef(false);
  const [rewards, setRewards] = useState<{ xpEarned: number; vpEarned: number } | null>(null);

  const isVictory = room.winnerRole === player.role;
  const outcome: 'win' | 'loss' | 'eliminated' = isVictory ? 'win' : !player.isAlive ? 'eliminated' : 'loss';

  // Keeps the latest live values available to the one-shot fallback timer
  // below without making it a dependency — the room keeps pushing periodic
  // full-state resyncs after the match ends, and a naive dependency array
  // covering all of these kept re-triggering the effect, clearing and
  // restarting the 2500ms timer on every tick so a player under network
  // jitter could sit on "…" well past the intended fallback window.
  const latestRef = useRef({ player, room, outcome });
  latestRef.current = { player, room, outcome };

  useEffect(() => {
    if (!player.userId) return;
    // Admin-cancelled: the room intentionally never called reportRewards(),
    // so rewardsReady stays false forever — without this guard the fallback
    // client-authored recordDeathrunResult() below would still fire after
    // its timer and grant rewards for a match that was voided, not lost.
    if (room.wasCancelled) {
      hasRecordedRef.current = true;
      return;
    }

    // Prefer server-authored awards (Colyseus → Next.js).
    if (room.rewardsReady || (player.xpEarned ?? 0) > 0 || (player.vpEarned ?? 0) > 0) {
      setRewards({
        xpEarned: player.xpEarned ?? 0,
        vpEarned: player.vpEarned ?? 0,
      });
      if (room.rewardsReady) {
        hasRecordedRef.current = true;
        notifyProgressionChanged();
      }
      // Display-only preview from room — still fall through to timed persist.
    }
  }, [player.userId, player.xpEarned, player.vpEarned, room.rewardsReady, room.wasCancelled]);

  // One-shot fallback: give the server 2500ms to deliver rewardsReady, then
  // record client-side. Scheduled exactly once per mount — NOT re-armed by
  // subsequent room state pushes.
  const timerScheduledRef = useRef(false);
  useEffect(() => {
    if (!player.userId || room.wasCancelled || timerScheduledRef.current) return;
    timerScheduledRef.current = true;

    const timer = window.setTimeout(() => {
      if (hasRecordedRef.current) return;
      const { player: p, room: r, outcome: o } = latestRef.current;
      if (r.rewardsReady) {
        hasRecordedRef.current = true;
        setRewards({
          xpEarned: p.xpEarned ?? 0,
          vpEarned: p.vpEarned ?? 0,
        });
        return;
      }
      hasRecordedRef.current = true;
      const score =
        typeof p.score === 'number'
          ? p.score
          : o === 'win'
            ? 100
            : 25;
      recordDeathrunResult({
        userId: p.userId,
        role: p.role === 'trapper' ? 'trapper' : 'runner',
        outcome: o,
        score,
        distance: p.distance ?? 0,
        matchId: r.matchId || undefined,
      })
        .then((result) => {
          setRewards(result);
          notifyProgressionChanged();
        })
        .catch(() => {});
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [player.userId, room.wasCancelled]);

  if (room.wasCancelled) {
    return (
      <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 z-[300]">
        <h2 className="text-5xl font-black mb-2 uppercase italic tracking-tighter text-slate-300">
          Match Cancelled
        </h2>
        <p className="text-slate-500 uppercase font-bold tracking-widest mb-10">
          Cancelled by an admin — no rewards granted
        </p>
        <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
          Return to Menu
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 z-[300]">
      {isVictory ? (
        <Trophy className="w-20 h-20 text-yellow-400 mb-4 drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]" />
      ) : (
        <Skull className="w-20 h-20 text-red-500 mb-4 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]" />
      )}
      <h2
        className={`text-7xl font-black mb-2 uppercase italic tracking-tighter ${isVictory ? 'text-yellow-400' : 'text-red-500'}`}
      >
        {isVictory ? 'Victory' : 'Defeat'}
      </h2>
      <p className="text-slate-400 uppercase font-bold tracking-widest mb-10">
        You played as {player.role === 'trapper' ? 'the Trapper' : 'a Runner'}
      </p>

      <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 mb-12 flex gap-10">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-cyan-400 mb-1">
            <Star className="w-5 h-5" />
            <p className="text-xs uppercase font-bold tracking-widest">XP</p>
          </div>
          <p className="text-3xl font-black text-white">{rewards ? `+${rewards.xpEarned}` : '...'}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-400 mb-1">
            <Coins className="w-5 h-5" />
            <p className="text-xs uppercase font-bold tracking-widest">VP</p>
          </div>
          <p className="text-3xl font-black text-white">{rewards ? `+${rewards.vpEarned}` : '...'}</p>
        </div>
      </div>

      <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
        Return to Menu
      </Button>
    </div>
  );
};
