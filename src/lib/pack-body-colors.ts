/**
 * Helpers for Characters_7 Body_Color_Variant meshes.
 * Pack: 6 colors × 3 shape variants → Body_001..018.png previews.
 */

export const PACK_BODY_COLORS = [
  'blue',
  'brown',
  'orange',
  'red',
  'white',
  'yellow',
] as const;

export type PackBodyColor = (typeof PACK_BODY_COLORS)[number];

/** Display / material tint for each pack body color. */
export const PACK_BODY_TINT: Record<PackBodyColor, number> = {
  blue: 0x3b82f6,
  brown: 0x92400e,
  orange: 0xea580c,
  red: 0xdc2626,
  white: 0xe2e8f0,
  yellow: 0xeab308,
};

export function parsePackBodyName(name: string): {
  color: PackBodyColor;
  variant: number;
} | null {
  const m = name.match(/Body_([A-Za-z]+)_(\d+)/i);
  if (!m) return null;
  const color = m[1]!.toLowerCase() as PackBodyColor;
  if (!PACK_BODY_COLORS.includes(color)) return null;
  const variant = Math.max(1, Math.min(3, parseInt(m[2]!, 10) || 1));
  return { color, variant };
}

/** Preview PNG path for a Body_Blue_002-style asset (under /game/skins/). */
export function packBodyThumbnailPath(name: string): string | null {
  const parsed = parsePackBodyName(name);
  if (!parsed) {
    if (/Basic_Character/i.test(name)) return '/game/skins/bodies/Body_001.png';
    return null;
  }
  const colorIndex = PACK_BODY_COLORS.indexOf(parsed.color);
  const sheetNum = colorIndex * 3 + parsed.variant;
  return `/game/skins/bodies/Body_${String(sheetNum).padStart(3, '0')}.png`;
}

export function packBodyTintHex(name: string): number | null {
  const parsed = parsePackBodyName(name);
  if (!parsed) return null;
  return PACK_BODY_TINT[parsed.color];
}
