import { Crown, Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const leaderboardData = [
  { id: '1', name: 'ShadowStriker', level: 99, xp: 99850, rankName: 'Immortal', avatar: 'https://picsum.photos/seed/p1/80/80', isVip: true, kd: 1.8, winRate: '65%' },
  { id: '2', name: 'Vortex', level: 92, xp: 92340, rankName: 'Diamond III', avatar: 'https://picsum.photos/seed/p2/80/80', isVip: true, kd: 1.5, winRate: '62%' },
  { id: '3', name: 'Phoenix', level: 88, xp: 88900, rankName: 'Diamond I', avatar: 'https://picsum.photos/seed/p3/80/80', isVip: false, kd: 1.4, winRate: '60%' },
  { id: '4', name: 'Wraith', level: 85, xp: 85250, rankName: 'Platinum II', avatar: 'https://picsum.photos/seed/p4/80/80', isVip: true, kd: 1.3, winRate: '58%' },
  { id: '5', name: 'Fury', level: 81, xp: 81600, rankName: 'Platinum I', avatar: 'https://picsum.photos/seed/p5/80/80', isVip: false, kd: 1.2, winRate: '55%' },
  { id: '6', name: 'Nyx', level: 79, xp: 79500, rankName: 'Gold III', avatar: 'https://picsum.photos/seed/p6/80/80', isVip: false, kd: 1.1, winRate: '54%' },
  { id: '7', name: 'Jett', level: 75, xp: 75120, rankName: 'Gold I', avatar: 'https://picsum.photos/seed/p7/80/80', isVip: true, kd: 1.0, winRate: '52%' },
  { id: '8', name: 'Sova', level: 72, xp: 72800, rankName: 'Silver III', avatar: 'https://picsum.photos/seed/p8/80/80', isVip: false, kd: 0.9, winRate: '50%' },
  { id: '9', name: 'Raze', level: 68, xp: 68400, rankName: 'Silver II', avatar: 'https://picsum.photos/seed/p9/80/80', isVip: false, kd: 0.85, winRate: '48%' },
  { id: '10', name: 'Omen', level: 65, xp: 65900, rankName: 'Silver I', avatar: 'https://picsum.photos/seed/p10/80/80', isVip: false, kd: 0.8, winRate: '45%' },
];

type Player = typeof leaderboardData[0];

interface LeaderboardViewProps {
  onViewProfile: (player: Player) => void;
}

export default function LeaderboardView({ onViewProfile }: LeaderboardViewProps) {
  return (
    <div className="px-12 py-8">
      <h1 className="text-5xl font-black mb-8 flex items-center gap-4">
        <Trophy className="w-12 h-12 text-yellow-400" />
        Leaderboard
      </h1>
      <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-slate-800/20">
                <TableHead className="w-[100px] text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">Level</TableHead>
                <TableHead className="text-right">Total XP</TableHead>
                <TableHead className="text-center">Rank Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboardData.map((player, index) => (
                <TableRow key={player.id} className="border-slate-700/50 hover:bg-slate-800/60 transition-colors cursor-pointer" onClick={() => onViewProfile(player)}>
                  <TableCell className="font-bold text-2xl text-center align-middle">
                    {index + 1 === 1 ? (
                      <Crown className="w-8 h-8 text-yellow-400 mx-auto" />
                    ) : (
                      index + 1
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-slate-600">
                        <AvatarImage src={player.avatar} alt={player.name} data-ai-hint="player avatar" />
                        <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{player.name}</span>
                        {player.isVip && <Crown className="w-5 h-5 text-yellow-400" />}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-bold text-lg">{player.level}</TableCell>
                  <TableCell className="text-right font-mono">{player.xp.toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="border-yellow-400/50 text-yellow-400 bg-yellow-500/10">{player.rankName}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
