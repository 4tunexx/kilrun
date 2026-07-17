'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Crown, MessageSquare, UserPlus } from 'lucide-react';
import { sendFriendRequest } from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';
import type { Player } from '@/components/views/friends-list';

export default function PublicProfileView({
  player,
  onMessage,
}: {
  player: Player;
  onInvite?: (name: string) => void;
  onMessage: () => void;
}) {
  const { toast } = useToast();
  if (!player) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center space-y-2">
        <Avatar className="h-24 w-24 mb-2 border-4 border-primary">
          <AvatarImage src={player.avatar} alt={player.name} />
          <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          {player.name}
          {player.isVip && <Crown className="w-6 h-6 text-yellow-400" />}
        </h2>
        <Badge
          variant="outline"
          className="border-yellow-400/50 text-yellow-400 bg-yellow-500/10 text-base"
        >
          {player.rankName}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs text-slate-400">Level</p>
          <p className="text-2xl font-bold">{player.level}</p>
        </div>
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs text-slate-400">Role</p>
          <p className="text-lg font-bold capitalize">{player.role ?? 'player'}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            try {
              await sendFriendRequest(player.id);
              toast({ title: 'Friend request sent' });
            } catch {
              toast({
                title: 'Could not send request',
                variant: 'destructive',
              });
            }
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" /> Add Friend
        </Button>
        <Button className="w-full" onClick={onMessage}>
          <MessageSquare className="mr-2 h-4 w-4" /> Message
        </Button>
      </div>
    </div>
  );
}
