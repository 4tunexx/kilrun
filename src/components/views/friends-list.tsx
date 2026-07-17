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
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  removeFriend,
  respondFriendRequest,
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
      userA: { id: string; username: string; avatarUrl: string; role?: string; isVip?: boolean };
    }[]
  >([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { openProfile } = useProfileNavigation();

  const reload = async () => {
    const [f, r] = await Promise.all([getFriends(), getFriendRequests()]);
    setFriends(f);
    setRequests(r);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(
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
          placeholder="Search friends..."
          className="pl-10 bg-slate-800 border-slate-700"
        />
      </div>

      {requests.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-semibold text-slate-300">Requests</p>
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={req.userA.avatarUrl} />
                  <AvatarFallback>{req.userA.username.charAt(0)}</AvatarFallback>
                </Avatar>
                <UserHoverCard
                  userId={req.userA.id}
                  role={req.userA.role}
                  isVip={req.userA.isVip}
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
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No friends yet. Add players from the leaderboard.
            </p>
          ) : (
            filtered.map((friend) => {
              const level = getLevelFromXp(friend.xpProgress ?? 0);
              return (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar>
                      <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                      <AvatarFallback>{friend.username.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <UserHoverCard
                        userId={friend.id}
                        role={friend.role}
                        isVip={friend.isVip}
                        className="truncate block"
                      >
                        {friend.username}
                      </UserHoverCard>
                      <p className="text-xs text-slate-400">
                        {friend.currentRank ?? 'Unranked'} · Lv {level}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white">
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
