'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InteractiveWordmark } from '@/components/interactive-wordmark';
import { resolveHeaderLogo, resolveHomeHeroImage } from '@/lib/branding';
import {
  DEFAULT_HEADER_LOGO_STYLE,
  LOGO_EFFECTS,
  type HeaderLogoStyle,
  type LogoEffect,
} from '@/lib/logo-style';

function SliderRow({
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
  onChange: (v: number) => void;
}) {
  const display =
    step < 1 ? value.toFixed(2) : String(Math.round(value));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-slate-300">{label}</Label>
        <span className="text-xs tabular-nums text-slate-400">
          {display}
          {suffix ?? ''}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-1"
      />
    </div>
  );
}

/** Live-preview editor for header wordmark position / size / opacity / effects. */
export function LogoStyleEditor({
  logoUrl,
  heroImage,
  style,
  onChange,
}: {
  logoUrl: string;
  heroImage: string;
  style: HeaderLogoStyle;
  onChange: (style: HeaderLogoStyle) => void;
}) {
  const src = resolveHeaderLogo(logoUrl);
  const hero = resolveHomeHeroImage(heroImage);

  const patch = (partial: Partial<HeaderLogoStyle>) =>
    onChange({ ...style, ...partial });

  return (
    <div className="sm:col-span-2 space-y-4 rounded-xl border border-slate-700/50 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-100">Header logo editor</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Drag the sliders — preview updates instantly. Save site settings to
            publish.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onChange({ ...DEFAULT_HEADER_LOGO_STYLE })}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset
        </Button>
      </div>

      {/* Live hero strip preview */}
      <div className="relative h-36 sm:h-44 overflow-hidden rounded-lg border border-slate-700/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/55 to-slate-900/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        <div className="relative h-full px-5 flex items-center">
          <InteractiveWordmark
            src={src}
            logoStyle={style}
            className="h-12 sm:h-16 w-auto max-w-[min(100%,18rem)]"
          />
        </div>
        <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-950/70 px-2 py-0.5 rounded">
          Live preview
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SliderRow
          label="Size"
          value={style.scale}
          min={0.4}
          max={2}
          step={0.05}
          suffix="×"
          onChange={(scale) => patch({ scale })}
        />
        <SliderRow
          label="Opacity"
          value={style.opacity}
          min={0.15}
          max={1}
          step={0.05}
          onChange={(opacity) => patch({ opacity })}
        />
        <SliderRow
          label="Move horizontal"
          value={style.offsetX}
          min={-120}
          max={120}
          step={1}
          suffix="px"
          onChange={(offsetX) => patch({ offsetX })}
        />
        <SliderRow
          label="Move vertical"
          value={style.offsetY}
          min={-60}
          max={60}
          step={1}
          suffix="px"
          onChange={(offsetY) => patch({ offsetY })}
        />
        <div className="space-y-2 sm:col-span-2">
          <Label className="text-slate-300">Effect</Label>
          <Select
            value={style.effect}
            onValueChange={(effect) => patch({ effect: effect as LogoEffect })}
          >
            <SelectTrigger className="bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOGO_EFFECTS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
