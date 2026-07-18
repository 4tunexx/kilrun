'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Skull, Swords, Users, Lock, Ban } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSiteSettings } from '@/lib/progression-actions';

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
    description:
      'One random player becomes the Trapper. Everyone else Runs the gauntlet of automatic hazards to reach the finish -- or gets hunted down first.',
    players: 'Up to 8',
    accent: 'from-orange-500/20 to-cyan-500/20 border-orange-500/40',
    isLive: true,
  },
  {
    id: 'horde',
    icon: Users,
    title: 'Horde Mode',
    description:
      'Solo or co-op. Survive escalating waves of AI enemies for as long as you can.',
    players: 'Solo / Co-op',
    accent: 'from-purple-500/10 to-slate-500/10 border-purple-500/20',
    isLive: false,
  },
  {
    id: 'competitive',
    icon: Swords,
    title: 'Competitive 4v4',
    description:
      'Team elimination. Wipe out the enemy squad before they wipe out yours.',
    players: '4v4',
    accent: 'from-red-500/10 to-slate-500/10 border-red-500/20',
    isLive: false,
  },
];

interface PlayViewProps {
  onPlay: (mode: KilrunMode) => void;
}

export default function PlayView({ onPlay }: PlayViewProps) {
  const [gameDisabled, setGameDisabled] = useState(false);
  const [disabledMsg, setDisabledMsg] = useState('');

  useEffect(() => {
    getSiteSettings().then((s) => {
      setGameDisabled(s.gameDisabled);
      setDisabledMsg(s.gameDisabledMsg);
    });
  }, []);

  return (
    <div className="px-4 sm:px-12 py-8">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-black">Select Mode</h2>
        <p className="text-slate-400 mt-2">
          Jump into a live match or check out what&apos;s coming next.
        </p>
      </div>

      {gameDisabled && (
        <Card className="mb-6 bg-red-950/40 border-red-500/40">
          <CardContent className="py-4 flex items-start gap-3">
            <Ban className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-200">Game temporarily disabled</p>
              <p className="text-sm text-red-200/80">
                {disabledMsg || 'Kilrun is offline for maintenance.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {modes.map((mode) => {
          const canPlay = mode.isLive && !gameDisabled;
          return (
            <Card
              key={mode.id}
              className={`bg-gradient-to-br ${mode.accent} backdrop-blur-sm overflow-hidden group transition-all ${
                canPlay ? 'hover:scale-[1.03] hover:border-primary/80' : 'opacity-70'
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-slate-900/60 rounded-full">
                    <mode.icon className="w-7 h-7 text-primary" />
                  </div>
                  {canPlay ? (
                    <Badge>Live</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="w-3 h-3" />
                      {gameDisabled && mode.isLive ? 'Disabled' : 'Soon'}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-2xl mt-4">{mode.title}</CardTitle>
                <CardDescription className="text-slate-300">
                  {mode.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400 mb-4">{mode.players} players</p>
                <Button
                  className="w-full"
                  disabled={!canPlay}
                  onClick={() => onPlay(mode.id)}
                >
                  {canPlay ? (
                    <>
                      Play <ArrowRight className="ml-2 w-4 h-4" />
                    </>
                  ) : (
                    'Unavailable'
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
