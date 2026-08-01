'use client';

/**
 * Admin -> Live tab: view active Colyseus matches and control them without
 * joining. Backed by server/src/index.ts's /admin/live-matches HTTP routes
 * (single-process deployment — matchMaker.getLocalRoomById() gives direct
 * access to the live Room instance, see that file's comment for why no
 * cross-process remoteRoomCall is needed).
 *
 * Pause/Cancel/Message and the per-player Kick/Mute/Ban menu are admin-only
 * (mods can view, matching the same admin-only boundary as the in-game
 * X-panel's kick/mute/ban). Cancel never grants rewards or touches Ranked
 * KP — see adminCancelMatch() on each Room class and the results-screen
 * wasCancelled guards. Per-player actions reuse the exact same room-side
 * kick/mute/ban logic as the in-game X-panel, just triggered over HTTP
 * instead of a Colyseus message from an in-room admin client.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Pause,
  Play,
  Ban,
  Send,
  RefreshCw,
  Radio,
  MoreVertical,
  UserX,
  VolumeX,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  adminListLiveMatches,
  adminPauseLiveMatch,
  adminResumeLiveMatch,
  adminCancelLiveMatch,
  adminSendLiveMatchMessage,
  adminKickLiveMatchPlayer,
  adminMuteLiveMatchPlayer,
  adminBanLiveMatchPlayer,
  type LiveMatch,
} from '@/lib/live-match-actions';

const MODE_LABEL: Record<string, string> = {
  deathrun: 'Deathrun',
  horde: 'Horde',
  competitive: 'Competitive',
  competitive_ranked: 'Competitive (Ranked)',
};

const ROLE_LABEL: Record<string, string> = {
  trapper: 'Trapper',
  runner: 'Runner',
  survivor: 'Survivor',
  team_a: 'Team A',
  team_b: 'Team B',
};

const MUTE_DURATIONS = [5, 15, 60] as const;

export function AdminLiveMatchesPanel() {
  const { toast } = useToast();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [busyPlayerKey, setBusyPlayerKey] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<Record<string, string>>({});
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [confirmBanPlayer, setConfirmBanPlayer] = useState<string | null>(null);
  const [copiedSteamId, setCopiedSteamId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await adminListLiveMatches();
    if (result.ok) {
      setMatches(result.matches);
      setFetchError(null);
    } else {
      setFetchError(result.error || 'Failed to reach the game server');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    setConfirmBanPlayer(null);
  }, [matches.length]);

  const withBusy = async (roomId: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyRoomId(roomId);
    try {
      const result = await fn();
      if (!result.ok) {
        toast({ title: result.error || 'Action failed', variant: 'destructive' });
      } else {
        await refresh();
      }
    } finally {
      setBusyRoomId(null);
    }
  };

  const withPlayerBusy = async (
    key: string,
    successTitle: string,
    fn: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    setBusyPlayerKey(key);
    try {
      const result = await fn();
      if (!result.ok) {
        toast({ title: result.error || 'Action failed', variant: 'destructive' });
      } else {
        toast({ title: successTitle });
        await refresh();
      }
    } finally {
      setBusyPlayerKey(null);
    }
  };

  const copySteamId = async (steamId: string) => {
    try {
      await navigator.clipboard.writeText(steamId);
      setCopiedSteamId(steamId);
      window.setTimeout(() => setCopiedSteamId((c) => (c === steamId ? null : c)), 1500);
    } catch {
      toast({ title: 'Could not copy to clipboard', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" /> Live Matches
          </span>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        ) : fetchError ? (
          <p className="text-sm text-destructive">
            {fetchError} — is the game server deployed with a matching
            GAME_SERVER_ADMIN_SECRET and NEXT_PUBLIC_GAME_SERVER_URL set?
          </p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No live matches right now.</p>
        ) : (
          matches.map((m) => {
            const isBusy = busyRoomId === m.roomId;
            return (
              <div
                key={m.roomId}
                className="rounded-lg border border-border/60 p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {MODE_LABEL[m.mode] ?? m.mode}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {m.phase}
                    </Badge>
                    {m.paused && (
                      <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/40">
                        Paused
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {m.playerCount} player{m.playerCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.paused ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => withBusy(m.roomId, () => adminResumeLiveMatch(m.roomId))}
                      >
                        <Play className="w-3.5 h-3.5 mr-1" /> Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => withBusy(m.roomId, () => adminPauseLiveMatch(m.roomId))}
                      >
                        <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                      </Button>
                    )}
                    {confirmCancel === m.roomId ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmCancel(null);
                          void withBusy(m.roomId, () => adminCancelLiveMatch(m.roomId));
                        }}
                      >
                        Confirm cancel?
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => setConfirmCancel(m.roomId)}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" /> Cancel match
                      </Button>
                    )}
                  </div>
                </div>

                {m.players.length > 0 && (
                  <div className="space-y-1">
                    {m.players.map((p) => {
                      const playerKey = `${m.roomId}:${p.sessionId}`;
                      const playerBusy = busyPlayerKey === playerKey;
                      return (
                        <div
                          key={p.sessionId}
                          className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5"
                        >
                          <PlayerAvatar
                            src={p.avatarUrl}
                            name={p.username}
                            className="h-6 w-6"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">{p.username}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {ROLE_LABEL[p.role] ?? (p.role || '—')}
                              </Badge>
                            </div>
                            <button
                              type="button"
                              onClick={() => p.steamId && void copySteamId(p.steamId)}
                              disabled={!p.steamId}
                              title={p.steamId ? 'Click to copy Steam ID' : 'Steam ID unavailable'}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono truncate hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
                            >
                              {p.steamId || 'Steam ID unavailable'}
                              {p.steamId &&
                                (copiedSteamId === p.steamId ? (
                                  <Check className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5 shrink-0" />
                                ))}
                            </button>
                          </div>

                          {confirmBanPlayer === playerKey ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs shrink-0"
                              disabled={playerBusy}
                              onClick={() => {
                                setConfirmBanPlayer(null);
                                void withPlayerBusy(playerKey, `Banned ${p.username}`, () =>
                                  adminBanLiveMatchPlayer(m.roomId, p.sessionId)
                                );
                              }}
                            >
                              Confirm ban?
                            </Button>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 shrink-0"
                                  disabled={playerBusy}
                                >
                                  {playerBusy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                                  Mute
                                </DropdownMenuLabel>
                                {MUTE_DURATIONS.map((mins) => (
                                  <DropdownMenuItem
                                    key={mins}
                                    onClick={() =>
                                      void withPlayerBusy(
                                        playerKey,
                                        `Muted ${p.username} for ${mins}m`,
                                        () => adminMuteLiveMatchPlayer(m.roomId, p.sessionId, mins)
                                      )
                                    }
                                  >
                                    <VolumeX className="w-3.5 h-3.5 mr-2 text-amber-400" />
                                    {mins} minutes
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    void withPlayerBusy(playerKey, `Kicked ${p.username}`, () =>
                                      adminKickLiveMatchPlayer(m.roomId, p.sessionId)
                                    )
                                  }
                                >
                                  <UserX className="w-3.5 h-3.5 mr-2 text-orange-400" />
                                  Kick
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setConfirmBanPlayer(playerKey)}
                                >
                                  <Ban className="w-3.5 h-3.5 mr-2" />
                                  Ban account…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Message everyone in this match…"
                    value={messageDraft[m.roomId] ?? ''}
                    onChange={(e) =>
                      setMessageDraft((prev) => ({ ...prev, [m.roomId]: e.target.value }))
                    }
                    maxLength={240}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={isBusy || !(messageDraft[m.roomId] ?? '').trim()}
                    onClick={async () => {
                      const text = (messageDraft[m.roomId] ?? '').trim();
                      if (!text) return;
                      await withBusy(m.roomId, () => adminSendLiveMatchMessage(m.roomId, text));
                      setMessageDraft((prev) => ({ ...prev, [m.roomId]: '' }));
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
