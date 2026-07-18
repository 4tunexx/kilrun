'use client';
import { useEffect, useState } from 'react';
import { BarChart3, Gauge, Loader2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getMatchStats, getStatsSummary, type StatsSummary } from '@/lib/actions';
import type { MatchStat } from '@/generated/prisma';

export default function StatsView({ userId }: { userId: string }) {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [history, setHistory] = useState<MatchStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    Promise.all([getStatsSummary(userId), getMatchStats(userId, 20)]).then(([s, h]) => {
      if (!isMounted) return;
      setSummary(s);
      setHistory(h);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const overallStats = summary
    ? [
        { name: 'Total Runs', value: summary.totalRuns },
        { name: 'Best Score', value: summary.bestScore },
        { name: 'Best Distance', value: `${summary.bestDistance}m` },
        { name: 'Avg Score', value: summary.avgScore },
        { name: 'Avg Distance', value: `${summary.avgDistance}m` },
      ]
    : [];

  const scoreHistory = [...history]
    .reverse()
    .map((m, i) => ({ name: `Run ${i + 1}`, score: m.score }));

  const distanceHistory = [...history]
    .reverse()
    .map((m, i) => ({ name: `Run ${i + 1}`, distance: m.distance }));

  if (isLoading) {
    return (
      <div className="px-12 py-8 flex items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading live stats...
      </div>
    );
  }

  return (
    <div className="px-12 py-8">
      {summary?.totalRuns === 0 ? (
        <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
          <CardContent className="py-16 text-center text-slate-400">
            No runs recorded yet. Launch the game and finish a run to start building your stats.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800/60 mb-6">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-2" /> Overview</TabsTrigger>
            <TabsTrigger value="runs"><Gauge className="w-4 h-4 mr-2" /> Recent Runs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {overallStats.map(stat => (
                  <Card key={stat.name} className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 text-center">
                    <CardHeader className="p-4">
                      <CardTitle className="text-4xl font-black text-primary">{stat.value}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className="text-slate-400 text-sm">{stat.name}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TrendingUp /> Score History</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={scoreHistory} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                      <XAxis dataKey="name" stroke="rgba(255, 255, 255, 0.5)"/>
                      <YAxis stroke="rgba(255, 255, 255, 0.5)" />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', border: '1px solid #475569' }} />
                      <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="runs">
            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
              <CardHeader><CardTitle>Distance Per Run</CardTitle></CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distanceHistory} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)"/>
                    <XAxis dataKey="name" stroke="rgba(255, 255, 255, 0.5)" />
                    <YAxis stroke="rgba(255, 255, 255, 0.5)" />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', border: '1px solid #475569' }}/>
                    <Bar dataKey="distance" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
