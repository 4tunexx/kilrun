'use client';

import React, { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Store,
  Users,
  BookOpen,
  Award,
  HelpCircle,
  User,
  ChevronRight,
  ChevronLeft,
  Home,
  Play,
  CheckSquare,
  Trophy,
  BarChart3,
  Star,
  Mail,
  Bell,
  ShieldAlert,
  Shield,
  CheckCircle2,
  Package,
  Gem,
  Crown,
  ShieldCheck,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import { RankLabel } from '@/components/ui/rank-badge';
import HomeView from '@/components/views/home-view';
import StoreView from '@/components/views/store-view';
import CommunityView from '@/components/views/community-view';
import GuidesView from '@/components/views/guides-view';
import LeaderboardView from '@/components/views/leaderboard-view';
import SupportView from '@/components/views/support-view';
import ProfileView from '@/components/views/profile-view';
import PlayView from '@/components/views/play-view';
import MissionsView from '@/components/views/missions-view';
import StatsView from '@/components/views/stats-view';
import BadgesView from '@/components/views/badges-view';
import NotificationsView from '@/components/views/notifications-view';
import MessagesView from '@/components/views/messages-view';
import PublicProfileView from '@/components/views/public-profile-view';
import {
  HealthIcon,
  SpeedIcon,
  JumpIcon,
  EnergyIcon,
  VisibilityIcon,
  PunchIcon,
  FlyIcon,
  HookIcon,
  BerserkIcon,
  BulletIcon,
  ThunderIcon,
} from '@/components/ability-icons';
import {
  HUB_NAV_CATALOG,
  defaultHubChrome,
  defaultHubNav,
  defaultHubPages,
  isHubPageEnabled,
  parseHubChrome,
  parseHubNav,
  parseHubPages,
  type HubChromeConfig,
  type HubNavLayout,
  type HubPageId,
  type HubPagesConfig,
} from '@/lib/hub-layout';
import { DAILY_MISSION_SEEDS } from '@/lib/daily-missions';

import { CircularProgress } from '@/components/ui/circular-progress';
import { Progress } from '@/components/ui/progress';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { NicknameEffectText } from '@/components/nickname-effect';
import { getCurrentUserProfile } from '@/lib/social-actions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
              {/* In-Game Abilities Collapsible */}
              <div className="w-full px-2 space-y-1">
              </div>

              <Dialog open={isVipDialogOpen} onOpenChange={setIsVipDialogOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setIsVipDialogOpen(true)}
                      className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 shrink-0 group relative ${
                        isVip
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-400/50 shadow-[0_0_12px_rgba(249,115,22,0.2)]'
                          : 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                      }`}
                    >
                      <Crown className="w-6 h-6 transition-transform group-hover:rotate-12" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{isVip ? 'VIP Active' : 'Unlock VIP'}</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="bg-slate-900/60 backdrop-blur-md border-slate-700/30 text-white max-w-md mx-4">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                      <Crown className="w-6 h-6 text-primary" />
                      {isVip ? 'VIP Active' : 'Unlock VIP Access'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {isVip
                        ? 'Your VIP perks are active across the hub.'
                        : `Spend ${VIP_UNLOCK_VP_COST} VP (balance: ${vpBalance}) for exclusive hub + future in-game perks.`}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2 space-y-2 text-sm">
                    {[
                      {
                        title: 'VIP name color',
                        body: 'Your username appears in orange across the hub.',
                      },
                      {
                        title: 'Crown on your avatar',
                        body: 'A crown badge on your profile picture.',
                      },
                      {
                        title: 'Exclusive cosmetics',
                        body: 'VIP banner, avatar frame, and nickname effect auto-equipped.',
                      },
                      {
                        title: 'In-game VIP (coming soon)',
                        body: 'More competitive perks planned for VIP members.',
                      },
                    ].map((perk) => (
                      <div
                        key={perk.title}
                        className="flex items-start gap-3 rounded-lg border border-slate-700/30 bg-slate-900/40 px-3 py-2.5"
                      >
                        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white">{perk.title}</h4>
                          <p className="text-xs text-slate-400">{perk.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!isVip && (
                    <Button size="lg" className="w-full text-lg" onClick={handleUnlockVip}>
                      Unlock for {VIP_UNLOCK_VP_COST} VP
                    </Button>
                  )}
                </DialogContent>
              </Dialog>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigate('premium')}
                    className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 shrink-0 group relative ${
                      isPremium
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                        : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <Gem className="w-6 h-6 text-amber-300 fill-amber-400/30 transition-transform group-hover:rotate-12" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isPremium ? 'Premium Active' : 'Go Premium'}</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex-1 min-h-2" />

              {showAdmin && <NavButton icon={Shield} label="Admin Panel" page="admin" />}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsInventoryOpen(true)}
                    className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 hover:bg-primary/20 shrink-0 group ${
                      isInventoryOpen
                        ? 'bg-primary/20 text-primary'
                        : 'text-slate-400 hover:text-primary'
                    }`}
                  >
                    <Package className="w-5 h-5 group-hover:text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Inventory</p>
                </TooltipContent>
              </Tooltip>
              <InventoryDrawer
                open={isInventoryOpen}
                onOpenChange={setIsInventoryOpen}
                username={user.username}
                avatarUrl={user.avatarUrl}
                onEquipChange={() => {
                  getCurrentUserProfile()
                    .then((u) => {
                      setEquippedFrameConfig(u.equippedFrameConfig ?? null);
                      setEquippedNicknameConfig(u.equippedNicknameConfig ?? null);
                      setIsVip(u.isVip);
                      setVpBalance(u.vpCurrency);
                      const expires =
                        (u as { premiumExpiresAt?: Date | string | null }).premiumExpiresAt ??
                        null;
                      const iso =
                        expires instanceof Date
                          ? expires.toISOString()
                          : typeof expires === 'string'
                            ? expires
                            : null;
                      setPremiumExpiresAt(iso);
                      setIsPremium(
                        isPremiumActive({ isVip: u.isVip, premiumExpiresAt: iso })
                      );
                    })
                    .catch(() => {});
                }}
              />
            </div>

            <button
              aria-label={isLeftMenuOpen ? 'Collapse navigation' : 'Expand navigation'}
              onClick={toggleLeftMenu}
              className={`w-10 h-10 bg-primary hover:bg-primary/90 backdrop-blur-md border border-slate-700/30 rounded-lg flex items-center justify-center transition shadow-lg hover:scale-110 ${
                !isLeftMenuOpen ? 'animate-slow-pulse-horizontal' : ''
              } ${
                isMobile
                  ? `fixed top-1/2 -translate-y-1/2 z-[55] ${isLeftMenuOpen ? 'left-[4.5rem]' : 'left-1'}`
                  : 'absolute -right-5 top-1/2 -translate-y-1/2 z-20'
              }`}
            >
              {isLeftMenuOpen ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {currentPage !== 'lobby' && <HubAnnouncementCarousel />}
            {currentPage !== 'lobby' && hubChrome.showHeader && PAGE_META[currentPage] && (
              <PageBanner
                title={
                  currentPage === 'home'
                    ? homeTitle
                    : PAGE_META[currentPage].title
                }
                subtitle={
                  currentPage === 'home'
                    ? homeSubtitle
                    : PAGE_META[currentPage].subtitle
                }
                toolbar={
                  <HubHeaderToolbar
                    unreadCount={unreadCount}
                    unreadMessages={unreadMessages}
                    currentUserId={user.id}
                    onOpenFriends={() => setIsFriendsSheetOpen(true)}
                    onOpenNotifications={() => navigate('notifications')}
                    onOpenMessages={() => navigate('messages')}
                    onLogout={handleLogout}
                    onOpenProfile={handleViewProfile}
                  />
                }
              />
            )}
            <ScrollArea className="relative z-0 flex-1 min-w-0">
              {renderContent()}
            </ScrollArea>
            {currentPage !== 'lobby' && hubChrome.showFooter && (
              <HubFooter markLogoUrl={logoUrl} onNavigate={navigate} />
            )}
          </div>

          <Sheet open={isFriendsSheetOpen} onOpenChange={setIsFriendsSheetOpen}>
            <SheetContent
              side="bottom"
              className="h-[70vh] sm:h-1/2 bg-slate-900/60 backdrop-blur-md border-t border-slate-700/30 text-white"
            >
              <SheetHeader>
                <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                  <Users /> Friends List
                </SheetTitle>
              </SheetHeader>
              <FriendsList
                onInvite={handleInvite}
                onMessage={(peerId) => handleMessage(peerId)}
              />
            </SheetContent>
          </Sheet>

          {/* Right profile rail */}
          <div className="relative">
            <button
              aria-label={isMenuOpen ? 'Collapse profile menu' : 'Expand profile menu'}
              onClick={toggleRightMenu}
              className={`w-10 h-10 bg-primary hover:bg-primary/90 backdrop-blur-md border border-slate-700/30 rounded-lg flex items-center justify-center transition shadow-lg hover:scale-110 ${
                !isMenuOpen ? 'animate-slow-pulse-horizontal rotate-180' : ''
              } ${
                isMobile
                  ? `fixed top-1/2 -translate-y-1/2 z-[55] ${isMenuOpen ? 'right-72' : 'right-1'}`
                  : 'absolute -left-5 top-1/2 -translate-y-1/2 z-20'
              }`}
            >
              {isMenuOpen ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
            <div
              className={
                isMobile
                  ? `fixed right-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)] z-[50] bg-slate-900/95 backdrop-blur-md border-l border-slate-700/30 overflow-hidden transition-all duration-300 ${
                      isMenuOpen ? 'w-72 translate-x-0 opacity-100' : 'w-72 translate-x-full opacity-0 pointer-events-none'
                    }`
                  : `bg-slate-900/60 backdrop-blur-md border-l border-slate-700/30 transition-all duration-300 ease-in-out overflow-hidden h-full ${
                      isMenuOpen ? 'w-72 sm:w-80' : 'w-0'
                    }`
              }
            >
              <ScrollArea className={`h-full ${isMobile ? 'w-72' : 'w-72 sm:w-80'}`}>
                <div
                  className={`p-4 sm:p-6 ${
                    isMenuOpen ? 'opacity-100' : 'opacity-0'
                  } transition-opacity duration-300`}
                >
                  <div className={isMenuOpen ? 'block' : 'hidden'}>
                    <div className="flex flex-col items-center mb-8 animate-in fade-in duration-500">
                      <div className="relative">
                        {pulsarOn && (
                          <>
                            <span
                              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full border-2 border-emerald-400/50 animate-ping"
                              aria-hidden
                            />
                            <span
                              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full border border-emerald-300/40 animate-pulse"
                              aria-hidden
                            />
                          </>
                        )}
                        <CircularProgress
                          progress={levelProgressPercent}
                          level={level}
                        >
                          <div className="h-24 w-24 overflow-visible relative">
                            <PlayerAvatar
                              src={user.avatarUrl}
                              name={user.username}
                              isVip={isVip}
                              frameConfig={equippedFrameConfig}
                              className="h-full w-full"
                              borderClassName="border-2 border-slate-900"
                              crownClassName="h-7 w-7 -top-1 -right-1"
                            />
                            {pulsarOn && (
                              <span
                                className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-black shadow-md ring-2 ring-slate-900"
                                title="Pulsar anticheat online"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </div>
                        </CircularProgress>
                      </div>
                      {pulsarBanner && (
                        <div className="mt-3 w-full rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-center animate-in fade-in zoom-in duration-300">
                          <p className="text-xs font-black uppercase tracking-wider text-emerald-300">
                            Anticheat Online
                          </p>
                          <p className="text-[10px] text-emerald-200/80">Pulsar active</p>
                        </div>
                      )}
                      <h3
                        className={`text-xl font-bold mt-2 flex items-center justify-center gap-1.5 flex-wrap ${
                          !equippedNicknameConfig
                            ? getRoleTextColorClass(user.role, isVip)
                            : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrentPage('profile')}
                          className="truncate max-w-[10rem] hover:underline underline-offset-2 decoration-primary/60"
                          title="Open your profile"
                        >
                          <NicknameEffectText
                            name={user.username}
                            effect={equippedNicknameConfig}
                          />
                        </button>
                        {isVip && (
                          <Badge className="bg-yellow-500 text-black h-5 px-1.5 text-[10px]">
                            VIP
                          </Badge>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex w-5 h-5 rounded-full bg-[#1b2838] border border-slate-600 items-center justify-center shrink-0 align-middle">
                              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white" aria-hidden>
                                <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.962 20.607 6.59 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.205l-1.837-.76c.331.823 1.023 1.486 1.928 1.761l1.854.766c-.41-.802-.443-1.778-.09-2.767zm11.195-7.695c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.386-.198c0-.986.805-1.787 1.79-1.787.982 0 1.787.801 1.787 1.787s-.805 1.79-1.787 1.79c-.985 0-1.79-.804-1.79-1.79z" />
                              </svg>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Steam confirmed</TooltipContent>
                        </Tooltip>
                        {emailVerified && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex w-5 h-5 rounded-full bg-emerald-600 border border-emerald-400 items-center justify-center shrink-0 align-middle">
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Email confirmed</TooltipContent>
                          </Tooltip>
                        )}
                        {isPremium && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex w-5 h-5 rounded-full bg-amber-500/25 border border-amber-400/70 items-center justify-center shrink-0 align-middle">
                                <Gem className="w-3 h-3 text-amber-300 fill-amber-400/40" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Kilrun Premium</TooltipContent>
                          </Tooltip>
                        )}
                        {pulsarOn && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="relative inline-flex w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/70 items-center justify-center shrink-0 align-middle">
                                <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
                                <ShieldCheck className="w-3 h-3 text-emerald-300 relative" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Pulsar anticheat online</TooltipContent>
                          </Tooltip>
                        )}
                      </h3>
                      <p className="text-xs uppercase tracking-wide text-slate-400 mt-1">
                        {user.role} · Lv {level} · {xpIntoLevel.toLocaleString()}/
                        {xpForNextLevel.toLocaleString()} XP
                      </p>
                      
                      {/* In-Game Progression Card - Collapsible */}
                      <Collapsible className="mt-4" suppressHydrationWarning>
                        <CollapsibleTrigger asChild>
                          <button className="w-full rounded-lg border border-slate-700/30 bg-slate-800/40 hover:bg-slate-800/60 px-3 py-2 text-left transition-colors flex items-center justify-between group">
                            <span className="text-xs font-bold text-orange-300">In-Game Powers</span>
                            <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-data-[state=open]:rotate-90" />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2" suppressHydrationWarning>
                          <GameProgressionCompact userId={user.id} />
                        </CollapsibleContent>
                      </Collapsible>
                      
                      <button
                        type="button"
                        onClick={handleTogglePulsar}
                        className={`mt-3 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          pulsarOn
                            ? 'border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15'
                            : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            <ShieldCheck
                              className={`h-4 w-4 ${pulsarOn ? 'text-emerald-300' : 'text-slate-400'}`}
                            />
                            Pulsar
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wide ${
                              pulsarOn ? 'text-emerald-300' : 'text-slate-500'
                            }`}
                          >
                            {pulsarOn ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {pulsarOn
                            ? 'Anticheat active — press to turn off'
                            : 'Press to activate anticheat'}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage('missions')}
                        className="mt-2 w-full flex items-center gap-2 group text-left"
                        title="Daily missions"
                      >
                        <Progress
                          value={
                            dailyTotal > 0
                              ? Math.round((dailyDone / dailyTotal) * 100)
                              : 0
                          }
                          tone="green"
                          className="h-2 flex-1"
                        />
                        <span className="text-[11px] font-semibold tabular-nums text-emerald-400 shrink-0 group-hover:text-emerald-300">
                          {dailyDone}/{dailyTotal}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!rankedAccess) navigate('premium');
                        }}
                        className={`mt-4 bg-slate-800/50 px-4 py-2 rounded-lg text-center w-full transition-colors ${
                          !rankedAccess
                            ? 'hover:bg-amber-500/10 hover:ring-1 hover:ring-amber-500/40 cursor-pointer'
                            : 'cursor-default'
                        }`}
                        title={
                          rankedAccess
                            ? undefined
                            : 'Unlock Premium to show your KP rank'
                        }
                      >
                        <div className="text-xs text-slate-400">Rank</div>
                        {rankedAccess ? (
                          <RankLabel
                            rank={currentRank}
                            size={18}
                            textClassName="text-lg font-bold"
                            className="justify-center mt-0.5"
                          />
                        ) : (
                          <div className="text-lg font-bold text-amber-300">Go Premium</div>
                        )}
                        {rankedAccess ? (
                          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                            {kp.toLocaleString()} KP
                            {peakRank && peakRank !== currentRank
                              ? ` · Peak ${peakRank}`
                              : ''}
                            {freeRankedWeek && !isPremium ? ' · Free week' : ''}
                          </div>
                        ) : peakRank && peakRank !== 'Unranked' ? (
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-center gap-1">
                            Peak{' '}
                            <RankLabel
                              rank={peakRank}
                              size={12}
                              textClassName="text-[10px] font-semibold"
                            />
                            {peakKp ? ` · ${peakKp.toLocaleString()} KP` : ''}
                          </div>
                        ) : null}
                      </button>
                      <div className="mt-2 text-sm text-slate-300 flex items-center justify-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-yellow-400" />
                        {vpBalance.toLocaleString()} VP
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-700/50 my-6" />

                    <h2 className="text-xl font-bold mb-6 tracking-tight">Shortcuts</h2>
                    <div className="space-y-2">
                      {rightNavItems.map((id) => {
                        const meta = HUB_NAV_CATALOG.find((i) => i.id === id);
                        const Icon = HUB_PAGE_ICONS[id];
                        if (!meta || !Icon) return null;
                        return (
                          <button
                            key={id}
                            onClick={() => navigate(id)}
                            className="w-full flex items-center justify-start px-4 py-3.5 rounded-lg hover:bg-primary/10 transition-all duration-300 text-left group relative overflow-hidden hover:-translate-y-0.5"
                          >
                            <div className="flex items-center space-x-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                              <Icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                              <span className="font-medium group-hover:text-white transition-colors">
                                {meta.label}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={isEmailPromptOpen}
        onOpenChange={(open) => {
          setIsEmailPromptOpen(open);
          if (!open) {
            sessionStorage.setItem('kilrun.emailPromptDismissed', '1');
          }
        }}
      >
        <DialogContent className="bg-slate-900/95 border-slate-700 text-white max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Mail className="w-6 h-6 text-primary" />
              Confirm your email
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              Type your email below. First-time verify unlocks a{' '}
              <span className="text-primary font-semibold">100 VP Welcome Bonus</span>.
            </DialogDescription>
          </DialogHeader>
          <EmailVerificationForm
            compact
            onComplete={() => {
              sessionStorage.setItem('kilrun.emailPromptDismissed', '1');
              setIsEmailPromptOpen(false);
              window.location.reload();
            }}
          />
          <Button
            variant="ghost"
            className="w-full text-slate-400"
            onClick={() => {
              sessionStorage.setItem('kilrun.emailPromptDismissed', '1');
              setIsEmailPromptOpen(false);
            }}
          >
            Later
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isCompetitiveDialogOpen}
        onOpenChange={setIsCompetitiveDialogOpen}
      >
        <AlertDialogContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-2xl">
              <ShieldAlert className="w-6 h-6 text-primary" />
              {competitiveQueue === 'ranked'
                ? 'Ranked Competitive Agreement'
                : 'Competitive Casual Agreement'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-slate-300 space-y-2 text-sm">
                {competitiveQueue === 'ranked' ? (
                  <>
                    <p>
                      You are joining <span className="text-amber-300 font-semibold">Premium Ranked</span>{' '}
                      — KP Elo will move, and this lobby is Premium-only.
                    </p>
                    <p className="text-slate-400 text-xs">
                    Fair play required. Cheating or boosting may result in bans. Pulsar anticheat must stay online.
                  </p>
                  </>
                ) : (
                  <p>
                    Casual Competitive awards XP, VP, KD and achievements —{' '}
                    <span className="font-semibold text-slate-200">your KP rank will not change</span>.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingCompetitiveMode(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleAgreeAndPlay}>
              Agree &amp; Find Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
    </ProfileNavigationProvider>
  );
}
