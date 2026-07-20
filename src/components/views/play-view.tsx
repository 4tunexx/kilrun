'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Skull,
  Swords,
  Users,
  Lock,
  Ban,
  Gem,
  Zap,
  ShieldCheck,
} from 'lucide-react';
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
export type CompetitiveQueue = 'casual' | 'ranked';

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
  onPlay: (mode: KilrunMode, opts?: { competitiveQueue?: CompetitiveQueue }) => void;
  isPremium?: boolean;
  /** Premium or free Ranked week — can enter Ranked queue. */
  rankedAccess?: boolean;
  freeRankedWeek?: boolean;
  /** Pulsar anticheat must be on for Competitive. */
  pulsarOn?: boolean;
  onOpenPremium?: () => void;
  onOpenPulsar?: () => void;
}

export default function PlayView({
  onPlay,
  isPremium = false,
  rankedAccess,
  freeRankedWeek = false,
  pulsarOn = false,
  onOpenPremium,
  onOpenPulsar,
}: PlayViewProps) {
  const canRanked = rankedAccess ?? isPremium;
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
          Casual Competitive never touches KP. Ranked Competitive requires Premium and moves your
          Elo rank. Competitive needs Pulsar anticheat online.
        </p>
      </div>

      {gameDisabled && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-2">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{disabledMsg || 'Matches are temporarily disabled.'}</span>
        </div>
      )}

      {!pulsarOn && (
        <button
          type="button"
          onClick={() => onOpenPulsar?.()}
          className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 flex gap-2 text-left hover:bg-emerald-500/15 transition-colors"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Pulsar offline</span> — activate anticheat in the right
            panel before starting Competitive.
          </span>
        </button>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {modes.map((mode) => {
          const info = KILRUN_MODE_INFO[mode.id];
          const Icon = mode.icon;
          const canPlay = mode.isLive && !gameDisabled;

          if (mode.id === 'competitive') {
            const canComp = canPlay && pulsarOn;
            return (
              <Card
                key={mode.id}
                className={`bg-gradient-to-br border ${info.accentClass} bg-slate-900/60 md:col-span-1`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {info.title}
                  </CardTitle>
                  <CardDescription className="text-slate-300/90">
                    4v4 · 6 rounds. Pick Casual (XP / KD only) or Premium Ranked (KP Elo).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={!canComp}
                    onClick={() => {
                      if (!pulsarOn) {
                        onOpenPulsar?.();
                        return;
                      }
                      onPlay('competitive', { competitiveQueue: 'casual' });
                    }}
                  >
                    {!pulsarOn ? (
                      <ShieldCheck className="h-4 w-4 mr-1" />
                    ) : (
                      <Zap className="h-4 w-4 mr-1" />
                    )}
                    {!pulsarOn ? 'Casual · Enable Pulsar' : 'Casual'}
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Button>
                  <Button
                    className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold"
                    disabled={!canPlay}
                    onClick={() => {
                      if (!pulsarOn) {
                        onOpenPulsar?.();
                        return;
                      }
                      if (!canRanked) {
                        onOpenPremium?.();
                        return;
                      }
                      onPlay('competitive', { competitiveQueue: 'ranked' });
                    }}
                  >
                    {!pulsarOn ? (
                      <ShieldCheck className="h-4 w-4 mr-1" />
                    ) : (
                      <Gem className="h-4 w-4 mr-1 fill-amber-900/20" />
                    )}
                    {!pulsarOn
                      ? 'Ranked · Enable Pulsar'
                      : canRanked
                        ? freeRankedWeek && !isPremium
                          ? 'Ranked · Free Week'
                          : 'Ranked Premium'
                        : 'Ranked · Go Premium'}
                    <ArrowRight className="h-4 w-4 ml-auto" />
                  </Button>
                  <p className="text-[11px] text-slate-500">
                    Casual: XP, VP, achievements — no rank change. Ranked: KP moves your ladder
                    rank
                    {freeRankedWeek ? ' (free week open)' : ''}.
                  </p>
                </CardContent>
              </Card>
            );
          }

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
