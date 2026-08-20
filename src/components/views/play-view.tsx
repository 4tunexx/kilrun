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
  Puzzle,
  RotateCcw,
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
import { getKilrunModeInfo, isCoreKilrunMode, registerPluginMode, type KilrunMode } from '@/lib/game-modes';
import { PartyPanel } from '@/components/party-panel';
import {
  getMyParty,
  setPartyMode,
} from '@/lib/party-actions';
import { getMyAbandonCooldown } from '@/lib/match-abandon-actions';
import { getStoredRejoin } from '@/components/game/net/connection';

export type { KilrunMode };
export type CompetitiveQueue = 'casual' | 'ranked';

interface ModeDefinition {
  id: KilrunMode;
  icon: typeof Skull;
  isLive: boolean;
  hasMain?: boolean;
}

function formatCooldownRemaining(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return '';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.ceil(hours / 24)} day`;
}

const modes: ModeDefinition[] = [
  { id: 'deathrun', icon: Skull, isLive: true },
  { id: 'horde', icon: Users, isLive: true },
  { id: 'competitive', icon: Swords, isLive: true },
];

interface PlayViewProps {
  onPlay: (mode: KilrunMode, opts?: { competitiveQueue?: CompetitiveQueue }) => void;
  /** Party members auto-follow leader into lobby (skips Competitive confirm). */
  onPartyFollow?: (
    mode: KilrunMode,
    opts?: { competitiveQueue?: CompetitiveQueue }
  ) => void;
  isPremium?: boolean;
  /** Premium or free Ranked week — can enter Ranked queue. */
  rankedAccess?: boolean;
  freeRankedWeek?: boolean;
  /** Pulsar anticheat must be on for Competitive. */
  pulsarOn?: boolean;
  onOpenPremium?: () => void;
  onOpenPulsar?: () => void;
  userId?: string;
}

export default function PlayView({
  onPlay,
  onPartyFollow,
  isPremium = false,
  rankedAccess,
  freeRankedWeek = false,
  pulsarOn = false,
  onOpenPremium,
  onOpenPulsar,
  userId,
}: PlayViewProps) {
  const canRanked = rankedAccess ?? isPremium;
  const [gameDisabled, setGameDisabled] = useState(false);
  const [disabledMsg, setDisabledMsg] = useState('');
  const [abandonCooldownUntil, setAbandonCooldownUntil] = useState<Date | null>(null);
  const [rejoinRoom, setRejoinRoom] = useState<KilrunMode | null>(null);
  const [pluginModes, setPluginModes] = useState<ModeDefinition[]>([]);

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
    getMyAbandonCooldown().then((c) => {
      setAbandonCooldownUntil(c.active && c.cooldownUntil ? new Date(c.cooldownUntil) : null);
    });
    const stored = getStoredRejoin();
    if (stored) {
      if (stored.roomName === 'competitive_ranked' || stored.roomName === 'competitive') {
        setRejoinRoom('competitive');
      } else if (stored.roomName && !stored.roomName.endsWith('_practice')) {
        setRejoinRoom(stored.roomName.replace(/_ranked$/, '') as KilrunMode);
      }
    }
    void fetch('/api/game/plugin-modes', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { ok?: boolean; modes?: Array<{ id: string; base?: string; title?: string; hasMain?: boolean }> }) => {
        if (!data?.ok || !Array.isArray(data.modes)) return;
        const extra: ModeDefinition[] = [];
        for (const row of data.modes) {
          if (!row?.id || isCoreKilrunMode(row.id)) continue;
          registerPluginMode(row);
          extra.push({
            id: row.id,
            icon: Puzzle,
            isLive: row.hasMain !== false,
            hasMain: row.hasMain !== false,
          });
        }
        setPluginModes(extra);
      })
      .catch(() => undefined);
  }, []);

  const cooldownActive = !!abandonCooldownUntil && abandonCooldownUntil.getTime() > Date.now();
  const cooldownLabel = abandonCooldownUntil
    ? formatCooldownRemaining(abandonCooldownUntil)
    : '';

  const startQueue = async (
    mode: KilrunMode,
    opts?: { competitiveQueue?: CompetitiveQueue }
  ) => {
    try {
      const party = await getMyParty();
      if (party?.isLeader) {
        const partyMode =
          mode === 'competitive'
            ? opts?.competitiveQueue === 'ranked'
              ? 'competitive_ranked'
              : 'competitive'
            : mode;
        await setPartyMode(partyMode);
      } else if (party && !party.isLeader) {
        // Members wait for leader — ignore solo queue clicks while in a party.
        return;
      }
    } catch {
      // Solo queue if party lookup fails.
    }
    onPlay(mode, opts);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-1 sm:px-2 pb-6 animate-in fade-in duration-500">
      <div className="pt-1">
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Play</h2>
        <p className="text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
          Casual Competitive never touches KP. Ranked Competitive requires Premium and moves your
          Elo rank. Competitive needs Pulsar anticheat online.
        </p>
      </div>

      {gameDisabled && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 text-sm text-amber-100 flex gap-2.5 items-start animate-in fade-in slide-in-from-top-2 duration-300">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{disabledMsg || 'Matches are temporarily disabled.'}</span>
        </div>
      )}

      {rejoinRoom && (
        <button
          type="button"
          onClick={() => {
            setRejoinRoom(null);
            void startQueue(rejoinRoom);
          }}
          className="w-full rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3.5 text-sm text-sky-100 flex gap-2.5 items-start text-left transition-all duration-200 hover:bg-sky-500/15 hover:border-sky-400/60 active:scale-[0.99]"
        >
          <RotateCcw className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Match in progress</span> — you disconnected recently.
            Click to rejoin before your seat is given up.
          </span>
        </button>
      )}

      {cooldownActive && (
        <div className="w-full rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5 text-sm text-red-100 flex gap-2.5 items-start">
          <Ban className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Competitive queueing is locked for <span className="font-semibold">{cooldownLabel}</span>{' '}
            after abandoning a match.
          </span>
        </div>
      )}

      {!pulsarOn && (
        <button
          type="button"
          onClick={() => onOpenPulsar?.()}
          className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3.5 text-sm text-emerald-100 flex gap-2.5 items-start text-left transition-all duration-200 hover:bg-emerald-500/15 hover:border-emerald-400/60 hover:shadow-[0_0_0_1px_rgba(52,211,153,0.15),0_8px_20px_-8px_rgba(16,185,129,0.35)] active:scale-[0.99]"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Pulsar offline</span> — activate anticheat in the right
            panel before starting Competitive.
          </span>
        </button>
      )}

      {userId ? (
        <PartyPanel userId={userId} onFollowLeader={onPartyFollow ?? onPlay} />
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        {[...modes, ...pluginModes].map((mode) => {
          const info = getKilrunModeInfo(mode.id);
          const Icon = mode.icon;
          const canPlay = mode.isLive && !gameDisabled;

          if (mode.id === 'competitive') {
            const canComp = canPlay && pulsarOn && !cooldownActive;
            return (
              <Card
                key={mode.id}
                className={`bg-gradient-to-br border ${info.accentClass} bg-slate-900/60 md:col-span-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 hover:border-opacity-80`}
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
                <CardContent className="space-y-2.5">
                  <Button
                    className="w-full transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                    variant="secondary"
                    disabled={!canComp}
                    onClick={() => {
                      if (!pulsarOn) {
                        onOpenPulsar?.();
                        return;
                      }
                      void startQueue('competitive', { competitiveQueue: 'casual' });
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
                    className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={!canPlay || cooldownActive}
                    onClick={() => {
                      if (!pulsarOn) {
                        onOpenPulsar?.();
                        return;
                      }
                      if (!canRanked) {
                        onOpenPremium?.();
                        return;
                      }
                      void startQueue('competitive', { competitiveQueue: 'ranked' });
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
                  <p className="text-[11px] text-slate-500 pt-0.5">
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
              className={`bg-gradient-to-br border ${info.accentClass} bg-slate-900/60 transition-all duration-300 ${
                canPlay
                  ? 'hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 hover:border-opacity-80'
                  : 'opacity-80'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    {info.title}
                  </CardTitle>
                  {!canPlay && (
                    <Badge variant="secondary" className="text-[10px]">
                      {gameDisabled && mode.isLive
                        ? 'Disabled'
                        : mode.hasMain === false
                          ? 'Needs MAIN'
                          : 'Soon'}
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
                  className="w-full transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  disabled={!canPlay}
                  onClick={() => void startQueue(mode.id)}
                >
                  {canPlay ? (
                    <>
                      Queue <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  ) : mode.hasMain === false ? (
                    <>
                      <Lock className="h-4 w-4 mr-1" /> Needs MAIN map
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
