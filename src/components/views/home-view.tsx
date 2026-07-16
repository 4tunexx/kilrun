'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Play,
  Calendar,
  Clock,
  Trophy,
  Map,
  Shield,
  Gauge,
  Gem,
  ChevronDown,
  Send,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import AnimatedCounter from '@/components/ui/animated-counter';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getActiveMissions, getStatsSummary, type StatsSummary } from '@/lib/actions';
import type { ActiveMission } from '@/generated/prisma';

const liveMatches = [
  {
    teamA: 'Ninjas',
    teamB: 'Samurais',
    scoreA: 8,
    scoreB: 5,
    map: 'Ascent',
    mode: 'Unrated',
    mapImage: 'https://i.postimg.cc/tJgX2XgN/bg.png',
  },
  {
    teamA: 'Ghosts',
    teamB: 'Phantoms',
    scoreA: 2,
    scoreB: 1,
    map: 'Haven',
    mode: 'Spike Rush',
    mapImage: 'https://i.postimg.cc/tJgX2XgN/bg.png',
  },
];

const chatMessages = [
  { author: 'Player1', message: 'GG what a match!' },
  { author: 'ProGamer', message: 'Anyone up for a ranked game?' },
  { author: 'Newbie', message: 'How do I unlock the new agent?' },
  { author: 'StreamerYT', message: 'Going live with some Kilrun gameplay!' },
  { author: 'Player1', message: 'Sure, I can join for a ranked' },
];

const newsUpdates = [
  {
    title: 'New Map "Abyss" Released!',
    date: '2 days ago',
    description:
      'Explore the depths of the new underwater map and discover new strategies.',
    image: 'https://picsum.photos/seed/news1/400/200',
    category: 'MAPS',
  },
  {
    title: 'Patch Notes v5.03',
    date: '4 days ago',
    description:
      'Agent balancing, weapon updates, and performance improvements are here.',
    image: 'https://picsum.photos/seed/news2/400/200',
    category: 'UPDATES',
  },
];

interface HomeViewProps {
  onLaunchGame?: () => void;
  userId: string;
  vpCurrency?: number;
}

