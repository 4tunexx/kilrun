'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  getLeaderboard,
  getMyFriendshipMap,
  sendFriendRequest,
} from '@/lib/social-actions';
import { recordLeaderboardVisit } from '@/lib/progression-actions';
import { getLevelFromXp } from '@/lib/progression';
import { UserHoverCard } from '@/components/user-hover-card';
import { useProfileNavigation } from '@/components/providers/profile-navigation-context';
import { useToast } from '@/hooks/use-toast';

type FriendStatus = 'friends' | 'pending_out' | 'pending_in';

export default function LeaderboardView({ userId }: { userId?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [friendMap, setFriendMap] = useState<Record<string, FriendStatus>>({});
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { openProfile } = useProfileNavigation();

  useEffect(() => {
    void recordLeaderboardVisit().catch(() => {});
    Promise.all([getLeaderboard(), getMyFriendshipMap()])
      .then(([board, map]) => {
        setRows(board);
        setFriendMap(map);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading rankings...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No players yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const level = getLevelFromXp(row.xpProgress);
            const isSelf = !!userId && row.id === userId;
            const status = friendMap[row.id];
            return (
              <Card
                key={row.id}
                className={`bg-slate-900/60 backdrop-blur-md border-slate-700/30 ${
                  isSelf ? 'ring-1 ring-primary/40' : ''
                }`}
              >
                <CardContent className="py-3 flex flex-wrap items-center gap-3">
                  <span className="w-8 text-center font-black text-slate-400">
                    #{index + 1}
                  </span>
                  <Avatar>
                    <AvatarImage src={row.avatarUrl} />
                    <AvatarFallback>
                      {(row.username || 'P').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate flex items-center gap-2">
                      <UserHoverCard
                        userId={row.id}
                        role={row.role}
                        isVip={row.isVip}
                        className="truncate"
                      >
                        {row.username || 'Player'}
                      </UserHoverCard>
                      {isSelf && (
                        <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">
                          You
                        </Badge>
                      )}
                      {row.isVip && (
                        <Badge className="bg-yellow-500 text-black">VIP</Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.currentRank || 'Unranked'} · Lv {level} ·{' '}
                      {(row.xpProgress ?? 0).toLocaleString()} XP · {row.role}
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => openProfile(row.id)}
                    >
                      Profile
                    </Button>
                    {isSelf ? null : status === 'friends' ? (
                      <Button size="sm" variant="outline" disabled className="flex-1 sm:flex-none">
                        Friends
                      </Button>
                    ) : status === 'pending_out' || status === 'pending_in' ? (
                      <Button size="sm" variant="outline" disabled className="flex-1 sm:flex-none">
                        Pending
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-none"
                        disabled={addingId === row.id}
                        onClick={async () => {
                          setAddingId(row.id);
                          try {
                            const result = await sendFriendRequest(row.id);
                            if (result.status === 'self') {
                              toast({ title: 'That is you' });
                            } else if (result.status === 'accepted') {
                              setFriendMap((prev) => ({ ...prev, [row.id]: 'friends' }));
                              toast({ title: 'Already friends' });
                            } else {
                              setFriendMap((prev) => ({ ...prev, [row.id]: 'pending_out' }));
                              toast({ title: 'Friend request sent' });
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
                        {addingId === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
