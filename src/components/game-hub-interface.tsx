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
  type LucideIcon,
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
import PremiumView from '@/components/views/premium-view';
import type { KilrunMode, CompetitiveQueue } from '@/components/views/play-view';
import { canAccessAdmin, VIP_UNLOCK_VP_COST, isPremiumActive } from '@/lib/roles';
import { unlockVipWithVp } from '@/lib/social-actions';
import { isPulsarActive, setPulsarActive } from '@/lib/pulsar-anticheat';
import {
  bootstrapHubProgression,
  getLivePlayerState,
  getSiteSettings,
} from '@/lib/progression-actions';
import { getLevelProgress } from '@/lib/progression';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileNavigationProvider } from '@/components/providers/profile-navigation-context';
import { InventoryDrawer } from '@/components/inventory-drawer';
import { getRoleTextColorClass } from '@/lib/role-colors';
import { PageBanner, PAGE_META } from '@/components/page-banner';
import { HubHeaderToolbar } from '@/components/hub-header-toolbar';
import { HubFooter } from '@/components/hub-footer';
import { resolveHubBackground, resolveMarkLogo } from '@/lib/branding';
import { onSiteSettingsUpdated } from '@/lib/site-branding-events';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
  /** Killrun Points — competitive Elo. */
  kp?: number;
  role: string;
  isVip: boolean;
  isPremium?: boolean;
  premiumExpiresAt?: string | null;
  bio: string;
  email: string | null;
  emailVerified: boolean;
  equippedFrameConfig?: unknown | null;
  equippedNicknameConfig?: unknown | null;
}

const HUB_PAGE_ICONS: Record<HubPageId, LucideIcon> = {
  home: Home,
  play: Play,
  missions: CheckSquare,
  leaderboard: Trophy,
  stats: BarChart3,
  store: Store,
  premium: Gem,
  badges: Award,
  community: Users,
  guides: BookOpen,
  support: HelpCircle,
  profile: User,
  notifications: Bell,
  messages: Mail,
};

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
  premium: PremiumView,
  lobby: LobbyView,
  admin: AdminView,
  'public-profile': PublicProfileView,
};

