'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
 * Read-only card for the in-game (match) level + power upgrades.
 * Separate from the website account level shown elsewhere on the profile —
 * upgrades can only be spent from the in-game menu (press M during a match).
 */
export function GameProgressionCard({ userId }: { userId: string }) {
  const [snap, setSnap] = useState<GameProgressionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

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
            const IconComponent = ABILITY_ICON_MAP[key];

            return (
              <div
                key={key}
                className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-2.5 flex items-center gap-2"
              >
                {IconComponent ? (
                  <IconComponent className="w-5 h-5 flex-shrink-0 text-orange-400" />
                ) : (
                  <span className="text-lg leading-none">{def.icon}</span>
                )}
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
