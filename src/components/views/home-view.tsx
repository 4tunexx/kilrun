'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Play,
  Trophy,
  Gauge,
  Clock,
  Coins,
  Loader2,
  Newspaper,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronUp,
  MessagesSquare,
  Target,
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
import { bootstrapHubOnce } from '@/lib/hub-bootstrap-client';
import { DAILY_MISSION_SEEDS, isDailyMissionRow } from '@/lib/daily-missions';
import { getForumPosts, getNewsPosts } from '@/lib/social-actions';
import type { ActiveMission } from '@/generated/prisma';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { UserHoverCard } from '@/components/user-hover-card';
import { InteractiveWordmark } from '@/components/interactive-wordmark';
import { NewsArticleDialog, type NewsArticle } from '@/components/news-article-dialog';
import { resolveNewsThumbnail } from '@/lib/news-thumbnail';
import { usePointerParallax } from '@/hooks/use-pointer-parallax';
import { resolveHeaderLogo, resolveHomeHeroImage } from '@/lib/branding';
import { onSiteSettingsUpdated } from '@/lib/site-branding-events';
import {
  DEFAULT_HEADER_LOGO_STYLE,
  normalizeHeaderLogoStyle,
  type HeaderLogoStyle,
} from '@/lib/logo-style';
import { PlayerAvatar } from '@/components/ui/player-avatar';

const CHAT_COLLAPSE_KEY = 'kilrun.chatCollapsed';

const PANEL =
  'bg-slate-900/60 backdrop-blur-md border border-slate-700/30';

interface HomeViewProps {
  onLaunchGame?: () => void;
  onNavigate?: (page: string) => void;
  userId: string;
  vpCurrency?: number;
  headerLogoUrl?: string;
  headerLogoStyle?: string | HeaderLogoStyle;
  homeHeroImage?: string;
}

