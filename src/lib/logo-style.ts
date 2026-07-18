/**
 * Header wordmark layout / look. Stored as JSON on SiteSettings.headerLogoStyle.
 */
import type { CSSProperties } from 'react';

export type LogoEffect = 'none' | 'glow' | 'shadow' | 'crisp' | 'soft';

export interface HeaderLogoStyle {
  /** Visual size multiplier (0.4 – 2). */
  scale: number;
  /** Horizontal offset in px (-120 – 120). */
  offsetX: number;
  /** Vertical offset in px (-60 – 60). */
  offsetY: number;
  /** Opacity 0.15 – 1. */
  opacity: number;
  effect: LogoEffect;
}

export const DEFAULT_HEADER_LOGO_STYLE: HeaderLogoStyle = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
  effect: 'none',
};

export const LOGO_EFFECTS: { value: LogoEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'glow', label: 'Red glow' },
  { value: 'shadow', label: 'Drop shadow' },
  { value: 'crisp', label: 'Crisp / contrast' },
  { value: 'soft', label: 'Soft blur edge' },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Parse DB JSON / partial objects into a safe style. Never throws. */
export function normalizeHeaderLogoStyle(raw: unknown): HeaderLogoStyle {
  let obj: Partial<HeaderLogoStyle> | null = null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { ...DEFAULT_HEADER_LOGO_STYLE };
    try {
      obj = JSON.parse(trimmed) as Partial<HeaderLogoStyle>;
    } catch {
      return { ...DEFAULT_HEADER_LOGO_STYLE };
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Partial<HeaderLogoStyle>;
  }
  if (!obj) return { ...DEFAULT_HEADER_LOGO_STYLE };

  const effect = (
    ['none', 'glow', 'shadow', 'crisp', 'soft'] as const
  ).includes(obj.effect as LogoEffect)
    ? (obj.effect as LogoEffect)
    : 'none';

  return {
    scale:
      typeof obj.scale === 'number' && Number.isFinite(obj.scale)
        ? clamp(obj.scale, 0.4, 2)
        : 1,
    offsetX:
      typeof obj.offsetX === 'number' && Number.isFinite(obj.offsetX)
        ? clamp(obj.offsetX, -120, 120)
        : 0,
    offsetY:
      typeof obj.offsetY === 'number' && Number.isFinite(obj.offsetY)
        ? clamp(obj.offsetY, -60, 60)
        : 0,
    opacity:
      typeof obj.opacity === 'number' && Number.isFinite(obj.opacity)
        ? clamp(obj.opacity, 0.15, 1)
        : 1,
    effect,
  };
}

export function serializeHeaderLogoStyle(style: HeaderLogoStyle): string {
  return JSON.stringify(normalizeHeaderLogoStyle(style));
}

function effectFilter(effect: LogoEffect): string | undefined {
  switch (effect) {
    case 'glow':
      return 'drop-shadow(0 0 10px rgba(239,68,68,0.75)) drop-shadow(0 0 22px rgba(239,68,68,0.35))';
    case 'shadow':
      return 'drop-shadow(0 8px 16px rgba(0,0,0,0.65))';
    case 'crisp':
      return 'contrast(1.15) saturate(1.1)';
    case 'soft':
      return 'drop-shadow(0 0 1px rgba(255,255,255,0.25))';
    default:
      return undefined;
  }
}

/** Inline styles for the wordmark wrapper (position / opacity / filter). */
export function headerLogoWrapperStyle(style: HeaderLogoStyle): CSSProperties {
  const s = normalizeHeaderLogoStyle(style);
  return {
    transform: `translate3d(${s.offsetX}px, ${s.offsetY}px, 0) scale(${s.scale})`,
    opacity: s.opacity,
    filter: effectFilter(s.effect),
    transformOrigin: 'left center',
  };
}
