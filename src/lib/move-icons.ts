/**
 * Lucide icon registry for anything the user picks an icon for (custom
 * moves, movement HUD rings) — this platform uses lucide-react exclusively,
 * never emoji, for anything WE render as a picker/registry. Icons are
 * stored as plain strings so they survive JSON round-trips (MapDocument,
 * PowerDefinition.icon) — prefixed "lucide:" to stay distinguishable from
 * the legacy emoji/image-url icon strings already used by the Power Editor
 * (shared/power-definitions.ts's `isImageIcon`), which this does not touch.
 */
import {
  Zap,
  Flame,
  Wind,
  Star,
  Sparkles,
  RotateCcw,
  FlipVertical,
  ChevronsUp,
  ArrowUp,
  Swords,
  Shield,
  Rocket,
  Target,
  Waves,
  Footprints,
  Move,
  CornerDownRight,
  Wand2,
  Snowflake,
  Ghost,
  Bolt,
  Gauge,
  Anchor,
  Crosshair,
  type LucideIcon,
} from 'lucide-react';

export const LUCIDE_ICON_PREFIX = 'lucide:';

export const MOVE_ICON_REGISTRY: Record<string, LucideIcon> = {
  Zap,
  Flame,
  Wind,
  Star,
  Sparkles,
  RotateCcw,
  FlipVertical,
  ChevronsUp,
  ArrowUp,
  Swords,
  Shield,
  Rocket,
  Target,
  Waves,
  Footprints,
  Move,
  CornerDownRight,
  Wand2,
  Snowflake,
  Ghost,
  Bolt,
  Gauge,
  Anchor,
  Crosshair,
};

export const MOVE_ICON_NAMES = Object.keys(MOVE_ICON_REGISTRY);

export function isLucideIconString(icon: string | undefined | null): icon is string {
  return typeof icon === 'string' && icon.startsWith(LUCIDE_ICON_PREFIX);
}

export function toLucideIconString(name: string): string {
  return `${LUCIDE_ICON_PREFIX}${name}`;
}

/** Resolve a "lucide:Name" string to its component, or null if unrecognized. */
export function getLucideIcon(icon: string | undefined | null): LucideIcon | null {
  if (!isLucideIconString(icon)) return null;
  const name = icon.slice(LUCIDE_ICON_PREFIX.length);
  return MOVE_ICON_REGISTRY[name] ?? null;
}

export const DEFAULT_MOVE_ICON = toLucideIconString('Sparkles');
