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
  ShieldCheck,
  Crown,
  Star,
  Bell,
  Mail,
  ShieldAlert,
  Shield,
  CheckCircle2,
} from 'lucide-react';
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
import FriendsList from '@/components/views/friends-list';
import LobbyView from '@/components/views/lobby-view';
import AdminView from '@/components/views/admin-view';
import type { KilrunMode } from '@/components/views/play-view';
import { canAccessAdmin, VIP_UNLOCK_VP_COST } from '@/lib/roles';
import { unlockVipWithVp } from '@/lib/social-actions';
import {
  bootstrapHubProgression,
  getLivePlayerState,
  getSiteSettings,
} from '@/lib/progression-actions';
import { getLevelProgress } from '@/lib/progression';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileNavigationProvider } from '@/components/providers/profile-navigation-context';

import { CircularProgress } from '@/components/ui/circular-progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { EmailVerificationForm } from '@/components/email-verification-form';

export interface SessionPlayer {
  id: string;
  steamId: string;
  username: string;
  avatarUrl: string;
  vpCurrency: number;
  xpProgress: number;
  currentRank: string;
  role: string;
  isVip: boolean;
  bio: string;
  email: string | null;
  emailVerified: boolean;
}

const pageComponents: { [key: string]: React.ComponentType<any> } = {
  home: HomeView,
  store: StoreView,
  community: CommunityView,
  guides: GuidesView,
  leaderboard: LeaderboardView,
  support: SupportView,
  profile: ProfileView,
  play: PlayView,
  missions: MissionsView,
  stats: StatsView,
  badges: BadgesView,
  notifications: NotificationsView,
  messages: MessagesView,
  lobby: LobbyView,
  admin: AdminView,
  'public-profile': PublicProfileView,
};

const VIEWS_NEEDING_USER_ID = new Set([
  'home',
  'profile',
  'stats',
  'missions',
  'messages',
  'notifications',
  'support',
  'store',
  'admin',
  'badges',
]);

