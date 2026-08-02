'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Crown,
  Loader2,
  LogOut,
  Settings2,
  Shield,
  ShieldPlus,
  Star,
  Swords,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClanImageUploadField } from '@/components/ui/clan-image-upload-field';
import { useToast } from '@/hooks/use-toast';
import { getFriends } from '@/lib/social-actions';
import {
  createClan,
  deleteClan,
  demoteMember,
  getClanLeaderboard,
  getJoinRequests,
  getMyClan,
  inviteToClan,
  kickMember,
  leaveClan,
  promoteMember,
  regenerateInviteCode,
  requestToJoinClan,
  respondToJoinRequest,
  updateClanProfile,
  type ClanDto,
  type ClanJoinRequestDto,
  type ClanLeaderboardRow,
} from '@/lib/clan-actions';
import {
  acceptChallenge,
  challengeClan,
  createClanLobby,
  declineChallenge,
  getIncomingChallenges,
  getMyClanLobby,
  joinClanLobby,
  leaveClanLobby,
  type ClanLobbyDto,
  type ClanWarChallengeDto,
} from '@/lib/clan-lobby-actions';

function roleBadge(role: string) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">
        <Crown className="h-3 w-3" /> Owner
      </span>
    );
  }
  if (role === 'officer') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
        <ShieldPlus className="h-3 w-3" /> Officer
      </span>
    );
  }
  return null;
}

