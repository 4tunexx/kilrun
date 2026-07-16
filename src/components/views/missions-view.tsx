'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Gift, Loader2, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getActiveMissions } from '@/lib/actions';
import type { ActiveMission } from '@/generated/prisma';

export default function MissionsView({ userId }: { userId: string }) {
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getActiveMissions(userId).then((data) => {
      if (!isMounted) return;
      setMissions(data);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8">Missions</h1>
      <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5" /> Active Missions</CardTitle>
          <CardDescription>Progress is tracked live from your match telemetry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading missions...
            </div>
          ) : missions.length === 0 ? (
            <p className="text-slate-400 text-center py-12">No active missions right now. Check back soon.</p>
          ) : (
            missions.map((mission) => {
              const progress = Math.min(
                Math.round((mission.currentCount / Math.max(mission.targetCount, 1)) * 100),
                100
              );
              return (
                <div
                  key={mission.id}
                  className={`p-4 rounded-lg bg-slate-900/50 border border-slate-700/50 ${mission.isCompleted ? 'opacity-60' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <div className="flex items-start gap-3">
                      {mission.isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                      ) : (
                        <div className="w-5 h-5 shrink-0" />
                      )}
                      <div>
                        <p className={`font-semibold text-lg ${mission.isCompleted ? 'line-through text-slate-400' : ''}`}>
                          {mission.title}
                        </p>
                        <p className="text-sm text-slate-400">{mission.description}</p>
                      </div>
                    </div>
                    <p className="text-sm text-yellow-400 font-bold flex items-center gap-1 whitespace-nowrap">
                      <Gift size={16} /> {mission.rewardXp.toLocaleString()} XP
                    </p>
                  </div>
                  {!mission.isCompleted && (
                    <div className="pl-8">
                      <Progress value={progress} className="h-3" />
                      <p className="text-xs text-slate-500 mt-1">{mission.currentCount} / {mission.targetCount}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
