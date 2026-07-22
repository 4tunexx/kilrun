'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Loader2,
  LogOut,
  PartyPopper,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import {
  clearPartyQueueRoom,
  createParty,
  getMyParty,
  inviteFriendToParty,
  joinPartyByCode,
  kickPartyMember,
  leaveParty,
  type PartyDto,
} from '@/lib/party-actions';
import { getFriends } from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';
import type { KilrunMode } from '@/lib/game-modes';
import type { CompetitiveQueue } from '@/components/views/play-view';

type FriendRow = {
  id: string;
  username: string;
  avatarUrl: string;
};

interface PartyPanelProps {
  userId: string;
  /** When leader is queuing, members can follow into the lobby. */
  onFollowLeader?: (
    mode: KilrunMode,
    opts?: { competitiveQueue?: CompetitiveQueue }
  ) => void;
}

function modeFromPartyMode(
  mode: string | null
): { mode: KilrunMode; competitiveQueue?: CompetitiveQueue } | null {
  if (!mode) return null;
  if (mode === 'competitive_ranked') {
    return { mode: 'competitive', competitiveQueue: 'ranked' };
  }
  if (mode === 'competitive') {
    return { mode: 'competitive', competitiveQueue: 'casual' };
  }
  if (mode === 'deathrun' || mode === 'horde') {
    return { mode: mode };
  }
  return null;
}

export function PartyPanel({ userId, onFollowLeader }: PartyPanelProps) {
  const { toast } = useToast();
  const [party, setParty] = useState<PartyDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const followedRoomRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await getMyParty();
      setParty(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    const t = setInterval(() => {
      void refresh();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    if (!party || party.isLeader || !party.activeRoomId || !party.mode) return;
    if (followedRoomRef.current === party.activeRoomId) return;
    const parsed = modeFromPartyMode(party.mode);
    if (!parsed || !onFollowLeader) return;
    followedRoomRef.current = party.activeRoomId;
    onFollowLeader(parsed.mode, {
      competitiveQueue: parsed.competitiveQueue,
    });
  }, [party, onFollowLeader]);

  useEffect(() => {
    if (!inviteOpen) return;
    void getFriends()
      .then((rows) => {
        setFriends(
          rows.map((f) => ({
            id: f.id,
            username: f.username,
            avatarUrl: f.avatarUrl,
          }))
        );
      })
      .catch(() => setFriends([]));
  }, [inviteOpen]);

  const run = async (fn: () => Promise<unknown>, okTitle?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (okTitle) toast({ title: okTitle });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Party action failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading party…
      </div>
    );
  }

  if (!party) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-slate-100 font-semibold">
          <Users className="h-4 w-4 text-sky-400" />
          Party
        </div>
        <p className="text-xs text-slate-400">
          Queue together — create a party or join with a 6-character invite code.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => createParty(), 'Party created')}
          >
            <PartyPopper className="h-3.5 w-3.5 mr-1.5" />
            Create party
          </Button>
          <div className="flex gap-1.5 flex-1 min-w-[10rem]">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={8}
              className="h-8 font-mono tracking-widest uppercase"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || joinCode.trim().length < 4}
              onClick={() =>
                void run(() => joinPartyByCode(joinCode), 'Joined party')
              }
            >
              Join
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const leaderQueuing = !!party.activeRoomId && !!party.mode;

  return (
    <div className="rounded-xl border border-sky-700/30 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-slate-100 font-semibold">
          <Users className="h-4 w-4 text-sky-400" />
          Party
          <span className="text-[11px] font-mono tracking-widest text-sky-300/90 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
            {party.code}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => {
              void navigator.clipboard.writeText(party.code);
              toast({ title: 'Invite code copied' });
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await leaveParty();
                setParty(null);
              }, 'Left party')
            }
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {party.members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-1.5 rounded-lg bg-slate-950/50 border border-slate-700/40 pl-1 pr-2 py-1"
          >
            <PlayerAvatar
              src={m.avatarUrl}
              name={m.username}
              className="h-7 w-7"
            />
            <span className="text-xs text-slate-200 max-w-[6rem] truncate">
              {m.username}
              {m.id === party.leaderId ? ' ★' : ''}
            </span>
            {party.isLeader && m.id !== userId && (
              <button
                type="button"
                className="text-rose-400/80 hover:text-rose-300"
                title="Kick"
                disabled={busy}
                onClick={() =>
                  void run(() => kickPartyMember(m.id), 'Member kicked')
                }
              >
                <UserMinus className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!party.isLeader && leaderQueuing && (
        <p className="text-xs text-amber-200/90 animate-pulse">
          Leader is queuing… joining their lobby…
        </p>
      )}
      {!party.isLeader && !leaderQueuing && (
        <p className="text-xs text-slate-500">
          Waiting for the leader to start a queue.
        </p>
      )}
      {party.isLeader && (
        <p className="text-xs text-slate-500">
          You lead the party — pick a mode below to queue everyone together.
        </p>
      )}

      <div className="relative">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setInviteOpen((o) => !o)}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Invite friend
        </Button>
        {inviteOpen && (
          <div className="absolute z-20 mt-1 left-0 right-0 sm:right-auto sm:min-w-[14rem] rounded-lg border border-slate-700 bg-slate-950 shadow-xl max-h-48 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-xs text-slate-500 p-3">No friends yet.</p>
            ) : (
              friends
                .filter((f) => !party.memberIds.includes(f.id))
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800/80"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => inviteFriendToParty(f.id),
                        `Invited ${f.username}`
                      )
                    }
                  >
                    <PlayerAvatar
                      src={f.avatarUrl}
                      name={f.username}
                      className="h-7 w-7"
                    />
                    <span className="truncate">{f.username}</span>
                  </button>
                ))
            )}
          </div>
        )}
      </div>

      {party.isLeader && party.activeRoomId && (
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-slate-400"
          disabled={busy}
          onClick={() => void run(() => clearPartyQueueRoom())}
        >
          Clear queue room
        </Button>
      )}
    </div>
  );
}
