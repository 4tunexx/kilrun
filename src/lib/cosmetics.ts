/**
 * Avatar frame + nickname effect cosmetics shared by admin generators,
 * equip actions, and profile rendering.
 */
import type { CSSProperties } from 'react';

export type CosmeticSlot = 'banner' | 'frame' | 'nickname';

/** Prisma select fragment — include on any public user card / list row. */
export const PUBLIC_USER_COSMETIC_SELECT = {
  equippedFrameConfig: true,
  equippedNicknameConfig: true,
} as const;

/** Common author/peer select used by chat, friends, forum, messages. */
export const PUBLIC_USER_CARD_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
  role: true,
  isVip: true,
  ...PUBLIC_USER_COSMETIC_SELECT,
} as const;

export type FrameStyle =
  | 'ring'
  | 'double'
  | 'hex'
  | 'glow'
  | 'pixels'
  | 'flame';

export interface FrameConfig {
  style: FrameStyle;
  color: string;
  secondaryColor: string;
  thickness: number;
  glow: boolean;
  animated: boolean;
}

export type NicknameEffect =
  | 'none'
  | 'glow'
  | 'rainbow'
  | 'shimmer'
  | 'fire'
  | 'ice'
  | 'neon'
  | 'glitch';

export interface NicknameConfig {
  effect: NicknameEffect;
  color: string;
  intensity: number;
}

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  style: 'ring',
  color: '#ef4444',
  secondaryColor: '#fbbf24',
  thickness: 3,
  glow: true,
  animated: false,
};

export const DEFAULT_NICKNAME_CONFIG: NicknameConfig = {
  effect: 'glow',
  color: '#ef4444',
  intensity: 0.7,
};

export const FRAME_STYLES: { value: FrameStyle; label: string }[] = [
  { value: 'ring', label: 'Simple ring' },
  { value: 'double', label: 'Double ring' },
  { value: 'hex', label: 'Hexagon' },
  { value: 'glow', label: 'Soft glow' },
  { value: 'pixels', label: 'Pixel border' },
  { value: 'flame', label: 'Flame edge' },
];

export const NICKNAME_EFFECTS: { value: NicknameEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'glow', label: 'Soft glow' },
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'fire', label: 'Fire' },
  { value: 'ice', label: 'Ice' },
  { value: 'neon', label: 'Neon' },
  { value: 'glitch', label: 'Glitch' },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeFrameConfig(raw: unknown): FrameConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FRAME_CONFIG };
  const c = raw as Partial<FrameConfig>;
  const style = FRAME_STYLES.some((s) => s.value === c.style)
    ? (c.style as FrameStyle)
    : 'ring';
  return {
    style,
    color: typeof c.color === 'string' && HEX_RE.test(c.color) ? c.color : DEFAULT_FRAME_CONFIG.color,
    secondaryColor:
      typeof c.secondaryColor === 'string' && HEX_RE.test(c.secondaryColor)
        ? c.secondaryColor
        : DEFAULT_FRAME_CONFIG.secondaryColor,
    thickness:
      typeof c.thickness === 'number' && Number.isFinite(c.thickness)
        ? clamp(c.thickness, 1, 8)
        : 3,
    glow: Boolean(c.glow),
    animated: Boolean(c.animated),
  };
}

export function normalizeNicknameConfig(raw: unknown): NicknameConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NICKNAME_CONFIG };
  const c = raw as Partial<NicknameConfig>;
  const effect = NICKNAME_EFFECTS.some((e) => e.value === c.effect)
    ? (c.effect as NicknameEffect)
    : 'glow';
  return {
    effect,
    color:
      typeof c.color === 'string' && HEX_RE.test(c.color)
        ? c.color
        : DEFAULT_NICKNAME_CONFIG.color,
    intensity:
      typeof c.intensity === 'number' && Number.isFinite(c.intensity)
        ? clamp(c.intensity, 0.2, 1)
        : 0.7,
  };
}

