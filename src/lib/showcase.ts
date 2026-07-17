/**
 * Profile "showcase" — a handful of picks (rank, badges, achievements, or
 * owned cosmetics) a player chooses to display on their mini hover card and
 * public profile. Slots unlock progressively by account level so the
 * hover card never floods with content early on. Pure types/formula only
 * (no server/client directive) so both server actions and UI can import it.
 */

export type ShowcaseItemType = 'rank' | 'badge' | 'achievement' | 'inventory';

export interface ShowcaseEntry {
  slot: number;
  itemType: ShowcaseItemType;
  refId?: string;
}

export const SHOWCASE_MAX_SLOTS = 10;

/** Level required to unlock the Nth showcase slot (index 0 = 1st slot). */
export const SHOWCASE_UNLOCK_LEVELS = [3, 5, 7, 10, 13, 16, 20, 24, 28, 32];

export function getShowcaseSlotCount(level: number): number {
  let count = 0;
  for (const threshold of SHOWCASE_UNLOCK_LEVELS) {
    if (level >= threshold) count++;
  }
  return Math.min(count, SHOWCASE_MAX_SLOTS);
}

/** Level at which the player's next showcase slot unlocks, or null if maxed. */
export function getNextShowcaseUnlockLevel(level: number): number | null {
  for (const threshold of SHOWCASE_UNLOCK_LEVELS) {
    if (level < threshold) return threshold;
  }
  return null;
}

export function parseShowcaseEntries(raw: unknown): ShowcaseEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ShowcaseEntry => {
    if (!e || typeof e !== 'object') return false;
    const candidate = e as Record<string, unknown>;
    return (
      typeof candidate.slot === 'number' &&
      typeof candidate.itemType === 'string' &&
      ['rank', 'badge', 'achievement', 'inventory'].includes(candidate.itemType)
    );
  });
}

export type ShowcaseDisplayItem = {
  itemType: ShowcaseItemType;
  title: string;
  icon: string;
  iconImageUrl: string | null;
  rarity: string | null;
};
