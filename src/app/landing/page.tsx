'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AnimatedCounter from '@/components/ui/animated-counter';
import {
  Users,
  Gamepad2,
  Gem,
  Crown,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { CircularProgress } from '@/components/ui/circular-progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getSiteSettings } from '@/lib/progression-actions';
import {
  getLandingPageData,
  type LandingStats,
  type LandingStoreItem,
  type LandingTopPlayer,
} from '@/lib/actions';
import { getLevelProgressPercent, getLevelFromXp } from '@/lib/progression';
import { StoreItemPreview } from '@/components/store-item-preview';
import {
  resolveHeaderLogo,
  resolveHubBackground,
  resolveLandingHeroImage,
  resolveMarkLogo,
} from '@/lib/branding';
import { normalizeLandingSlides } from '@/lib/cosmetics';
import { onSiteSettingsUpdated } from '@/lib/site-branding-events';
import { parseHubChrome } from '@/lib/hub-layout';
import { InteractiveWordmark } from '@/components/interactive-wordmark';
import { usePointerParallax } from '@/hooks/use-pointer-parallax';
import {
  DEFAULT_HEADER_LOGO_STYLE,
  normalizeHeaderLogoStyle,
  type HeaderLogoStyle,
} from '@/lib/logo-style';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  steam_auth_failed: 'Steam login was cancelled or failed. Please try again.',
  steam_auth_invalid: 'Steam could not verify this login. Please try again.',
  steam_id_missing: 'Steam did not return a valid account id. Please try again.',
  db_unavailable:
    'Could not reach the player database. Check that MongoDB Atlas Network Access allows 0.0.0.0/0 (required for Vercel) and that the cluster is not paused, then try again.',
  steam_db_error: 'Login succeeded with Steam, but saving your profile failed. Please try again.',
  banned: 'This account has been banned. Contact support if you believe this is a mistake.',
};

const EMPTY_STATS: LandingStats = {
  registeredPlayers: 0,
  matchesPlayed: 0,
  matchesPlayedToday: 0,
  vpEarned: 0,
};

