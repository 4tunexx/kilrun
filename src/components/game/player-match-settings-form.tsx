'use client';

import type { PlayerMatchSettings } from './player-match-settings';

export function PlayerMatchSettingsFields({
  value,
  onChange,
}: {
  value: PlayerMatchSettings;
  onChange: (next: PlayerMatchSettings) => void;
}) {
  const patch = (partial: Partial<PlayerMatchSettings>) => onChange({ ...value, ...partial });
  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between text-sm text-white/80">
        Bloom
        <input
          type="checkbox"
          className="h-4 w-4 accent-cyan-400"
          checked={value.bloom}
          onChange={(e) => patch({ bloom: e.target.checked })}
        />
      </label>
      <label className="block text-sm text-white/80">
        Master ({Math.round(value.masterVolume * 100)}%)
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="mt-1 w-full accent-cyan-400"
          value={value.masterVolume}
          onChange={(e) => patch({ masterVolume: Number(e.target.value) })}
        />
      </label>
      <label className="block text-sm text-white/80">
        Sound effects ({Math.round(value.sfxVolume * 100)}%)
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="mt-1 w-full accent-cyan-400"
          value={value.sfxVolume}
          onChange={(e) => patch({ sfxVolume: Number(e.target.value) })}
        />
      </label>
      <label className="block text-sm text-white/80">
        Music ({Math.round(value.musicVolume * 100)}%)
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="mt-1 w-full accent-cyan-400"
          value={value.musicVolume}
          onChange={(e) => patch({ musicVolume: Number(e.target.value) })}
        />
      </label>
      <label className="block text-sm text-white/80">
        Look sensitivity ({value.mouseSensMult.toFixed(2)}×)
        <input
          type="range"
          min={0.25}
          max={2.5}
          step={0.05}
          className="mt-1 w-full accent-cyan-400"
          value={value.mouseSensMult}
          onChange={(e) => patch({ mouseSensMult: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
