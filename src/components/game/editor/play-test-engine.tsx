'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '../kilrun-engine';
import { mintMyGameJoinToken, getSessionUser } from '@/lib/actions';
import type { MapDocument } from './map-document';
import { prepareDocForPlayTest } from './prefab-storage';

/**
 * Map editor "Play Test" — renders the REAL live game client (KilrunEngine),
 * not a simplified preview renderer. Same HUD, chat, admin panel, skill /
 * progression menu as an actual match, running your in-editor draft map
 * against a private, solo, no-rewards Deathrun room ('deathrun_practice')
 * so testing never touches real matchmaking, real players, or grants real
 * XP/VP.
 *
 * Deathrun-only for now; Horde/Competitive still use the lighter
 * `MapPlayPreview` renderer until a practice room exists for those modes too.
 */
export function PlayTestEngine({
  doc,
  onClose,
  playTestRole,
}: {
  doc: MapDocument;
  onClose: () => void;
  /** Deathrun only — forces the solo player's role after connecting. */
  playTestRole?: 'runner' | 'trapper';
}) {
  const [joinToken, setJoinToken] = useState<string | undefined>(undefined);
  const [sessionUser, setSessionUser] = useState<{
    userId: string;
    username: string;
    avatarUrl?: string;
    isAdmin: boolean;
  } | null>(null);
  const [ready, setReady] = useState(false);

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
    }),
    [sessionUser, joinToken]
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
      mode="deathrun"
      roomNameOverride="deathrun_practice"
      draftDoc={draftDoc}
      joinOptions={joinOptions}
      onExit={onClose}
      isAdmin={sessionUser.isAdmin}
      practiceRole={playTestRole}
    />
  );
}
