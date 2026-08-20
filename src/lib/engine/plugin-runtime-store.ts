import type { MapDocument, MapShopItem } from '@/components/game/editor/map-document';
import type { PluginModeSpec } from '@/lib/game-modes';
import type { PluginPermission } from '@/lib/engine/plugin-manifest';
import { pluginHasPermission } from '@/lib/engine/plugin-manifest';
import type { CatalogWeaponDef } from '@/lib/weapon-catalog';
import { clipPluginSource, PLUGIN_SOURCE_MAX_BYTES } from '@shared/plugin-source';

export type MapPluginBundle = {
  id: string;
  version: string;
  entry: string;
  source: string;
  modes?: PluginModeSpec[];
  permissions?: PluginPermission[];
  weapons?: CatalogWeaponDef[];
  shopItems?: MapShopItem[];
};

const MAX_BUNDLES = 16;

let loaded: MapPluginBundle[] = [];

export function setLoadedPluginBundles(next: MapPluginBundle[]) {
  loaded = next.slice(0, MAX_BUNDLES).map((row) => serializeBundle(row));
}

export function peekPluginRuntimeBundles(): MapPluginBundle[] {
  return loaded;
}

export function catalogWeaponToShopItem(cat: CatalogWeaponDef): MapShopItem {
  const c = cat.combat || {};
  const fireMode = c.fireMode === 'auto' || c.fireMode === 'bolt' ? c.fireMode : 'semi';
  const melee = cat.kind === 'melee';
  return {
    id: cat.id,
    label: cat.label,
    description: cat.gripHint || cat.label,
    kind: melee ? 'melee' : 'hitscan',
    damage: Number.isFinite(c.damage) ? Number(c.damage) : 20,
    range: Number.isFinite(c.range) ? Number(c.range) : melee ? 2.4 : 12,
    cooldownMs: Number.isFinite(c.cooldownMs) ? Number(c.cooldownMs) : 500,
    coneRadians: Number.isFinite(c.coneRadians) ? Number(c.coneRadians) : 0.18,
    shopPrice: 100,
    modelUrl: cat.modelUrl,
    catalogId: cat.id,
    fireMode,
    pellets: Math.max(1, Math.floor(c.pellets ?? 1)),
    adsZoomFov: c.adsZoomFov ?? 0,
    adsConeScale: c.adsConeScale ?? 1,
    hipfireConeScale: c.hipfireConeScale ?? 1,
    magSize: c.magSize ?? (melee ? 0 : 12),
    reserveAmmo: c.reserveAmmo ?? (melee ? 0 : 48),
    reloadMs: c.reloadMs ?? (melee ? 0 : 1600),
    unlockMetric: cat.unlockMetric,
    unlockAmount: cat.unlockAmount,
    enabled: true,
    modes: [...cat.modes],
    sortOrder: cat.sortOrder ?? 80,
  };
}

export function pluginShopItemsFromBundles(bundles: MapPluginBundle[] | null | undefined): MapShopItem[] {
  const extras: MapShopItem[] = [];
  const seen = new Set<string>();
  for (const bundle of bundles ?? []) {
    for (const item of bundle.shopItems ?? []) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      extras.push(item);
    }
    for (const weapon of bundle.weapons ?? []) {
      if (!weapon?.id || seen.has(weapon.id)) continue;
      seen.add(weapon.id);
      extras.push(catalogWeaponToShopItem(weapon));
    }
  }
  return extras;
}

export function mergeShopItemsById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  if (!extra.length) return base;
  const out = [...base];
  for (const item of extra) {
    if (!item?.id) continue;
    const index = out.findIndex((row) => row.id === item.id);
    if (index >= 0) out[index] = { ...out[index], ...item };
    else out.push(item);
  }
  return out;
}

function serializeBundle(row: MapPluginBundle): MapPluginBundle {
  const permissions = row.permissions;
  const allowLive = pluginHasPermission(permissions, 'server');
  return {
    id: row.id,
    version: row.version,
    entry: row.entry,
    source: allowLive ? clipPluginSource(row.source, PLUGIN_SOURCE_MAX_BYTES) : '',
    modes: row.modes,
    permissions,
    weapons: row.weapons,
    shopItems: row.shopItems,
  };
}

export function attachPluginRuntimeToDoc(doc: MapDocument): MapDocument {
  const bundles = loaded.length ? loaded : doc.pluginRuntime ?? [];
  if (!bundles.length) return doc;
  const pluginRuntime = bundles.slice(0, MAX_BUNDLES).map((row) => serializeBundle(row));
  const extras = pluginShopItemsFromBundles(pluginRuntime);
  const currentItems = doc.shopSettings?.items;
  const shopSettings =
    Array.isArray(currentItems) && currentItems.length && extras.length
      ? {
          ...doc.shopSettings,
          items: mergeShopItemsById(currentItems, extras),
        }
      : doc.shopSettings;
  return {
    ...doc,
    shopSettings,
    pluginRuntime,
  };
}
