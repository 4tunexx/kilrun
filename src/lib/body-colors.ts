/**
 * Default body colors = gameplay identification, NOT shop skins.
 * Same mesh (mannequin); only albedo tint changes.
 *
 * Indices must stay in sync with server/src/lib/body-colors.ts
 */

export interface BodyColorDef {
  index: number;
  id: string;
  name: string;
  /** CSS / config hex */
  hex: string;
  /** Three.js material color (0xRRGGBB) */
  materialColor: number;
  /** Soft emissive accent for team readability on premium skins */
  emissiveAccent: number;
}

/** Body_001 … Body_008 — fixed palette used by all modes. */
export const BODY_COLORS: readonly BodyColorDef[] = [
  {
    index: 0,
    id: 'body_001',
    name: 'Red',
    hex: '#e11d48',
    materialColor: 0xe11d48,
    emissiveAccent: 0x7f1d1d,
  },
  {
    index: 1,
    id: 'body_002',
    name: 'Blue',
    hex: '#2563eb',
    materialColor: 0x2563eb,
    emissiveAccent: 0x1e3a8a,
  },
  {
    index: 2,
    id: 'body_003',
    name: 'Green',
    hex: '#16a34a',
    materialColor: 0x16a34a,
    emissiveAccent: 0x14532d,
  },
  {
    index: 3,
    id: 'body_004',
    name: 'Yellow',
    hex: '#eab308',
    materialColor: 0xeab308,
    emissiveAccent: 0x854d0e,
  },
  {
    index: 4,
    id: 'body_005',
    name: 'Purple',
    hex: '#9333ea',
    materialColor: 0x9333ea,
    emissiveAccent: 0x581c87,
  },
  {
    index: 5,
    id: 'body_006',
    name: 'Orange',
    hex: '#ea580c',
    materialColor: 0xea580c,
    emissiveAccent: 0x9a3412,
  },
  {
    index: 6,
    id: 'body_007',
    name: 'Cyan',
    hex: '#06b6d4',
    materialColor: 0x06b6d4,
    emissiveAccent: 0x155e75,
  },
  {
    index: 7,
    id: 'body_008',
    name: 'White',
    hex: '#f8fafc',
    materialColor: 0xf8fafc,
    emissiveAccent: 0x64748b,
  },
] as const;

export const BODY_COLOR_COUNT = BODY_COLORS.length;

/** Trapper / Team A */
export const BODY_COLOR_RED = 0;
/** Team B + solo / default player look everywhere */
export const BODY_COLOR_BLUE = 1;
/** -1 = no gameplay override (use equipped premium / default mannequin look). */
export const BODY_COLOR_NONE = -1;

/**
 * Solo / lobby default: one consistent color everywhere when alone.
 * Blue — never Red (Red is trapper / Team A only).
 */
export const BODY_COLOR_SOLO_DEFAULT = BODY_COLOR_BLUE;

export function getBodyColor(index: number): BodyColorDef | null {
  if (!Number.isInteger(index) || index < 0 || index >= BODY_COLORS.length) return null;
  return BODY_COLORS[index]!;
}

export function isValidBodyColorIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BODY_COLORS.length;
}

/** Runner palette excludes Red so the trapper stays unique. */
export const RUNNER_BODY_COLOR_INDICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Deathrun: trapper always Red (0). Each runner gets a unique non-red color.
 * Solo (1 player): always Blue — one color everywhere.
 * Extra runners beyond 7 wrap with a deterministic offset (still prefer uniqueness).
 */
export function assignDeathrunColors(
  sessionIds: string[],
  trapperSessionId: string | null
): Map<string, number> {
  const out = new Map<string, number>();
  if (sessionIds.length === 1) {
    out.set(sessionIds[0]!, BODY_COLOR_SOLO_DEFAULT);
    return out;
  }
  const runners = sessionIds.filter((id) => id !== trapperSessionId);
  runners.forEach((id, i) => {
    out.set(id, RUNNER_BODY_COLOR_INDICES[i % RUNNER_BODY_COLOR_INDICES.length]!);
  });
  if (trapperSessionId) {
    out.set(trapperSessionId, BODY_COLOR_RED);
  }
  return out;
}

/**
 * Horde: unique colors in join order; wrap after palette exhausted.
 * Solo: always Blue.
 */
export function assignHordeColors(sessionIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (sessionIds.length === 1) {
    out.set(sessionIds[0]!, BODY_COLOR_SOLO_DEFAULT);
    return out;
  }
  sessionIds.forEach((id, i) => {
    // Prefer non-red first for survivors, then wrap full palette
    const order = [...RUNNER_BODY_COLOR_INDICES, BODY_COLOR_RED];
    out.set(id, order[i % order.length]!);
  });
  return out;
}

/**
 * Competitive: Team A = Red, Team B = Blue.
 */
export function assignCompetitiveColor(role: string): number {
  if (role === 'team_b') return BODY_COLOR_BLUE;
  return BODY_COLOR_RED;
}
