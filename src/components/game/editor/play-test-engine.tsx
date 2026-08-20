'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '../kilrun-engine';
import { mintMyGameJoinToken, getSessionUser } from '@/lib/actions';
import type { CoreKilrunMode, KilrunMode } from '@/lib/game-modes';
import { isCoreKilrunMode, resolveModeBase } from '@/lib/game-modes';
import type { MapDocument } from './map-document';
import { prepareDocForPlayTest } from './prefab-storage';
import type { GameRoomName } from '../net/connection';

const PRACTICE_ROOM: Record<CoreKilrunMode, GameRoomName> = {
  deathrun: 'deathrun_practice',
  horde: 'horde_practice',
  competitive: 'competitive_practice',
};

/**
 * Map editor "Play Test (Live)" — real KilrunEngine against a private
 * solo practice room for the map's mode (no matchmaking / rewards).
 */
export function PlayTestEngine({
  doc,
  onClose,
  playTestRole,
  mode = 'deathrun',
}: {
  doc: MapDocument;
  onClose: () => void;
  playTestRole?: 'runner' | 'trapper' | 'team_a' | 'team_b';
  mode?: KilrunMode;
}) {
  const [joinToken, setJoinToken] = useState<string | undefined>(undefined);
  const [sessionUser, setSessionUser] = useState<{
    userId: string;
    username: string;
    avatarUrl?: string;
    isAdmin: boolean;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const simMode = resolveModeBase(mode);
  const practiceRoom: GameRoomName = isCoreKilrunMode(mode)
    ? PRACTICE_ROOM[simMode]
    : `${mode}_practice`;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([mintMyGameJoinToken().catch(() => null), getSessionUser().catch(() => null)])
      .then(([token, user]) => {
        if (cancelled) return;
        setJoinToken(token ?? undefined);
        if (user) {
          setSessionUser({
            userId: user.id,
            username: user.username || 'Player',
            avatarUrl: user.avatarUrl || undefined,
            isAdmin: user.role === 'admin',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Mint once per Play Test session — token is short-lived but the practice
    // room session is meant to be brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draftDoc = useMemo(() => prepareDocForPlayTest(doc).doc, [doc]);

  const joinOptions = useMemo(
    () => ({
      userId: sessionUser?.userId ?? '',
      username: sessionUser?.username ?? 'Player',
      avatarUrl: sessionUser?.avatarUrl,
      ...(joinToken ? { token: joinToken } : {}),
      isAdmin: sessionUser?.isAdmin ?? false,
      ...(simMode === 'competitive' && (playTestRole === 'team_a' || playTestRole === 'team_b')
        ? { teamRequest: playTestRole as 'team_a' | 'team_b' }
        : {}),
    }),
    [sessionUser, joinToken, simMode, playTestRole]
  );

  if (!ready || !sessionUser) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center text-white/60 text-sm">
        {ready ? 'You must be signed in to Play Test.' : 'Starting Play Test…'}
      </div>
    );
  }

  return (
    <KilrunEngine
      mode={mode}
      roomNameOverride={practiceRoom}
      draftDoc={draftDoc}
      joinOptions={joinOptions}
      onExit={onClose}
      isAdmin={sessionUser.isAdmin}
      practiceRole={
        simMode === 'deathrun' && (playTestRole === 'runner' || playTestRole === 'trapper')
          ? playTestRole
          : undefined
      }
    />
  );
}
