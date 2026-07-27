'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ABILITY_KEYS,
  ABILITY_DEFINITIONS,
  type AbilityKey,
} from '@shared/ability-progression';
import type { GameProgressionSnapshot } from '@/lib/game-progression-actions';

interface GameMenuProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  avatarUrl?: string;
  /** Loaded lazily so the game doesn't stall waiting on this. */
  progression: GameProgressionSnapshot | null;
  loading: boolean;
  upgrading: AbilityKey | null;
  error?: string | null;
  onUpgrade: (ability: AbilityKey) => void;
}

/**
 * IN-GAME level/XP + power upgrade menu — opened with M during a match.
 * Entirely separate from the website account level shown elsewhere in the
 * HUD (that ring uses `xpProgress` / `src/lib/progression.ts`).
 */
export function GameMenu({
  open,
  onClose,
  username,
  avatarUrl,
  progression,
  loading,
  upgrading,
  error,
  onUpgrade,
}: GameMenuProps) {
  if (!open) return null;

  const level = progression?.level ?? 1;
  const percent = progression?.percent ?? 0;
  const skillPoints = progression?.skillPoints ?? 0;

  return (
    <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-auto p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0f1724]/95 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0f1724]/95 px-6 py-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={username} className="w-11 h-11 rounded-full object-cover border-2 border-white/15" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/10 border-2 border-white/15" />
            )}
            <div>
              <p className="text-white font-black text-lg leading-tight">{username}</p>
              <p className="text-[11px] font-bold tracking-widest text-amber-300/80 uppercase">
                In-Game Level {level}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
            <X className="w-5 h-5 text-white" />
          </Button>
        </div>

        <div className="px-6 pt-4">
          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width] duration-300"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[11px] font-bold text-white/50">
              {loading ? 'Loading…' : `${Math.round(percent)}% to level ${level + 1}`}
            </p>
            <p className="flex items-center gap-1 text-[12px] font-black text-amber-300">
              <Sparkles className="w-3.5 h-3.5" />
              {skillPoints} Skill Point{skillPoints === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {error && (
          <p className="mx-6 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] font-bold text-red-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-6">
          {ABILITY_KEYS.map((key) => {
            const def = ABILITY_DEFINITIONS[key];
            const lvl = progression?.abilities?.[key] ?? 0;
            const atMax = lvl >= def.maxLevel;
            const cost = def.costForLevel(lvl);
            const canAfford = !atMax && skillPoints >= cost;
            return (
              <div
                key={key}
                className="relative rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{def.icon}</span>
                    <div>
                      <p className="text-white font-black text-sm leading-tight">{def.name}</p>
                      <p className="text-[10px] font-bold tracking-wide text-white/40 uppercase">
                        Level {lvl}/{def.maxLevel}
                      </p>
                    </div>
                  </div>
                  {canAfford && (
                    <button
                      onClick={() => onUpgrade(key)}
                      disabled={upgrading === key}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-lg shadow-[0_0_0_3px_rgba(16,185,129,0.25)] transition disabled:opacity-50"
                      aria-label={`Upgrade ${def.name}`}
                      title={`Upgrade for ${cost} Skill Point${cost === 1 ? '' : 's'}`}
                    >
                      {upgrading === key ? '…' : '+'}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-white/50">{def.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[12px] font-bold text-sky-300">{def.effectLabel(lvl)}</p>
                  {!atMax && (
                    <p className="text-[10px] font-bold text-white/35">
                      Next: {cost} SP
                    </p>
                  )}
                  {atMax && <p className="text-[10px] font-black text-amber-300">MAX</p>}
                </div>
                <div className="h-1.5 w-full rounded-full bg-black/40 overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${(lvl / def.maxLevel) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6">
          <p className="text-[10px] font-bold text-white/30 text-center">
            Press M to close · Kill enemies and win matches to earn XP and Skill Points
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook that owns fetching/upgrading in-game progression for the local
 * player, plus whether a "+" level-up indicator should show on the HUD.
 */
export function useGameProgression(userId: string | null | undefined) {
  const [progression, setProgression] = useState<GameProgressionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<AbilityKey | null>(null);
  const [, startTransition] = useTransition();

  const refresh = React.useCallback(() => {
    if (!userId) return;
    setLoading(true);
    import('@/lib/game-progression-actions')
      .then(({ getGameProgression }) => getGameProgression(userId))
      .then((snap) => setProgression(snap))
      .catch(() => setError('Could not load progression'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upgrade = (ability: AbilityKey) => {
    if (!userId || upgrading) return;
    setUpgrading(ability);
    setError(null);
    startTransition(() => {
      import('@/lib/game-progression-actions')
        .then(({ upgradeGameAbility }) => upgradeGameAbility(userId, ability))
        .then((snap) => setProgression(snap))
        .catch((err) => setError(err instanceof Error ? err.message : 'Upgrade failed'))
        .finally(() => setUpgrading(null));
    });
  };

  const hasUnspentPoints = (progression?.skillPoints ?? 0) > 0;

  return { progression, loading, error, upgrading, refresh, upgrade, hasUnspentPoints };
}
