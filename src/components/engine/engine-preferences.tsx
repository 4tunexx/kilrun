'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { applyPlayerMatchAudio } from '@/components/game/effects/soundboard';
import { PlayerMatchSettingsFields } from '@/components/game/player-match-settings-form';
import {
  loadPlayerMatchSettings,
  savePlayerMatchSettings,
  type PlayerMatchSettings,
} from '@/components/game/player-match-settings';
import { MenuSfxRoot } from '@/components/game/effects/menu-sfx';

export function applyStoredEngineAudio(): void {
  applyPlayerMatchAudio(loadPlayerMatchSettings());
}

export function EnginePreferencesOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = React.useState<PlayerMatchSettings>(() => loadPlayerMatchSettings());

  React.useEffect(() => {
    if (open) setSettings(loadPlayerMatchSettings());
  }, [open]);

  if (!open) return null;

  const patch = (next: PlayerMatchSettings) => {
    const saved = savePlayerMatchSettings(next);
    setSettings(saved);
    applyPlayerMatchAudio(saved);
  };

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <MenuSfxRoot className="rounded-2xl border border-white/15 bg-[#0f1724] p-6 shadow-2xl">
          <h2 className="text-2xl font-black tracking-wide text-white mb-1">Audio & look</h2>
          <p className="text-sm text-white/50 mb-5">This device · also used in Play Test and live matches</p>
          <PlayerMatchSettingsFields value={settings} onChange={patch} />
          <Button className="mt-5 w-full" size="lg" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </MenuSfxRoot>
      </div>
    </div>
  );
}
