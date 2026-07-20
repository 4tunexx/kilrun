'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MoreHorizontal,
  Search,
  Swords,
  MessageSquare,
  User,
  Trash2,
  Loader2,
  Check,
  X,
  UserPlus,
} from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getFriendRequests,
  getFriends,
  getOutgoingFriendRequests,
  removeFriend,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
} from '@/lib/social-actions';
import { getLevelFromXp } from '@/lib/progression';
import { UserHoverCard } from '@/components/user-hover-card';
import { useProfileNavigation } from '@/components/providers/profile-navigation-context';
import { useToast } from '@/hooks/use-toast';

type FriendRow = {
  id: string;
  username: string;
  avatarUrl: string;
  role?: string;
  isVip?: boolean;
  xpProgress?: number;
  currentRank?: string;
  isOnline?: boolean;
  lastSeenAt?: Date | null;
  equippedFrameConfig?: unknown | null;
  equippedNicknameConfig?: unknown | null;
};

export const FriendsList = ({
  onInvite,
  onMessage,
}: {
  onInvite: (name: string) => void;
  onMessage: (peerId: string) => void;
}) => {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<
    {
      id: string;
      userA: {
        id: string;
        username: string;
        avatarUrl: string;
        role?: string;
        isVip?: boolean;
        equippedFrameConfig?: unknown | null;
        equippedNicknameConfig?: unknown | null;
      };
    }[]
  >([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pendingOutIds, setPendingOutIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { openProfile } = useProfileNavigation();

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const reload = async () => {
    const [f, r, out] = await Promise.all([
      getFriends(),
      getFriendRequests(),
      getOutgoingFriendRequests(),
    ]);
    setFriends(f);
    setRequests(r);
    setPendingOutIds(new Set(out.map((o) => o.userBId)));
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
    // Refresh presence dots while the friends sheet is open.
    const id = setInterval(() => {
      reload().catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchPlayers(q)
        .then((rows) => {
          if (!cancelled) setSearchResults(rows);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const filteredFriends = useMemo(
    () =>
      friends.filter((f) =>
        f.username.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [friends, query]
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading friends...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players or friends..."
          className="pl-10 bg-slate-900/60 backdrop-blur-md border-slate-700/30"
        />
      </div>

      {requests.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-semibold text-slate-300">Requests</p>
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 shrink-0">
                  <PlayerAvatar
                    src={req.userA.avatarUrl}
                    name={req.userA.username}
                    isVip={req.userA.isVip}
                    frameConfig={req.userA.equippedFrameConfig}
                    className="h-full w-full"
                    crownClassName="h-3.5 w-3.5"
                  />
                </div>
                <UserHoverCard
                  userId={req.userA.id}
                  role={req.userA.role}
                  isVip={req.userA.isVip}
                  nicknameEffect={req.userA.equippedNicknameConfig}
                  className="truncate text-sm"
                >
                  {req.userA.username}
                </UserHoverCard>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-green-400"
                  onClick={async () => {
                    await respondFriendRequest(req.id, true);
                    await reload();
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-red-400"
                  onClick={async () => {
                    await respondFriendRequest(req.id, false);
                    await reload();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1 -mr-4 pr-4">
        {query.trim().length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold text-slate-300">Players</p>
            {searching ? (
              <p className="text-sm text-slate-400 flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Searching...
              </p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No players match “{query.trim()}”.</p>
            ) : (
              searchResults.map((player) => {
                const level = getLevelFromXp(player.xpProgress ?? 0);
                const alreadyFriend = friendIds.has(player.id);
                const pending = pendingOutIds.has(player.id);
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0">
                        <PlayerAvatar
                          src={player.avatarUrl}
                          name={player.username}
                          isVip={player.isVip}
                          frameConfig={player.equippedFrameConfig}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <UserHoverCard
                          userId={player.id}
                          role={player.role}
                          isVip={player.isVip}
                          nicknameEffect={player.equippedNicknameConfig}
                          className="truncate block"
                        >
                          {player.username}
                        </UserHoverCard>
                        <p className="text-xs text-slate-400">
                          {player.role} · {player.currentRank ?? 'Unranked'} · Lv {level}
                        </p>
                      </div>
                    </div>
                    {alreadyFriend ? (
                      <Button size="sm" variant="outline" disabled className="shrink-0">
                        Friends
                      </Button>
                    ) : pending ? (
                      <Button size="sm" variant="outline" disabled className="shrink-0">
                        Pending
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={addingId === player.id}
                        onClick={async () => {
                          setAddingId(player.id);
                          try {
                            const result = await sendFriendRequest(player.id);
                            if (result.status === 'self') {
                              toast({ title: 'That is you' });
                            } else if (result.status === 'pending') {
                              setPendingOutIds((prev) => new Set(prev).add(player.id));
                              toast({ title: 'Friend request sent' });
                            } else if (result.status === 'accepted') {
                              toast({ title: 'Already friends' });
                              await reload();
                            }
                          } catch {
                            toast({
                              title: 'Could not send request',
                              variant: 'destructive',
                            });
                          } finally {
                            setAddingId(null);
                          }
                        }}
                      >
                        {addingId === player.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4 mr-1" /> Add
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-300">
            {query.trim() ? 'Matching friends' : 'Friends'}
          </p>
          {filteredFriends.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              {query.trim()
                ? 'No friends match that name.'
                : 'No friends yet. Search for a player above to add them.'}
            </p>
          ) : (
            filteredFriends.map((friend) => {
              const level = getLevelFromXp(friend.xpProgress ?? 0);
              const online = !!friend.isOnline;
              return (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 backdrop-blur-md border border-slate-700/30 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0 h-10 w-10">
                      <PlayerAvatar
                        src={friend.avatarUrl}
                        name={friend.username}
                        isVip={friend.isVip}
                        frameConfig={friend.equippedFrameConfig}
                        className="h-full w-full"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-900 ${
                          online ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                        title={online ? 'Online' : 'Offline'}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            online ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                          title={online ? 'Online' : 'Offline'}
                        />
                        <UserHoverCard
                          userId={friend.id}
                          role={friend.role}
                          isVip={friend.isVip}
                          nicknameEffect={friend.equippedNicknameConfig}
                          className="truncate"
                        >
                          {friend.username}
                        </UserHoverCard>
                      </div>
                      <p className="text-xs text-slate-400">
                        {online ? 'Online' : 'Offline'} · {friend.currentRank ?? 'Unranked'} · Lv{' '}
                        {level}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-900/60 backdrop-blur-md border-slate-700/30 text-white">
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => onInvite(friend.username)}
                      >
                        <Swords /> Invite to Party
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => onMessage(friend.id)}
                      >
                        <MessageSquare /> Message
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2"
                        onClick={() => openProfile(friend.id)}
                      >
                        <User /> View Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
                        onClick={async () => {
                          await removeFriend(friend.id);
                          toast({ title: 'Friend removed' });
                          await reload();
                        }}
                      >
                        <Trash2 /> Remove Friend
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FriendsList;
