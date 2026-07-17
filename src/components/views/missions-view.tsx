'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Gift, Loader2, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { bootstrapMyMissions, getActiveMissions } from '@/lib/actions';
import type { ActiveMission } from '@/generated/prisma';

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

  const game = missions.filter((m) => !m.templateKey.startsWith('web_'));
  const web = missions.filter((m) => m.templateKey.startsWith('web_'));

  return (
    <div className="px-4 sm:px-8 py-6">
      <h1 className="text-3xl sm:text-5xl font-black mb-2">Missions</h1>
      <p className="text-slate-400 mb-6">
        Complete in-game and website challenges for XP. Completions notify you instantly.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading missions...
        </div>
      ) : (
        <Tabs defaultValue="game">
          <TabsList className="bg-slate-800/60">
            <TabsTrigger value="game">
              In-Game ({game.filter((m) => m.isCompleted).length}/{game.length})
            </TabsTrigger>
            <TabsTrigger value="web">
              Website ({web.filter((m) => m.isCompleted).length}/{web.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="game" className="mt-4">
            <MissionList missions={game} empty="No in-game missions yet. Seed the database or check back soon." />
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
}: {
  missions: ActiveMission[];
  empty: string;
}) {
  if (missions.length === 0) {
    return <p className="text-slate-400 text-center py-12">{empty}</p>;
  }

  return (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" /> Mission Board
        </CardTitle>
        <CardDescription>
          Progress updates live from matches and hub activity.
        </CardDescription>
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
              className={`p-4 rounded-lg bg-slate-900/50 border border-slate-700/50 ${
                mission.isCompleted ? 'opacity-70' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center shrink-0">
                    {mission.iconImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mission.iconImageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : mission.isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
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
              {!mission.isCompleted && (
                <div className="pl-11">
                  <Progress value={progress} className="h-3" />
                  <p className="text-xs text-slate-500 mt-1">
                    {mission.currentCount} / {mission.targetCount}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
