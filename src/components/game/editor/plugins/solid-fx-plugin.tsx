'use client';

import { Sparkles } from 'lucide-react';
import { ensureSolidFx, entityShowsSolidFx } from '../map-document';
import {
  SOLID_FX_PRESETS,
  type SolidFxConfig,
  type SolidFxMode,
  type SolidFxStyle,
  type SolidFxTrigger,
} from '@shared/solid-fx';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-xs text-white/60">
      {label} ({suffix ? `${value}${suffix}` : value})
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        className="w-full"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SolidFxPluginPanel({ brains }: { brains: MapEditorBrains }) {
  const { selected, patchSelected, apiRef } = brains;
  if (!selected || !entityShowsSolidFx(selected)) {
    return (
      <p className="text-[11px] leading-snug text-white/45">
        Select a walkable solid (Hammer box, floor, platform) to author vanish / unveil FX.
      </p>
    );
  }

  const fx = ensureSolidFx(selected);
  const setFx = (partial: Partial<SolidFxConfig>) => {
    patchSelected({ solidFx: { ...fx, ...partial, enabled: true } });
  };

  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center gap-2 text-xs text-white/80">
        <input
          type="checkbox"
          checked={!!selected.solidFx?.enabled}
          onChange={(e) => patchSelected({ solidFx: { ...fx, enabled: e.target.checked } })}
        />
        Enable Solid FX
      </label>

      <div className="grid grid-cols-2 gap-1">
        {Object.entries(SOLID_FX_PRESETS).map(([id, preset]) => (
          <button
            key={id}
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-semibold text-white/80 hover:bg-white/10"
            onClick={() => patchSelected({ solidFx: ensureSolidFx({ ...fx, ...preset, enabled: true }) })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {!selected.solidFx?.enabled ? (
        <p className="text-[11px] leading-snug text-white/40">
          Off — this solid stays fully visible with normal collision. Play Test and live matches only
          run FX when enabled.
        </p>
      ) : (
        <>
          <label className="block text-xs text-white/60">
            Mode
            <select
              className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
              value={fx.mode}
              onChange={(e) => setFx({ mode: e.target.value as SolidFxMode })}
            >
              <option value="appear">Appear (starts hidden)</option>
              <option value="disappear">Disappear (starts shown)</option>
            </select>
          </label>
          <label className="block text-xs text-white/60">
            Trigger
            <select
              className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
              value={fx.trigger}
              onChange={(e) => setFx({ trigger: e.target.value as SolidFxTrigger })}
            >
              <option value="proximity">Proximity (walk near)</option>
              <option value="step">Step on</option>
              <option value="either">Either</option>
            </select>
          </label>
          <label className="block text-xs text-white/60">
            Style
            <select
              className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-2 py-1"
              value={fx.style}
              onChange={(e) => setFx({ style: e.target.value as SolidFxStyle })}
            >
              <option value="unveil">Unveil (Y wipe)</option>
              <option value="glitch">Glitch</option>
              <option value="matrix">Matrix cubes</option>
              <option value="fade">Fade</option>
            </select>
          </label>
          <RangeField
            label="Radius"
            value={fx.radius}
            min={0.5}
            max={12}
            step={0.25}
            suffix="m"
            onChange={(radius) => setFx({ radius })}
          />
          <RangeField
            label="Delay"
            value={fx.delayMs}
            min={0}
            max={3000}
            step={50}
            suffix="ms"
            onChange={(delayMs) => setFx({ delayMs })}
          />
          <RangeField
            label="Duration"
            value={fx.durationMs}
            min={150}
            max={3000}
            step={50}
            suffix="ms"
            onChange={(durationMs) => setFx({ durationMs })}
          />
          <RangeField
            label="Restore after"
            value={fx.restoreMs}
            min={0}
            max={8000}
            step={100}
            suffix="ms"
            onChange={(restoreMs) => setFx({ restoreMs })}
          />
          <RangeField
            label="Collide at"
            value={Math.round(fx.collideAt * 100)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(pct) => setFx({ collideAt: pct / 100 })}
          />
          <button
            type="button"
            className="w-full rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
            onClick={() => apiRef.current?.previewSolidFx?.()}
          >
            Preview FX
          </button>
          <p className="text-[10px] leading-snug text-white/40">
            Editor stays solid so you can build. Preview FX plays the animation here. Play
            Test: Appear platforms start gone (cyan wire is the marker) — walk toward them
            and they animate in. Disappear starts visible, then vanishes when triggered.
          </p>
        </>
      )}
    </div>
  );
}

export const solidFxPlugin: MapEditorPlugin = {
  id: 'solid-fx',
  slot: 'inspector',
  label: 'Solid FX',
  icon: Sparkles,
  order: 40,
  showWhen: (entity) => entityShowsSolidFx(entity),
  render: (brains) => <SolidFxPluginPanel brains={brains} />,
};
