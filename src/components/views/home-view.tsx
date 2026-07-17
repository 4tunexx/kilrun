'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Play,
  Trophy,
  Gauge,
  Clock,
  Gem,
  Loader2,
  Newspaper,
  MessageCircle,
  Send,
} from 'lucide-react';
import AnimatedCounter from '@/components/ui/animated-counter';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  getActiveMissions,
  getStatsSummary,
  type StatsSummary,
} from '@/lib/actions';
import {
  getGlobalChat,
  sendGlobalChat,
  getSiteSettings,
} from '@/lib/progression-actions';
import { getNewsPosts } from '@/lib/social-actions';
import type { ActiveMission } from '@/generated/prisma';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { UserHoverCard } from '@/components/user-hover-card';

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
  const [chat, setChat] = useState<any[]>([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [headerTitle, setHeaderTitle] = useState('Command Center');
  const [headerSubtitle, setHeaderSubtitle] = useState('Your live Kilrun overview');
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const refreshChat = useCallback(async () => {
    const messages = await getGlobalChat(40);
    setChat(messages.reverse());
  }, []);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      getActiveMissions(userId),
      getStatsSummary(userId),
      getNewsPosts(),
      getGlobalChat(40),
      getSiteSettings(),
    ]).then(([m, s, n, c, settings]) => {
      if (!isMounted) return;
      setMissions(m.slice(0, 4));
      setSummary(s);
      setNews(n.slice(0, 3));
      setChat([...c].reverse());
      setChatEnabled(settings.chatEnabled);
      if (settings.headerTitle) setHeaderTitle(settings.headerTitle);
      if (settings.headerSubtitle) setHeaderSubtitle(settings.headerSubtitle);
      setIsLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!chatEnabled) return;
    const id = setInterval(() => {
      refreshChat().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [chatEnabled, refreshChat]);

  const handleSend = async () => {
    if (!chatInput.trim() || sending) return;
    setSending(true);
    try {
      await sendGlobalChat(chatInput);
      setChatInput('');
      await refreshChat();
    } catch (e: any) {
      toast({
        title: e?.message ?? 'Could not send',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight">
            {headerTitle}
          </h1>
          <p className="text-slate-400 mt-1">{headerSubtitle}</p>
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
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" /> Live Chat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!chatEnabled ? (
              <p className="text-slate-400 text-sm">Chat is disabled by staff.</p>
            ) : (
              <>
                <div className="h-56 overflow-y-auto space-y-2 rounded-lg bg-slate-900/40 p-3 border border-slate-700/40">
                  {chat.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">
                      No messages yet — say hello!
                    </p>
                  ) : (
                    chat.map((msg) => (
                      <div key={msg.id} className="flex gap-2 items-start">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={msg.user.avatarUrl} />
                          <AvatarFallback>
                            {msg.user.username.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <UserHoverCard userId={msg.user.id} className="text-sm">
                              {msg.user.username}
                            </UserHoverCard>
                            {msg.user.isVip && (
                              <Badge className="h-4 text-[10px] bg-yellow-500 text-black">
                                VIP
                              </Badge>
                            )}
                            <span className="text-[10px] text-slate-500">
                              {formatDistanceToNow(new Date(msg.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 break-words">
                            {msg.body}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message the hub..."
                    maxLength={300}
                    className="bg-slate-900/50 border-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSend();
                    }}
                  />
                  <Button onClick={handleSend} disabled={sending || !chatInput.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle>Active Missions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            ) : missions.length === 0 ? (
              <p className="text-slate-400 text-sm">No missions yet.</p>
            ) : (
              missions.map((mission) => {
                const progress = Math.min(
                  Math.round(
                    (mission.currentCount / Math.max(mission.targetCount, 1)) * 100
                  ),
                  100
                );
                return (
                  <div key={mission.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={mission.isCompleted ? 'line-through text-slate-500' : ''}>
                        {mission.title}
                      </span>
                      <span className="text-yellow-400">+{mission.rewardXp} XP</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-slate-500 mt-1">
                      {mission.currentCount}/{mission.targetCount}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {news.length > 0 && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="w-5 h-5" /> Latest News
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {news.map((n) => (
              <div key={n.id} className="border-b border-slate-700/40 pb-3 last:border-0">
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-slate-400">{n.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
