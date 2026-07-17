'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, X } from 'lucide-react';
import KilrunEngine from '@/components/game/kilrun-engine';
import type { KilrunMode } from './play-view';

interface LobbyViewProps {
  mode: KilrunMode;
  onCancel: () => void;
  userId: string;
  username: string;
  avatarUrl?: string;
}

const MODE_LABELS: Record<KilrunMode, string> = {
  deathrun: 'Deathrun',
  horde: 'Horde Mode',
  competitive: 'Competitive 4v4',
};

const LobbyView: React.FC<LobbyViewProps> = ({ mode, onCancel, userId, username, avatarUrl }) => {
  const joinOptions = useMemo(() => ({ userId, username, avatarUrl }), [userId, username, avatarUrl]);

  if (mode !== 'deathrun') {
    return (
      <div className="px-12 py-8 h-full flex flex-col items-center justify-center">
        <Card className="w-full max-w-lg bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-black">{MODE_LABELS[mode]}</CardTitle>
            <CardDescription>This mode is still in development.</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <Clock className="w-5 h-5" />
              <span>Check back soon -- built on the same engine as Deathrun.</span>
            </div>
            <Button variant="destructive" size="lg" onClick={onCancel}>
              <X className="mr-2 h-5 w-5" /> Back to Mode Select
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Deathrun owns the full-screen game engine for its entire lifecycle
  // (lobby wait -> countdown -> playing -> results), so it renders itself
  // instead of sitting inside the hub's page chrome.
  return <KilrunEngine joinOptions={joinOptions} onExit={onCancel} />;
};

export default LobbyView;
