'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '@/components/game/kilrun-engine';
import type { KilrunMode } from './play-view';
import { getMyEquippedSkinAttachments } from '@/lib/social-actions';
import type { SkinAttachment } from '@/lib/player-skins';
import { getSiteSettings } from '@/lib/progression-actions';
import { getRankForKp, KP_DEFAULT } from '@/lib/kp';
import { parseRankConfig, RANK_MM_OPEN_KEY } from '@/lib/rank-config';

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
  /** Premium membership active. */
  isPremium?: boolean;
  /** Premium or free Ranked week — may enter Ranked queue. */
  rankedAccess?: boolean;
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
  rankedAccess,
  competitiveQueue = 'casual',
}) => {
  const [equippedSkins, setEquippedSkins] = useState<SkinAttachment[]>([]);
  const [skinsReady, setSkinsReady] = useState(false);
  const [rankReady, setRankReady] = useState(mode !== 'competitive');
  const [rankKey, setRankKey] = useState(RANK_MM_OPEN_KEY);
  const [mmWaitSec, setMmWaitSec] = useState(12);
  const [minSameRankPlayers, setMinSameRankPlayers] = useState(4);

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

  useEffect(() => {
    if (mode !== 'competitive' || competitiveQueue !== 'ranked') {
      setRankReady(true);
      setRankKey(RANK_MM_OPEN_KEY);
      return;
    }
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        const cfg = parseRankConfig(
          (s as { rankConfigJson?: string }).rankConfigJson ?? '{}'
        );
        const playerKp = typeof kp === 'number' ? kp : KP_DEFAULT;
        const tier = getRankForKp(playerKp, cfg.tiers);
        setRankKey(tier);
        setMmWaitSec(cfg.matchmakingWaitSec);
        setMinSameRankPlayers(cfg.minSameRankPlayers);
        setRankReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const playerKp = typeof kp === 'number' ? kp : KP_DEFAULT;
        setRankKey(getRankForKp(playerKp));
        setRankReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, competitiveQueue, kp]);

  const canRanked = rankedAccess ?? isPremium;
  const joinOptions = useMemo(
    () => ({
      userId,
      username,
      avatarUrl,
      isAdmin,
      kp,
      isPremium,
      rankedAccess: canRanked,
      ...(mode === 'competitive' && competitiveQueue === 'ranked'
        ? { rankKey, mmWaitSec, minSameRankPlayers }
        : {}),
    }),
    [
      userId,
      username,
      avatarUrl,
      isAdmin,
      kp,
      isPremium,
      canRanked,
      mode,
      competitiveQueue,
      rankKey,
      mmWaitSec,
      minSameRankPlayers,
    ]
  );

  // Wait for equipped skins so the local avatar spawns with shop gear once.
  if (!skinsReady || !rankReady) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0a1220] flex items-center justify-center text-white/60 text-sm">
        {mode === 'competitive' && competitiveQueue === 'ranked'
          ? 'Finding Ranked match…'
          : 'Loading avatar skins…'}
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
