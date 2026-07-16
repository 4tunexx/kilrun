import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Award, Crown, MessageSquare, Swords, UserPlus } from 'lucide-react';

export default function PublicProfileView({ player, onInvite, onMessage }: { player: any; onInvite: (name: string) => void; onMessage: () => void; }) {
  if (!player) return null;
  
  return (
    <DialogContent className="bg-slate-900/80 backdrop-blur-md border-slate-700 text-white max-w-lg">
      <DialogHeader>
        <div className="flex flex-col items-center text-center space-y-2">
          <Avatar className="h-24 w-24 mb-2 border-4 border-primary">
            <AvatarImage src={player.avatar} alt={player.name} />
            <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <DialogTitle className="text-3xl font-bold flex items-center gap-2">
            {player.name}
            {player.isVip && <Crown className="w-6 h-6 text-yellow-400" />}
          </DialogTitle>
          <Badge variant="outline" className="border-yellow-400/50 text-yellow-400 bg-yellow-500/10 text-base">
            {player.rankName}
          </Badge>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-4 text-center my-4">
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs text-slate-400">Level</p>
          <p className="text-2xl font-bold">{player.level}</p>
        </div>
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs text-slate-400">K/D Ratio</p>
          <p className="text-2xl font-bold">{player.kd}</p>
        </div>
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs text-slate-400">Win Rate</p>
          <p className="text-2xl font-bold">{player.winRate}</p>
        </div>
      </div>
      <div>
        <h4 className="font-bold text-center mb-2">Featured Achievements</h4>
        <div className="flex justify-center gap-4">
          <div className="flex flex-col items-center text-center p-2 bg-slate-800/50 rounded-lg w-24">
            <Award className="w-8 h-8 text-yellow-400 mb-1" />
            <p className="text-xs leading-tight">S1 Champion</p>
          </div>
          <div className="flex flex-col items-center text-center p-2 bg-slate-800/50 rounded-lg w-24">
            <Award className="w-8 h-8 text-yellow-400 mb-1" />
            <p className="text-xs leading-tight">Flawless</p>
          </div>
           <div className="flex flex-col items-center text-center p-2 bg-slate-800/50 rounded-lg w-24">
            <Award className="w-8 h-8 text-yellow-400 mb-1" />
            <p className="text-xs leading-tight">Clutch King</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-6">
        <Button variant="outline" className="w-full" onClick={() => {}}>
          <UserPlus className="mr-2 h-4 w-4" /> Add Friend
        </Button>
        <Button variant="outline" className="w-full" onClick={() => onInvite(player.name)}>
          <Swords className="mr-2 h-4 w-4" /> Invite
        </Button>
        <Button className="w-full" onClick={onMessage}>
          <MessageSquare className="mr-2 h-4 w-4" /> Message
        </Button>
      </div>
    </DialogContent>
  );
}
