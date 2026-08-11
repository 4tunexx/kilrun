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
  queue?: 'casual' | 'ranked';
  onContinue: () => void;
}

export const CompetitiveResultsScreen: React.FC<Props> = ({
  room,
  player,
  players,
  queue = 'casual',
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

  // player.role is a shared enum across modes ('trapper' | 'runner' | 'survivor'
  // | 'team_a' | 'team_b') — a reconnect mid-match can momentarily deliver a
  // stale/unset value before the server's competitive role sync lands. Lock
  // onto the first valid team_a/team_b we see instead of silently defaulting
  // to team_a, which would flip a real win into a shown loss (and vice versa)
  // for anyone actually on team_b whose role hasn't synced yet.
  const lockedTeamRef = useRef<'team_a' | 'team_b' | null>(null);
  if (player.role === 'team_a' || player.role === 'team_b') {
    lockedTeamRef.current = player.role;
  } else if (!lockedTeamRef.current) {
    console.error(`[CompetitiveResultsScreen] unexpected player.role "${player.role}" — awaiting valid team assignment`);
  }
  const team = lockedTeamRef.current ?? 'team_a';
  const won = room.winnerRole === team;
  const outcome: 'win' | 'loss' = won ? 'win' : 'loss';
  const ranked = queue === 'ranked' || room.modeTag === 'competitive_ranked';

  const opponentAvgKp = useMemo(() => {
    const enemyRole = team === 'team_a' ? 'team_b' : 'team_a';
    const enemies: number[] = [];
    players.forEach((p) => {
      if (p.role === enemyRole) enemies.push(typeof p.kp === 'number' ? p.kp : KP_DEFAULT);
    });
    if (!enemies.length) return KP_DEFAULT;
    return enemies.reduce((a, b) => a + b, 0) / enemies.length;
  }, [players, team]);

  // Keeps the latest live values available to the one-shot fallback timer
  // below without making it a dependency — the room keeps pushing periodic
  // full-state resyncs after the match ends, and a naive dependency array
  // covering all of these kept re-triggering the effect, clearing and
  // restarting the 2500ms timer on every tick so a player under network
  // jitter could sit on "…" well past the intended fallback window.
  const latestRef = useRef({ player, room, team, outcome, opponentAvgKp, ranked });
  latestRef.current = { player, room, team, outcome, opponentAvgKp, ranked };

  // Reacts immediately whenever the server (or the wasCancelled short-circuit)
  // delivers a real result — independent of the fallback timer's schedule.
  useEffect(() => {
    if (!player.userId) return;
    // Admin-cancelled: rewardsReady never becomes true, so without this
    // guard the fallback client-authored recordCompetitiveResult() below
    // would still fire — critically, that would also touch Ranked KP for
    // a match that was voided, not actually lost.
    if (room.wasCancelled) {
      hasRecordedRef.current = true;
      return;
    }
    if (room.rewardsReady || (player.xpEarned ?? 0) > 0 || (player.vpEarned ?? 0) > 0) {
      setRewards({
        xpEarned: player.xpEarned ?? 0,
        vpEarned: player.vpEarned ?? 0,
        kpDelta: player.kpDelta ?? 0,
        kp: typeof player.kp === 'number' ? player.kp : KP_DEFAULT,
        rank: '',
      });
      if (room.rewardsReady) hasRecordedRef.current = true;
    }
  }, [
    player.userId,
    player.xpEarned,
    player.vpEarned,
    player.kpDelta,
    player.kp,
    room.rewardsReady,
    room.wasCancelled,
  ]);

  // One-shot fallback: give the server 2500ms to deliver rewardsReady, then
  // record client-side. Scheduled exactly once per mount (guarded by
  // timerScheduledRef) — NOT re-armed by subsequent room state pushes.
  const timerScheduledRef = useRef(false);
  useEffect(() => {
    if (!player.userId || room.wasCancelled || timerScheduledRef.current) return;
    timerScheduledRef.current = true;

    const timer = window.setTimeout(() => {
      if (hasRecordedRef.current) return;
      const { player: p, room: r, team: t, outcome: o, opponentAvgKp: avgKp, ranked: rk } =
        latestRef.current;
      if (r.rewardsReady) {
        hasRecordedRef.current = true;
        setRewards({
          xpEarned: p.xpEarned ?? 0,
          vpEarned: p.vpEarned ?? 0,
          kpDelta: p.kpDelta ?? 0,
          kp: typeof p.kp === 'number' ? p.kp : KP_DEFAULT,
          rank: '',
        });
        return;
      }
      hasRecordedRef.current = true;
      recordCompetitiveResult({
        userId: p.userId,
        team: t,
        outcome: o,
        opponentAvgKp: avgKp,
        roundsWon: t === 'team_a' ? r.scoreA ?? 0 : r.scoreB ?? 0,
        roundsLost: t === 'team_a' ? r.scoreB ?? 0 : r.scoreA ?? 0,
        kills: p.kills ?? 0,
        queue: rk ? 'ranked' : 'casual',
        matchId: r.matchId || undefined,
      })
        .then(setRewards)
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
          Cancelled by an admin — no rewards or KP change
        </p>
        <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
          Return to Menu
        </Button>
      </div>
    );
  }

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
        {ranked ? 'Ranked Premium' : 'Casual'} · {room.scoreA ?? 0} – {room.scoreB ?? 0} · Team{' '}
        {team === 'team_a' ? 'A' : 'B'}
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
        {ranked && (
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
            {rewards ? (
              <p className="text-[11px] text-slate-400 mt-1">
                {rewards.kp} KP{rewards.rank ? ` · ${rewards.rank}` : ''}
              </p>
            ) : null}
          </div>
        )}
        {!ranked && (
          <div className="text-center max-w-[10rem]">
            <p className="text-xs uppercase font-bold text-slate-500 mb-1">Rank</p>
            <p className="text-sm text-slate-400">Unaffected in Casual</p>
          </div>
        )}
      </div>
      <Button size="lg" className="px-16 py-8 text-xl font-black uppercase rounded-2xl" onClick={onContinue}>
        Return to Menu
      </Button>
    </div>
  );
};
