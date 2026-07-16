'use client';

import { ArrowRight, Swords, Skull, Bomb, Shield, Users } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const competitiveModes = [
  {
    icon: Bomb,
    title: 'Competitive',
    description: '5v5 match with ranks on the line.',
    players: '5v5',
    image: 'https://picsum.photos/seed/gm1/600/400',
    hint: 'esports stadium',
  },
];

const casualModes = [
  {
    icon: Shield,
    title: 'Unrated',
    description: 'Casual 5v5 match, perfect for practice.',
    players: '5v5',
    image: 'https://picsum.photos/seed/gm2/600/400',
    hint: 'game characters',
  },
  {
    icon: Swords,
    title: 'Deathmatch',
    description: 'Fast-paced free-for-all action.',
    players: '12 Players',
    image: 'https://picsum.photos/seed/gm3/600/400',
    hint: 'action battle',
  },
  {
    icon: Skull,
    title: 'Spike Rush',
    description: 'Quick, casual 5v5 with randomized loadouts.',
    players: '5v5',
    image: 'https://picsum.photos/seed/gm4/600/400',
    hint: 'fast motion',
  },
];

interface PlayViewProps {
  onPlay: (mode: string, description: string, isCompetitive: boolean) => void;
}

const GameModeCard = ({
  mode,
  onPlay,
  isCompetitive,
}: {
  mode: (typeof competitiveModes)[0];
  onPlay: (mode: string, description: string, isCompetitive: boolean) => void;
  isCompetitive: boolean;
}) => (
  <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30 overflow-hidden group transition-all hover:border-primary/80 hover:scale-[1.03]">
    <div className="relative h-48">
      <Image
        src={mode.image}
        alt={mode.title}
        fill
        className="object-cover group-hover:scale-110 transition-transform duration-300"
        data-ai-hint={mode.hint}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
      <div className="absolute top-4 left-4 p-2 bg-slate-900/50 rounded-full">
        <mode.icon className="w-6 h-6 text-primary" />
      </div>
    </div>
    <CardHeader>
      <CardTitle className="text-3xl font-bold">{mode.title}</CardTitle>
      <CardDescription>{mode.description}</CardDescription>
    </CardHeader>
    <CardContent className="flex justify-between items-center">
      <p className="font-semibold text-slate-400 flex items-center gap-2">
        <Users size={16} />
        {mode.players}
      </p>
      <Button onClick={() => onPlay(mode.title, mode.description, isCompetitive)}>
        Play <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </CardContent>
  </Card>
);

export default function PlayView({ onPlay }: PlayViewProps) {
  return (
    <div className="px-12 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-5xl font-black">Select Mode</h1>
        <Button
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-lg"
          onClick={() =>
            onPlay(
              'Spike Rush',
              'Quick, casual 5v5 with randomized loadouts.',
              false
            )
          }
        >
          <ArrowRight className="mr-2 h-5 w-5" /> Quick Play
        </Button>
      </div>

      <Tabs defaultValue="casual" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800/60 mb-6 h-14">
          <TabsTrigger value="casual" className="text-lg">
            Casual
          </TabsTrigger>
          <TabsTrigger value="competitive" className="text-lg">
            Competitive
          </TabsTrigger>
        </TabsList>
        <TabsContent value="casual">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {casualModes.map((mode) => (
              <GameModeCard
                key={mode.title}
                mode={mode}
                onPlay={onPlay}
                isCompetitive={false}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="competitive">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {competitiveModes.map((mode) => (
              <GameModeCard
                key={mode.title}
                mode={mode}
                onPlay={onPlay}
                isCompetitive={true}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
