'use client';

import { useEffect, useState } from 'react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
 * Compact version for right sidebar menu - small icons only, no text.
 */
export function GameProgressionCompact({ userId }: { userId: string }) {
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

  if (loading || !snap) return null;

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .animate-shimmer {
          background-size: 200% 100%;
          animation: shimmer 2.5s infinite;
        }
      `}</style>

      {/* XP Bar with Level and Skill Points */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-orange-400/80 uppercase">
              In-Game Level
            </p>
            <p className="text-2xl font-black text-orange-300 leading-none">{snap.level}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-widest text-orange-400/80 uppercase">
              Skill Points
            </p>
            <p className="text-2xl font-black text-orange-300 leading-none">{snap.skillPoints}</p>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden mb-1 relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 animate-shimmer"
            style={{ width: `${Math.max(2, snap.percent)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400">
          {snap.xpIntoLevel} / {snap.xpForNextLevel} XP to level {snap.level + 1}
        </p>
      </div>

      {/* Powers Grid - Compact 4 columns */}
      <div className="border-t border-slate-700/50 pt-4">
        <p className="text-[10px] font-bold tracking-widest text-orange-400/80 uppercase mb-2">
          Power Upgrades
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {ABILITY_KEYS.map((key) => {
            const def = ABILITY_DEFINITIONS[key];
            const lvl = snap.abilities[key] ?? 0;
            const IconComponent = ABILITY_ICON_MAP[key];

            return (
              <Popover key={key}>
                <PopoverTrigger asChild>
                  <button className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-1.5 flex flex-col items-center justify-center hover:border-orange-400/50 hover:bg-slate-900/60 transition-all cursor-help aspect-square">
                    {IconComponent ? (
                      <IconComponent className="w-4 h-4 flex-shrink-0 text-orange-400" />
                    ) : (
                      <span className="text-sm leading-none">{def.icon}</span>
                    )}
                    <p className="text-[8px] font-bold text-white truncate mt-0.5">
                      Lv {lvl}
                    </p>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-slate-900 border-slate-700 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {IconComponent ? (
                        <IconComponent className="w-6 h-6 text-orange-400" />
                      ) : (
                        <span className="text-xl">{def.icon}</span>
                      )}
                      <div>
                        <p className="text-sm font-bold text-orange-300">{def.name}</p>
                        <p className="text-xs text-slate-400">Level {lvl}/{def.maxLevel}</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-300 leading-relaxed">{def.description}</p>
                    
                    {lvl < def.maxLevel && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">
                          Cost to upgrade: <span className="text-orange-300 font-bold">{def.costForLevel(lvl)} XP</span>
                        </p>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </div>
    </div>
  );
}
