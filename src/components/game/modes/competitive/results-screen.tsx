'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Skull, Star, Coins, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NetPlayerState, NetRoomState } from '../../net/types';
import { recordCompetitiveResult } from '@/lib/actions';
import { KP_DEFAULT } from '@/lib/kp';

interface Props {
  room: NetRoomState;
  player: NetPlayerState;
  players: Map<string, NetPlayerState>;
  onContinue: () => void;
}

export const CompetitiveResultsScreen: React.FC<Props> = ({
  room,
  player,
  players,
  onContinue,
}) => {
  const hasRecordedRef = useRef(false);
  const [rewards, setRewards] = useState<{
    xpEarned: number;
    vpEarned: number;
    kpDelta: number;
    kp: number;
    rank: string;
  } | null>(null);

  const team = player.role === 'team_b' ? 'team_b' : 'team_a';
  const won = room.winnerRole === team;
  const outcome: 'win' | 'loss' = won ? 'win' : 'loss';

  const opponentAvgKp = useMemo(() => {
    const enemyRole = team === 'team_a' ? 'team_b' : 'team_a';
    const enemies: number[] = [];
    players.forEach((p) => {
      if (p.role === enemyRole) enemies.push(typeof p.kp === 'number' ? p.kp : KP_DEFAULT);
    });
    if (!enemies.length) return KP_DEFAULT;
    return enemies.reduce((a, b) => a + b, 0) / enemies.length;
  }, [players, team]);

  useEffect(() => {
    if (hasRecordedRef.current || !player.userId) return;
    hasRecordedRef.current = true;
    recordCompetitiveResult({
      userId: player.userId,
      team,
      outcome,
      opponentAvgKp,
      roundsWon: team === 'team_a' ? room.scoreA ?? 0 : room.scoreB ?? 0,
      roundsLost: team === 'team_a' ? room.scoreB ?? 0 : room.scoreA ?? 0,
    })
      .then(setRewards)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 z-[300]">
      {won ? (
        <Trophy className="w-20 h-20 text-yellow-400 mb-4" />
      ) : (
        <Skull className="w-20 h-20 text-red-500 mb-4" />
      )}
      <h2
        className={`text-6xl font-black mb-2 uppercase italic ${
          won ? 'text-yellow-400' : 'text-red-500'
        }`}
      >
        {won ? 'Match Win' : 'Match Loss'}
      </h2>
      <p className="text-slate-400 uppercase font-bold tracking-widest mb-2">
        {room.scoreA ?? 0} – {room.scoreB ?? 0} · You were Team {team === 'team_a' ? 'A' : 'B'}
      </p>
      <div className="bg-slate-900/60 p-6 rounded-2xl border border-white/5 mb-10 flex gap-8 flex-wrap justify-center">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-cyan-400 mb-1">
            <Star className="w-5 h-5" />
            <p className="text-xs uppercase font-bold">XP</p>
          </div>
          <p className="text-3xl font-black text-white">
            {rewards ? `+${rewards.xpEarned}` : '...'}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-400 mb-1">
            <Coins className="w-5 h-5" />
            <p className="text-xs uppercase font-bold">VP</p>
          </div>
          <p className="text-3xl font-black text-white">
            {rewards ? `+${rewards.vpEarned}` : '...'}
          </p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-400 mb-1">
            <TrendingUp className="w-5 h-5" />
            <p className="text-xs uppercase font-bold">KP</p>
          </div>
          <p className="text-3xl font-black text-white">
            {rewards
              ? `${rewards.kpDelta >= 0 ? '+' : ''}${rewards.kpDelta}`
              : '...'}
          </p>
          {rewards && (
            <p className="text-[11px] text-slate-400 mt-1">
              {rewards.kp} KP · {rewards.rank}
            </p>
          )}
        </div>
      </div>
      <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
        Return to Menu
      </Button>
    </div>
  );
};
