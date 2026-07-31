'use client';

import { useState } from 'react';
import { Hexagon, Sparkles } from 'lucide-react';
import { GameMenu, useGameProgression } from '@/components/game/ui/game-menu';

/**
 * Profile-page entry point for the power skill tree — same GameMenu
 * component the in-game "press M" menu uses (it already talks to
 * upgradeGameAbility as a plain server action, not a Colyseus room message,
 * so it works unmodified outside a live match). Opens as a full-viewport
 * modal on click.
 */
export function PowerSkillTreeLauncher({
  userId,
  username,
  avatarUrl,
  readOnly = false,
}: {
  userId: string;
  username: string;
  avatarUrl?: string;
  /** Viewing someone else's profile — view only, spending is for your own tree. */
  readOnly?: boolean;
}) {
  const { progression, loading, error, upgrading, powers, upgrade } = useGameProgression(userId);
  const [open, setOpen] = useState(false);

  const level = progression?.level ?? 1;
  const skillPoints = progression?.skillPoints ?? 0;
  const hasPoints = !readOnly && !loading && skillPoints > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl border border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/60 hover:border-amber-400/40 transition-colors p-4 text-left"
      >
        <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
          <Hexagon className="w-5 h-5 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Power Skill Tree</p>
          <p className="text-xs text-slate-400">
            {loading ? 'Loading…' : `In-game Level ${level}`}
            {hasPoints && (
              <span className="ml-1.5 text-amber-300 font-bold">
                · {skillPoints} unspent Skill Point{skillPoints === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>
        {hasPoints ? (
          <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-400 text-black text-[10px] font-black px-2 py-1">
            <Sparkles className="w-3 h-3" />
            {skillPoints}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
            View tree
          </span>
        )}
      </button>

      <GameMenu
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        username={username}
        avatarUrl={avatarUrl}
        progression={progression}
        loading={loading}
        upgrading={upgrading}
        error={error}
        onUpgrade={upgrade}
        powers={powers}
        readOnly={readOnly}
        positioning="viewport"
      />
    </>
  );
}
