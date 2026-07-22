'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Gift, Loader2, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { bootstrapMyMissions, getActiveMissions } from '@/lib/actions';
import { DAILY_MISSION_SEEDS } from '@/lib/daily-missions';
import type { ActiveMission } from '@/generated/prisma';

function isDailyMission(m: ActiveMission) {
  return (
    (m as { category?: string }).category === 'daily' ||
    m.templateKey.startsWith('daily_')
  );
}

function isWebMission(m: ActiveMission) {
  if (isDailyMission(m)) return false;
  return (
    (m as { category?: string }).category === 'website' ||
    m.templateKey.startsWith('web_')
  );
}

export default function MissionsView({ userId }: { userId: string }) {
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      await bootstrapMyMissions();
      const data = await getActiveMissions(userId);
      if (!isMounted) return;
      setMissions(data);
      setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const daily = useMemo(() => missions.filter(isDailyMission), [missions]);
  const game = useMemo(
    () => missions.filter((m) => !isDailyMission(m) && !isWebMission(m)),
    [missions]
  );
  const web = useMemo(() => missions.filter(isWebMission), [missions]);

  const dailyDone = daily.filter((m) => m.isCompleted).length;

  return (
    <div className="px-4 sm:px-8 py-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading missions...
        </div>
      ) : (
        <Tabs defaultValue="daily">
          <TabsList className="bg-slate-800/60 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="daily">
              Daily ({dailyDone}/{daily.length || DAILY_MISSION_SEEDS.length})
            </TabsTrigger>
            <TabsTrigger value="game">
              In-Game ({game.filter((m) => m.isCompleted).length}/{game.length})
            </TabsTrigger>
            <TabsTrigger value="web">
              Website ({web.filter((m) => m.isCompleted).length}/{web.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-4 space-y-3">
            <div className="flex items-center gap-3 px-1">
              <Progress
                value={
                  daily.length
                    ? Math.round((dailyDone / daily.length) * 100)
                    : 0
                }
                tone="green"
                className="h-2.5 flex-1"
              />
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                {dailyDone}/{daily.length || DAILY_MISSION_SEEDS.length}
              </span>
            </div>
            <MissionList
              missions={daily}
              empty="No daily missions yet. They unlock automatically on hub load."
              tone="green"
              title="Daily Missions"
              description={`Resets every day at midnight (UTC). Complete all ${DAILY_MISSION_SEEDS.length} for full daily progress.`}
            />
          </TabsContent>
          <TabsContent value="game" className="mt-4">
            <MissionList
              missions={game}
              empty="No in-game missions yet. Seed the database or check back soon."
            />
          </TabsContent>
          <TabsContent value="web" className="mt-4">
            <MissionList missions={web} empty="No website missions yet." />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function MissionList({
  missions,
  empty,
  tone = 'primary',
  title = 'Mission Board',
  description = 'Progress updates live from matches and hub activity.',
}: {
  missions: ActiveMission[];
  empty: string;
  tone?: 'primary' | 'green';
  title?: string;
  description?: string;
}) {
  if (missions.length === 0) {
    return <p className="text-slate-400 text-center py-12">{empty}</p>;
  }

  return (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {missions.map((mission) => {
          const progress = Math.min(
            Math.round(
              (mission.currentCount / Math.max(mission.targetCount, 1)) * 100
            ),
            100
          );
          return (
            <div
              key={mission.id}
              className={`p-4 rounded-lg bg-slate-900/50 border transition group ${
                mission.isCompleted
                  ? 'border-emerald-500/55 hover:border-emerald-400/70'
                  : 'border-slate-700/50'
              }`}
            >
              <div className="flex justify-between items-start mb-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center shrink-0 transition duration-200 group-hover:scale-125 origin-center">
                    {mission.iconImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mission.iconImageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : mission.isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Target className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`font-semibold text-lg ${
                          mission.isCompleted ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {mission.title}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {mission.metric}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">{mission.description}</p>
                  </div>
                </div>
                <p className="text-sm text-yellow-400 font-bold flex items-center gap-1 whitespace-nowrap">
                  <Gift size={16} /> {mission.rewardXp.toLocaleString()} XP
                </p>
              </div>
              <div className="pl-11">
                <Progress value={progress} tone={tone} className="h-3" />
                <p className="text-xs text-slate-500 mt-1">
                  {mission.currentCount} / {mission.targetCount}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
