'use client';

import React, { useEffect, useMemo, useState } from 'react';
import KilrunEngine from '../kilrun-engine';
import { mintMyGameJoinToken, getSessionUser } from '@/lib/actions';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';
import { hasEngineSession, mintEngineJoinToken } from '@/lib/engine/platform-client';
import type { CoreKilrunMode, KilrunMode } from '@/lib/game-modes';
import { isCoreKilrunMode, resolveModeBase } from '@/lib/game-modes';
import type { MapDocument } from './map-document';
import { prepareDocForPlayTest } from './prefab-storage';
import type { GameRoomName } from '../net/connection';
import { MapPlayPreview } from './map-play-preview';
import { Button } from '@/components/ui/button';
import { Play, Wifi, WifiOff } from 'lucide-react';

const PRACTICE_ROOM: Record<CoreKilrunMode, GameRoomName> = {
  deathrun: 'deathrun_practice',
  horde: 'horde_practice',
  competitive: 'competitive_practice',
};

const DEFAULT_EDITOR_USER = {
  userId: 'desktop-editor',
  username: 'Editor',
  avatarUrl: '/K2.png',
  isAdmin: true,
};

function createLocalPracticeToken(): string {
  const claims = {
    userId: 'desktop-editor',
    steamId: '0',
    username: 'Editor',
    avatarUrl: '/K2.png',
    isAdmin: true,
    isStaff: true,
    isPremium: true,
    rankedAccess: true,
    kp: 1000,
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  try {
    const body = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${body}.desktop-editor-practice-token`;
  } catch {
    return 'dev-practice-token';
  }
}

/**
 * Map editor "Play Test (Live)" — real KilrunEngine against a private
 * solo practice room for the map's mode (no matchmaking / rewards),
 * with instant fallback to full offline live simulation if the game server is offline.
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
  const [offlineSimMode, setOfflineSimMode] = useState(false);

  const simMode = resolveModeBase(mode);
  const practiceRoom: GameRoomName = isCoreKilrunMode(mode)
    ? PRACTICE_ROOM[simMode]
    : `${mode}_practice`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (isKilrunEngineDesktop() && hasEngineSession()) {
          const minted = await mintEngineJoinToken();
          if (cancelled) return;
          setJoinToken(minted.token ?? createLocalPracticeToken());
          if (minted.user) {
            setSessionUser({
              userId: minted.user.id,
              username: minted.user.username || 'Player',
              avatarUrl: minted.user.avatarUrl,
              isAdmin: minted.user.role === 'admin',
            });
            return;
          }
        }
        const [token, user] = await Promise.all([
          mintMyGameJoinToken().catch(() => null),
          getSessionUser().catch(() => null),
        ]);
        if (cancelled) return;
        setJoinToken(token ?? createLocalPracticeToken());
        if (user) {
          setSessionUser({
            userId: user.id,
            username: user.username || 'Player',
            avatarUrl: user.avatarUrl || undefined,
            isAdmin: user.role === 'admin',
          });
        } else {
          setSessionUser(DEFAULT_EDITOR_USER);
        }
      } catch {
        if (!cancelled) {
          setJoinToken(createLocalPracticeToken());
          setSessionUser(DEFAULT_EDITOR_USER);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const draftDoc = useMemo(() => prepareDocForPlayTest(doc).doc, [doc]);

  const joinOptions = useMemo(
    () => ({
      userId: sessionUser?.userId ?? 'desktop-editor',
      username: sessionUser?.username ?? 'Player',
      avatarUrl: sessionUser?.avatarUrl,
      token: joinToken || createLocalPracticeToken(),
      isAdmin: sessionUser?.isAdmin ?? true,
      ...(simMode === 'competitive' && (playTestRole === 'team_a' || playTestRole === 'team_b')
        ? { teamRequest: playTestRole as 'team_a' | 'team_b' }
        : {}),
    }),
    [sessionUser, joinToken, simMode, playTestRole]
  );

  if (offlineSimMode) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#080b12] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-white/10 z-[100]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <WifiOff className="w-3.5 h-3.5" /> Offline Live Simulator Active
            </span>
            <span className="text-xs text-white/50">Full physics, weapons, &amp; AAA HUD</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            onClick={() => setOfflineSimMode(false)}
          >
            <Wifi className="w-3.5 h-3.5 mr-1" /> Try Live Server Again
          </Button>
        </div>
        <div className="flex-1 relative">
          <MapPlayPreview
            doc={draftDoc}
            onClose={onClose}
            playTestRole={playTestRole}
          />
        </div>
      </div>
    );
  }

  if (!ready || !sessionUser) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#080b12] flex flex-col items-center justify-center gap-4 text-white">
        <div className="animate-spin w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p className="text-sm font-semibold tracking-wide text-white/70">Initializing Live Test Engine…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <div className="absolute top-3 left-4 z-[400] flex items-center gap-2 pointer-events-auto">
        <Button
          size="sm"
          variant="secondary"
          className="bg-black/60 backdrop-blur border border-white/15 text-white/80 hover:text-white text-xs shadow-lg"
          onClick={() => setOfflineSimMode(true)}
          title="Switch to standalone offline live simulator if live game server is not running"
        >
          <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Switch to Offline Sim
        </Button>
      </div>
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
    </div>
  );
}