export default function HomeView({
  onLaunchGame,
  onNavigate,
  userId,
  vpCurrency = 0,
  headerLogoUrl: headerLogoUrlProp,
  headerLogoStyle: headerLogoStyleProp,
  homeHeroImage,
}: HomeViewProps) {
  const [dailyMissions, setDailyMissions] = useState<ActiveMission[]>([]);
  const [mainMissions, setMainMissions] = useState<ActiveMission[]>([]);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [readingNewsId, setReadingNewsId] = useState<string | null>(null);
  const [readingNews, setReadingNews] = useState<NewsArticle | null>(null);
  const [forumTopics, setForumTopics] = useState<any[]>([]);
  const [chat, setChat] = useState<any[]>([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /** Admin SiteSettings win over any prop/default. */
  const [wordmarkSrc, setWordmarkSrc] = useState(
    resolveHeaderLogo(headerLogoUrlProp)
  );
  const [logoStyle, setLogoStyle] = useState<HeaderLogoStyle>(() =>
    normalizeHeaderLogoStyle(headerLogoStyleProp ?? DEFAULT_HEADER_LOGO_STYLE)
  );
  const [heroSrc, setHeroSrc] = useState(resolveHomeHeroImage(homeHeroImage));
  const heroParallax = usePointerParallax(22);
  const { toast } = useToast();

  const refreshChat = useCallback(async () => {
    const messages = await getGlobalChat(40);
    setChat(messages.reverse());
  }, []);

  useEffect(() => {
    try {
      setChatCollapsed(
        typeof window !== 'undefined' &&
          localStorage.getItem(CHAT_COLLAPSE_KEY) === '1'
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      // Wait for hub bootstrap so Daily Login (and other login-day sync) is
      // reflected before we snapshot the board for the home panel.
      try {
        await bootstrapHubOnce();
      } catch {
        // Still load the board; panel may briefly lag until next visit.
      }
      if (!isMounted) return;
      const [m, s, n, c, settings, forum] = await Promise.all([
        getActiveMissions(userId),
        getStatsSummary(userId),
        getNewsPosts(),
        getGlobalChat(40),
        getSiteSettings(),
        getForumPosts(5),
      ]);
      if (!isMounted) return;
      const daily = m.filter(isDailyMissionRow);
      const main = m.filter((mission) => !isDailyMissionRow(mission));
      // Show the full daily board so completed missions (e.g. Daily Login)
      // stay counted and visible — do not clip incomplete-first to 5.
      setDailyMissions(daily);
      setMainMissions(main);
      setSummary(s);
      setNews(n.slice(0, 3));
      setForumTopics(forum.slice(0, 5));
      setChat([...c].reverse());
      setChatEnabled(settings.chatEnabled);
      // Prefer fetched settings (including empty clears) over stale props.
      setWordmarkSrc(
        resolveHeaderLogo(settings.headerLogoUrl ?? headerLogoUrlProp)
      );
      setLogoStyle(
        normalizeHeaderLogoStyle(
          (settings as { headerLogoStyle?: string }).headerLogoStyle ??
            headerLogoStyleProp ??
            DEFAULT_HEADER_LOGO_STYLE
        )
      );
      setHeroSrc(
        resolveHomeHeroImage(settings.homeHeroImage ?? homeHeroImage)
      );
      setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [userId, homeHeroImage, headerLogoUrlProp, headerLogoStyleProp]);

  useEffect(() => {
    return onSiteSettingsUpdated((s) => {
      if (s.headerLogoUrl !== undefined) {
        setWordmarkSrc(resolveHeaderLogo(s.headerLogoUrl));
      }
      if (s.headerLogoStyle !== undefined) {
        setLogoStyle(normalizeHeaderLogoStyle(s.headerLogoStyle));
      }
      if (s.homeHeroImage !== undefined) {
        setHeroSrc(resolveHomeHeroImage(s.homeHeroImage));
      }
    });
  }, []);

  // Slow chat refresh — only while this tab is visible (cuts idle POST spam).
  useEffect(() => {
    if (!chatEnabled) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      refreshChat().catch(() => {});
    };
    const id = setInterval(tick, 15000);
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
    <div className="flex flex-col min-h-full">
      {/* Hero banner — pointer-reactive background + interactive wordmark */}
      <div
        ref={heroParallax.ref}
        className="relative h-48 sm:h-64 overflow-hidden touch-pan-y"
        onPointerMove={heroParallax.onPointerMove}
        onPointerLeave={heroParallax.onPointerLeave}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          alt="Kilrun arena"
          className="absolute inset-[-8%] h-[116%] w-[116%] max-w-none object-cover pointer-events-none select-none"
          style={heroParallax.mediaStyle}
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/55 to-slate-900/70 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent pointer-events-none" />
        <div className="relative h-full px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <InteractiveWordmark
              src={wordmarkSrc}
              logoStyle={logoStyle}
              className="h-12 sm:h-16 md:h-20 w-auto max-w-[min(100%,22rem)]"
            />
          </div>
          <Button
            size="lg"
            className="shrink-0 h-14 px-8 text-lg font-bold shadow-2xl"
            onClick={onLaunchGame}
          >
            <Play className="mr-2 h-6 w-6 fill-current" /> Launch Game
          </Button>
        </div>
      </div>

      {/* Stats — flush under hero, full width matching header */}
      <div className="w-full border-y border-slate-700/40 bg-slate-900/70 backdrop-blur-md">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-700/50">
          <button
            type="button"
            className="group px-3 sm:px-5 py-5 sm:py-6 text-center transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]"
            onClick={() => onNavigate?.('store')}
          >
            <Coins className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-yellow-400 transition group-hover:scale-110" />
            <div className="text-2xl sm:text-3xl font-black tracking-tight">
              <AnimatedCounter end={vpCurrency} />
            </div>
            <p className="mt-1 text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-semibold">
              VP Balance
            </p>
          </button>
          <button
            type="button"
            className="group px-3 sm:px-5 py-5 sm:py-6 text-center transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]"
            onClick={() => onNavigate?.('leaderboard')}
          >
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary transition group-hover:scale-110" />
            <div className="text-2xl sm:text-3xl font-black tracking-tight">
              {summary?.bestScore ?? 0}
            </div>
            <p className="mt-1 text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Best Score
            </p>
          </button>
          <button
            type="button"
            className="group px-3 sm:px-5 py-5 sm:py-6 text-center transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]"
            onClick={() => onNavigate?.('stats')}
          >
            <Gauge className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary transition group-hover:scale-110" />
            <div className="text-2xl sm:text-3xl font-black tracking-tight">
              {summary?.bestDistance ?? 0}m
            </div>
            <p className="mt-1 text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Best Distance
            </p>
          </button>
          <button
            type="button"
            className="group px-3 sm:px-5 py-5 sm:py-6 text-center transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:bg-white/[0.04]"
            onClick={() => onNavigate?.('stats')}
          >
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 text-primary transition group-hover:scale-110" />
            <div className="text-2xl sm:text-3xl font-black tracking-tight">
              {summary?.totalRuns ?? 0}
            </div>
            <p className="mt-1 text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Total Runs
            </p>
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-6 space-y-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className={PANEL}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" /> Live Chat
              </CardTitle>
              {chatEnabled && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-slate-400"
                  onClick={() => {
                    const next = !chatCollapsed;
                    setChatCollapsed(next);
                    try {
                      localStorage.setItem(CHAT_COLLAPSE_KEY, next ? '1' : '0');
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {chatCollapsed ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 mr-1" /> Show
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 mr-1" /> Hide
                    </>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {!chatEnabled ? (
                <p className="text-slate-400 text-sm">Chat is disabled by staff.</p>
              ) : chatCollapsed ? (
                <p className="text-slate-500 text-sm py-2">
                  Live chat hidden — click Show to reopen.
                </p>
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
                          <PlayerAvatar
                            src={msg.user.avatarUrl}
                            name={msg.user.username}
                            isVip={msg.user.isVip}
                            frameConfig={msg.user.equippedFrameConfig}
                            className="h-7 w-7"
                            crownClassName="h-3.5 w-3.5 -top-0.5 -right-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <UserHoverCard
                                userId={msg.user.id}
                                role={msg.user.role}
                                isVip={msg.user.isVip}
                                nicknameEffect={msg.user.equippedNicknameConfig}
                                className="text-sm"
                              >
                                {msg.user.username}
                              </UserHoverCard>
                              {msg.user.isVip && (
                                <Badge className="h-4 text-[10px] bg-orange-500 text-black">
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
                      placeholder="Message the hub… tag a friend with @nickname"
                      maxLength={300}
                      className="bg-slate-900/50 border-slate-700"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend();
                      }}
                    />
                    <Button onClick={handleSend} disabled={sending || !chatInput.trim()}>
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className={PANEL}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Daily Missions</CardTitle>
                <span className="text-xs font-semibold text-emerald-400 tabular-nums">
                  {dailyMissions.filter((m) => m.isCompleted).length}/
                  {dailyMissions.length || DAILY_MISSION_SEEDS.length}
                </span>
              </div>
              <Progress
                value={
                  dailyMissions.length
                    ? Math.round(
                        (dailyMissions.filter((m) => m.isCompleted).length /
                          dailyMissions.length) *
                          100
                      )
                    : 0
                }
                tone="green"
                className="h-2 mt-2"
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : dailyMissions.length === 0 ? (
                <p className="text-slate-400 text-sm">No daily missions yet.</p>
              ) : (
                dailyMissions.map((mission) => {
                  const progress = Math.min(
                    Math.round(
                      (mission.currentCount / Math.max(mission.targetCount, 1)) * 100
                    ),
                    100
                  );
                  return (
                    <div key={mission.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span
                          className={
                            mission.isCompleted ? 'line-through text-slate-500' : ''
                          }
                        >
                          {mission.title}
                        </span>
                        <span className="text-yellow-400">+{mission.rewardXp} XP</span>
                      </div>
                      <Progress value={progress} tone="green" className="h-2" />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className={PANEL}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" /> Main Missions
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => onNavigate?.('missions')}
                >
                  View all
                </Button>
              </div>
              <Progress
                value={
                  mainMissions.length
                    ? Math.round(
                        (mainMissions.filter((m) => m.isCompleted).length /
                          mainMissions.length) *
                          100
                      )
                    : 0
                }
                className="h-2.5 mt-2"
              />
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {mainMissions.filter((m) => m.isCompleted).length}/
                {mainMissions.length} complete
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {mainMissions.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="flex justify-between text-sm gap-2"
                >
                  <span
                    className={
                      m.isCompleted
                        ? 'line-through text-slate-500 truncate'
                        : 'truncate'
                    }
                  >
                    {m.title}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {m.currentCount}/{m.targetCount}
                  </span>
                </div>
              ))}
              {mainMissions.length === 0 && (
                <p className="text-sm text-slate-500">No main missions yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className={PANEL}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <MessagesSquare className="w-5 h-5" /> Latest Forum
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => onNavigate?.('community')}
                >
                  Forums
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {forumTopics.length === 0 ? (
                <p className="text-sm text-slate-500">No topics yet.</p>
              ) : (
                forumTopics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onNavigate?.('community')}
                    className="w-full text-left rounded-md border border-slate-700/30 bg-slate-900/30 px-3 py-2 hover:border-primary/40 transition"
                  >
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {t.category} · {t.author?.username} ·{' '}
                      {t._count?.replies ?? 0} replies
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {news.length > 0 && (
          <Card className={PANEL}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="w-5 h-5" /> Latest News
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {news.map((n) => {
                const thumb = resolveNewsThumbnail(n.headerImageUrl, n.body);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setReadingNews(n);
                      setReadingNewsId(n.id);
                    }}
                    className="group flex w-full items-stretch gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-slate-600/60 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {thumb ? (
                      <div className="relative h-16 w-24 sm:h-[4.5rem] sm:w-28 shrink-0 overflow-hidden rounded-md border border-slate-700/50 bg-slate-900/80">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
                      <p className="font-semibold truncate">{n.title}</p>
                      <p className="text-sm text-slate-400 line-clamp-2">{n.summary}</p>
                      <p className="text-xs text-primary mt-1">Read article →</p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <NewsArticleDialog
        open={!!readingNewsId}
        onOpenChange={(open) => {
          if (!open) {
            setReadingNewsId(null);
            setReadingNews(null);
          }
        }}
        postId={readingNewsId}
        initialPost={readingNews}
      />
    </div>
  );
}
