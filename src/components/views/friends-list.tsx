'use client';

import {
  MoreHorizontal,
  Search,
  Swords,
  MessageSquare,
  User,
  Trash2,
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

const friendsData = [
  { id: '1', name: 'ShadowStriker', avatar: 'https://picsum.photos/seed/p1/80/80', status: 'online', rankName: 'Immortal', level: 99, kd: 1.8, winRate: '65%' },
  { id: '2', name: 'Vortex', avatar: 'https://picsum.photos/seed/p2/80/80', status: 'ingame', rankName: 'Diamond III', level: 92, kd: 1.5, winRate: '62%' },
  { id: '3', name: 'Phoenix', avatar: 'https://picsum.photos/seed/p3/80/80', status: 'away', rankName: 'Diamond I', level: 88, kd: 1.4, winRate: '60%' },
  { id: '4', name: 'Wraith', avatar: 'https://picsum.photos/seed/p4/80/80', status: 'offline', rankName: 'Platinum II', level: 85, kd: 1.3, winRate: '58%' },
  { id: '5', name: 'Fury', avatar: 'https://picsum.photos/seed/p5/80/80', status: 'online', rankName: 'Platinum I', level: 81, kd: 1.2, winRate: '55%' },
  { id: '6', name: 'Nyx', avatar: 'https://picsum.photos/seed/p6/80/80', status: 'offline', rankName: 'Gold III', level: 79, kd: 1.1, winRate: '54%' },
  { id: '7', name: 'Jett', avatar: 'https://picsum.photos/seed/p7/80/80', status: 'ingame', rankName: 'Gold I', level: 75, kd: 1.0, winRate: '52%' },
];

export type Player = typeof friendsData[0];

export const FriendsList = ({ onInvite, onViewProfile, onMessage }: { onInvite: (name: string) => void; onViewProfile: (player: Player) => void; onMessage: () => void; }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'ingame': return 'bg-blue-500';
      case 'away': return 'bg-yellow-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input placeholder="Search friends..." className="pl-10 bg-slate-800 border-slate-700" />
      </div>
      <ScrollArea className="flex-1 -mr-6 pr-6">
        <div className="space-y-2">
          {friendsData.map((friend) => (
            <div key={friend.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar>
                    <AvatarImage src={friend.avatar} alt={friend.name} />
                    <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${getStatusColor(friend.status)}`} />
                </div>
                <div>
                  <p className="font-semibold">{friend.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{friend.status}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white">
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onInvite(friend.name)}>
                    <Swords /> Invite to Party
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={onMessage}>
                    <MessageSquare /> Message
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onViewProfile(friend)}>
                    <User /> View Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500">
                    <Trash2 /> Remove Friend
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FriendsList;
