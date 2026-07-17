'use client';

import { useEffect, useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getLeaderboard, sendFriendRequest } from '@/lib/social-actions';
import type { Player } from '@/components/views/friends-list';
import { getLevelFromXp } from '@/lib/progression';
import { useToast } from '@/hooks/use-toast';

export default function LeaderboardView({
  onViewProfile,
}: {
  onViewProfile?: (player: Player) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getLeaderboard()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <h1 className="text-3xl sm:text-4xl font-black flex items-center gap-2">
        <Crown className="text-yellow-400" /> Leaderboard
      </h1>

      {loading ? (
        <div className="text-slate-400 flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading rankings...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No players yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const player: Player = {
              id: row.id,
              name: row.username,
              avatar: row.avatarUrl,
              rankName: row.currentRank,
              level: getLevelFromXp(row.xpProgress),
              isVip: row.isVip,
              role: row.role,
            };
            return (
              <Card key={row.id} className="bg-slate-800/40 border-slate-700/30">
                <CardContent className="py-3 flex flex-wrap items-center gap-3">
                  <span className="w-8 text-center font-black text-slate-400">
                    #{index + 1}
                  </span>
                  <Avatar>
                    <AvatarImage src={row.avatarUrl} />
                    <AvatarFallback>{row.username.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate flex items-center gap-2">
                      {row.username}
                      {row.isVip && (
                        <Badge className="bg-yellow-500 text-black">VIP</Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.currentRank} · {row.xpProgress} XP · {row.role}
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      onClick={() => onViewProfile?.(player)}
                    >
                      Profile
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={async () => {
                        try {
                          await sendFriendRequest(row.id);
                          toast({ title: 'Friend request sent' });
                        } catch {
                          toast({
                            title: 'Could not send request',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      Add
                    </Button>
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
