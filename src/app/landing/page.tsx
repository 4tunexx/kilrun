'use client';

import React, { Suspense, useRef } from 'react';
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
  ShieldCheck,
  Award,
  Sword,
  ShoppingBag,
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

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  steam_auth_failed: 'Steam login was cancelled or failed. Please try again.',
  steam_auth_invalid: 'Steam could not verify this login. Please try again.',
  steam_id_missing: 'Steam did not return a valid account id. Please try again.',
  db_unavailable:
    'Could not reach the player database. Check that MongoDB Atlas Network Access allows 0.0.0.0/0 (required for Vercel) and that the cluster is not paused, then try again.',
  steam_db_error: 'Login succeeded with Steam, but saving your profile failed. Please try again.',
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

const topPlayers = [
  {
    name: 'ShadowStriker',
    level: 99,
    xp: 75,
    rankName: 'Immortal',
    avatar: 'https://picsum.photos/seed/p1/80/80',
    icons: [Award, ShieldCheck, Sword],
    isFirst: true,
  },
  {
    name: 'Vortex',
    level: 92,
    xp: 40,
    rankName: 'Diamond III',
    avatar: 'https://picsum.photos/seed/p2/80/80',
    icons: [Award, ShieldCheck],
  },
  {
    name: 'Phoenix',
    level: 88,
    xp: 90,
    rankName: 'Diamond I',
    avatar: 'https://picsum.photos/seed/p3/80/80',
    icons: [ShieldCheck, Sword],
  },
  {
    name: 'Wraith',
    level: 85,
    xp: 25,
    rankName: 'Platinum II',
    avatar: 'https://picsum.photos/seed/p4/80/80',
    icons: [Award],
  },
  {
    name: 'Fury',
    level: 81,
    xp: 60,
    rankName: 'Platinum I',
    avatar: 'https://picsum.photos/seed/p5/80/80',
    icons: [Sword],
  },
];

const carouselImages = [
  {
    src: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80',
    alt: 'Kilrun game banner 1',
    hint: 'gameplay esports',
  },
  {
    src: 'https://picsum.photos/seed/slide2/1600/900',
    alt: 'Kilrun game banner 2',
    hint: 'action scene',
  },
  {
    src: 'https://picsum.photos/seed/slide3/1600/900',
    alt: 'Kilrun game banner 3',
    hint: 'futuristic character',
  },
];

const popularItems = [
  {
    name: 'Cyber Blade Skin',
    price: 1999,
    category: 'Weapon Skin',
    image: 'https://picsum.photos/seed/item1/400/400',
    hint: 'glowing sword',
  },
  {
    name: 'Neon Runner Pack',
    price: 2499,
    category: 'Bundle',
    image: 'https://picsum.photos/seed/item2/400/400',
    hint: 'futuristic gear',
  },
  {
    name: 'Quantum Armor',
    price: 1499,
    category: 'Outfit',
    image: 'https://picsum.photos/seed/item3/400/400',
    hint: 'glowing armor',
  },
  {
    name: 'Holographic Emote',
    price: 599,
    category: 'Emote',
    image: 'https://picsum.photos/seed/item4/400/400',
    hint: 'dancing hologram',
  },
  {
    name: 'Dragonfire Shotgun',
    price: 2199,
    category: 'Weapon Skin',
    image: 'https://picsum.photos/seed/item5/400/400',
    hint: 'fire shotgun',
  },
  {
    name: 'Celestial Wings',
    price: 1899,
    category: 'Back Bling',
    image: 'https://picsum.photos/seed/item6/400/400',
    hint: 'glowing wings',
  },
];