export default function ClansView({
  userId,
  onLaunchClanWar,
}: {
  userId?: string;
  onLaunchClanWar?: (lobbyId: string) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [myClan, setMyClan] = useState<ClanDto | null>(null);
  const [leaderboard, setLeaderboard] = useState<ClanLeaderboardRow[]>([]);
  const [leaderboardSort, setLeaderboardSort] = useState<'total' | 'average'>('total');
  const [joinRequests, setJoinRequests] = useState<ClanJoinRequestDto[]>([]);
  const [tab, setTab] = useState<'overview' | 'members' | 'wars' | 'settings'>('overview');

  // Create-clan form
  const [name, setName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Invite-friends dropdown
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof getFriends>>>([]);

  // Clan Wars
  const [clanLobby, setClanLobby] = useState<ClanLobbyDto | null>(null);
  const [incomingChallenges, setIncomingChallenges] = useState<ClanWarChallengeDto[]>([]);
  const [challengeTargetTag, setChallengeTargetTag] = useState('');

  const refresh = useCallback(async () => {
    const [clan, board] = await Promise.all([
      getMyClan().catch(() => null),
      getClanLeaderboard(leaderboardSort).catch(() => []),
    ]);
    setMyClan(clan);
    setLeaderboard(board);
    if (clan && (clan.viewerRole === 'owner' || clan.viewerRole === 'officer')) {
      setJoinRequests(await getJoinRequests().catch(() => []));
      setIncomingChallenges(await getIncomingChallenges().catch(() => []));
    } else {
      setJoinRequests([]);
      setIncomingChallenges([]);
    }
    if (clan) {
      setClanLobby(await getMyClanLobby().catch(() => null));
    } else {
      setClanLobby(null);
    }
  }, [leaderboardSort]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!inviteOpen) return;
    void getFriends()
      .then(setFriends)
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
        title: e instanceof Error ? e.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-8 py-10 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading clans…
      </div>
    );
  }

  // ---------- No clan: browse leaderboard + create/join ----------
  if (!myClan) {
    return (
      <div className="px-4 sm:px-8 py-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-100">
          <Shield className="h-5 w-5 text-cyan-400" />
          <h1 className="text-xl font-bold">Clans</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-400" /> Clan Clash Leaderboard
                </h2>
                <div className="flex gap-1 text-[11px]">
                  {(['total', 'average'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`px-2 py-1 rounded ${
                        leaderboardSort === s
                          ? 'bg-cyan-600/30 text-cyan-200'
                          : 'text-slate-400 hover:bg-slate-800'
                      }`}
                      onClick={() => setLeaderboardSort(s)}
                    >
                      {s === 'total' ? 'Total KP' : 'Average KP'}
                    </button>
                  ))}
                </div>
              </div>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500">No clans yet — be the first to create one.</p>
              ) : (
                <div className="space-y-1.5">
                  {leaderboard.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2"
                    >
                      <span className="w-6 text-center text-sm font-bold text-slate-500">
                        #{c.rank}
                      </span>
                      <PlayerAvatar src={c.imageUrl} name={c.name} className="h-8 w-8" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {c.name} <span className="text-slate-500">[{c.tag}]</span>
                        </p>
                        <p className="text-[11px] text-slate-500">{c.memberCount} members</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-cyan-300">
                          {leaderboardSort === 'average' ? c.averageKp : c.totalKp} KP
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 space-y-2.5">
                <h2 className="text-sm font-semibold text-slate-200">Create a clan</h2>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Clan name"
                  maxLength={32}
                  className="h-8"
                />
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                  placeholder="TAG (3-5 chars)"
                  maxLength={5}
                  className="h-8 font-mono tracking-widest uppercase"
                />
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  maxLength={280}
                  className="text-sm min-h-16"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy || name.trim().length < 3 || tagInput.trim().length < 3}
                  onClick={() =>
                    void run(
                      () => createClan({ name, tag: tagInput, description }),
                      'Clan created'
                    )
                  }
                >
                  <Shield className="h-3.5 w-3.5 mr-1.5" /> Create clan
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 space-y-2.5">
                <h2 className="text-sm font-semibold text-slate-200">Join with an invite code</h2>
                <div className="flex gap-1.5">
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
                      void run(async () => {
                        const res = await requestToJoinClan(joinCode);
                        toast({
                          title:
                            res.status === 'joined'
                              ? `Joined ${res.clan.name}`
                              : `Join request sent to ${res.clan.name}`,
                        });
                      })
                    }
                  >
                    Join
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ---------- In a clan ----------
  const clan = myClan;
  const isManager = clan.viewerRole === 'owner' || clan.viewerRole === 'officer';
  const isOwner = clan.viewerRole === 'owner';
  const inviteLink =
    typeof window !== 'undefined' ? `${window.location.origin}/clan/join/${clan.inviteCode}` : '';

  return (
    <div className="px-4 sm:px-8 py-6 space-y-5">
      {clan.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clan.bannerUrl}
          alt=""
          className="h-28 w-full rounded-xl object-cover border border-slate-700/50"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <PlayerAvatar src={clan.imageUrl} name={clan.name} className="h-14 w-14" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {clan.name} <span className="text-slate-500">[{clan.tag}]</span>
            </h1>
            {clan.description && (
              <p className="text-sm text-slate-400 max-w-xl">{clan.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 relative">
          {isManager && (
            <Button size="sm" variant="ghost" onClick={() => setInviteOpen((o) => !o)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Invite friends
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(inviteLink || clan.inviteCode);
              toast({ title: 'Invite link copied' });
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Invite link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-400"
            disabled={busy}
            onClick={() => void run(() => leaveClan(), 'Left clan')}
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Leave
          </Button>

          {inviteOpen && isManager && (
            <div className="absolute z-20 top-full mt-1 right-0 min-w-[16rem] rounded-lg border border-slate-700 bg-slate-950 shadow-xl overflow-hidden">
              <p className="text-[11px] font-semibold text-slate-200 px-3 pt-2 pb-1">
                Invite a hub friend
              </p>
              <div className="max-h-52 overflow-y-auto">
                {friends.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3">
                    No friends yet — share the invite link instead.
                  </p>
                ) : (
                  friends
                    .filter((f) => !clan.members.some((m) => m.id === f.id))
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800/80"
                        disabled={busy}
                        onClick={() =>
                          void run(() => inviteToClan(f.id), `Invited ${f.username}`)
                        }
                      >
                        <PlayerAvatar src={f.avatarUrl} name={f.username} className="h-7 w-7" />
                        <span className="truncate flex-1">{f.username}</span>
                      </button>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total KP', value: clan.totalKp },
          { label: 'Average KP', value: clan.averageKp },
          { label: 'Members', value: clan.members.length },
          { label: 'Clan War Record', value: `${clan.warWins}-${clan.warLosses}-${clan.warDraws}` },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="text-lg font-bold text-slate-100">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        {(
          [
            ['overview', 'Overview', Users],
            ['members', 'Members', Star],
            ['wars', 'Clan Wars', Swords],
            ...(isManager ? [['settings', 'Settings', Settings2] as const] : []),
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === id
                ? 'border-cyan-400 text-cyan-200'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setTab(id)}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">
            {isOwner
              ? 'You lead this clan. Invite friends, manage members, and grow the clan score together.'
              : 'Combined member KP determines your clan’s rank on the leaderboard.'}
          </p>
          {isManager && joinRequests.length > 0 && (
            <Card className="bg-slate-900/50 border-amber-700/40">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-200">
                  Pending join requests ({joinRequests.length})
                </p>
                {joinRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <PlayerAvatar src={r.avatarUrl} name={r.username} className="h-7 w-7" />
                    <span className="text-sm flex-1 truncate">{r.username}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => respondToJoinRequest(r.id, true), 'Member accepted')
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => respondToJoinRequest(r.id, false))}
                    >
                      Decline
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-1.5">
          {clan.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg bg-slate-950/40 border border-slate-800 px-3 py-2"
            >
              <PlayerAvatar src={m.avatarUrl} name={m.username} className="h-8 w-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate flex items-center gap-1.5">
                  {m.username} {roleBadge(m.role)}
                </p>
                <p className="text-[11px] text-slate-500">{m.kp} KP</p>
              </div>
              {isOwner && m.id !== userId && m.role !== 'owner' && (
                <div className="flex items-center gap-1">
                  {m.role === 'member' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      disabled={busy}
                      onClick={() => void run(() => promoteMember(m.id), 'Promoted to officer')}
                    >
                      Promote
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      disabled={busy}
                      onClick={() => void run(() => demoteMember(m.id), 'Demoted to member')}
                    >
                      Demote
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-rose-400"
                    disabled={busy}
                    onClick={() => void run(() => kickMember(m.id), 'Member removed')}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {isManager && !isOwner && m.id !== userId && m.role === 'member' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-rose-400"
                  disabled={busy}
                  onClick={() => void run(() => kickMember(m.id), 'Member removed')}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'wars' && (
        <div className="space-y-4 max-w-xl">
          <p className="text-xs text-slate-500">
            Clan Wars run Competitive Casual only — no KP, no Ranked, no Premium involved.
          </p>

          {isManager && incomingChallenges.length > 0 && (
            <Card className="bg-slate-900/50 border-amber-700/40">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-200">
                  Incoming challenges ({incomingChallenges.length})
                </p>
                {incomingChallenges.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate">
                      {c.challengerClanName} <span className="text-slate-500">[{c.challengerClanTag}]</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const lobby = await acceptChallenge(c.id);
                          setClanLobby(lobby);
                        }, 'Challenge accepted')
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => declineChallenge(c.id))}
                    >
                      Decline
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!clanLobby ? (
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Swords className="h-4 w-4 text-rose-400" /> Start a clan lobby
                </h2>
                <p className="text-xs text-slate-500">
                  Create a lobby, have clanmates join, then challenge another clan to a fight.
                </p>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setClanLobby(await createClanLobby());
                    }, 'Clan lobby created')
                  }
                >
                  Create clan lobby
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-900/50 border-rose-700/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                    <Swords className="h-4 w-4 text-rose-400" /> Clan lobby
                  </h2>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    {clanLobby.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {clanLobby.members.map((m) => (
                    <span
                      key={m.id}
                      className="text-xs px-2 py-1 rounded bg-slate-950/50 border border-slate-800"
                    >
                      {m.username}
                      {m.id === clanLobby.leaderId ? ' ★' : ''}
                    </span>
                  ))}
                </div>

                {clanLobby.status === 'open' && (
                  <div className="flex flex-wrap gap-2">
                    {!clanLobby.members.some((m) => m.id === userId) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            setClanLobby(await joinClanLobby());
                          }, 'Joined clan lobby')
                        }
                      >
                        Join lobby
                      </Button>
                    )}
                    {clanLobby.isLeader && (
                      <div className="flex gap-1.5 flex-1 min-w-[10rem]">
                        <Input
                          value={challengeTargetTag}
                          onChange={(e) => setChallengeTargetTag(e.target.value.toUpperCase())}
                          placeholder="Target clan TAG"
                          maxLength={5}
                          className="h-8 font-mono tracking-widest uppercase"
                        />
                        <Button
                          size="sm"
                          disabled={busy || challengeTargetTag.trim().length < 3}
                          onClick={() =>
                            void run(async () => {
                              const target = leaderboard.find(
                                (c) => c.tag === challengeTargetTag.trim().toUpperCase()
                              );
                              if (!target) throw new Error('No clan with that tag on the leaderboard');
                              await challengeClan(target.id);
                              setChallengeTargetTag('');
                            }, 'Challenge sent')
                          }
                        >
                          Challenge
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-400"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await leaveClanLobby();
                          setClanLobby(null);
                        }, 'Left lobby')
                      }
                    >
                      Leave lobby
                    </Button>
                  </div>
                )}

                {clanLobby.status === 'challenging' && (
                  <p className="text-xs text-amber-200/90 animate-pulse">
                    Waiting for the other clan to respond…
                  </p>
                )}

                {clanLobby.status === 'matched' && (
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-300">
                      Matched! Ready up to queue into Competitive Casual.
                    </p>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => onLaunchClanWar?.(clanLobby.id)}
                    >
                      <Swords className="h-3.5 w-3.5 mr-1.5" /> Queue for the fight
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === 'settings' && isManager && (
        <div className="space-y-4 max-w-lg">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-4 space-y-3">
              <ClanImageUploadField
                label="Clan icon"
                value={clan.imageUrl}
                kind="icon"
                onChange={(url) => void run(() => updateClanProfile({ imageUrl: url }))}
              />
              <ClanImageUploadField
                label="Clan banner"
                value={clan.bannerUrl}
                kind="banner"
                onChange={(url) => void run(() => updateClanProfile({ bannerUrl: url }))}
              />
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Description</label>
                <Textarea
                  defaultValue={clan.description}
                  maxLength={280}
                  className="text-sm min-h-20"
                  onBlur={(e) =>
                    void run(() => updateClanProfile({ description: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={clan.isOpen}
                  disabled={busy}
                  onChange={(e) =>
                    void run(() => updateClanProfile({ isOpen: e.target.checked }))
                  }
                />
                Open clan — anyone with the invite link joins instantly
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void run(() => regenerateInviteCode(), 'Invite code reset')}
              >
                Reset invite code
              </Button>
            </CardContent>
          </Card>

          {isOwner && (
            <Card className="bg-slate-900/50 border-rose-800/40">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold text-rose-300">Danger zone</p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Delete this clan permanently? This cannot be undone.')) return;
                    void run(() => deleteClan(), 'Clan deleted');
                  }}
                >
                  Delete clan
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
