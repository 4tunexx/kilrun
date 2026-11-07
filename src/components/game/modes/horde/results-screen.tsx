'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Skull, Trophy, Star, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NetPlayerState, NetRoomState } from '../../net/types';
import { notifyProgressionChanged } from '@/lib/game-progression-client';
import {
  getRewardDisplayValue,
  isPracticeRoom,
  type RewardDisplayStatus,
} from '../../net/results-state';

interface Props {
  room: NetRoomState;
  player: NetPlayerState;
  onContinue: () => void;
}

export const HordeResultsScreen: React.FC<Props> = ({ room, player, onContinue }) => {
  const hasRecordedRef = useRef(false);
  const isPractice = isPracticeRoom(room.modeTag);
  const [rewards, setRewards] = useState<{ xpEarned: number; vpEarned: number } | null>(
    isPractice ? { xpEarned: 0, vpEarned: 0 } : null
  );
  const [rewardStatus, setRewardStatus] = useState<RewardDisplayStatus>(
    isPractice ? 'confirmed' : 'pending'
  );

  const survived = room.winnerRole === 'survivor';

  useEffect(() => {
    if (!player.userId) return;
    if (room.wasCancelled) {
      hasRecordedRef.current = true;
      return;
    }
    if (isPractice) {
      hasRecordedRef.current = true;
      setRewards({ xpEarned: 0, vpEarned: 0 });
      setRewardStatus('confirmed');
      return;
    }
    if (room.rewardsReady) {
      setRewards({
        xpEarned: player.xpEarned ?? 0,
        vpEarned: player.vpEarned ?? 0,
      });
      setRewardStatus('confirmed');
      if (!hasRecordedRef.current) {
        hasRecordedRef.current = true;
        notifyProgressionChanged();
      }
    }
  }, [player.userId, player.xpEarned, player.vpEarned, room.rewardsReady, room.wasCancelled, isPractice]);

  useEffect(() => {
    if (!player.userId || room.wasCancelled || isPractice || hasRecordedRef.current) return;
    const timer = window.setTimeout(() => {
      if (!hasRecordedRef.current) setRewardStatus('unavailable');
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [player.userId, room.wasCancelled, isPractice]);

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
      {survived ? (
        <Trophy className="w-20 h-20 text-yellow-400 mb-4" />
      ) : (
        <Skull className="w-20 h-20 text-red-500 mb-4" />
      )}
      <h2
        className={`text-6xl font-black mb-2 uppercase italic ${
          survived ? 'text-yellow-400' : 'text-red-500'
        }`}
      >
        {survived ? 'Waves Cleared' : 'Squad Wiped'}
      </h2>
      <p className="text-slate-400 uppercase font-bold tracking-widest mb-6">
        Wave {room.wave ?? 0} · {room.teamKills ?? 0} kills
      </p>
      <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 mb-10 flex gap-10">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-cyan-400 mb-1">
            <Star className="w-5 h-5" />
            <p className="text-xs uppercase font-bold">XP</p>
          </div>
          <p className="text-3xl font-black text-white">
            {getRewardDisplayValue(rewards?.xpEarned, rewardStatus)}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-400 mb-1">
            <Coins className="w-5 h-5" />
            <p className="text-xs uppercase font-bold">VP</p>
          </div>
          <p className="text-3xl font-black text-white">
            {getRewardDisplayValue(rewards?.vpEarned, rewardStatus)}
          </p>
        </div>
      </div>
      <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
        Return to Menu
      </Button>
    </div>
  );
};
