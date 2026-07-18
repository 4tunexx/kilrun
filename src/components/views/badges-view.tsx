'use client';

import { useEffect, useState } from 'react';
import { Award, CheckCircle, Loader2, Lock, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getPlayerAchievements, getPlayerBadges } from '@/lib/progression-actions';

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
                  className={`bg-slate-900/60 backdrop-blur-md border border-slate-700/30 ${
                    badge.unlocked ? 'border-primary/40' : 'opacity-60'
                  }`}
                >
                  <CardContent className="pt-5 flex gap-3 items-start">
                    {badge.iconImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={badge.iconImageUrl}
                        alt=""
                        className={`w-10 h-10 rounded object-cover shrink-0 ${
                          badge.unlocked ? '' : 'opacity-40 grayscale'
                        }`}
                      />
                    ) : badge.unlocked ? (
                      <Award className="w-10 h-10 text-primary shrink-0" />
                    ) : (
                      <Lock className="w-10 h-10 text-slate-500 shrink-0" />
                    )}
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
            {ach.iconImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ach.iconImageUrl}
                alt=""
                className={`w-5 h-5 rounded object-cover ${ach.unlocked ? '' : 'opacity-40 grayscale'}`}
              />
            ) : ach.unlocked ? (
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
