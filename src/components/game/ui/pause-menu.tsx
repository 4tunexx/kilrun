'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map, Maximize, Play, LogOut } from 'lucide-react';

interface PauseMenuProps {
  open: boolean;
  isAdmin?: boolean;
  onResume: () => void;
  onOpenEditor: () => void;
  onToggleFullscreen: () => void;
  onExit: () => void;
}

export function PauseMenu({
  open,
  isAdmin,
  onResume,
  onOpenEditor,
  onToggleFullscreen,
  onExit,
}: PauseMenuProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-white/15 bg-[#0f1724]/95 p-6 shadow-2xl">
        <h2 className="text-2xl font-black tracking-wide text-white mb-1">Paused</h2>
        <p className="text-sm text-white/50 mb-6">ESC resumes · mouse unlocked</p>
        <div className="space-y-2">
          <Button className="w-full justify-start" size="lg" onClick={onResume}>
            <Play className="w-4 h-4 mr-2" /> Resume
          </Button>
          <Button className="w-full justify-start" size="lg" variant="secondary" onClick={onToggleFullscreen}>
            <Maximize className="w-4 h-4 mr-2" /> Toggle Fullscreen
          </Button>
          {isAdmin && (
            <Button className="w-full justify-start" size="lg" variant="secondary" onClick={onOpenEditor}>
              <Map className="w-4 h-4 mr-2" /> Map Editor
            </Button>
          )}
          <Button className="w-full justify-start" size="lg" variant="destructive" onClick={onExit}>
            <LogOut className="w-4 h-4 mr-2" /> Exit Match
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Request fullscreen once the match canvas is ready. */
export function useGameFullscreen(rootRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = rootRef.current;
    if (!el || document.fullscreenElement) return;
    // Browsers require a user gesture; lobby Play click often still counts briefly
    el.requestFullscreen?.().catch(() => {});
  }, [enabled, rootRef]);

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  return { isFs, toggle };
}
