'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
import FriendsList, { type Player } from '@/components/views/friends-list';
import LobbyView from '@/components/views/lobby-view';
import AdminView from '@/components/views/admin-view';
import type { KilrunMode } from '@/components/views/play-view';

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

export interface SessionPlayer {
  id: string;
  steamId: string;
  username: string;
  avatarUrl: string;
  vpCurrency: number;
  xpProgress: number;
  currentRank: string;
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
};

// Views that read live telemetry from Prisma need to know which player to query for.
const VIEWS_NEEDING_USER_ID = new Set(['home', 'profile', 'stats', 'missions']);

export default function GameHubInterface({ user }: { user: SessionPlayer }) {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('home');
  const [isVipDialogOpen, setIsVipDialogOpen] = useState(false);
  const [isFriendsSheetOpen, setIsFriendsSheetOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Player | null>(null);
  const [lobbyMode, setLobbyMode] = useState<KilrunMode | null>(null);
  const [isCompetitiveDialogOpen, setIsCompetitiveDialogOpen] = useState(false);
  const [pendingCompetitiveMode, setPendingCompetitiveMode] = useState<KilrunMode | null>(null);
  const { toast } = useToast();

  const handleInvite = (name: string) => {
    toast({
      title: 'Invite Sent!',
      description: `Your invitation has been sent to ${name}.`,
    });
  };

  const handleViewProfile = (player: Player) => {
    setSelectedProfile(player);
    setIsProfileDialogOpen(true);
  };

  const handleMessage = () => {
    setIsFriendsSheetOpen(false);
    setCurrentPage('messages');
  };

  const handlePlay = (mode: KilrunMode) => {
    if (mode === 'competitive') {
      setPendingCompetitiveMode(mode);
      setIsCompetitiveDialogOpen(true);
    } else {
      setLobbyMode(mode);
      setCurrentPage('lobby');
    }
  };

  const handleAgreeAndPlay = () => {
    if (pendingCompetitiveMode) {
      setLobbyMode(pendingCompetitiveMode);
      setCurrentPage('lobby');
    }
    setIsCompetitiveDialogOpen(false);
    setPendingCompetitiveMode(null);
  };

  const handleCancelLobby = () => {
    setLobbyMode(null);
    setCurrentPage('play');
  };

  const handleLaunchGame = () => {
    setCurrentPage('play');
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

  const renderContent = () => {
    const PageComponent = pageComponents[currentPage];
    if (PageComponent) {
      let props: any = {};
      if (currentPage === 'leaderboard') {
        props.onViewProfile = handleViewProfile;
      } else if (currentPage === 'play') {
        props.onPlay = handlePlay;
      } else if (currentPage === 'home') {
        props.onLaunchGame = handleLaunchGame;
        props.vpCurrency = user.vpCurrency;
      } else if (currentPage === 'lobby' && lobbyMode) {
        props = {
          mode: lobbyMode,
          onCancel: handleCancelLobby,
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        };
      }

      if (VIEWS_NEEDING_USER_ID.has(currentPage)) {
        props.userId = user.id;
      }

      if (currentPage === 'lobby' && !lobbyMode) {
        setCurrentPage('play');
        return <PlayView onPlay={handlePlay} />;
      }

      return <PageComponent {...props} />;
    }
    return <HomeView onLaunchGame={handleLaunchGame} userId={user.id} vpCurrency={user.vpCurrency} />;
  };

  const NavButton = ({ icon: Icon, label, page, glow = false }: { icon: any, label: string, page: string, glow?: boolean }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setCurrentPage(page)}
          className={`w-12 h-12 rounded-lg transition-all duration-300 flex items-center justify-center hover:scale-110 hover:-translate-y-1 hover:bg-primary/20 shrink-0 group ${
            currentPage === page || (page === 'play' && currentPage === 'lobby')
              ? 'bg-primary/20 text-primary shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'text-slate-400 hover:text-primary'
          } ${glow ? 'bg-primary/10 text-primary border border-primary/20' : ''}`}
        >
          <Icon className={`w-6 h-6 transition-colors duration-300 ${currentPage === page ? 'text-primary' : 'group-hover:text-primary'}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen text-white relative overflow-hidden">
        <div className="fixed inset-0 z-0">
          <Image
            src="https://i.postimg.cc/tJgX2XgN/bg.png"
            alt="App background"
            fill
            priority
            sizes="100vw"
            className="object-cover"
            data-ai-hint="futuristic game background"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-slate-900/85" />
        </div>

        <div className="relative z-10 flex h-screen">
          <div className={`relative h-full transition-all duration-300 ease-in-out ${isLeftMenuOpen ? 'w-24' : 'w-0'}`}>
            <div className={`w-24 bg-slate-900/60 backdrop-blur-md flex flex-col items-center py-6 space-y-4 border-r border-slate-700/30 h-full overflow-hidden transition-opacity duration-300 ${isLeftMenuOpen ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center mb-6 shadow-lg cursor-pointer hover:bg-primary/90 transition shrink-0 hover:scale-110 active:scale-95 duration-300" onClick={() => setCurrentPage('home')}>
                <div className="text-2xl font-bold">K</div>
              </div>

              <NavButton icon={Home} label="Home" page="home" />
              <NavButton icon={Play} label="Play" page="play" />
              <NavButton icon={CheckSquare} label="Missions" page="missions" />
              <NavButton icon={Trophy} label="Leaderboard" page="leaderboard" />
              <NavButton icon={BarChart3} label="Stats" page="stats" />
              <NavButton icon={ShieldCheck} label="Badges" page="badges" />

              <div className="my-2 w-3/4 h-px bg-slate-700/50 shrink-0" />

              <NavButton icon={Bell} label="Notifications" page="notifications" />
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
                    <p>Unlock VIP</p>
                  </TooltipContent>
                </Tooltip>
                <DialogContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-primary flex items-center gap-2">
                      <Crown className="w-6 h-6" />
                      Unlock VIP Access
                    </DialogTitle>
                    <DialogDescription className="text-slate-300">
                      Get exclusive perks and stand out from the crowd.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-700/50 rounded-lg">
                        <Star className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold">Exclusive VIP Badge</h4>
                        <p className="text-sm text-slate-400">
                          Show off your status with a unique badge next to your
                          name.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <Button size="lg" className="w-full text-lg">
                      Purchase for $9.99/month
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex-1 shrink-0" />

              <NavButton icon={Shield} label="Admin Panel" page="admin" />

              <Sheet
                open={isFriendsSheetOpen}
                onOpenChange={setIsFriendsSheetOpen}
              >
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
                  className="h-1/2 bg-slate-900/80 backdrop-blur-md border-t border-slate-700 text-white"
                >
                  <SheetHeader className="flex-row items-center justify-between">
                    <div className="space-y-1">
                      <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                        <Users /> Friends List
                      </SheetTitle>
                    </div>
                  </SheetHeader>
                  <FriendsList
                    onInvite={handleInvite}
                    onViewProfile={handleViewProfile}
                    onMessage={handleMessage}
                  />
                </SheetContent>
              </Sheet>
            </div>
            
            <button
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

          <ScrollArea className="flex-1">{renderContent()}</ScrollArea>

          <div className="relative">
            <button
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
                isMenuOpen ? 'w-80' : 'w-0'
              }`}
            >
              <ScrollArea className="h-full w-80">
                <div
                  className={`p-6 ${
                    isMenuOpen ? 'opacity-100' : 'opacity-0'
                  } transition-opacity duration-300`}
                >
                  <div className={isMenuOpen ? 'block' : 'hidden'}>
                    <div className="flex flex-col items-center mb-8 animate-in fade-in duration-500">
                      <CircularProgress progress={user.xpProgress} level={Math.floor(user.xpProgress / 100)}>
                        <Avatar className="h-28 w-28 border-4 border-slate-800">
                          <AvatarImage
                            src={user.avatarUrl}
                            alt={user.username}
                          />
                          <AvatarFallback>{user.username.charAt(0)}</AvatarFallback>
                        </Avatar>
                      </CircularProgress>
                      <h3 className="text-xl font-bold mt-4 pt-4">{user.username}</h3>
                      <div className="mt-4 bg-slate-800/50 px-4 py-2 rounded-lg text-center">
                        <div className="text-xs text-slate-400">Rank</div>
                        <div className="text-lg font-bold text-yellow-400">
                          {user.currentRank}
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-700/50 my-6" />

                    <h2 className="text-xl font-bold mb-6 tracking-tight">
                      Shortcuts
                    </h2>
                    <div className="space-y-2">
                      {menuItems.map((item, i) => (
                        <button
                          key={i}
                          onClick={() => item.page && setCurrentPage(item.page)}
                          className="w-full flex items-center justify-start px-4 py-3.5 rounded-lg hover:bg-primary/10 transition-all duration-300 text-left group relative overflow-hidden hover:-translate-y-0.5"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
                          <div className="flex items-center space-x-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1">
                            <item.icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                            <span className="font-medium group-hover:text-white transition-colors">{item.label}</span>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-start px-4 py-3.5 rounded-lg hover:bg-destructive/10 transition-all duration-300 text-left group relative overflow-hidden hover:-translate-y-0.5"
                      >
                        <div className="flex items-center space-x-4 relative z-10">
                          <ShieldAlert className="w-5 h-5 text-slate-400 group-hover:text-destructive transition-colors" />
                          <span className="font-medium group-hover:text-destructive transition-colors">Log Out</span>
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
      <AlertDialog
        open={isCompetitiveDialogOpen}
        onOpenChange={setIsCompetitiveDialogOpen}
      >
        <AlertDialogContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white">
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
  );
}