function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const authError = searchParams.get('error');
  if (!authError) return null;

  const message =
    AUTH_ERROR_MESSAGES[authError] ??
    'Something went wrong during login. Please try again.';

  return (
    <div role="alert" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
      <div className="rounded-lg border border-red-500/40 bg-red-950/70 px-4 py-3 text-sm text-red-100">
        {message}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );
  const [headerTitle, setHeaderTitle] = useState('Welcome to Kilrun');
  const [headerSubtitle, setHeaderSubtitle] = useState(
    'The ultimate deathrun experience. Compete, conquer, and climb the ranks.'
  );
  const [bgUrl, setBgUrl] = useState(resolveHubBackground());
  const [heroSlides, setHeroSlides] = useState<{ src: string; alt: string }[]>(
    []
  );
  const [showLandingSlider, setShowLandingSlider] = useState(true);
  const [markLogoUrl, setMarkLogoUrl] = useState('');
  const [headerLogoUrl, setHeaderLogoUrl] = useState('');
  const [headerLogoStyle, setHeaderLogoStyle] = useState<HeaderLogoStyle>(
    DEFAULT_HEADER_LOGO_STYLE
  );
  const heroParallax = usePointerParallax(20);
  const [stats, setStats] = useState<LandingStats>(EMPTY_STATS);
  const [topPlayers, setTopPlayers] = useState<LandingTopPlayer[]>([]);
  const [popularItems, setPopularItems] = useState<LandingStoreItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const applyBranding = (s: {
    headerTitle?: string | null;
    headerSubtitle?: string | null;
    backgroundUrl?: string | null;
    landingHeroImage?: string | null;
    landingHeroSlides?: string | null;
    logoUrl?: string | null;
    headerLogoUrl?: string | null;
    headerLogoStyle?: string | null;
    hubChromeJson?: string | null;
  }) => {
    if (s.headerTitle) setHeaderTitle(s.headerTitle);
    if (s.headerSubtitle) setHeaderSubtitle(s.headerSubtitle);
    if (s.backgroundUrl !== undefined && s.backgroundUrl !== null) {
      setBgUrl(resolveHubBackground(s.backgroundUrl));
    }
    const chrome = parseHubChrome(s.hubChromeJson);
    setShowLandingSlider(chrome.showLandingSlider);
    if (
      s.landingHeroSlides !== undefined ||
      s.landingHeroImage !== undefined
    ) {
      const parsed = normalizeLandingSlides(s.landingHeroSlides);
      let slides: { src: string; alt: string }[] = parsed
        .map((slide) => ({
          src: resolveLandingHeroImage(slide.src) || slide.src,
          alt: slide.alt || 'Kilrun',
        }))
        .filter((slide) => Boolean(slide.src));
      if (slides.length === 0 && s.landingHeroImage) {
        const src = resolveLandingHeroImage(s.landingHeroImage);
        slides = src ? [{ src, alt: 'Kilrun' }] : [];
      }
      setHeroSlides(slides);
    }
    if (s.logoUrl !== undefined && s.logoUrl !== null) {
      setMarkLogoUrl(s.logoUrl);
    }
    if (s.headerLogoUrl !== undefined && s.headerLogoUrl !== null) {
      setHeaderLogoUrl(s.headerLogoUrl);
    }
    if (s.headerLogoStyle !== undefined && s.headerLogoStyle !== null) {
      setHeaderLogoStyle(normalizeHeaderLogoStyle(s.headerLogoStyle));
    }
  };

  useEffect(() => {
    getSiteSettings()
      .then((s) => applyBranding(s))
      .catch(() => {});

    getLandingPageData()
      .then((data) => {
        setStats(data.stats);
        setTopPlayers(data.topPlayers);
        setPopularItems(data.popularItems);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  useEffect(() => onSiteSettingsUpdated(applyBranding), []);

  const markSrc = resolveMarkLogo(markLogoUrl);
  const wordmarkSrc = resolveHeaderLogo(headerLogoUrl);

  const handleNavigation = () => {
    window.location.href = '/api/auth/steam';
  };

  const renderAuthCard = () => (
    <Card className="bg-slate-900/60 backdrop-blur-md border-slate-700/50 w-full max-w-sm animate-in fade-in duration-1000 delay-400">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Ready to Play?</CardTitle>
        <CardDescription>
          Login or create an account to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col space-y-4">
        <Button
          onClick={handleNavigation}
          size="lg"
          className="w-full text-lg font-bold"
        >
          Login
        </Button>
        <Button
          onClick={handleNavigation}
          size="lg"
          variant="outline"
          className="w-full text-lg font-bold"
        >
          Register
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen text-white relative">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
      </div>

      <div className="relative z-10">
        <Suspense fallback={null}>
          <AuthErrorBanner />
        </Suspense>

        {/* Header Banner */}
        <header className="pt-8 pb-8 md:pt-24 md:pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div
              ref={heroParallax.ref}
              className="relative rounded-2xl overflow-hidden shadow-2xl touch-pan-y"
              onPointerMove={heroParallax.onPointerMove}
              onPointerLeave={heroParallax.onPointerLeave}
            >
              <div className="relative h-56 sm:h-72 md:h-[32rem] overflow-hidden">
                {heroSlides.length > 0 ? (
                  <div
                    className="absolute inset-[-8%] h-[116%] w-[116%]"
                    style={heroParallax.mediaStyle}
                  >
                    {showLandingSlider && heroSlides.length > 1 ? (
                      <Carousel
                        opts={{ loop: true }}
                        plugins={[autoplayPlugin.current]}
                        className="w-full h-full"
                        onMouseEnter={autoplayPlugin.current.stop}
                        onMouseLeave={autoplayPlugin.current.reset}
                      >
                        <CarouselContent className="-ml-0 h-full">
                          {heroSlides.map((image, index) => (
                            <CarouselItem key={index} className="pl-0 h-full">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={image.src}
                                alt={image.alt}
                                className="w-full h-56 sm:h-72 md:h-[32rem] object-cover pointer-events-none select-none"
                                draggable={false}
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                        <CarouselPrevious className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-10" />
                        <CarouselNext className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-10" />
                      </Carousel>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={heroSlides[0].src}
                        alt={heroSlides[0].alt}
                        className="w-full h-56 sm:h-72 md:h-[32rem] object-cover pointer-events-none select-none"
                        draggable={false}
                      />
                    )}
                  </div>
                ) : (
                  <div
                    className="absolute inset-[-8%] h-[116%] w-[116%] bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950"
                    style={heroParallax.mediaStyle}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent md:bg-gradient-to-r md:from-slate-900/90 md:via-slate-900/50 md:to-transparent pointer-events-none" />

                {/* Title overlay; auth card only on md+ so it is not clipped on mobile */}
                <div className="absolute inset-0 flex items-end md:items-center justify-between p-6 md:p-24 gap-8">
                  <div className="max-w-xl min-w-0">
                    <div className="mb-3 md:mb-5">
                      <InteractiveWordmark
                        src={wordmarkSrc}
                        alt={headerTitle}
                        logoStyle={headerLogoStyle}
                        className="h-14 sm:h-20 md:h-24 w-auto max-w-full"
                      />
                    </div>
                    <p className="text-base sm:text-lg md:text-xl text-slate-200 animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-200">
                      {headerSubtitle}
                    </p>
                  </div>

                  <div className="hidden md:block w-full max-w-sm shrink-0">
                    {renderAuthCard()}
                  </div>
                </div>
              </div>

              {/* Mobile auth actions — in normal flow so they stay visible */}
              <div className="md:hidden flex justify-center p-4 sm:p-6 bg-slate-900/70 border-t border-slate-700/50">
                {renderAuthCard()}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          {/* Stats Section — live MongoDB aggregates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-24 animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-500">
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Users className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  {dataLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  ) : (
                    <AnimatedCounter end={stats.registeredPlayers} />
                  )}
                </div>
                <p className="text-slate-400 mt-1">Registered Players</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Gamepad2 className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  {dataLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  ) : (
                    <AnimatedCounter end={stats.matchesPlayed} />
                  )}
                </div>
                <p className="text-slate-400 mt-1">
                  Matches Played
                  {!dataLoading && stats.matchesPlayedToday > 0
                    ? ` · ${stats.matchesPlayedToday.toLocaleString()} today`
                    : ''}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Gem className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  {dataLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  ) : (
                    <AnimatedCounter end={stats.vpEarned} />
                  )}
                </div>
                <p className="text-slate-400 mt-1">VP Earned</p>
              </CardContent>
            </Card>
          </div>

          {/* Popular Items — live store catalog / purchase rankings */}
          <div className="w-full mb-24 animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-700">
            <div className="flex items-center justify-center mb-8">
              <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
                <ShoppingBag className="text-primary" />
                Popular Items
              </h2>
            </div>
            {dataLoading ? (
              <div className="flex justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading store...
              </div>
            ) : popularItems.length === 0 ? (
              <p className="text-center text-slate-400 py-8">
                Store items will appear here once the catalog is seeded.
              </p>
            ) : (
              <Carousel
                opts={{
                  align: 'start',
                  loop: popularItems.length > 3,
                }}
                plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
                className="w-full"
              >
                <CarouselContent className="-ml-4">
                  {popularItems.map((item) => (
                    <CarouselItem
                      key={item.id}
                      className="pl-4 md:basis-1/2 lg:basis-1/4"
                    >
                      <div className="p-1">
                        <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group shadow-lg flex flex-col items-center justify-start h-full">
                          <CardContent className="p-0 w-full">
                            <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-slate-900/80">
                              <StoreItemPreview item={item} />
                            </div>
                            <div className="p-4 w-full">
                              <p className="text-xs text-slate-400 uppercase">
                                {item.itemCategory}
                              </p>
                              <h3 className="font-bold text-lg truncate">
                                {item.itemName}
                              </h3>
                              <div className="flex items-center justify-between mt-2">
                                <p className="font-bold text-yellow-400">
                                  {item.vpPrice} VP
                                </p>
                                <Button size="sm" onClick={handleNavigation}>
                                  Login to Buy
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="absolute left-0 top-1/2 -translate-y-1/2 z-10" />
                <CarouselNext className="absolute right-0 top-1/2 -translate-y-1/2 z-10" />
              </Carousel>
            )}
          </div>

          {/* Top Players — live leaderboard */}
          <div className="w-full animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-900">
            <div className="flex items-center justify-center mb-8">
              <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
                <Crown className="text-yellow-400" />
                Top Players
              </h2>
            </div>
            {dataLoading ? (
              <div className="flex justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading rankings...
              </div>
            ) : topPlayers.length === 0 ? (
              <p className="text-center text-slate-400 py-8">
                Be the first to sign in and claim the top spot.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {topPlayers.map((player, index) => {
                  const xp = player.xpProgress ?? 0;
                  const level = getLevelFromXp(xp);
                  const xpPct = getLevelProgressPercent(xp);
                  const name = player.username || 'Player';
                  return (
                    <TooltipProvider key={player.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 text-center hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group shadow-lg cursor-default flex flex-col items-center justify-start pt-6 pb-4 px-4 h-full">
                            <div className="relative mb-8">
                              <CircularProgress
                                progress={xpPct}
                                level={level}
                                size={110}
                                strokeWidth={6}
                              >
                                <Avatar className="h-24 w-24">
                                  <AvatarImage
                                    src={player.avatarUrl}
                                    alt={name}
                                  />
                                  <AvatarFallback>
                                    {name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                              </CircularProgress>
                              {index === 0 && (
                                <Crown className="absolute -top-4 -right-2 w-8 h-8 text-yellow-400 -rotate-[30deg] drop-shadow-lg" />
                              )}
                            </div>
                            <p className="font-bold text-xl truncate mt-auto">
                              {name}
                            </p>
                          </Card>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900/60 backdrop-blur-md border-slate-700/30 text-white">
                          <div className="p-1 min-w-[150px] text-center">
                            <p className="font-bold text-lg text-yellow-400">
                              {player.currentRank || 'Unranked'}
                            </p>
                            <p className="text-xs text-slate-300 mt-1">
                              Level {level} · {xp.toLocaleString()} XP
                            </p>
                            {player.isVip && (
                              <p className="text-xs text-yellow-400/90 mt-1">VIP</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap justify-between items-center gap-4 text-slate-400 text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={markSrc}
                alt=""
                className="h-7 w-7 object-contain shrink-0"
              />
              <p className="truncate">
                &copy; {new Date().getFullYear()} Kilrun. All Rights Reserved.
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <a href="#" className="hover:text-primary transition">
                Terms of Service
              </a>
              <a href="#" className="hover:text-primary transition">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-primary transition">
                Support
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
