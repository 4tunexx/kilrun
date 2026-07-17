'use client';

import React, { useEffect, useState } from 'react';
import {
  Play,
  Trophy,
  Gauge,
  Clock,
  Gem,
  Loader2,
  Newspaper,
} from 'lucide-react';
import AnimatedCounter from '@/components/ui/animated-counter';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActiveMissions, getStatsSummary, type StatsSummary } from '@/lib/actions';
import { getNewsPosts } from '@/lib/social-actions';
import type { ActiveMission } from '@/generated/prisma';
import { formatDistanceToNow } from 'date-fns';

interface HomeViewProps {
  onLaunchGame?: () => void;
  userId: string;
  vpCurrency?: number;
}

export default function HomeView({
  onLaunchGame,
  userId,
  vpCurrency = 0,
}: HomeViewProps) {
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getActiveMissions(userId),
      getStatsSummary(userId),
      getNewsPosts(),
    ]).then(([m, s, n]) => {
      if (!isMounted) return;
      setMissions(m.slice(0, 4));
      setSummary(s);
      setNews(n.slice(0, 3));
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            Command Center
          </h1>
          <p className="text-slate-400 mt-1">Your live Kilrun overview</p>
        </div>
        <Button size="lg" className="w-full sm:w-auto" onClick={onLaunchGame}>
          <Play className="mr-2 h-5 w-5" /> Play Deathrun
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 text-center">
            <Gem className="w-6 h-6 mx-auto mb-2 text-yellow-400" />
            <div className="text-2xl sm:text-3xl font-black">
              <AnimatedCounter end={vpCurrency} />
            </div>
            <p className="text-xs sm:text-sm text-slate-400">VP Balance</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 text-center">
            <Trophy className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl sm:text-3xl font-black">
              {summary?.bestScore ?? 0}
            </div>
            <p className="text-xs sm:text-sm text-slate-400">Best Score</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 text-center">
            <Gauge className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl sm:text-3xl font-black">
              {summary?.bestDistance ?? 0}m
            </div>
            <p className="text-xs sm:text-sm text-slate-400">Best Distance</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="pt-6 text-center">
            <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
            <div className="text-2xl sm:text-3xl font-black">
              {summary?.totalRuns ?? 0}
            </div>
            <p className="text-xs sm:text-sm text-slate-400">Total Runs</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle>Active Missions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : missions.length === 0 ? (
              <p className="text-slate-400 text-sm">No active missions.</p>
            ) : (
              missions.map((mission) => {
                const progress = Math.min(
                  100,
                  Math.round((mission.currentCount / mission.targetCount) * 100)
                );
                return (
                  <div key={mission.id}>
                    <div className="flex justify-between items-end mb-1 gap-2">
                      <p className="font-semibold text-sm">{mission.title}</p>
                      <p className="text-xs text-yellow-400 font-bold shrink-0">
                        {mission.rewardXp.toLocaleString()} XP
                      </p>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="w-5 h-5" /> Latest News
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {news.length === 0 ? (
              <p className="text-slate-400 text-sm">
                No news yet. Check Community later.
              </p>
            ) : (
              news.map((post) => (
                <div
                  key={post.id}
                  className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/40"
                >
                  <p className="font-semibold">{post.title}</p>
                  <p className="text-sm text-slate-400">{post.summary}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDistanceToNow(new Date(post.createdAt))} ago
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
