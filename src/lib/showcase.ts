/**
 * Profile "showcase" — a handful of picks (rank, badges, achievements, or
 * owned cosmetics) a player chooses to display on their mini hover card.
 * Slots unlock progressively by account level so the hover card never floods
 * with content early on. Pure types/formula only (no server/client directive)
 * so both server actions and UI can import it.
 *
 * Storage (User.showcaseItems) accepts either a legacy array of entries, or
 * `{ entries, layout }` for mini-card position/alignment preferences.
 */

export type ShowcaseItemType = 'rank' | 'badge' | 'achievement' | 'inventory' | 'reputation';

export interface ShowcaseEntry {
  slot: number;
  itemType: ShowcaseItemType;
  refId?: string;
}

export type ShowcasePosition = 'after_level' | 'bottom';
export type ShowcaseAlign = 'start' | 'center' | 'end';

export type ShowcaseLayout = {
  position: ShowcasePosition;
  align: ShowcaseAlign;
};

export const DEFAULT_SHOWCASE_LAYOUT: ShowcaseLayout = {
  position: 'after_level',
  align: 'start',
};

export const SHOWCASE_MAX_SLOTS = 10;
/** Max chips shown per category row on the mini card (pagination beyond this). */
export const SHOWCASE_ROW_PAGE_SIZE = 3;

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

const SHOWCASE_TYPES: ShowcaseItemType[] = [
  'rank',
  'badge',
  'achievement',
  'inventory',
  'reputation',
];

const POSITIONS: ShowcasePosition[] = ['after_level', 'bottom'];
const ALIGNS: ShowcaseAlign[] = ['start', 'center', 'end'];

export function normalizeShowcaseLayout(raw: unknown): ShowcaseLayout {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SHOWCASE_LAYOUT };
  const o = raw as Record<string, unknown>;
  return {
    position: POSITIONS.includes(o.position as ShowcasePosition)
      ? (o.position as ShowcasePosition)
      : DEFAULT_SHOWCASE_LAYOUT.position,
    align: ALIGNS.includes(o.align as ShowcaseAlign)
      ? (o.align as ShowcaseAlign)
      : DEFAULT_SHOWCASE_LAYOUT.align,
  };
}

function parseEntryList(raw: unknown): ShowcaseEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ShowcaseEntry => {
    if (!e || typeof e !== 'object') return false;
    const candidate = e as Record<string, unknown>;
    return (
      typeof candidate.slot === 'number' &&
      typeof candidate.itemType === 'string' &&
      SHOWCASE_TYPES.includes(candidate.itemType as ShowcaseItemType)
    );
  });
}

/** Prefer `parseShowcaseStorage` when layout is needed; this keeps legacy call sites working. */
export function parseShowcaseEntries(raw: unknown): ShowcaseEntry[] {
  return parseShowcaseStorage(raw).entries;
}

export function parseShowcaseStorage(raw: unknown): {
  entries: ShowcaseEntry[];
  layout: ShowcaseLayout;
} {
  if (Array.isArray(raw)) {
    return { entries: parseEntryList(raw), layout: { ...DEFAULT_SHOWCASE_LAYOUT } };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.entries)) {
      return {
        entries: parseEntryList(o.entries),
        layout: normalizeShowcaseLayout(o.layout),
      };
    }
  }
  return { entries: [], layout: { ...DEFAULT_SHOWCASE_LAYOUT } };
}

export function serializeShowcaseStorage(
  entries: ShowcaseEntry[],
  layout: ShowcaseLayout
): { entries: ShowcaseEntry[]; layout: ShowcaseLayout } {
  return {
    entries,
    layout: normalizeShowcaseLayout(layout),
  };
}

export type ShowcaseDisplayItem = {
  itemType: ShowcaseItemType;
  title: string;
  icon: string;
  iconImageUrl: string | null;
  rarity: string | null;
  /** Optional numeric subtitle (e.g. reputation value). */
  value?: number | null;
};

/** Group display items by category, preserving first-seen order from slots. */
export function groupShowcaseByCategory(
  items: ShowcaseDisplayItem[]
): { type: ShowcaseItemType; items: ShowcaseDisplayItem[] }[] {
  const order: ShowcaseItemType[] = [];
  const map = new Map<ShowcaseItemType, ShowcaseDisplayItem[]>();
  for (const item of items) {
    if (!map.has(item.itemType)) {
      map.set(item.itemType, []);
      order.push(item.itemType);
    }
    map.get(item.itemType)!.push(item);
  }
  return order.map((type) => ({ type, items: map.get(type)! }));
}
