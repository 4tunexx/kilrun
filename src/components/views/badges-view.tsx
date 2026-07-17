'use client';

import { useEffect, useState } from 'react';
import { Award, CheckCircle, Loader2, Lock, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getPlayerAchievements, getPlayerBadges } from '@/lib/actions';

export default function BadgesView({ userId }: { userId: string }) {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([getPlayerAchievements(userId), getPlayerBadges(userId)])
      .then(([a, b]) => {
        if (!mounted) return;
        setAchievements(a);
        setBadges(b);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const gameAch = achievements.filter((a) => a.category === 'game');
  const webAch = achievements.filter((a) => a.category === 'website');

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <h1 className="text-3xl sm:text-4xl font-black mb-2 flex items-center gap-3">
        <Award className="w-8 h-8 text-primary" />
        Badges & Achievements
      </h1>
      <p className="text-slate-400 mb-4">
        Unlock rewards in-game and across the website hub.
      </p>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading...
        </div>
      ) : (
        <Tabs defaultValue="badges">
          <TabsList className="bg-slate-800/60">
            <TabsTrigger value="badges">Badges ({badges.filter((b) => b.unlocked).length}/{badges.length})</TabsTrigger>
            <TabsTrigger value="game">In-Game Achievements</TabsTrigger>
            <TabsTrigger value="web">Website Achievements</TabsTrigger>
          </TabsList>

          <TabsContent value="badges" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {badges.map((badge) => (
                <Card
                  key={badge.id}
                  className={`border ${
                    badge.unlocked
                      ? 'bg-slate-800/50 border-primary/40'
                      : 'bg-slate-900/30 border-slate-700/40 opacity-60'
                  }`}
                >
                  <CardContent className="pt-5 flex gap-3 items-start">
                    <div className="text-2xl">{badge.unlocked ? '🏅' : '🔒'}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold">{badge.title}</h3>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {badge.rarity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400">{badge.description}</p>
                      <p className="text-xs mt-1 font-semibold flex items-center gap-1">
                        {badge.unlocked ? (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-400" /> Earned
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" /> Locked
                          </>
                        )}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="game" className="mt-4 space-y-2">
            {gameAch.map((ach) => (
              <AchievementRow key={ach.id} ach={ach} />
            ))}
          </TabsContent>

          <TabsContent value="web" className="mt-4 space-y-2">
            {webAch.map((ach) => (
              <AchievementRow key={ach.id} ach={ach} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AchievementRow({ ach }: { ach: any }) {
  return (
    <Card
      className={`bg-slate-800/40 border-slate-700/30 ${
        ach.unlocked ? '' : 'opacity-55'
      }`}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {ach.unlocked ? (
              <Trophy className="w-4 h-4 text-yellow-400" />
            ) : (
              <Lock className="w-4 h-4 text-slate-500" />
            )}
            {ach.title}
          </span>
          <span className="text-sm font-normal text-yellow-400">
            +{ach.xpReward} XP
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 pb-3 text-sm text-slate-400">
        {ach.description}
      </CardContent>
    </Card>
  );
}
