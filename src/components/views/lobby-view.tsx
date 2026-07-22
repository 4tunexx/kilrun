'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '@/components/game/kilrun-engine';
import type { KilrunMode } from './play-view';
import { getMyEquippedSkinAttachments } from '@/lib/social-actions';
import type { SkinAttachment } from '@/lib/player-skins';
import { packMatchLoadout } from '@/lib/match-loadout';
import { getSiteSettings } from '@/lib/progression-actions';
import { getRankForKp, KP_DEFAULT } from '@/lib/kp';
import { parseRankConfig, RANK_MM_OPEN_KEY } from '@/lib/rank-config';
import { mintMyGameJoinToken } from '@/lib/actions';
import {
  clearPartyQueueRoom,
  getMyParty,
  setPartyQueueRoom,
  type PartyDto,
} from '@/lib/party-actions';

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
  const [joinToken, setJoinToken] = useState<string | undefined>(undefined);
  const [tokenReady, setTokenReady] = useState(false);
  const [partyReady, setPartyReady] = useState(false);
  const [party, setParty] = useState<PartyDto | null>(null);
  const [joinByRoomId, setJoinByRoomId] = useState<string | undefined>(undefined);
  const [waitingForLeaderRoom, setWaitingForLeaderRoom] = useState(false);

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
    let cancelled = false;
    void mintMyGameJoinToken()
      .then((token) => {
        if (!cancelled) {
          setJoinToken(token ?? undefined);
          setTokenReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setJoinToken(undefined);
          setTokenReady(true);
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

  // Party join: leader joinOrCreate + publish roomId; members wait then joinById.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const resolveParty = async () => {
      try {
        const p = await getMyParty();
        if (cancelled) return;
        setParty(p);
        if (!p || p.memberIds.length < 2) {
          setJoinByRoomId(undefined);
          setWaitingForLeaderRoom(false);
          setPartyReady(true);
          return;
        }
        if (p.isLeader) {
          setJoinByRoomId(undefined);
          setWaitingForLeaderRoom(false);
          setPartyReady(true);
          return;
        }
        // Member: wait for leader's activeRoomId
        if (p.activeRoomId) {
          setJoinByRoomId(p.activeRoomId);
          setWaitingForLeaderRoom(false);
          setPartyReady(true);
          return;
        }
        setWaitingForLeaderRoom(true);
        setPartyReady(false);
        poll = setInterval(() => {
          void getMyParty().then((next) => {
            if (cancelled || !next) return;
            setParty(next);
            if (next.activeRoomId) {
              setJoinByRoomId(next.activeRoomId);
              setWaitingForLeaderRoom(false);
              setPartyReady(true);
              if (poll) clearInterval(poll);
            }
          });
        }, 1500);
      } catch {
        if (!cancelled) {
          setParty(null);
          setPartyReady(true);
        }
      }
    };

    void resolveParty();
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
    };
  }, [userId, mode, competitiveQueue]);

  const canRanked = rankedAccess ?? isPremium;
  const loadout = useMemo(() => packMatchLoadout(equippedSkins), [equippedSkins]);
  const joinOptions = useMemo(
    () => ({
      userId,
      username,
      avatarUrl,
      ...(joinToken ? { token: joinToken } : {}),
      // Privilege fields are unused when a verified token is present; kept for
      // local/dev servers with no join secret (onAuth falls back to options).
      isAdmin,
      kp,
      isPremium,
      rankedAccess: canRanked,
      equippedSkinsJson: loadout.equippedSkinsJson,
      weaponCombat: loadout.weaponCombat,
      ...(joinByRoomId ? { joinByRoomId } : {}),
      ...(mode === 'competitive' && competitiveQueue === 'ranked'
        ? { rankKey, mmWaitSec, minSameRankPlayers }
        : {}),
    }),
    [
      userId,
      username,
      avatarUrl,
      joinToken,
      isAdmin,
      kp,
      isPremium,
      canRanked,
      mode,
      competitiveQueue,
      rankKey,
      mmWaitSec,
      minSameRankPlayers,
      loadout,
      joinByRoomId,
    ]
  );

  const handleRoomConnected = (roomId: string) => {
    void getMyParty()
      .then((p) => {
        if (!p?.isLeader || p.memberIds.length < 2) return;
        return setPartyQueueRoom(p.id, roomId);
      })
      .catch(() => {});
  };

  const handleExit = () => {
    if (party?.isLeader) {
      void clearPartyQueueRoom().catch(() => {});
    }
    onCancel();
  };

  // Wait for equipped skins + join token so privileges are server-minted.
  if (!skinsReady || !rankReady || !tokenReady || !partyReady) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0a1220] flex items-center justify-center text-white/60 text-sm">
        {waitingForLeaderRoom
          ? 'Waiting for party leader…'
          : mode === 'competitive' && competitiveQueue === 'ranked'
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
      onExit={handleExit}
      onRoomConnected={handleRoomConnected}
      xpProgress={xpProgress}
      isAdmin={isAdmin}
      equippedSkins={equippedSkins}
    />
  );
};

export default LobbyView;
