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
import { resolveGameDisabled } from '@/lib/branding';
import { KILRUN_MODE_INFO, type KilrunMode } from '@/lib/game-modes';

export type { KilrunMode };

interface ModeDefinition {
  id: KilrunMode;
  icon: typeof Skull;
  isLive: boolean;
}

const modes: ModeDefinition[] = [
  { id: 'deathrun', icon: Skull, isLive: true },
  { id: 'horde', icon: Users, isLive: true },
  { id: 'competitive', icon: Swords, isLive: true },
];

interface PlayViewProps {
  onPlay: (mode: KilrunMode) => void;
}

export default function PlayView({ onPlay }: PlayViewProps) {
  const [gameDisabled, setGameDisabled] = useState(false);
  const [disabledMsg, setDisabledMsg] = useState('');

  useEffect(() => {
    getSiteSettings().then((s) => {
      setGameDisabled(
        resolveGameDisabled({
          gameDisabled: s.gameDisabled,
          gameDisabledUntil: s.gameDisabledUntil,
        })
      );
      setDisabledMsg(s.gameDisabledMsg);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Play</h2>
        <p className="text-sm text-slate-400 mt-1">
          Pick a mode. Set each mode&apos;s Active Match Map in Admin → Map Editor before queuing.
        </p>
      </div>

      {gameDisabled && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-2">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{disabledMsg || 'Matches are temporarily disabled.'}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {modes.map((mode) => {
          const info = KILRUN_MODE_INFO[mode.id];
          const Icon = mode.icon;
          const canPlay = mode.isLive && !gameDisabled;
          return (
            <Card
              key={mode.id}
              className={`bg-gradient-to-br border ${info.accentClass} bg-slate-900/60`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {info.title}
                  </CardTitle>
                  {!canPlay && (
                    <Badge variant="secondary" className="text-[10px]">
                      {gameDisabled && mode.isLive ? 'Disabled' : 'Soon'}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-slate-300/90">
                  {info.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-slate-400">{info.players}</p>
                <Button
                  className="w-full"
                  disabled={!canPlay}
                  onClick={() => onPlay(mode.id)}
                >
                  {canPlay ? (
                    <>
                      Queue <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-1" /> Coming soon
                    </>
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
