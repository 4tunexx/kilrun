/**
 * Next.js-side bridge between the persisted `PowerDefinition` Mongo rows and
 * the generic engine in `shared/power-definitions.ts`. Every server-side
 * consumer (API routes, server actions) should call `loadPowerDefinitions()`
 * — it's cached for a short TTL, and on any DB error it falls back to the
 * static 12-ability list so a Mongo hiccup can never break the game.
 */

import { prisma } from '@/lib/prisma';
import {
  applyDynamicPowerDefinitions,
  STATIC_FALLBACK_POWERS,
  type PowerDefinitionRecord,
  type CostFormula,
  type PowerEffectType,
  type PowerEffectParams,
  type PowerPrerequisite,
} from '@shared/power-definitions';

type PowerDefinitionRow = {
  key: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  unlockLevel: number;
  prerequisitesJson: string;
  costJson: string;
  effectType: string;
  effectParamsJson: string;
  isCore: boolean;
  sortOrder: number;
  posX?: number | null;
  posY?: number | null;
};

function safeParse<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function rowToRecord(row: PowerDefinitionRow): PowerDefinitionRecord {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    maxLevel: row.maxLevel,
    unlockLevel: row.unlockLevel,
    prerequisites: safeParse<PowerPrerequisite[]>(row.prerequisitesJson, []),
    cost: safeParse<CostFormula>(row.costJson, { type: 'flat', base: 1 }),
    effectType: row.effectType as PowerEffectType,
    effectParams: safeParse<PowerEffectParams>(row.effectParamsJson, { bonuses: [] } as never),
    isCore: row.isCore,
    sortOrder: row.sortOrder,
    posX: row.posX ?? null,
    posY: row.posY ?? null,
  };
}

export function recordToRowData(record: PowerDefinitionRecord) {
  return {
    key: record.key,
    name: record.name,
    description: record.description,
    icon: record.icon,
    maxLevel: record.maxLevel,
    unlockLevel: record.unlockLevel,
    prerequisitesJson: JSON.stringify(record.prerequisites ?? []),
    costJson: JSON.stringify(record.cost),
    effectType: record.effectType,
    effectParamsJson: JSON.stringify(record.effectParams),
    isCore: record.isCore,
    sortOrder: record.sortOrder,
    posX: typeof record.posX === 'number' ? record.posX : null,
    posY: typeof record.posY === 'number' ? record.posY : null,
  };
}

let cache: { at: number; records: PowerDefinitionRecord[] } | null = null;
const CACHE_TTL_MS = 15_000;

/** Load active power definitions (DB rows if reachable, else the static
 * fallback), hot-swap the shared engine's singleton, and return the list.
 * Cached briefly so hot code paths (player-loadout, game-progression
 * actions) don't hit Mongo on every call. */
export async function loadPowerDefinitions(opts?: { force?: boolean }): Promise<PowerDefinitionRecord[]> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.records;
  }
  try {
    const rows = await prisma.powerDefinition.findMany({ orderBy: { sortOrder: 'asc' } });
    if (!rows.length) {
      // DB reachable but not seeded yet — use static fallback, don't cache
      // as "final" so the next request retries once seeding happens.
      applyDynamicPowerDefinitions(STATIC_FALLBACK_POWERS);
      return STATIC_FALLBACK_POWERS;
    }
    const records = rows.map((r) => rowToRecord(r as unknown as PowerDefinitionRow));
    applyDynamicPowerDefinitions(records);
    cache = { at: now, records };
    return records;
  } catch (err) {
    console.error('[power-definitions] DB load failed, using static fallback:', err);
    applyDynamicPowerDefinitions(STATIC_FALLBACK_POWERS);
    return STATIC_FALLBACK_POWERS;
  }
}

export function invalidatePowerDefinitionsCache(): void {
  cache = null;
}