export default function HomeView({ onLaunchGame, userId, vpCurrency = 0 }: HomeViewProps) {
  const [isChatOpen, setIsChatOpen] = React.useState(true);
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([getActiveMissions(userId), getStatsSummary(userId)]).then(([m, s]) => {
      if (!isMounted) return;
      setMissions(m.slice(0, 4));
      setSummary(s);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  return (
    <>
      {/* Game Header Banner */}
      <div className="relative h-64 overflow-visible">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80"
            alt="Game background"
            fill
            className="object-cover"
            data-ai-hint="gameplay screen"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-900/80" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
        </div>

        <div className="relative h-full px-12 flex items-center justify-between">
          <h1 className="text-8xl font-black tracking-tight drop-shadow-2xl">
            Kilrun
          </h1>
          <button 
            onClick={onLaunchGame}
            className="bg-primary hover:bg-primary/90 transition-transform hover:scale-105 px-10 py-5 rounded-xl font-bold text-lg flex items-center space-x-3 shadow-2xl pointer-events-auto"
          >
            <Play className="w-6 h-6 fill-current" />
            <span>Launch Game</span>
          </button>
        </div>
      </div>

      {/* Stats Bar - Stabilized with Grid */}
      <div className="w-full grid grid-cols-1 md:grid-cols-4 divide-x divide-slate-700/50 bg-slate-800/60 backdrop-blur-md border-t border-b border-slate-700/50 rounded-none overflow-hidden">
        <div className="px-12 py-6 flex items-center space-x-4 hover:-translate-y-1 transition-all duration-300 cursor-pointer group hover:bg-slate-700/20">
          <Calendar className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">
              Last Played
            </div>
            <div className="font-bold text-xl whitespace-nowrap">
              {summary?.lastPlayedAt ? format(new Date(summary.lastPlayedAt), 'd MMM') : '\u2014'}
            </div>
          </div>
        </div>

        <div className="px-12 py-6 flex items-center space-x-4 hover:-translate-y-1 transition-all duration-300 cursor-pointer group hover:bg-slate-700/20">
          <Gem className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">
              VP Currency
            </div>
            <div className="font-bold text-xl whitespace-nowrap">
              <AnimatedCounter end={vpCurrency} duration={2} />
            </div>
          </div>
        </div>
        
        <div className="px-12 py-6 flex items-center space-x-4 hover:-translate-y-1 transition-all duration-300 cursor-pointer group hover:bg-slate-700/20">
          <Gauge className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">
              Best Distance
            </div>
            <div className="font-bold text-xl whitespace-nowrap">
              <AnimatedCounter end={summary?.bestDistance ?? 0} duration={2} />m
            </div>
          </div>
        </div>

        <div className="px-12 py-6 flex items-center space-x-4 hover:-translate-y-1 transition-all duration-300 cursor-pointer group hover:bg-slate-700/20">
          <Trophy className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">
              Best Score
            </div>
            <div className="font-bold text-xl whitespace-nowrap">
              <AnimatedCounter end={summary?.bestScore ?? 0} duration={2} />
            </div>
          </div>
        </div>
      </div>

      {/* New Dashboard Content */}
      <div className="p-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Live Matches */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 hover:border-primary/50 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Live Matches
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveMatches.map((match, i) => (
                <div
                  key={i}
                  className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden group transition-all hover:scale-105 hover:border-primary/50"
                >
                  <div className="relative h-24">
                    <Image
                      src={match.mapImage}
                      alt={match.map}
                      fill
                      className="object-cover opacity-40 group-hover:opacity-60 transition"
                      data-ai-hint="game map"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    <div className="absolute bottom-2 left-3 text-white">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Map size={14} /> {match.map}
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-3 text-white">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Shield size={14} /> {match.mode}
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-lg">{match.teamA}</span>
                      <span className="text-xs text-slate-400">vs</span>
                      <span className="font-bold text-lg">{match.teamB}</span>
                    </div>
                    <div className="flex justify-between items-center text-3xl font-black">
                      <span>{match.scoreA}</span>
                      <span>{match.scoreB}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* News & Updates */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 hover:border-primary/50 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl font-bold tracking-tight">
                News & Updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {newsUpdates.map((item, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className="w-40 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <Image
                      src={item.image}
                      alt={item.title}
                      width={160}
                      height={96}
                      className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                      data-ai-hint="game update"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">
                      {item.category}
                    </p>
                    <h4 className="font-bold text-lg mb-1 group-hover:text-primary/90 transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-sm text-slate-400 leading-snug">
                      {item.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">{item.date}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-8">
          {/* Active Missions - live from Prisma */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 hover:border-primary/50 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Active Missions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : missions.length === 0 ? (
                <p className="text-sm text-slate-400">No active missions right now.</p>
              ) : (
                missions.map((mission) => {
                  const progress = Math.min(
                    Math.round((mission.currentCount / Math.max(mission.targetCount, 1)) * 100),
                    100
                  );
                  return (
                    <div key={mission.id}>
                      <div className="flex justify-between items-end mb-1">
                        <p className="font-semibold text-sm">{mission.title}</p>
                        <p className="text-xs text-yellow-400 font-bold">
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

          {/* Personal Bests - derived from live MatchStat telemetry */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 hover:border-primary/50 transition-all">
            <CardHeader>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Personal Bests
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-slate-700/50 rounded-lg">
                  <Trophy className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h4 className="font-bold">{summary?.bestScore ?? 0} pts</h4>
                  <p className="text-sm text-slate-400">Best Score</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-slate-700/50 rounded-lg">
                  <Gauge className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h4 className="font-bold">{summary?.bestDistance ?? 0}m</h4>
                  <p className="text-sm text-slate-400">Best Distance</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-slate-700/50 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h4 className="font-bold">{summary?.totalRuns ?? 0}</h4>
                  <p className="text-sm text-slate-400">Total Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Chat */}
          <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
            <Collapsible open={isChatOpen} onOpenChange={setIsChatOpen}>
              <div className="flex items-center justify-between pr-4">
                <CardHeader>
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    Live Chat
                  </CardTitle>
                </CardHeader>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronDown
                      className={`h-5 w-5 transition-transform duration-300 ${
                        isChatOpen ? 'rotate-180' : ''
                      }`}
                    />
                    <span className="sr-only">Toggle chat</span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="border-t border-slate-700/30 pt-4">
                    <ScrollArea className="h-56 pr-4">
                      <div className="space-y-4">
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className="flex flex-col items-start text-sm"
                          >
                            <span className="font-bold text-primary/90">
                              {msg.author}
                            </span>
                            <p className="text-slate-300 bg-slate-700/20 px-3 py-1.5 rounded-lg rounded-tl-none">
                              {msg.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <div className="mt-4 flex space-x-2">
                    <Input
                      placeholder="Type your message..."
                      className="bg-slate-900/50 border-slate-700 focus:ring-primary/50"
                    />
                    <Button size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      </div>
    </>
  );
}
