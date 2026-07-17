/**
 * Shared banner-cosmetic helpers. Pure functions only (no server/client
 * directive) so they can be imported from server actions, the admin banner
 * generator, and any client component that renders an equipped banner.
 */
import type { CSSProperties } from 'react';

export type BannerAnimationStyle = 'none' | 'shimmer' | 'pulse' | 'rotate';

export interface BannerConfig {
  colors: string[];
  angle: number;
  animated: boolean;
  animationStyle: BannerAnimationStyle;
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
    ['none', 'shimmer', 'pulse', 'rotate'] as const
  ).includes(cfg.animationStyle as BannerAnimationStyle)
    ? (cfg.animationStyle as BannerAnimationStyle)
    : 'none';
  return {
    colors,
    angle,
    animated: Boolean(cfg.animated) && animationStyle !== 'none',
    animationStyle,
  };
}

export function bannerGradientCss(config: BannerConfig): string {
  return `linear-gradient(${config.angle}deg, ${config.colors.join(', ')})`;
}

/** Inline style object for a div rendering this banner. */
export function bannerStyle(config: BannerConfig): CSSProperties {
  return {
    backgroundImage: bannerGradientCss(config),
    backgroundSize: config.animated && config.animationStyle === 'shimmer' ? '200% 200%' : '100% 100%',
  };
}

/** Tailwind animation utility class matching this banner's animation style. */
export function bannerAnimationClass(config: BannerConfig): string {
  if (!config.animated) return '';
  switch (config.animationStyle) {
    case 'shimmer':
      return 'animate-banner-shimmer';
    case 'pulse':
      return 'animate-banner-pulse-glow';
    case 'rotate':
      return 'animate-banner-rotate-hue';
    default:
      return '';
  }
}

export const BANNER_ANIMATION_STYLES: { value: BannerAnimationStyle; label: string }[] = [
  { value: 'none', label: 'None (static)' },
  { value: 'shimmer', label: 'Shimmer (sweeping gradient)' },
  { value: 'pulse', label: 'Pulse (glow in/out)' },
  { value: 'rotate', label: 'Rotate (shifting hues)' },
];