/** Wrapper styles around an avatar for the equipped frame. */
export function frameWrapperStyle(config: FrameConfig): CSSProperties {
  const f = normalizeFrameConfig(config);
  const pad = f.thickness;
  const shadow = f.glow
    ? `0 0 ${8 + f.thickness * 2}px ${f.color}99`
    : undefined;

  if (f.style === 'double') {
    return {
      padding: pad,
      background: `linear-gradient(135deg, ${f.color}, ${f.secondaryColor})`,
      borderRadius: '9999px',
      boxShadow: shadow,
    };
  }
  if (f.style === 'hex') {
    return {
      padding: pad + 2,
      background: `linear-gradient(135deg, ${f.color}, ${f.secondaryColor})`,
      clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)',
      boxShadow: shadow,
    };
  }
  if (f.style === 'pixels') {
    return {
      padding: pad,
      background: f.color,
      borderRadius: 4,
      boxShadow: `0 0 0 2px ${f.secondaryColor}, ${shadow ?? 'none'}`,
    };
  }
  if (f.style === 'flame') {
    return {
      padding: pad + 1,
      background: `conic-gradient(from 180deg, ${f.color}, ${f.secondaryColor}, ${f.color})`,
      borderRadius: '9999px',
      boxShadow: shadow,
    };
  }
  // ring / glow
  return {
    padding: pad,
    background: f.style === 'glow' ? f.color : `linear-gradient(135deg, ${f.color}, ${f.secondaryColor})`,
    borderRadius: '9999px',
    boxShadow: shadow ?? `0 0 0 2px ${f.color}55`,
  };
}

export function frameAnimationClass(config: FrameConfig): string {
  const f = normalizeFrameConfig(config);
  if (!f.animated) return '';
  if (f.style === 'flame') return 'animate-frame-spin';
  return 'animate-frame-pulse';
}

/** CSS class + inline style for nickname effects. */
export function nicknameEffectClass(config: NicknameConfig | null | undefined): string {
  if (!config) return '';
  const n = normalizeNicknameConfig(config);
  switch (n.effect) {
    case 'rainbow':
      return 'animate-nick-rainbow bg-clip-text text-transparent bg-[length:200%_auto] bg-gradient-to-r from-red-400 via-yellow-300 via-green-400 via-cyan-400 to-fuchsia-400';
    case 'shimmer':
      return 'animate-nick-shimmer';
    case 'fire':
      return 'animate-nick-fire';
    case 'ice':
      return 'text-cyan-200 animate-nick-ice';
    case 'neon':
      return 'animate-nick-neon';
    case 'glitch':
      return 'animate-nick-glitch';
    case 'glow':
      return 'animate-nick-glow';
    default:
      return '';
  }
}

export function nicknameEffectStyle(
  config: NicknameConfig | null | undefined
): CSSProperties | undefined {
  if (!config) return undefined;
  const n = normalizeNicknameConfig(config);
  if (n.effect === 'rainbow' || n.effect === 'none') return undefined;
  const alpha = Math.round(n.intensity * 255)
    .toString(16)
    .padStart(2, '0');
  return {
    color: n.color,
    textShadow:
      n.effect === 'glow' || n.effect === 'neon'
        ? `0 0 ${6 + n.intensity * 10}px ${n.color}${alpha}`
        : n.effect === 'fire'
          ? `0 0 8px #f97316, 0 0 16px ${n.color}`
          : n.effect === 'ice'
            ? `0 0 8px #67e8f9`
            : undefined,
  };
}

export type LandingHeroSlide = { src: string; alt?: string; title?: string };

export function normalizeLandingSlides(raw: unknown): LandingHeroSlide[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: LandingHeroSlide[] = [];
  for (const item of arr) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ src: item.trim(), alt: 'Kilrun' });
      continue;
    }
    if (item && typeof item === 'object' && typeof (item as { src?: string }).src === 'string') {
      const s = item as LandingHeroSlide;
      const src = s.src.trim();
      if (!src) continue;
      out.push({
        src,
        alt: s.alt?.trim() || 'Kilrun',
        title: s.title?.trim() || undefined,
      });
    }
  }
  return out;
}
