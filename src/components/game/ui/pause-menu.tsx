'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map, Maximize, Play, LogOut, AlertTriangle, Settings, ChevronLeft } from 'lucide-react';
import { MenuSfxRoot } from '../effects/menu-sfx';
import { playSound } from '../effects/soundboard';
import {
  DEFAULT_PLAYER_MATCH_SETTINGS,
  type PlayerMatchSettings,
} from '../player-match-settings';
import { PlayerMatchSettingsFields } from '../player-match-settings-form';

interface PauseMenuProps {
  open: boolean;
  isAdmin?: boolean;
  onResume: () => void;
  onOpenEditor: () => void;
  onToggleFullscreen: () => void;
  onExit: () => void;
  /** Competitive match currently in countdown/playing — enables Abandon Match. */
  showAbandon?: boolean;
  /** Escalating cooldown tier (in minutes) the player would incur next. */
  nextAbandonPenaltyMin?: number;
  onAbandon?: () => void;
  matchSettings?: PlayerMatchSettings;
  onMatchSettingsChange?: (next: PlayerMatchSettings) => void;
  /** Bound pause key label (Controls panel). */
  pauseHint?: string;
}

export function PauseMenu({
  open,
  isAdmin,
  onResume,
  onOpenEditor,
  onToggleFullscreen,
  onExit,
  showAbandon,
  nextAbandonPenaltyMin,
  onAbandon,
  matchSettings = DEFAULT_PLAYER_MATCH_SETTINGS,
  onMatchSettingsChange,
  pauseHint = 'Esc',
}: PauseMenuProps) {
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmingAbandon(false);
      setSettingsOpen(false);
    } else {
      playSound('ui_transition');
    }
  }, [open]);

  if (!open) return null;

  if (confirmingAbandon) {
    return (
      <MenuSfxRoot className="absolute inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
        <div className="w-full max-w-sm mx-4 rounded-2xl border border-red-500/30 bg-[#0f1724]/95 p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-black tracking-wide text-white">Abandon Match?</h2>
          </div>
          <p className="text-sm text-white/60 mb-4">
            Leaving a Competitive match in progress locks you out of Competitive
            queueing for{' '}
            <span className="text-white font-semibold">
              {nextAbandonPenaltyMin ? `${nextAbandonPenaltyMin} min` : 'a while'}
            </span>
            . Repeated abandons escalate the cooldown: 10 min → 30 min → 2 hr →
            5 hr → 1 day. Your team will also play shorthanded.
          </p>
          <div className="space-y-2">
            <Button
              className="w-full justify-start"
              size="lg"
              variant="destructive"
              onClick={() => {
                setConfirmingAbandon(false);
                onAbandon?.();
              }}
            >
              <LogOut className="w-4 h-4 mr-2" /> Confirm Abandon
            </Button>
            <Button
              className="w-full justify-start"
              size="lg"
              variant="secondary"
              onClick={() => setConfirmingAbandon(false)}
            >
              Never mind — keep playing
            </Button>
          </div>
        </div>
      </MenuSfxRoot>
    );
  }

  if (settingsOpen) {
    return (
      <MenuSfxRoot className="absolute inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
        <div className="w-full max-w-sm mx-4 rounded-2xl border border-white/15 bg-[#0f1724]/95 p-6 shadow-2xl">
          <h2 className="text-2xl font-black tracking-wide text-white mb-1">Settings</h2>
          <p className="text-sm text-white/50 mb-5">This device only · stored in the browser</p>
          <div className="mb-5">
            <PlayerMatchSettingsFields
              value={matchSettings}
              onChange={(next) => onMatchSettingsChange?.(next)}
            />
          </div>
          <Button
            className="w-full justify-start"
            size="lg"
            variant="secondary"
            onClick={() => setSettingsOpen(false)}
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>
      </MenuSfxRoot>
    );
  }

  return (
    <MenuSfxRoot className="absolute inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
      <div className="w-full max-w-sm mx-4 rounded-2xl border border-white/15 bg-[#0f1724]/95 p-6 shadow-2xl">
        <h2 className="text-2xl font-black tracking-wide text-white mb-1">Paused</h2>
        <p className="text-sm text-white/50 mb-6">
          {pauseHint} resumes · mouse unlocked{isAdmin ? ' · F2 admin' : ''}
        </p>
        <div className="space-y-2">
          <Button className="w-full justify-start" size="lg" onClick={onResume}>
            <Play className="w-4 h-4 mr-2" /> Resume
          </Button>
          <Button className="w-full justify-start" size="lg" variant="secondary" onClick={onToggleFullscreen}>
            <Maximize className="w-4 h-4 mr-2" /> Toggle Fullscreen
          </Button>
          <Button
            className="w-full justify-start"
            size="lg"
            variant="secondary"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" /> Graphics & audio
          </Button>
          {isAdmin && (
            <Button className="w-full justify-start" size="lg" variant="secondary" onClick={onOpenEditor}>
              <Map className="w-4 h-4 mr-2" /> Map Editor
            </Button>
          )}
          <Button className="w-full justify-start" size="lg" variant="destructive" onClick={onExit}>
            <LogOut className="w-4 h-4 mr-2" /> Exit Match
          </Button>
          {showAbandon && (
            <Button
              className="w-full justify-start border border-red-500/40"
              size="lg"
              variant="ghost"
              onClick={() => setConfirmingAbandon(true)}
            >
              <AlertTriangle className="w-4 h-4 mr-2 text-red-400" /> Abandon Match…
            </Button>
          )}
        </div>
      </div>
    </MenuSfxRoot>
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
