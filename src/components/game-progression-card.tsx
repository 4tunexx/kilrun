'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { STATIC_FALLBACK_POWERS, type PowerDefinitionRecord } from '@shared/ability-progression';
import {
  getGameProgression,
  getPowerDefinitionsForMenu,
  type GameProgressionSnapshot,
} from '@/lib/game-progression-actions';
import { costForLevelFormula, isImageIcon } from '@shared/power-definitions';
import { getLucideIcon } from '@/lib/move-icons';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/** Renders an ability's `icon` as an uploaded image when it's a URL, else as
 * the plain emoji glyph — same convention as power-editor.tsx / game-menu.tsx.
 * Without this check, an admin-uploaded icon URL would render as literal
 * text instead of an image. */
function AbilityIcon({ icon, className }: { icon: string; className?: string }) {
  const Lucide = getLucideIcon(icon);
  if (Lucide) return <Lucide className={(className ?? '') + ' object-contain'} />;
  if (isImageIcon(icon)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={(className ?? '') + ' object-contain'} />;
  }
  return <span className={className}>{icon}</span>;
}

/**
 * Read-only card for the in-game (match) level + power upgrades.
 * Separate from the website account level shown elsewhere on the profile —
 * upgrades can only be spent from the in-game menu (press M during a match).
 */
export function GameProgressionCard({ userId }: { userId: string }) {
  const [snap, setSnap] = useState<GameProgressionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  // Fetched explicitly rather than read off the shared ABILITY_DEFINITIONS
  // singleton — that object is mutated by applyDynamicPowerDefinitions()
  // running on the server (inside the getGameProgression server action),
  // which has zero effect on this client bundle's own separate copy of the
  // same module. Reading the singleton here meant this grid could never see
  // admin icon edits, even though the tree (which receives `powers` as an
  // explicit prop from this same fetch) always has.
  const [powers, setPowers] = useState<PowerDefinitionRecord[]>(STATIC_FALLBACK_POWERS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getGameProgression(userId), getPowerDefinitionsForMenu()])
      .then(([res, defs]) => {
        if (cancelled) return;
        setSnap(res);
        if (Array.isArray(defs) && defs.length > 0) setPowers(defs);
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

        <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden mb-1 relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 animate-shimmer"
            style={{ width: `${Math.max(2, snap.percent)}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {snap.xpIntoLevel} / {snap.xpForNextLevel} XP to level {snap.level + 1}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {powers.map((def) => {
            const key = def.key;
            const lvl = snap.abilities[key] ?? 0;
            const locked = snap.level < def.unlockLevel;

            return (
              <Popover key={key}>
                <PopoverTrigger asChild>
                  <button
                    className={`rounded-lg border p-2.5 flex items-center gap-2 transition-all cursor-help text-left w-full ${
                      locked
                        ? 'border-slate-700/25 bg-slate-900/20 opacity-50'
                        : 'border-slate-700/40 bg-slate-900/40 hover:border-orange-400/50 hover:bg-slate-900/60'
                    }`}
                  >
                    <AbilityIcon
                      icon={def.icon}
                      className={`shrink-0 ${isImageIcon(def.icon) || getLucideIcon(def.icon) ? 'w-6 h-6' : 'text-lg leading-none'} ${locked ? 'grayscale opacity-70' : ''}`}
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{def.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">
                        {locked ? `🔒 Lv ${def.unlockLevel}` : `Lv ${lvl}/${def.maxLevel}`}
                      </p>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-slate-900 border-slate-700 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AbilityIcon icon={def.icon} className={isImageIcon(def.icon) || getLucideIcon(def.icon) ? 'w-8 h-8 shrink-0' : 'text-xl'} />
                      <div>
                        <p className="text-sm font-bold text-orange-300">{def.name}</p>
                        <p className="text-xs text-slate-400">
                          {locked ? `Unlocks at level ${def.unlockLevel}` : `Level ${lvl}/${def.maxLevel}`}
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{def.description}</p>

                    {!locked && lvl < def.maxLevel && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-slate-400">
                          Cost to upgrade: <span className="text-orange-300 font-bold">{costForLevelFormula(def.cost, lvl)} XP</span>
                        </p>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
