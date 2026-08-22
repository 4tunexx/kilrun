'use client';

import { GameMenu, useGameProgression } from '@/components/game/ui/game-menu';

/**
 * Profile-page entry point for the power skill tree — same GameMenu
 * component the in-game "press M" menu uses (it already talks to
 * upgradeGameAbility via /api/game/progression (same menu as in-match M),
 * so it works unmodified outside a live match). Rendered inline in the page
 * flow (no launcher button / modal) so the tree is visible immediately.
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

  return (
    <GameMenu
      open
      onClose={() => {}}
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
      positioning="inline"
    />
  );
}
