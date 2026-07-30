'use client';

/**
 * Admin -> Live tab: view active Colyseus matches and control them without
 * joining. Backed by server/src/index.ts's /admin/live-matches HTTP routes
 * (single-process deployment — matchMaker.getLocalRoomById() gives direct
 * access to the live Room instance, see that file's comment for why no
 * cross-process remoteRoomCall is needed).
 *
 * Pause/Cancel/Message are admin-only (mods can view, matching the same
 * admin-only boundary as the in-game X-panel's kick/mute/ban). Cancel never
 * grants rewards or touches Ranked KP — see adminCancelMatch() on each Room
 * class and the results-screen wasCancelled guards.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pause, Play, Ban, Send, RefreshCw, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  adminListLiveMatches,
  adminPauseLiveMatch,
  adminResumeLiveMatch,
  adminCancelLiveMatch,
  adminSendLiveMatchMessage,
  type LiveMatch,
} from '@/lib/live-match-actions';

const MODE_LABEL: Record<string, string> = {
  deathrun: 'Deathrun',
  horde: 'Horde',
  competitive: 'Competitive',
  competitive_ranked: 'Competitive (Ranked)',
};

export function AdminLiveMatchesPanel() {
  const { toast } = useToast();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busyRoomId, setBusyRoomId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<Record<string, string>>({});
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

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
                className="rounded-lg border border-border/60 p-3 space-y-2"
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
                  <p className="text-xs text-muted-foreground truncate">
                    {m.players.map((p) => `${p.username} (${p.role})`).join(', ')}
                  </p>
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
