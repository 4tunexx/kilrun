/**
 * Shared banner-cosmetic helpers. Pure functions only (no server/client
 * directive) so they can be imported from server actions, the admin banner
 * generator, and any client component that renders an equipped banner.
 */
import type { CSSProperties } from 'react';

export type BannerAnimationStyle =
  | 'none'
  | 'shimmer'
  | 'pulse'
  | 'rotate'
  | 'wave'
  | 'breathe'
  | 'sparkle';

export interface BannerConfig {
  colors: string[];
  angle: number;
  animated: boolean;
  animationStyle: BannerAnimationStyle;
  /** Soft blur overlay intensity 0–1. */
  blur?: number;
  /** Overall opacity of the banner fill 0.4–1. */
  opacity?: number;
}

export const DEFAULT_BANNER_CONFIG: BannerConfig = {
  colors: ['#ef4444', '#7c3aed'],
  angle: 135,
  animated: false,
  animationStyle: 'none',
};

export const BANNER_PRESET_SWATCHES: string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#0ea5e9',
  '#ffffff',
  '#0f172a',
];

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/** Normalizes arbitrary/legacy JSON into a safe BannerConfig, never throws. */
export function normalizeBannerConfig(raw: unknown): BannerConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_BANNER_CONFIG;
  const cfg = raw as Partial<BannerConfig>;
  const validColors = Array.isArray(cfg.colors)
    ? cfg.colors.filter((c): c is string => typeof c === 'string' && isValidHexColor(c))
    : [];
  const colors = validColors.length >= 2 ? validColors.slice(0, 4) : DEFAULT_BANNER_CONFIG.colors;
  const angle =
    typeof cfg.angle === 'number' && Number.isFinite(cfg.angle)
      ? Math.max(0, Math.min(360, Math.round(cfg.angle)))
      : DEFAULT_BANNER_CONFIG.angle;
  const animationStyle: BannerAnimationStyle = (
    ['none', 'shimmer', 'pulse', 'rotate', 'wave', 'breathe', 'sparkle'] as const
  ).includes(cfg.animationStyle as BannerAnimationStyle)
    ? (cfg.animationStyle as BannerAnimationStyle)
    : 'none';
  const blur =
    typeof cfg.blur === 'number' && Number.isFinite(cfg.blur)
      ? Math.max(0, Math.min(1, cfg.blur))
      : 0;
  const opacity =
    typeof cfg.opacity === 'number' && Number.isFinite(cfg.opacity)
      ? Math.max(0.4, Math.min(1, cfg.opacity))
      : 1;
  return {
    colors,
    angle,
    animated: Boolean(cfg.animated) && animationStyle !== 'none',
    animationStyle,
    blur,
    opacity,
  };
}

export function bannerGradientCss(config: BannerConfig): string {
  return `linear-gradient(${config.angle}deg, ${config.colors.join(', ')})`;
}

/** Inline style object for a div rendering this banner. */
export function bannerStyle(config: BannerConfig): CSSProperties {
  const c = normalizeBannerConfig(config);
  const sweeping =
    c.animated && (c.animationStyle === 'shimmer' || c.animationStyle === 'wave');
  return {
    backgroundImage: bannerGradientCss(c),
    backgroundSize: sweeping ? '200% 200%' : 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: c.opacity ?? 1,
    // Soft blur as an overlay feel — keep modest so profile banners don't look muddy
    filter: (c.blur ?? 0) > 0 ? `blur(${(c.blur ?? 0) * 1.25}px)` : undefined,
  };
}

/** Tailwind animation utility class matching this banner's animation style. */
export function bannerAnimationClass(config: BannerConfig): string {
  const c = normalizeBannerConfig(config);
  if (!c.animated) return '';
  switch (c.animationStyle) {
    case 'shimmer':
      return 'animate-banner-shimmer';
    case 'pulse':
      return 'animate-banner-pulse-glow';
    case 'rotate':
      return 'animate-banner-rotate-hue';
    case 'wave':
      return 'animate-banner-wave';
    case 'breathe':
      return 'animate-banner-breathe';
    case 'sparkle':
      return 'animate-banner-sparkle';
    default:
      return '';
  }
}

export const BANNER_ANIMATION_STYLES: { value: BannerAnimationStyle; label: string }[] = [
  { value: 'none', label: 'None (static)' },
  { value: 'shimmer', label: 'Shimmer (sweeping gradient)' },
  { value: 'pulse', label: 'Pulse (glow in/out)' },
  { value: 'rotate', label: 'Rotate (shifting hues)' },
  { value: 'wave', label: 'Wave (flowing gradient)' },
  { value: 'breathe', label: 'Breathe (scale soft)' },
  { value: 'sparkle', label: 'Sparkle (brightness flicker)' },
];