const VIEWS_NEEDING_USER_ID = new Set([
  'home',
  'profile',
  'stats',
  'leaderboard',
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
  const [pulsarOn, setPulsarOn] = useState(false);
  const [pulsarBanner, setPulsarBanner] = useState(false);
  const [isFriendsSheetOpen, setIsFriendsSheetOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [previousPage, setPreviousPage] = useState('home');
  const [lobbyMode, setLobbyMode] = useState<KilrunMode | null>(null);
  const [competitiveQueue, setCompetitiveQueue] = useState<CompetitiveQueue>('casual');
  const [isCompetitiveDialogOpen, setIsCompetitiveDialogOpen] = useState(false);
  const [pendingCompetitiveMode, setPendingCompetitiveMode] = useState<KilrunMode | null>(null);
  const [vpBalance, setVpBalance] = useState(user.vpCurrency);
  const [xpProgress, setXpProgress] = useState(user.xpProgress);
  const [dailyDone, setDailyDone] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(5);
  const [currentRank, setCurrentRank] = useState(user.currentRank);
  const [kp, setKp] = useState(user.kp ?? 1000);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [bgUrl, setBgUrl] = useState(resolveHubBackground());
  /** Raw SiteSettings values — resolve*() only at render so admin always wins. */
  const [logoUrl, setLogoUrl] = useState('');
  const [headerLogoUrl, setHeaderLogoUrl] = useState('');
  const [headerLogoStyle, setHeaderLogoStyle] = useState('');
  const [homeHeroImage, setHomeHeroImage] = useState('');
  const [isVip, setIsVip] = useState(user.isVip);
  const [isPremium, setIsPremium] = useState(
    user.isPremium ??
      isPremiumActive({ isVip: user.isVip, premiumExpiresAt: user.premiumExpiresAt })
  );
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(
    user.premiumExpiresAt ?? null
  );
  const [rankedAccess, setRankedAccess] = useState(
    !!(
      user.isPremium ??
      isPremiumActive({ isVip: user.isVip, premiumExpiresAt: user.premiumExpiresAt })
    )
  );
  const [freeRankedWeek, setFreeRankedWeek] = useState(false);
  const [peakRank, setPeakRank] = useState('Unranked');
  const [peakKp, setPeakKp] = useState(user.kp ?? 1000);
  const [equippedFrameConfig, setEquippedFrameConfig] = useState<unknown | null>(
    user.equippedFrameConfig ?? null
  );
  const [equippedNicknameConfig, setEquippedNicknameConfig] = useState<unknown | null>(
    user.equippedNicknameConfig ?? null
  );
  const [isEmailPromptOpen, setIsEmailPromptOpen] = useState(false);
  const [homeTitle, setHomeTitle] = useState(PAGE_META.home.title);
  const [homeSubtitle, setHomeSubtitle] = useState(PAGE_META.home.subtitle);
  const [hubPages, setHubPages] = useState<HubPagesConfig>(() => defaultHubPages());
  const [hubNav, setHubNav] = useState<HubNavLayout>(() => defaultHubNav());
  const [hubChrome, setHubChrome] = useState<HubChromeConfig>(() => defaultHubChrome());
  const { toast } = useToast();

  const showAdmin = canAccessAdmin(user.role);
  const isStaff = showAdmin;

  const applyLayoutFromSettings = (settings: {
    hubPagesJson?: string | null;
    hubNavJson?: string | null;
    hubChromeJson?: string | null;
  }) => {
    if (settings.hubPagesJson !== undefined && settings.hubPagesJson !== null) {
      setHubPages(parseHubPages(settings.hubPagesJson));
    }
    if (settings.hubNavJson !== undefined && settings.hubNavJson !== null) {
      setHubNav(parseHubNav(settings.hubNavJson));
    }
    if (settings.hubChromeJson !== undefined && settings.hubChromeJson !== null) {
      setHubChrome(parseHubChrome(settings.hubChromeJson));
    }
  };

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
    setPulsarOn(isPulsarActive());
  }, []);

  // Refresh equipped cosmetics when opening the right profile rail
  useEffect(() => {
    if (!isMenuOpen) return;
    getLivePlayerState(user.id)
      .then((live) => {
        setVpBalance(live.vpCurrency);
        setXpProgress(live.xpProgress);
        setCurrentRank(live.currentRank);
        if (typeof live.kp === 'number') setKp(live.kp);
        setIsVip(live.isVip);
        setIsPremium(!!live.isPremium);
        setPremiumExpiresAt(live.premiumExpiresAt ?? null);
        setRankedAccess(!!(live.rankedAccess ?? live.isPremium));
        setFreeRankedWeek(!!live.freeRankedWeek);
        if (typeof live.peakKp === 'number') setPeakKp(live.peakKp);
        if (typeof live.peakRank === 'string') setPeakRank(live.peakRank);
        setEmailVerified(live.emailVerified);
      })
      .catch(() => {});
    getCurrentUserProfile()
      .then((u) => {
        setEquippedFrameConfig(u.equippedFrameConfig ?? null);
        setEquippedNicknameConfig(u.equippedNicknameConfig ?? null);
      })
      .catch(() => {});
  }, [isMenuOpen, user.id]);

  useEffect(() => {
    if (user.emailVerified) return;
    const dismissed =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('kilrun.emailPromptDismissed') === '1';
    if (!dismissed) {
      setIsEmailPromptOpen(true);
    }
  }, [user.emailVerified]);

  // Bootstrap once; poll rail state slowly and only while the tab is visible.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const applyLive = (live: Awaited<ReturnType<typeof getLivePlayerState>>) => {
      if (cancelled) return;
      setXpProgress(live.xpProgress);
      setVpBalance(live.vpCurrency);
      setCurrentRank(live.currentRank);
      if (typeof live.kp === 'number') setKp(live.kp);
      setIsVip(live.isVip);
      setIsPremium(!!live.isPremium);
      setPremiumExpiresAt(live.premiumExpiresAt ?? null);
      setRankedAccess(!!(live.rankedAccess ?? live.isPremium));
      setFreeRankedWeek(!!live.freeRankedWeek);
      if (typeof live.peakKp === 'number') setPeakKp(live.peakKp);
      if (typeof live.peakRank === 'string') setPeakRank(live.peakRank);
      setEmailVerified(live.emailVerified);
      setUnreadCount(live.unreadNotifications);
      if (typeof live.unreadMessages === 'number') {
        setUnreadMessages(live.unreadMessages);
      }
      if (typeof live.dailyMissionsCompleted === 'number') {
        setDailyDone(live.dailyMissionsCompleted);
      }
      if (typeof live.dailyMissionsTotal === 'number') {
        setDailyTotal(live.dailyMissionsTotal);
      }
    };

    (async () => {
      try {
        const [live, settings] = await Promise.all([
          bootstrapHubProgression(),
          getSiteSettings(),
        ]);
        if (cancelled) return;
        applyLive(live);
        setBgUrl(resolveHubBackground(settings.backgroundUrl));
        setLogoUrl(settings.logoUrl ?? '');
        setHeaderLogoUrl(settings.headerLogoUrl ?? '');
        setHeaderLogoStyle(
          (settings as { headerLogoStyle?: string }).headerLogoStyle ?? ''
        );
        setHomeHeroImage(settings.homeHeroImage ?? '');
        if (settings.headerTitle) setHomeTitle(settings.headerTitle);
        if (settings.headerSubtitle) setHomeSubtitle(settings.headerSubtitle);
        applyLayoutFromSettings(settings as {
          hubPagesJson?: string;
          hubNavJson?: string;
          hubChromeJson?: string;
        });
      } catch (err) {
        console.error(err);
      }
    })();

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      getLivePlayerState(user.id).then(applyLive).catch(() => {});
    };

    poll = setInterval(tick, 30000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user.id]);

  // Admin "Save site settings" broadcasts — apply logos immediately (no reload).
  useEffect(() => {
    return onSiteSettingsUpdated((s) => {
      if (s.backgroundUrl !== undefined) {
        setBgUrl(resolveHubBackground(s.backgroundUrl));
      }
      if (s.logoUrl !== undefined) setLogoUrl(s.logoUrl ?? '');
      if (s.headerLogoUrl !== undefined) setHeaderLogoUrl(s.headerLogoUrl ?? '');
      if (s.headerLogoStyle !== undefined) {
        setHeaderLogoStyle(s.headerLogoStyle ?? '');
      }
      if (s.homeHeroImage !== undefined) {
        setHomeHeroImage(s.homeHeroImage ?? '');
      }
      if (s.headerTitle) setHomeTitle(s.headerTitle);
      if (s.headerSubtitle) setHomeSubtitle(s.headerSubtitle);
      applyLayoutFromSettings(s);
    });
  }, []);

  const navigate = (page: string) => {
    if (!isHubPageEnabled(hubPages, page, isStaff)) {
      toast({
        title: 'Page unavailable',
        description: 'This section is temporarily disabled.',
        variant: 'destructive',
      });
      return;
    }
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

  const handlePlay = (
    mode: KilrunMode,
    opts?: { competitiveQueue?: CompetitiveQueue }
  ) => {
    if (mode === 'competitive') {
      const queue = opts?.competitiveQueue ?? 'casual';
      if (queue === 'ranked' && !rankedAccess) {
        navigate('premium');
        return;
      }
      setCompetitiveQueue(queue);
      setPendingCompetitiveMode(mode);
      setIsCompetitiveDialogOpen(true);
    } else {
      setCompetitiveQueue('casual');
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
    setCompetitiveQueue('casual');
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

  const handleTogglePulsar = () => {
    const next = !pulsarOn;
    setPulsarOn(next);
    setPulsarActive(next);
    if (next) {
      setPulsarBanner(true);
      window.setTimeout(() => setPulsarBanner(false), 2200);
      toast({
        title: 'Anticheat Online',
        description: 'Pulsar is active on your session.',
      });
    } else {
      toast({
        title: 'Pulsar offline',
        description: 'Anticheat deactivated.',
      });
    }
  };

  const handleLogout = () => {
    signOut({ callbackUrl: '/landing' });
  };

  const leftNavItems = hubNav.left.filter(
    (id) => isStaff || hubPages[id] !== false
  );
  const rightNavItems = hubNav.right.filter(
    (id) => isStaff || hubPages[id] !== false
  );

  const renderContent = () => {
    if (currentPage === 'admin' && !showAdmin) {
      return (
        <div className="p-6 text-center text-slate-300">
          Staff access required.
        </div>
      );
    }

    if (!isHubPageEnabled(hubPages, currentPage, isStaff)) {
      return (
        <div className="p-10 text-center space-y-2">
          <p className="text-xl font-bold text-white">Page unavailable</p>
          <p className="text-slate-400 text-sm">
            This section is temporarily disabled by an admin.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('home')}>
            Back to Home
          </Button>
        </div>
      );
    }

    const PageComponent = pageComponents[currentPage];
    if (PageComponent) {
      let props: any = {};
      if (currentPage === 'play') {
        props.onPlay = handlePlay;
        props.isPremium = isPremium;
        props.rankedAccess = rankedAccess;
        props.freeRankedWeek = freeRankedWeek;
        props.onOpenPremium = () => navigate('premium');
      } else if (currentPage === 'premium') {
        props.vpBalance = vpBalance;
        props.isVip = isVip;
        props.premiumExpiresAt = premiumExpiresAt;
        props.currentRank = isPremium ? currentRank : undefined;
        props.peakRank = peakRank;
        props.kp = kp;
        props.onPurchased = (next: { vpBalance: number; premiumExpiresAt: string }) => {
          setVpBalance(next.vpBalance);
          setPremiumExpiresAt(next.premiumExpiresAt);
          setIsPremium(true);
          setRankedAccess(true);
          getLivePlayerState(user.id)
            .then((live) => {
              setCurrentRank(live.currentRank);
              if (typeof live.kp === 'number') setKp(live.kp);
              if (typeof live.peakRank === 'string') setPeakRank(live.peakRank);
              if (typeof live.peakKp === 'number') setPeakKp(live.peakKp);
            })
            .catch(() => {});
        };
        props.onGoRanked = () =>
          handlePlay('competitive', { competitiveQueue: 'ranked' });
      } else if (currentPage === 'home') {
        props.onLaunchGame = handleLaunchGame;
        props.onNavigate = navigate;
        props.vpCurrency = vpBalance;
        // Pass raw SiteSettings values — HomeView resolves + re-fetches admin truth.
        props.headerLogoUrl = headerLogoUrl;
        props.headerLogoStyle = headerLogoStyle;
        props.homeHeroImage = homeHeroImage;
      } else if (currentPage === 'lobby' && lobbyMode) {
        props = {
          mode: lobbyMode,
          onCancel: handleCancelLobby,
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          xpProgress,
          isAdmin: showAdmin,
          kp,
          isPremium: rankedAccess,
          competitiveQueue: lobbyMode === 'competitive' ? competitiveQueue : 'casual',
        };
      } else if (currentPage === 'messages') {
        props.userId = user.id;
      } else if (currentPage === 'admin') {
        props.viewerRole = user.role;
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
        return (
          <PlayView
            onPlay={handlePlay}
            isPremium={isPremium}
            rankedAccess={rankedAccess}
            freeRankedWeek={freeRankedWeek}
            onOpenPremium={() => navigate('premium')}
          />
        );
      }

      return <PageComponent {...props} />;
    }
    return (
      <HomeView
        onLaunchGame={handleLaunchGame}
        onNavigate={navigate}
        userId={user.id}
        vpCurrency={vpBalance}
        headerLogoUrl={headerLogoUrl}
        headerLogoStyle={headerLogoStyle}
        homeHeroImage={homeHeroImage}
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

  // Fullscreen match: no hub rails / collapsible menus behind the game.
  if (currentPage === 'lobby' && lobbyMode) {
    return (
      <ProfileNavigationProvider value={{ openProfile: handleViewProfile }}>
        <LobbyView
          mode={lobbyMode}
          onCancel={handleCancelLobby}
          userId={user.id}
          username={user.username}
          avatarUrl={user.avatarUrl}
          xpProgress={xpProgress}
          isAdmin={showAdmin}
          kp={kp}
          isPremium={rankedAccess}
          competitiveQueue={lobbyMode === 'competitive' ? competitiveQueue : 'casual'}
        />
      </ProfileNavigationProvider>
    );
  }

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
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-4 sm:mb-6 cursor-pointer transition shrink-0 hover:scale-110 active:scale-95 duration-300 overflow-hidden bg-transparent shadow-none hover:bg-white/5"
                onClick={() => navigate('home')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveMarkLogo(logoUrl)}
                  alt="Kilrun"
                  className="w-full h-full object-contain p-0.5"
                />
              </div>

              <NavButton icon={Home} label="Home" page="home" />
              {leftNavItems
                .filter((id) => id !== 'home')
                .map((id) => {
                  const meta = HUB_NAV_CATALOG.find((i) => i.id === id);
                  const Icon = HUB_PAGE_ICONS[id];
                  if (!meta || !Icon) return null;
                  return (
                    <NavButton key={id} icon={Icon} label={meta.label} page={id} />
                  );
                })}

              <div className="my-2 w-3/4 h-px bg-slate-700/50 shrink-0" />

              <Dialog open={isVipDialogOpen} onOpenChange={setIsVipDialogOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setIsVipDialogOpen(true)}
                      className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 shrink-0 group relative ${
                        isVip
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
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
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                        : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20'
                    }`}
                  >
                    <Gem className="w-6 h-6 transition-transform group-hover:rotate-12" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isPremium ? 'Premium Active' : 'Go Premium'}</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex-1 shrink-0" />

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

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
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
              <HubFooter markLogoUrl={logoUrl} />
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
                        {isPremium && (
                          <Badge className="bg-amber-500 text-black h-5 px-1.5 text-[10px]">
                            Premium
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
                              <span className="inline-flex w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/60 items-center justify-center shrink-0 align-middle">
                                <Gem className="w-3 h-3 text-amber-300" />
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
                          if (!isPremium) navigate('premium');
                        }}
                        className={`mt-4 bg-slate-800/50 px-4 py-2 rounded-lg text-center w-full transition-colors ${
                          !isPremium
                            ? 'hover:bg-amber-500/10 hover:ring-1 hover:ring-amber-500/40 cursor-pointer'
                            : 'cursor-default'
                        }`}
                        title={isPremium ? undefined : 'Unlock Premium to show your KP rank'}
                      >
                        <div className="text-xs text-slate-400">Rank</div>
                        <div
                          className={`text-lg font-bold ${
                            isPremium ? 'text-yellow-400' : 'text-amber-300'
                          }`}
                        >
                          {isPremium ? currentRank : 'Go Premium'}
                        </div>
                        {isPremium ? (
                          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                            {kp.toLocaleString()} KP
                            {peakRank && peakRank !== currentRank
                              ? ` · Peak ${peakRank}`
                              : ''}
                          </div>
                        ) : peakRank && peakRank !== 'Unranked' ? (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Peak {peakRank}
                            {peakKp ? ` · ${peakKp.toLocaleString()} KP` : ''}
                          </div>
                        ) : null}
                      </button>
                      <div className="mt-2 text-sm text-slate-300">{vpBalance} VP</div>
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
                      Fair play required. Cheating or boosting may result in bans.
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
