'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ABILITY_KEYS,
  ABILITY_DEFINITIONS,
  getNewlyUnlockedAbilities,
  type AbilityDefinition,
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
    <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-md pointer-events-auto p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.09] to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-b from-[#0f1724]/95 to-[#0f1724]/80 backdrop-blur-xl px-6 py-4">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={username} className="w-11 h-11 rounded-full object-cover border-2 border-white/20 shadow-lg" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/10 border-2 border-white/20" />
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
            const locked = level < def.unlockLevel;
            const canAfford = !locked && !atMax && skillPoints >= cost;
            return (
              <div
                key={key}
                className={`relative rounded-xl border p-4 flex flex-col gap-2 transition ${
                  locked
                    ? 'border-white/5 bg-white/[0.02] opacity-60'
                    : 'border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.015] hover:border-white/20'
                }`}
              >
                {locked && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white/50">
                    🔒 Level {def.unlockLevel}
                  </div>
                )}
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
                  <p className="text-[12px] font-bold text-sky-300">
                    {locked ? `🔒 Unlocks at Level ${def.unlockLevel}` : def.effectLabel(lvl)}
                  </p>
                  {!locked && !atMax && (
                    <p className="text-[10px] font-bold text-white/35">
                      Next: {cost} SP
                    </p>
                  )}
                  {!locked && atMax && <p className="text-[10px] font-black text-amber-300">MAX</p>}
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
/**
 * Nice popup shown when the player's in-game level just went up — lists any
 * abilities that just became unlockable in that jump (e.g. hit level 10,
 * "Invisibility" is now spendable).
 */
export function LevelUpPopup({
  event,
  onDismiss,
}: {
  event: { fromLevel: number; toLevel: number; unlocked: AbilityDefinition[] } | null;
  onDismiss: () => void;
}) {
  if (!event) return null;
  return (
    <div className="absolute inset-0 z-[270] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-gradient-to-b from-white/[0.09] to-white/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-6 text-center">
          <Sparkles className="w-9 h-9 text-amber-300" />
          <p className="text-2xl font-black text-white">Level Up!</p>
          <p className="text-sm font-bold text-amber-300">
            Level {event.fromLevel} → {event.toLevel}
          </p>
        </div>
        {event.unlocked.length > 0 && (
          <div className="px-6 pb-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-white/40 mb-2 text-center">
              New power{event.unlocked.length > 1 ? 's' : ''} unlocked
            </p>
            <div className="flex flex-col gap-2">
              {event.unlocked.map((def) => (
                <div
                  key={def.key}
                  className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2"
                >
                  <span className="text-2xl leading-none">{def.icon}</span>
                  <div className="text-left">
                    <p className="text-white font-black text-sm leading-tight">{def.name}</p>
                    <p className="text-[11px] text-white/50">{def.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-6 pb-6 pt-4">
          <Button className="w-full font-black" onClick={onDismiss}>
            Nice!
          </Button>
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
  const [levelUpEvent, setLevelUpEvent] = useState<{
    fromLevel: number;
    toLevel: number;
    unlocked: ReturnType<typeof getNewlyUnlockedAbilities>;
  } | null>(null);
  const [, startTransition] = useTransition();

  const checkLevelUp = React.useCallback(
    (snap: GameProgressionSnapshot | null) => {
      if (!snap || !userId || typeof window === 'undefined') return;
      const key = `kilrun.gameLevel.lastSeen.${userId}`;
      const stored = window.localStorage.getItem(key);
      const lastSeen = stored ? parseInt(stored, 10) : snap.level;
      if (Number.isFinite(lastSeen) && snap.level > lastSeen) {
        setLevelUpEvent({
          fromLevel: lastSeen,
          toLevel: snap.level,
          unlocked: getNewlyUnlockedAbilities(lastSeen, snap.level),
        });
      }
      window.localStorage.setItem(key, String(snap.level));
    },
    [userId]
  );

  const refresh = React.useCallback(() => {
    if (!userId) return;
    setLoading(true);
    import('@/lib/game-progression-actions')
      .then(({ getGameProgression }) => getGameProgression(userId))
      .then((snap) => {
        setProgression(snap);
        checkLevelUp(snap);
      })
      .catch(() => setError('Could not load progression'))
      .finally(() => setLoading(false));
  }, [userId, checkLevelUp]);

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
        .then((snap) => {
          setProgression(snap);
          checkLevelUp(snap);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Upgrade failed'))
        .finally(() => setUpgrading(null));
    });
  };

  const hasUnspentPoints = (progression?.skillPoints ?? 0) > 0;

  return {
    progression,
    loading,
    error,
    upgrading,
    refresh,
    upgrade,
    hasUnspentPoints,
    levelUpEvent,
    dismissLevelUp: () => setLevelUpEvent(null),
  };
}
