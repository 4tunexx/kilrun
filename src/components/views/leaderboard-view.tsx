'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Medal, Trophy } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getLeaderboard,
  getMyFriendshipMap,
  sendFriendRequest,
  type LeaderboardRow,
  type LeaderboardSort,
} from '@/lib/social-actions';
import { recordLeaderboardVisit } from '@/lib/progression-actions';
import { getLevelFromXp } from '@/lib/progression';
import { UserHoverCard } from '@/components/user-hover-card';
import { useProfileNavigation } from '@/components/providers/profile-navigation-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type FriendStatus = 'friends' | 'pending_out' | 'pending_in';

const SORT_TABS: { id: LeaderboardSort; label: string; hint: string }[] = [
  { id: 'xp', label: 'Top XP', hint: 'Highest account experience' },
  { id: 'vp', label: 'Top Vault Points', hint: 'Richest players by VP' },
  { id: 'stats', label: 'Top Combat', hint: 'Wins · Kills · K/D from Deathrun' },
];

export default function LeaderboardView({ userId }: { userId?: string }) {
  const [sort, setSort] = useState<LeaderboardSort>('xp');
  const [page, setPage] = useState(1);
  const [podium, setPodium] = useState<LeaderboardRow[]>([]);
  const [rest, setRest] = useState<LeaderboardRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [friendMap, setFriendMap] = useState<Record<string, FriendStatus>>({});
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { openProfile } = useProfileNavigation();

  useEffect(() => {
    void recordLeaderboardVisit().catch(() => {});
    void getMyFriendshipMap().then(setFriendMap).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeaderboard({ sort, page, pageSize: 10 })
      .then((data) => {
        if (cancelled) return;
        setPodium(data.podium);
        setRest(data.rest);
        setTotalPages(data.totalPages);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, page]);

  const first = podium.find((p) => p.rank === 1) ?? podium[0];
  const second = podium.find((p) => p.rank === 2) ?? podium[1];
  const third = podium.find((p) => p.rank === 3) ?? podium[2];

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <Tabs
        value={sort}
        onValueChange={(v) => {
          setSort(v as LeaderboardSort);
          setPage(1);
        }}
      >
        <TabsList className="bg-slate-800/60 flex flex-wrap h-auto gap-1">
          {SORT_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} title={t.hint}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-xs text-slate-400 -mt-3">
        {SORT_TABS.find((t) => t.id === sort)?.hint}
      </p>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading rankings...
        </div>
      ) : podium.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No players yet.</p>
      ) : (
        <>
          {/* Olympic podium: 2nd · 1st · 3rd */}
          <div className="flex items-end justify-center gap-2 sm:gap-4 pt-4 pb-2">
            <PodiumSeat
              row={second}
              place={2}
              sort={sort}
              userId={userId}
              className="order-1 w-[30%] max-w-[11rem]"
              pedestalClass="h-16 sm:h-20 bg-slate-600/50 border-slate-400/30"
            />
            <PodiumSeat
              row={first}
              place={1}
              sort={sort}
              userId={userId}
              className="order-2 w-[36%] max-w-[13rem] -mt-4"
              pedestalClass="h-24 sm:h-28 bg-amber-500/25 border-amber-400/40"
              crown
            />
            <PodiumSeat
              row={third}
              place={3}
              sort={sort}
              userId={userId}
              className="order-3 w-[30%] max-w-[11rem]"
              pedestalClass="h-12 sm:h-16 bg-orange-700/30 border-orange-500/30"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
              Rankings
            </h3>
            {rest.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">
                More players will appear here as the community grows.
              </p>
            ) : (
              rest.map((row) => (
                <RankRow
                  key={row.id}
                  row={row}
                  sort={sort}
                  userId={userId}
                  friendMap={friendMap}
                  addingId={addingId}
                  setAddingId={setAddingId}
                  setFriendMap={setFriendMap}
                  toast={toast}
                  openProfile={openProfile}
                />
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-slate-400 tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function metricLine(row: LeaderboardRow, sort: LeaderboardSort) {
  if (sort === 'vp') return `${(row.vpCurrency ?? 0).toLocaleString()} VP`;
  if (sort === 'stats')
    return `${row.wins} W · ${row.kills} K · ${row.kd.toFixed(2)} K/D`;
  return `Lv ${getLevelFromXp(row.xpProgress)} · ${row.xpProgress.toLocaleString()} XP`;
}

function PodiumSeat({
  row,
  place,
  sort,
  userId,
  className,
  pedestalClass,
  crown,
}: {
  row?: LeaderboardRow;
  place: 1 | 2 | 3;
  sort: LeaderboardSort;
  userId?: string;
  className?: string;
  pedestalClass: string;
  crown?: boolean;
}) {
  if (!row) {
    return <div className={cn('opacity-30', className)} />;
  }
  const isSelf = !!userId && row.id === userId;
  const medal =
    place === 1 ? 'text-amber-300' : place === 2 ? 'text-slate-200' : 'text-orange-400';

  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <div className="relative mb-2">
        {crown && <Trophy className="absolute -top-5 left-1/2 -translate-x-1/2 h-5 w-5 text-amber-300" />}
        <div
          className={cn(
            'mx-auto',
            place === 1 ? 'h-20 w-20' : 'h-14 w-14 sm:h-16 sm:w-16'
          )}
        >
          <PlayerAvatar
            src={row.avatarUrl}
            name={row.username || 'P'}
            isVip={row.isVip}
            frameConfig={row.equippedFrameConfig}
            className="h-full w-full"
            borderClassName={cn(
              'border-2 shadow-lg',
              place === 1 && 'border-amber-400/70',
              place === 2 && 'border-slate-300/50',
              place === 3 && 'border-orange-500/50'
            )}
          />
        </div>
        <span
          className={cn(
            'absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center text-[10px] font-black',
            medal
          )}
        >
          {place}
        </span>
      </div>
      <UserHoverCard
        userId={row.id}
        role={row.role}
        isVip={row.isVip}
        nicknameEffect={row.equippedNicknameConfig}
        className="text-sm font-bold truncate max-w-full"
      >
        {row.username}
      </UserHoverCard>
      {isSelf && (
        <Badge variant="outline" className="mt-0.5 border-primary/50 text-primary text-[9px]">
          You
        </Badge>
      )}
      <p className="text-[10px] sm:text-xs text-slate-400 mt-1 px-1 leading-snug">
        {metricLine(row, sort)}
      </p>
      <div className={cn('mt-3 w-full rounded-t-lg border-t border-x', pedestalClass)} />
    </div>
  );
}

function RankRow({
  row,
  sort,
  userId,
  friendMap,
  addingId,
  setAddingId,
  setFriendMap,
  toast,
  openProfile,
}: {
  row: LeaderboardRow;
  sort: LeaderboardSort;
  userId?: string;
  friendMap: Record<string, FriendStatus>;
  addingId: string | null;
  setAddingId: (id: string | null) => void;
  setFriendMap: React.Dispatch<React.SetStateAction<Record<string, FriendStatus>>>;
  toast: ReturnType<typeof useToast>['toast'];
  openProfile: (id: string) => void;
}) {
  const isSelf = !!userId && row.id === userId;
  const status = friendMap[row.id];

  return (
    <Card
      className={cn(
        'bg-slate-900/60 backdrop-blur-md border-slate-700/30',
        isSelf && 'ring-1 ring-primary/40'
      )}
    >
      <CardContent className="py-3 flex flex-wrap items-center gap-3">
        <span className="w-10 text-center font-black text-slate-400 tabular-nums flex items-center justify-center gap-0.5">
          <Medal className="h-3.5 w-3.5 opacity-40" />#{row.rank}
        </span>
        <div className="h-10 w-10 shrink-0">
          <PlayerAvatar
            src={row.avatarUrl}
            name={row.username || 'P'}
            isVip={row.isVip}
            frameConfig={row.equippedFrameConfig}
            className="h-full w-full"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate flex items-center gap-2">
            <UserHoverCard
              userId={row.id}
              role={row.role}
              isVip={row.isVip}
              nicknameEffect={row.equippedNicknameConfig}
              className="truncate"
            >
              {row.username || 'Player'}
            </UserHoverCard>
            {isSelf && (
              <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">
                You
              </Badge>
            )}
            {row.isVip && <Badge className="bg-yellow-500 text-black">VIP</Badge>}
          </p>
          <p className="text-xs text-slate-400">
            {row.currentRank || 'Unranked'} · {metricLine(row, sort)}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => openProfile(row.id)}>
            Profile
          </Button>
          {isSelf ? null : status === 'friends' ? (
            <Button size="sm" variant="outline" disabled className="flex-1 sm:flex-none">
              Friends
            </Button>
          ) : status === 'pending_out' || status === 'pending_in' ? (
            <Button size="sm" variant="outline" disabled className="flex-1 sm:flex-none">
              Pending
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              disabled={addingId === row.id}
              onClick={async () => {
                setAddingId(row.id);
                try {
                  const result = await sendFriendRequest(row.id);
                  if (result.status === 'self') {
                    toast({ title: 'That is you' });
                  } else if (result.status === 'accepted') {
                    setFriendMap((prev) => ({ ...prev, [row.id]: 'friends' }));
                    toast({ title: 'Already friends' });
                  } else {
                    setFriendMap((prev) => ({ ...prev, [row.id]: 'pending_out' }));
                    toast({ title: 'Friend request sent' });
                  }
                } catch {
                  toast({ title: 'Could not send request', variant: 'destructive' });
                } finally {
                  setAddingId(null);
                }
              }}
            >
              {addingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