export default function GameHubInterface({ user }: { user: SessionPlayer }) {
  const isMobile = useIsMobile();
  // Both rails stay collapsed until the player opens them (esp. important on mobile).
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [isVipDialogOpen, setIsVipDialogOpen] = useState(false);
  const [isFriendsSheetOpen, setIsFriendsSheetOpen] = useState(false);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [previousPage, setPreviousPage] = useState('home');
  const [lobbyMode, setLobbyMode] = useState<KilrunMode | null>(null);
  const [isCompetitiveDialogOpen, setIsCompetitiveDialogOpen] = useState(false);
  const [pendingCompetitiveMode, setPendingCompetitiveMode] = useState<KilrunMode | null>(null);
  const [vpBalance, setVpBalance] = useState(user.vpCurrency);
  const [xpProgress, setXpProgress] = useState(user.xpProgress);
  const [currentRank, setCurrentRank] = useState(user.currentRank);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bgUrl, setBgUrl] = useState('https://i.postimg.cc/tJgX2XgN/bg.png');
  const [logoUrl, setLogoUrl] = useState('');
  const [isVip, setIsVip] = useState(user.isVip);
  const [isEmailPromptOpen, setIsEmailPromptOpen] = useState(false);
  const { toast } = useToast();

  const { level, xpIntoLevel, xpForNextLevel, percent: levelProgressPercent } =
    getLevelProgress(xpProgress);

  useEffect(() => {
    // Keep rails closed whenever we cross into mobile widths.
    if (isMobile) {
      setIsMenuOpen(false);
      setIsLeftMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (user.emailVerified) return;
    const dismissed =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('kilrun.emailPromptDismissed') === '1';
    if (!dismissed) {
      setIsEmailPromptOpen(true);
    }
  }, [user.emailVerified]);

  // Bootstrap missions / login XP and poll live XP bar on the right rail.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [live, settings] = await Promise.all([
          bootstrapHubProgression(),
          getSiteSettings(),
        ]);
        if (cancelled) return;
        setXpProgress(live.xpProgress);
        setVpBalance(live.vpCurrency);
        setCurrentRank(live.currentRank);
        setIsVip(live.isVip);
        setEmailVerified(live.emailVerified);
        setUnreadCount(live.unreadNotifications);
        if (settings.backgroundUrl) setBgUrl(settings.backgroundUrl);
        if (settings.logoUrl) setLogoUrl(settings.logoUrl);
      } catch (err) {
        console.error(err);
      }
    })();

    const poll = setInterval(() => {
      getLivePlayerState()
        .then((live) => {
          if (cancelled) return;
          setXpProgress(live.xpProgress);
          setVpBalance(live.vpCurrency);
          setCurrentRank(live.currentRank);
          setIsVip(live.isVip);
          setEmailVerified(live.emailVerified);
          setUnreadCount(live.unreadNotifications);
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  const navigate = (page: string) => {
    setCurrentPage(page);
    if (isMobile) {
      setIsMenuOpen(false);
      setIsLeftMenuOpen(false);
    }
  };

  const handleInvite = (name: string) => {
    toast({
      title: 'Invite Sent!',
      description: `Your invitation has been sent to ${name}.`,
    });
  };

  const handleViewProfile = (userId: string) => {
    if (currentPage !== 'public-profile') {
      setPreviousPage(currentPage);
    }
    setViewingProfileUserId(userId);
    navigate('public-profile');
  };

  const handleBackFromProfile = () => {
    navigate(previousPage === 'public-profile' ? 'home' : previousPage);
  };

  const handleMessage = (peerId?: string) => {
    setIsFriendsSheetOpen(false);
    navigate('messages');
    if (peerId) {
      // Messages view reads optional peer via sessionStorage for deep-link.
      sessionStorage.setItem('kilrun.messagePeerId', peerId);
    }
  };

  const handlePlay = (mode: KilrunMode) => {
    if (mode === 'competitive') {
      setPendingCompetitiveMode(mode);
      setIsCompetitiveDialogOpen(true);
    } else {
      setLobbyMode(mode);
      navigate('lobby');
    }
  };

  const handleAgreeAndPlay = () => {
    if (pendingCompetitiveMode) {
      setLobbyMode(pendingCompetitiveMode);
      navigate('lobby');
    }
    setIsCompetitiveDialogOpen(false);
    setPendingCompetitiveMode(null);
  };

  const handleCancelLobby = () => {
    setLobbyMode(null);
    navigate('play');
  };

  const handleLaunchGame = () => {
    navigate('play');
  };

  const handleUnlockVip = async () => {
    const result = await unlockVipWithVp();
    if (!result.ok) {
      toast({
        title: 'Not enough VP',
        description: `VIP costs ${VIP_UNLOCK_VP_COST} VP. Play matches to earn more.`,
        variant: 'destructive',
      });
      return;
    }
    setIsVip(true);
    if (!result.already) {
      setVpBalance((v) => v - VIP_UNLOCK_VP_COST);
    }
    setIsVipDialogOpen(false);
    toast({ title: 'VIP unlocked', description: 'Welcome to VIP.' });
  };

  const menuItems = [
    { icon: Store, label: 'Store', page: 'store' },
    { icon: Users, label: 'Community', page: 'community' },
    { icon: BookOpen, label: 'Guides', page: 'guides' },
    { icon: Award, label: 'Leaderboard', page: 'leaderboard' },
    { icon: HelpCircle, label: 'Support', page: 'support' },
    { icon: User, label: 'Profile', page: 'profile' },
  ];

  const handleLogout = () => {
    signOut({ callbackUrl: '/landing' });
  };

  const showAdmin = canAccessAdmin(user.role);

  const renderContent = () => {
    if (currentPage === 'admin' && !showAdmin) {
      return (
        <div className="p-6 text-center text-slate-300">
          Staff access required.
        </div>
      );
    }

    const PageComponent = pageComponents[currentPage];
    if (PageComponent) {
      let props: any = {};
      if (currentPage === 'play') {
        props.onPlay = handlePlay;
      } else if (currentPage === 'home') {
        props.onLaunchGame = handleLaunchGame;
        props.vpCurrency = vpBalance;
      } else if (currentPage === 'lobby' && lobbyMode) {
        props = {
          mode: lobbyMode,
          onCancel: handleCancelLobby,
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        };
      } else if (currentPage === 'messages') {
        props.userId = user.id;
      } else if (currentPage === 'public-profile') {
        if (!viewingProfileUserId) {
          navigate(previousPage);
          return null;
        }
        props = {
          userId: viewingProfileUserId,
          onMessage: (peerId: string) => handleMessage(peerId),
          onBack: handleBackFromProfile,
        };
      }

      if (VIEWS_NEEDING_USER_ID.has(currentPage)) {
        props.userId = user.id;
      }

      if (currentPage === 'lobby' && !lobbyMode) {
        navigate('play');
        return <PlayView onPlay={handlePlay} />;
      }

      return <PageComponent {...props} />;
    }
    return (
      <HomeView
        onLaunchGame={handleLaunchGame}
        userId={user.id}
        vpCurrency={vpBalance}
      />
    );
  };

  const NavButton = ({
    icon: Icon,
    label,
    page,
    glow = false,
  }: {
    icon: any;
    label: string;
    page: string;
    glow?: boolean;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => navigate(page)}
          className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 hover:bg-primary/20 shrink-0 group ${
            currentPage === page || (page === 'play' && currentPage === 'lobby')
              ? 'bg-primary/20 text-primary shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'text-slate-400 hover:text-primary'
          } ${glow ? 'bg-primary/10 text-primary border border-primary/20' : ''}`}
        >
          <Icon
            className={`w-6 h-6 transition-colors duration-300 ${
              currentPage === page ? 'text-primary' : 'group-hover:text-primary'
            }`}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <ProfileNavigationProvider value={{ openProfile: handleViewProfile }}>
    <TooltipProvider>
      <div className="min-h-screen text-white relative overflow-hidden">
        <div className="fixed inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/85" />
        </div>

        <div className="relative z-10 flex h-screen">
          <div
            className={`relative h-full transition-all duration-300 ease-in-out ${
              isLeftMenuOpen ? 'w-20 sm:w-24' : 'w-0'
            }`}
          >
            <div
              className={`w-20 sm:w-24 bg-slate-900/60 backdrop-blur-md flex flex-col items-center py-6 space-y-4 border-r border-slate-700/30 h-full overflow-hidden transition-opacity duration-300 ${
                isLeftMenuOpen ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 bg-primary rounded-xl flex items-center justify-center mb-4 sm:mb-6 shadow-lg cursor-pointer hover:bg-primary/90 transition shrink-0 hover:scale-110 active:scale-95 duration-300 overflow-hidden"
                onClick={() => navigate('home')}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-2xl font-bold">K</div>
                )}
              </div>

              <NavButton icon={Home} label="Home" page="home" />
              <NavButton icon={Play} label="Play" page="play" />
              <NavButton icon={CheckSquare} label="Missions" page="missions" />
              <NavButton icon={Trophy} label="Leaderboard" page="leaderboard" />
              <NavButton icon={BarChart3} label="Stats" page="stats" />
              <NavButton icon={ShieldCheck} label="Badges" page="badges" />

              <div className="my-2 w-3/4 h-px bg-slate-700/50 shrink-0" />

              <div className="relative shrink-0">
                <NavButton icon={Bell} label="Notifications" page="notifications" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center pointer-events-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <NavButton icon={Mail} label="Messages" page="messages" />

              <Dialog open={isVipDialogOpen} onOpenChange={setIsVipDialogOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <button className="w-12 h-12 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all duration-300 hover:scale-110 hover:-translate-y-1 flex items-center justify-center relative shrink-0 shadow-[0_0_10px_rgba(239,68,68,0.1)] group">
                        <Crown className="w-6 h-6 transition-transform group-hover:rotate-12" />
                      </button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{isVip ? 'VIP Active' : 'Unlock VIP'}</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white max-w-md mx-4">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-primary flex items-center gap-2">
                      <Crown className="w-6 h-6" />
                      {isVip ? 'VIP Active' : 'Unlock VIP Access'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-300">
                      {isVip
                        ? 'You already have VIP perks on this account.'
                        : `Spend ${VIP_UNLOCK_VP_COST} VP (balance: ${vpBalance}) for exclusive perks.`}
                    </DialogDescription>
                  </DialogHeader>
                  {!isVip && (
                    <div className="py-4 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-700/50 rounded-lg">
                          <Star className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-bold">Exclusive VIP Badge</h4>
                          <p className="text-sm text-slate-400">
                            Show off your status next to your name.
                          </p>
                        </div>
                      </div>
                      <Button size="lg" className="w-full text-lg" onClick={handleUnlockVip}>
                        Unlock for {VIP_UNLOCK_VP_COST} VP
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <div className="flex-1 shrink-0" />

              {showAdmin && <NavButton icon={Shield} label="Admin Panel" page="admin" />}

              <Sheet open={isFriendsSheetOpen} onOpenChange={setIsFriendsSheetOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SheetTrigger asChild>
                      <button
                        className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 hover:bg-primary/20 shrink-0 group ${
                          isFriendsSheetOpen
                            ? 'bg-primary/20 text-primary'
                            : 'text-slate-400 hover:text-primary'
                        }`}
                      >
                        <Users className="w-5 h-5 group-hover:text-primary transition-colors" />
                      </button>
                    </SheetTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Friends</p>
                  </TooltipContent>
                </Tooltip>
                <SheetContent
                  side="bottom"
                  className="h-[70vh] sm:h-1/2 bg-slate-900/80 backdrop-blur-md border-t border-slate-700 text-white"
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
            </div>

            <button
              aria-label={isLeftMenuOpen ? 'Collapse navigation' : 'Expand navigation'}
              onClick={() => setIsLeftMenuOpen(!isLeftMenuOpen)}
              className={`absolute -right-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary hover:bg-primary/90 backdrop-blur-md border border-slate-700/30 rounded-lg flex items-center justify-center transition shadow-lg z-20 hover:scale-110 ${
                !isLeftMenuOpen ? 'animate-slow-pulse-horizontal' : ''
              }`}
            >
              {isLeftMenuOpen ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          </div>

          <ScrollArea className="flex-1 min-w-0">{renderContent()}</ScrollArea>

          <div className="relative">
            <button
              aria-label={isMenuOpen ? 'Collapse profile menu' : 'Expand profile menu'}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`absolute -left-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary hover:bg-primary/90 backdrop-blur-md border border-slate-700/30 rounded-lg flex items-center justify-center transition shadow-lg z-20 hover:scale-110 ${
                !isMenuOpen ? 'animate-slow-pulse-horizontal rotate-180' : ''
              }`}
            >
              {isMenuOpen ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
            <div
              className={`bg-slate-900/60 backdrop-blur-md border-l border-slate-700/30 transition-all duration-300 ease-in-out overflow-hidden h-full ${
                isMenuOpen ? 'w-72 sm:w-80' : 'w-0'
              }`}
            >
              <ScrollArea className="h-full w-72 sm:w-80">
                <div
                  className={`p-4 sm:p-6 ${
                    isMenuOpen ? 'opacity-100' : 'opacity-0'
                  } transition-opacity duration-300`}
                >
                  <div className={isMenuOpen ? 'block' : 'hidden'}>
                    <div className="flex flex-col items-center mb-8 animate-in fade-in duration-500">
                      <div className="relative">
                        <CircularProgress
                          progress={levelProgressPercent}
                          level={level}
                        >
                          <Avatar className="h-28 w-28 border-4 border-slate-800">
                            <AvatarImage src={user.avatarUrl} alt={user.username} />
                            <AvatarFallback>{user.username.charAt(0)}</AvatarFallback>
                          </Avatar>
                        </CircularProgress>
                        <div className="absolute top-1 right-1 flex flex-col gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="w-6 h-6 rounded-full bg-[#1b2838] border border-slate-600 flex items-center justify-center shadow">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white" aria-hidden>
                                  <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.962 20.607 6.59 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.205l-1.837-.76c.331.823 1.023 1.486 1.928 1.761l1.854.766c-.41-.802-.443-1.778-.09-2.767zm11.195-7.695c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.386-.198c0-.986.805-1.787 1.79-1.787.982 0 1.787.801 1.787 1.787s-.805 1.79-1.787 1.79c-.985 0-1.79-.804-1.79-1.79z" />
                                </svg>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Steam confirmed</TooltipContent>
                          </Tooltip>
                          {emailVerified && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="w-6 h-6 rounded-full bg-emerald-600 border border-emerald-400 flex items-center justify-center shadow">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Email confirmed</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <h3 className="text-xl font-bold mt-4 pt-4 flex items-center gap-2">
                        {user.username}
                        {isVip && <Badge className="bg-yellow-500 text-black">VIP</Badge>}
                      </h3>
                      <p className="text-xs uppercase tracking-wide text-slate-400 mt-1">
                        {user.role} · Lv {level} · {xpIntoLevel.toLocaleString()}/
                        {xpForNextLevel.toLocaleString()} XP
                      </p>
                      <div className="mt-4 bg-slate-800/50 px-4 py-2 rounded-lg text-center w-full">
                        <div className="text-xs text-slate-400">Rank</div>
                        <div className="text-lg font-bold text-yellow-400">
                          {currentRank}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">{vpBalance} VP</div>
                    </div>

                    <div className="w-full h-px bg-slate-700/50 my-6" />

                    <h2 className="text-xl font-bold mb-6 tracking-tight">Shortcuts</h2>
                    <div className="space-y-2">
                      {menuItems.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => item.page && navigate(item.page)}
                          className="w-full flex items-center justify-start px-4 py-3.5 rounded-lg hover:bg-primary/10 transition-all duration-300 text-left group relative overflow-hidden hover:-translate-y-0.5"
                        >
                          <div className="flex items-center space-x-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                            <item.icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                            <span className="font-medium group-hover:text-white transition-colors">
                              {item.label}
                            </span>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-start px-4 py-3.5 rounded-lg hover:bg-destructive/10 transition-all duration-300 text-left group relative overflow-hidden hover:-translate-y-0.5"
                      >
                        <div className="flex items-center space-x-4 relative z-10">
                          <ShieldAlert className="w-5 h-5 text-slate-400 group-hover:text-destructive transition-colors" />
                          <span className="font-medium group-hover:text-destructive transition-colors">
                            Log Out
                          </span>
                        </div>
                      </button>
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
              Competitive Play Agreement
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-slate-300">
                You are about to enter a competitive match.
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
