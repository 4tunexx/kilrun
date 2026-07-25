/**
 * Server-side body color assignment — keep indices in sync with
 * src/lib/body-colors.ts on the Next.js client.
 */

export const BODY_COLOR_RED = 0;
export const BODY_COLOR_BLUE = 1;
export const BODY_COLOR_NONE = -1;
/** Solo / default player — Blue everywhere when alone. */
export const BODY_COLOR_SOLO_DEFAULT = BODY_COLOR_BLUE;

/** Runner palette excludes Red so the trapper stays unique. */
export const RUNNER_BODY_COLOR_INDICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

const FULL_PALETTE_ORDER: readonly number[] = [...RUNNER_BODY_COLOR_INDICES, BODY_COLOR_RED];

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

export function assignHordeColors(sessionIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (sessionIds.length === 1) {
    out.set(sessionIds[0]!, BODY_COLOR_SOLO_DEFAULT);
    return out;
  }
  sessionIds.forEach((id, i) => {
    out.set(id, FULL_PALETTE_ORDER[i % FULL_PALETTE_ORDER.length]!);
  });
  return out;
}

export function assignCompetitiveColor(role: string): number {
  if (role === 'team_b') return BODY_COLOR_BLUE;
  return BODY_COLOR_RED;
}

/** Next unused color for a late-joining Horde player. First player = Blue. */
export function nextHordeColor(usedIndices: number[]): number {
  if (usedIndices.length === 0) return BODY_COLOR_SOLO_DEFAULT;
  for (const idx of FULL_PALETTE_ORDER) {
    if (!usedIndices.includes(idx)) return idx;
  }
  return FULL_PALETTE_ORDER[usedIndices.length % FULL_PALETTE_ORDER.length]!;
}
