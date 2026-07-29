/**
 * Next.js-side bridge between the persisted `WeaponDefinition` Mongo rows and
 * the global weapon catalog in `src/lib/weapon-catalog.ts`. Every server-side
 * consumer (API routes, server actions) should call `loadWeaponDefinitions()`
 * — it's cached for a short TTL, and on any DB error it falls back to the
 * static 8-weapon catalog so a Mongo hiccup can never break gameplay.
 *
 * Mirrors `src/lib/power-definitions.ts` exactly (same shape, same caching,
 * same fallback guarantees) — see that file for the reference pattern.
 */

import { prisma } from '@/lib/prisma';
import {
  applyDynamicWeaponDefinitions,
  STATIC_FALLBACK_WEAPONS,
  type CatalogWeaponDef,
} from '@/lib/weapon-catalog';
import type { WeaponCombatConfig, WeaponCombatKind } from '@/lib/weapons';

type WeaponDefinitionRow = {
  key: string;
  label: string;
  modelUrl: string;
  kind: string;
  combatJson: string;
  modesJson: string;
  gripHint: string;
  unlockMetric: string | null;
  unlockAmount: number | null;
  isCore: boolean;
  sortOrder: number;
};

function safeParse<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function rowToRecord(row: WeaponDefinitionRow): CatalogWeaponDef {
  return {
    id: row.key,
    label: row.label,
    modelUrl: row.modelUrl,
    kind: (row.kind as WeaponCombatKind) || 'hitscan',
    combat: safeParse<Partial<WeaponCombatConfig>>(row.combatJson, {}),
    modes: safeParse<Array<'horde' | 'competitive'>>(row.modesJson, ['horde', 'competitive']),
    gripHint: row.gripHint ?? '',
    unlockMetric: row.unlockMetric ?? undefined,
    unlockAmount: row.unlockAmount ?? undefined,
    isCore: row.isCore,
    sortOrder: row.sortOrder,
  };
}

export function recordToRowData(record: CatalogWeaponDef) {
  return {
    key: record.id,
    label: record.label,
    modelUrl: record.modelUrl,
    kind: record.kind,
    combatJson: JSON.stringify(record.combat ?? {}),
    modesJson: JSON.stringify(record.modes ?? []),
    gripHint: record.gripHint ?? '',
    unlockMetric: record.unlockMetric ?? null,
    unlockAmount:
      typeof record.unlockAmount === 'number' && Number.isFinite(record.unlockAmount)
        ? record.unlockAmount
        : null,
    isCore: !!record.isCore,
    sortOrder: record.sortOrder ?? 0,
  };
}

let cache: { at: number; records: CatalogWeaponDef[] } | null = null;
const CACHE_TTL_MS = 15_000;

/** Load active weapon definitions (DB rows if reachable, else the static
 * fallback), hot-swap `CATALOG_WEAPONS`, and return the list. Cached briefly
 * so hot code paths (map open, shop resolve) don't hit Mongo on every call. */
export async function loadWeaponDefinitions(opts?: { force?: boolean }): Promise<CatalogWeaponDef[]> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.records;
  }
  try {
    const rows = await prisma.weaponDefinition.findMany({ orderBy: { sortOrder: 'asc' } });
    if (!rows.length) {
      // DB reachable but not seeded yet — use static fallback, don't cache
      // as "final" so the next request retries once seeding happens.
      applyDynamicWeaponDefinitions(STATIC_FALLBACK_WEAPONS);
      return STATIC_FALLBACK_WEAPONS;
    }
    const records = rows.map((r) => rowToRecord(r as unknown as WeaponDefinitionRow));
    applyDynamicWeaponDefinitions(records);
    cache = { at: now, records };
    return records;
  } catch (err) {
    console.error('[weapon-definitions] DB load failed, using static fallback:', err);
    applyDynamicWeaponDefinitions(STATIC_FALLBACK_WEAPONS);
    return STATIC_FALLBACK_WEAPONS;
  }
}

export function invalidateWeaponDefinitionsCache(): void {
  cache = null;
}
