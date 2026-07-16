'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, User, X, Users, Clock, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Progress } from '../ui/progress';

const players = [
  {
    name: 'Username',
    avatar: 'https://picsum.photos/seed/avatar/80/80',
    isPlayer: true,
  },
  null,
  null,
  null,
  null,
  null,
];

interface LobbyViewProps {
  mode: string;
  description: string;
  onCancel: () => void;
}

const LobbyView: React.FC<LobbyViewProps> = ({
  mode,
  description,
  onCancel,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime((prevTime) => prevTime + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const requiredPlayers = 6;
  const currentPlayers = players.filter((p) => p !== null).length;

  return (
    <div className="px-12 py-8 h-full flex flex-col items-center justify-center">
      <Card className="w-full max-w-4xl bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-black">{mode}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 text-2xl font-bold text-primary animate-pulse">
              <Loader2 className="w-6 h-6 animate-spin" />
              Searching for players...
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-slate-400">
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span>
                  {currentPlayers}/{requiredPlayers} Players
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span>{formatTime(elapsedTime)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
            {players.map((player, index) => (
              <div
                key={index}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-300 ${
                  player
                    ? 'bg-slate-700/50 border-primary/50 border-2 p-4'
                    : 'bg-slate-900/50'
                }`}
              >
                {player ? (
                  <>
                    <Avatar className="w-16 h-16 mb-2">
                      <AvatarImage src={player.avatar} alt={player.name} />
                      <AvatarFallback>{player.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <p className="font-bold text-sm truncate">{player.name}</p>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-full border-dashed border-slate-700 hover:bg-slate-800/50 hover:border-primary/50 flex flex-col gap-2 text-slate-500 hover:text-slate-300"
                  >
                    <UserPlus className="w-8 h-8" />
                    <span className="text-xs">Invite</span>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Progress
            value={(currentPlayers / requiredPlayers) * 100}
            className="mb-8"
          />

          <div className="text-center">
            <Button variant="destructive" size="lg" onClick={onCancel}>
              <X className="mr-2 h-5 w-5" /> Cancel Search
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LobbyView;
