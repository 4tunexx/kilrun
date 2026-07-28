'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ABILITY_KEYS,
  ABILITY_DEFINITIONS,
} from '@shared/ability-progression';
import { getGameProgression, type GameProgressionSnapshot } from '@/lib/game-progression-actions';
import {
  HealthIcon,
  SpeedIcon,
  JumpIcon,
  EnergyIcon,
  VisibilityIcon,
  PunchIcon,
  FlyIcon,
  HookIcon,
  BerserkIcon,
  BulletIcon,
  ThunderIcon,
} from '@/components/ability-icons';
import { ArrowRightLeft } from 'lucide-react';

const ABILITY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  health: HealthIcon,
  speed: SpeedIcon,
  jump: JumpIcon,
  energy: EnergyIcon,
  visibility: VisibilityIcon,
  punch: PunchIcon,
  fly: FlyIcon,
  hook: HookIcon,
  berserk: BerserkIcon,
  bullet: BulletIcon,
  thunder: ThunderIcon,
};

/**
 * Game progression display with toggle between web XP and in-game level.
 * Shows ability icons and skill points when in-game mode is active.
 */
export function ProgressionToggleCard({ userId }: { userId: string }) {
  const [snap, setSnap] = useState<GameProgressionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInGame, setShowInGame] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGameProgression(userId)
      .then((res) => {
        if (!cancelled) setSnap(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!showInGame) {
    return null; // Web XP is shown elsewhere
  }

  if (loading) {
    return (
      <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardContent className="pt-5">
          <p className="text-sm text-slate-400">Loading in-game stats…</p>
        </CardContent>
      </Card>
    );
  }

  if (!snap) return null;

  return (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-orange-400/80 uppercase">
              In-Game Level
            </p>
            <p className="text-3xl font-black text-orange-300 leading-none mt-1">{snap.level}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold tracking-widest text-orange-400/80 uppercase">
              Skill Points
            </p>
            <p className="text-3xl font-black text-orange-300 leading-none mt-1">{snap.skillPoints}</p>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden mb-1">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500"
            style={{ width: `${Math.max(2, snap.percent)}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {snap.xpIntoLevel} / {snap.xpForNextLevel} XP to level {snap.level + 1}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ABILITY_KEYS.map((key) => {
            const def = ABILITY_DEFINITIONS[key];
            const lvl = snap.abilities[key] ?? 0;
            const IconComponent = ABILITY_ICON_MAP[key] || (() => <span>{def.icon}</span>);

            return (
              <div
                key={key}
                className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-2.5 flex items-center gap-2"
              >
                <IconComponent className="w-5 h-5 flex-shrink-0 text-orange-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white truncate">{def.name}</p>
                  <p className="text-[10px] font-bold text-slate-400">
                    Lv {lvl}/{def.maxLevel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Pulsing toggle button for switching between web and in-game progression.
 * Placed next to the XP display in the profile header.
 */
export function ProgressionModeToggle() {
  const [showInGame, setShowInGame] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setShowInGame(!showInGame)}
      className={`relative w-10 h-10 rounded-full p-0 flex items-center justify-center transition-all ${
        showInGame
          ? 'bg-orange-500/20 border border-orange-400/50 text-orange-300 hover:bg-orange-500/30'
          : 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
      }`}
      title={showInGame ? 'Show web XP' : 'Show in-game level'}
    >
      <ArrowRightLeft className="w-4 h-4" />
      {!showInGame && (
        <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-pulse" />
      )}
    </Button>
  );
}
