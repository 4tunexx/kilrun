import { comparePluginVersions, mergeById } from '../../shared/plugin-source.js';

export type CatalogPluginRow = {
  pluginId: string;
  version: string;
  source: string;
  permissions?: string[];
  modes?: unknown[];
  weapons?: Array<Record<string, unknown> & { id: string }>;
  shopItems?: Array<Record<string, unknown> & { id: string }>;
};

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*' || raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

let cache: CatalogPluginRow[] = [];
let cacheAt = 0;

export function peekPluginCatalog(): CatalogPluginRow[] {
  return cache;
}

export async function refreshPluginCatalog(): Promise<CatalogPluginRow[]> {
  const base = resolveWebAppUrl();
  if (!base) return cache;
  if (cache.length && Date.now() - cacheAt < 8000) return cache;
  const url = `${base}/api/game/plugins?t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
      signal: controller.signal,
    });
    if (!res.ok) return cache;
    const data = (await res.json()) as { ok?: boolean; plugins?: CatalogPluginRow[] };
    if (Array.isArray(data?.plugins)) {
      cache = data.plugins.filter((row) => row && typeof row.pluginId === 'string');
      cacheAt = Date.now();
    }
  } catch (err) {
    console.warn('[plugin-catalog] fetch failed', err);
  } finally {
    clearTimeout(timer);
  }
  return cache;
}

function asIdRows(raw: unknown): Array<Record<string, unknown> & { id: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, unknown> & { id: string }> = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as { id?: unknown }).id || '');
    if (!id) continue;
    out.push({ ...(row as Record<string, unknown>), id });
  }
  return out;
}

export function overlayCatalogOnRuntime(runtime: unknown): unknown[] {
  const bundles = Array.isArray(runtime) ? [...runtime] : [];
  if (!cache.length || !bundles.length) return bundles;
  const byId = new Map(cache.map((row) => [row.pluginId, row]));
  return bundles.map((bundle) => {
    if (!bundle || typeof bundle !== 'object') return bundle;
    const rec = bundle as Record<string, unknown>;
    const id = String(rec.id || '');
    const cat = byId.get(id);
    if (!cat || comparePluginVersions(cat.version, String(rec.version || '0')) < 0) return bundle;
    return {
      ...rec,
      version: cat.version,
      source: cat.source,
      permissions: cat.permissions ?? rec.permissions,
      modes: cat.modes ?? rec.modes,
      weapons: cat.weapons ?? rec.weapons,
      shopItems: cat.shopItems ?? rec.shopItems,
    };
  });
}

export function collectShopFromRuntime(runtime: unknown): Array<Record<string, unknown> & { id: string }> {
  const extras: Array<Record<string, unknown> & { id: string }> = [];
  const seen = new Set<string>();
  for (const bundle of overlayCatalogOnRuntime(runtime)) {
    if (!bundle || typeof bundle !== 'object') continue;
    const rec = bundle as Record<string, unknown>;
    for (const item of asIdRows(rec.shopItems)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      extras.push(item);
    }
    for (const weapon of asIdRows(rec.weapons)) {
      if (seen.has(weapon.id)) continue;
      seen.add(weapon.id);
      const combat =
        weapon.combat && typeof weapon.combat === 'object'
          ? (weapon.combat as Record<string, unknown>)
          : {};
      extras.push({
        id: weapon.id,
        label: String(weapon.label || weapon.id),
        kind: weapon.kind === 'melee' ? 'melee' : 'hitscan',
        damage: Number(combat.damage) || 20,
        range: Number(combat.range) || 8,
        cooldownMs: Number(combat.cooldownMs) || 500,
        coneRadians: Number(combat.coneRadians) || 0.18,
        shopPrice: 100,
        modelUrl: typeof weapon.modelUrl === 'string' ? weapon.modelUrl : undefined,
        catalogId: weapon.id,
        enabled: true,
        modes: Array.isArray(weapon.modes) ? weapon.modes : ['horde', 'competitive'],
        sortOrder: typeof weapon.sortOrder === 'number' ? weapon.sortOrder : 80,
      });
    }
  }
  return extras;
}

export function mergeShopPool<T extends { id: string }>(base: T[], extra: T[]): T[] {
  return mergeById(base, extra);
}
