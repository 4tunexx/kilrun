'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '@/components/game/kilrun-engine';
import type { KilrunMode } from './play-view';
import { getMyEquippedSkinAttachments } from '@/lib/social-actions';
import type { SkinAttachment } from '@/lib/player-skins';

interface LobbyViewProps {
  mode: KilrunMode;
  onCancel: () => void;
  userId: string;
  username: string;
  avatarUrl?: string;
  xpProgress?: number;
  isAdmin?: boolean;
  /** Competitive KP for Elo snapshot at join. */
  kp?: number;
  /** Premium active — required for ranked queue. */
  isPremium?: boolean;
  /** Casual (no KP) vs Ranked Premium. */
  competitiveQueue?: 'casual' | 'ranked';
}

const LobbyView: React.FC<LobbyViewProps> = ({
  mode,
  onCancel,
  userId,
  username,
  avatarUrl,
  xpProgress = 0,
  isAdmin = false,
  kp,
  isPremium = false,
  competitiveQueue = 'casual',
}) => {
  const joinOptions = useMemo(
    () => ({ userId, username, avatarUrl, isAdmin, kp, isPremium, rankedAccess: isPremium }),
    [userId, username, avatarUrl, isAdmin, kp, isPremium]
  );
  const [equippedSkins, setEquippedSkins] = useState<SkinAttachment[]>([]);
  const [skinsReady, setSkinsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMyEquippedSkinAttachments()
      .then((atts) => {
        if (!cancelled) {
          setEquippedSkins(atts);
          setSkinsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEquippedSkins([]);
          setSkinsReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Wait for equipped skins so the local avatar spawns with shop gear once.
  if (!skinsReady) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0a1220] flex items-center justify-center text-white/60 text-sm">
        Loading avatar skins…
      </div>
    );
  }

  return (
    <KilrunEngine
      mode={mode}
      competitiveQueue={competitiveQueue}
      joinOptions={joinOptions}
      onExit={onCancel}
      xpProgress={xpProgress}
      isAdmin={isAdmin}
      equippedSkins={equippedSkins}
    />
  );
};

export default LobbyView;
