'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Skull, Coins, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NetPlayerState, NetRoomState } from '../../net/types';
import { recordDeathrunResult } from '@/lib/actions';

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

  useEffect(() => {
    if (!player.userId) return;

    // Prefer server-authored awards (Colyseus → Next.js).
    if (room.rewardsReady || (player.xpEarned ?? 0) > 0 || (player.vpEarned ?? 0) > 0) {
      setRewards({
        xpEarned: player.xpEarned ?? 0,
        vpEarned: player.vpEarned ?? 0,
      });
      if (room.rewardsReady) {
        hasRecordedRef.current = true;
        return;
      }
      // Display-only preview from room — still fall through to timed persist.
    }

    if (hasRecordedRef.current) return;

    const matchId = room.matchId || undefined;
    const timer = window.setTimeout(() => {
      if (hasRecordedRef.current) return;
      if (room.rewardsReady) {
        hasRecordedRef.current = true;
        setRewards({
          xpEarned: player.xpEarned ?? 0,
          vpEarned: player.vpEarned ?? 0,
        });
        return;
      }
      hasRecordedRef.current = true;
      const score =
        typeof player.score === 'number'
          ? player.score
          : outcome === 'win'
            ? 100
            : 25;
      recordDeathrunResult({
        userId: player.userId,
        role: player.role === 'trapper' ? 'trapper' : 'runner',
        outcome,
        score,
        distance: player.distance ?? 0,
        matchId,
      })
        .then((result) => setRewards(result))
        .catch(() => {});
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [
    player.userId,
    player.role,
    player.xpEarned,
    player.vpEarned,
    player.score,
    player.distance,
    outcome,
    room.rewardsReady,
    room.matchId,
  ]);

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