export default function LandingPage() {
  const autoplayPlugin = useRef(
    Autoplay({ delay: 3000, stopOnInteraction: true })
  );

  const handleNavigation = () => {
    window.location.href = '/api/auth/steam';
  };

  return (
    <div className="min-h-screen text-white relative">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <Image
          src="https://i.postimg.cc/tJgX2XgN/bg.png"
          alt="Futuristic game background"
          fill
          className="object-cover"
          data-ai-hint="futuristic game background"
        />
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
      </div>

      <div className="relative z-10">
        <Suspense fallback={null}>
          <AuthErrorBanner />
        </Suspense>

        {/* Header Banner */}
        <header className="pt-16 pb-8 md:pt-24 md:pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl">
              <Carousel
                opts={{ loop: true }}
                plugins={[autoplayPlugin.current]}
                className="w-full"
                onMouseEnter={autoplayPlugin.current.stop}
                onMouseLeave={autoplayPlugin.current.reset}
              >
                <CarouselContent className="-ml-0">
                  {carouselImages.map((image, index) => (
                    <CarouselItem key={index} className="pl-0">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        width={1600}
                        height={900}
                        className="w-full h-auto md:h-[32rem] object-cover"
                        data-ai-hint={image.hint}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="absolute left-6 top-1/2 -translate-y-1/2 z-10" />
                <CarouselNext className="absolute right-6 top-1/2 -translate-y-1/2 z-10" />
              </Carousel>
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/50 to-transparent" />

              <div className="absolute inset-0 flex flex-wrap items-center justify-between p-8 md:p-24 gap-8">
                <div className="max-w-lg">
                  <h1 className="text-5xl md:text-7xl font-black tracking-tight drop-shadow-2xl mb-4 animate-in fade-in-0 slide-in-from-bottom-10 zoom-in-90 duration-1000">
                    Welcome to Kilrun
                  </h1>
                  <p className="text-lg md:text-xl text-slate-200 animate-in fade-in-0 slide-in-from-bottom-10 zoom-in-90 duration-1000 delay-200">
                    The ultimate deathrun experience. Compete, conquer, and
                    climb the ranks.
                  </p>
                </div>

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
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-24 animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-500">
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Users className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  <AnimatedCounter end={342123} />
                </div>
                <p className="text-slate-400 mt-1">Players Online</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Gamepad2 className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  <AnimatedCounter end={1250345} />
                </div>
                <p className="text-slate-400 mt-1">Games Played Today</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <Gem className="w-10 h-10 mb-3 text-primary" />
                <div className="text-4xl font-black">
                  <AnimatedCounter end={8900000} />
                </div>
                <p className="text-slate-400 mt-1">Diamonds Earned</p>
              </CardContent>
            </Card>
          </div>

          {/* Popular Items Section */}
          <div className="w-full mb-24 animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-700">
            <div className="flex items-center justify-center mb-8">
              <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
                <ShoppingBag className="text-primary" />
                Popular Items
              </h2>
            </div>
            <Carousel
              opts={{
                align: 'start',
                loop: true,
              }}
              plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
              className="w-full"
            >
              <CarouselContent className="-ml-4">
                {popularItems.map((item, index) => (
                  <CarouselItem
                    key={index}
                    className="pl-4 md:basis-1/2 lg:basis-1/4"
                  >
                    <div className="p-1">
                      <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group shadow-lg cursor-pointer flex flex-col items-center justify-start h-full">
                        <CardContent className="p-0 w-full">
                          <div className="relative aspect-square w-full overflow-hidden rounded-t-lg">
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              className="object-cover group-hover:scale-110 transition-transform duration-300"
                              data-ai-hint={item.hint}
                            />
                          </div>
                          <div className="p-4 w-full">
                            <p className="text-xs text-slate-400 uppercase">
                              {item.category}
                            </p>
                            <h3 className="font-bold text-lg truncate">
                              {item.name}
                            </h3>
                            <div className="flex items-center justify-between mt-2">
                              <p className="font-bold text-yellow-400">
                                {item.price} VP
                              </p>
                              <Button size="sm">Buy Now</Button>
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
          </div>

          {/* Top Players */}
          <div className="w-full animate-in fade-in-0 slide-in-from-bottom-10 duration-1000 delay-900">
            <div className="flex items-center justify-center mb-8">
              <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
                <Crown className="text-yellow-400" />
                Top Players
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {topPlayers.map((player) => (
                <TooltipProvider key={player.name}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card className="bg-slate-800/60 backdrop-blur-md border-slate-700/50 text-center hover:border-primary/50 transition-all duration-300 hover:-translate-y-2 group shadow-lg cursor-pointer flex flex-col items-center justify-start pt-6 pb-4 px-4 h-full">
                        <div className="relative mb-8">
                          <CircularProgress
                            progress={player.xp}
                            level={player.level}
                            size={110}
                            strokeWidth={6}
                          >
                            <Avatar className="h-24 w-24">
                              <AvatarImage
                                src={player.avatar}
                                alt={player.name}
                                data-ai-hint="player avatar"
                              />
                              <AvatarFallback>
                                {player.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          </CircularProgress>
                          {player.isFirst && (
                            <Crown className="absolute -top-4 -right-2 w-8 h-8 text-yellow-400 -rotate-[30deg] drop-shadow-lg" />
                          )}
                        </div>
                        <p className="font-bold text-xl truncate mt-auto">
                          {player.name}
                        </p>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white">
                      <div className="p-1 min-w-[150px] text-center">
                        <p className="font-bold text-lg text-yellow-400">
                          {player.rankName}
                        </p>
                        {player.icons.length > 0 && (
                          <div className="flex gap-3 mt-2 justify-center border-t border-slate-700/50 pt-2">
                            {player.icons.map((Icon, i) => (
                              <Icon
                                key={i}
                                className="w-5 h-5 text-slate-300"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap justify-between items-center text-slate-400 text-sm">
            <p>&copy; {new Date().getFullYear()} Kilrun. All Rights Reserved.</p>
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
