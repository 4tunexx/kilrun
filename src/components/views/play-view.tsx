'use client';

import { ArrowRight, Skull, Swords, Users, Lock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type KilrunMode = 'deathrun' | 'horde' | 'competitive';

interface ModeDefinition {
  id: KilrunMode;
  icon: typeof Skull;
  title: string;
  description: string;
  players: string;
  accent: string;
  isLive: boolean;
}

const modes: ModeDefinition[] = [
  {
    id: 'deathrun',
    icon: Skull,
    title: 'Deathrun',
    description: 'One random player becomes the Trapper. Everyone else Runs the gauntlet of automatic hazards to reach the finish -- or gets hunted down first.',
    players: 'Up to 8',
    accent: 'from-orange-500/20 to-cyan-500/20 border-orange-500/40',
    isLive: true,
  },
  {
    id: 'horde',
    icon: Users,
    title: 'Horde Mode',
    description: 'Solo or co-op. Survive escalating waves of AI enemies for as long as you can.',
    players: 'Solo / Co-op',
    accent: 'from-purple-500/10 to-slate-500/10 border-purple-500/20',
    isLive: false,
  },
  {
    id: 'competitive',
    icon: Swords,
    title: 'Competitive 4v4',
    description: 'Team elimination. Wipe out the enemy squad before they wipe out yours.',
    players: '4v4',
    accent: 'from-red-500/10 to-slate-500/10 border-red-500/20',
    isLive: false,
  },
];

interface PlayViewProps {
  onPlay: (mode: KilrunMode) => void;
}

export default function PlayView({ onPlay }: PlayViewProps) {
  return (
    <div className="px-12 py-8">
      <div className="mb-8">
        <h1 className="text-5xl font-black">Select Mode</h1>
        <p className="text-slate-400 mt-2">Jump into a live match or check out what's coming next.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {modes.map((mode) => (
          <Card
            key={mode.id}
            className={`bg-gradient-to-br ${mode.accent} backdrop-blur-sm overflow-hidden group transition-all ${
              mode.isLive ? 'hover:scale-[1.03] hover:border-primary/80' : 'opacity-70'
            }`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-3 bg-slate-900/60 rounded-full">
                  <mode.icon className="w-7 h-7 text-primary" />
                </div>
                {mode.isLive ? (
                  <Badge className="bg-green-600/80 hover:bg-green-600/80">Live</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-slate-700/80 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Coming Soon
                  </Badge>
                )}
              </div>
              <CardTitle className="text-3xl font-bold mt-4">{mode.title}</CardTitle>
              <CardDescription className="min-h-[4.5rem]">{mode.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center">
              <p className="font-semibold text-slate-400 flex items-center gap-2">
                <Users size={16} />
                {mode.players}
              </p>
              <Button disabled={!mode.isLive} onClick={() => onPlay(mode.id)}>
                {mode.isLive ? 'Play' : 'Soon'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
