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

export type BannerPattern =
  | 'none'
  | 'stripes'
  | 'diagonal'
  | 'dots'
  | 'grid'
  | 'chevrons'
  | 'carbon'
  | 'stars';

export type BannerTextureBlend =
  | 'normal'
  | 'overlay'
  | 'soft-light'
  | 'multiply'
  | 'screen';

export interface BannerConfig {
  colors: string[];
  angle: number;
  animated: boolean;
  animationStyle: BannerAnimationStyle;
  /** Soft blur overlay intensity 0–1. */
  blur?: number;
  /** Overall opacity of the banner fill 0.4–1. */
  opacity?: number;
  /** Tiled CSS/SVG pattern on top of the gradient. */
  pattern?: BannerPattern;
  /** Pattern strength 0–1 (default 0.35). */
  patternOpacity?: number;
  /** Pattern tile scale 0.5–3 (default 1). */
  patternScale?: number;
  /** Optional uploaded texture / image overlay (data URL or http). */
  textureUrl?: string;
  /** Texture strength 0–1 (default 0.45). */
  textureOpacity?: number;
  /** How the texture blends over the gradient. */
  textureBlend?: BannerTextureBlend;
}

export const DEFAULT_BANNER_CONFIG: BannerConfig = {
  colors: ['#ef4444', '#7c3aed'],
  angle: 135,
  animated: false,
  animationStyle: 'none',
  pattern: 'none',
  patternOpacity: 0.35,
  patternScale: 1,
  textureOpacity: 0.45,
  textureBlend: 'overlay',
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

export const BANNER_PATTERNS: { value: BannerPattern; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'diagonal', label: 'Diagonal lines' },
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid' },
  { value: 'chevrons', label: 'Chevrons' },
  { value: 'carbon', label: 'Carbon fiber' },
  { value: 'stars', label: 'Stars' },
];

export const BANNER_TEXTURE_BLENDS: { value: BannerTextureBlend; label: string }[] = [
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'normal', label: 'Normal' },
];

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const BANNER_PATTERN_SET = new Set<BannerPattern>(
  BANNER_PATTERNS.map((p) => p.value)
);
const BANNER_BLEND_SET = new Set<BannerTextureBlend>(
  BANNER_TEXTURE_BLENDS.map((b) => b.value)
);

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/**
 * Build a URL-safe SKU from a display name.
 * e.g. skuFromName("Crimson Wave", "banner") → "banner-crimson-wave"
 */
export function skuFromName(name: string, prefix?: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
  if (!base) return prefix ? `${prefix}-` : '';
  if (!prefix) return base;
  const p = prefix.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (base.startsWith(`${p}-`)) return base;
  return `${p}-${base}`;
}

/** Normalizes arbitrary/legacy JSON into a safe BannerConfig, never throws. */
export function normalizeBannerConfig(raw: unknown): BannerConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BANNER_CONFIG };
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
  const pattern: BannerPattern = BANNER_PATTERN_SET.has(cfg.pattern as BannerPattern)
    ? (cfg.pattern as BannerPattern)
    : 'none';
  const patternOpacity =
    typeof cfg.patternOpacity === 'number' && Number.isFinite(cfg.patternOpacity)
      ? Math.max(0, Math.min(1, cfg.patternOpacity))
      : 0.35;
  const patternScale =
    typeof cfg.patternScale === 'number' && Number.isFinite(cfg.patternScale)
      ? Math.max(0.5, Math.min(3, cfg.patternScale))
      : 1;
  const textureUrl =
    typeof cfg.textureUrl === 'string' && cfg.textureUrl.trim().length > 8
      ? cfg.textureUrl.trim()
      : undefined;
  const textureOpacity =
    typeof cfg.textureOpacity === 'number' && Number.isFinite(cfg.textureOpacity)
      ? Math.max(0, Math.min(1, cfg.textureOpacity))
      : 0.45;
  const textureBlend: BannerTextureBlend = BANNER_BLEND_SET.has(
    cfg.textureBlend as BannerTextureBlend
  )
    ? (cfg.textureBlend as BannerTextureBlend)
    : 'overlay';
  return {
    colors,
    angle,
    animated: Boolean(cfg.animated) && animationStyle !== 'none',
    animationStyle,
    blur,
    opacity,
    pattern,
    patternOpacity,
    patternScale,
    textureUrl,
    textureOpacity,
    textureBlend,
  };
}

export function bannerGradientCss(config: BannerConfig): string {
  return `linear-gradient(${config.angle}deg, ${config.colors.join(', ')})`;
}

function svgDataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Tiled pattern layer background-image for the given config. */
export function bannerPatternImage(config: BannerConfig): string | undefined {
  const c = normalizeBannerConfig(config);
  if (!c.pattern || c.pattern === 'none') return undefined;
  const s = Math.round(24 * (c.patternScale ?? 1));
  switch (c.pattern) {
    case 'stripes':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><rect width="12" height="24" fill="white" opacity="0.55"/></svg>`
      );
    case 'diagonal':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M0 24L24 0H18L0 18zm24 0V18L6 24z" fill="white" opacity="0.45"/></svg>`
      );
    case 'dots':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2" fill="white" opacity="0.55"/><circle cx="18" cy="18" r="2.2" fill="white" opacity="0.55"/></svg>`
      );
    case 'grid':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M0 0h24v1H0zm0 23h24v1H0zM0 0h1v24H0zm23 0h1v24h-1z" fill="white" opacity="0.4"/></svg>`
      );
    case 'chevrons':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M0 8l12 6 12-6v4L12 18 0 12z" fill="white" opacity="0.4"/></svg>`
      );
    case 'carbon':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 16 16"><rect width="8" height="8" fill="white" opacity="0.22"/><rect x="8" y="8" width="8" height="8" fill="white" opacity="0.22"/><rect x="8" width="8" height="8" fill="black" opacity="0.18"/><rect y="8" width="8" height="8" fill="black" opacity="0.18"/></svg>`
      );
    case 'stars':
      return svgDataUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s * 2}" height="${s * 2}" viewBox="0 0 48 48"><path d="M12 6l1.2 3.6H17l-3 2.2 1.2 3.6-3.2-2.2-3.2 2.2 1.2-3.6-3-2.2h3.8zm24 18l1.2 3.6H41l-3 2.2 1.2 3.6-3.2-2.2-3.2 2.2 1.2-3.6-3-2.2h3.8z" fill="white" opacity="0.55"/></svg>`
      );
    default:
      return undefined;
  }
}

/** Base gradient fill style (no pattern/texture — those are separate layers). */
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
    filter: (c.blur ?? 0) > 0 ? `blur(${(c.blur ?? 0) * 1.25}px)` : undefined,
  };
}

export function bannerPatternStyle(config: BannerConfig): CSSProperties | undefined {
  const c = normalizeBannerConfig(config);
  const img = bannerPatternImage(c);
  if (!img) return undefined;
  const tile = Math.round(48 * (c.patternScale ?? 1));
  return {
    backgroundImage: img,
    backgroundSize: `${tile}px ${tile}px`,
    backgroundRepeat: 'repeat',
    opacity: c.patternOpacity ?? 0.35,
    mixBlendMode: 'overlay',
    pointerEvents: 'none',
  };
}

export function bannerTextureStyle(config: BannerConfig): CSSProperties | undefined {
  const c = normalizeBannerConfig(config);
  if (!c.textureUrl) return undefined;
  return {
    backgroundImage: `url("${c.textureUrl.replace(/"/g, '%22')}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: c.textureOpacity ?? 0.45,
    mixBlendMode: c.textureBlend ?? 'overlay',
    pointerEvents: 'none',
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
