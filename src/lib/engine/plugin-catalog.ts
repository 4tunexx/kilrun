import {
  getKilrunModeInfo,
  isCoreKilrunMode,
  isPluginModeId,
  parsePluginModeSpec,
  registerPluginMode,
  type PluginModeSpec,
} from '@/lib/game-modes';
import { isPluginPermission, pluginHasPermission, type PluginPermission } from '@/lib/engine/plugin-manifest';
import type { MapPluginBundle } from '@/lib/engine/plugin-runtime-store';
import { clipPluginSource, comparePluginVersions } from '@shared/plugin-source';

export type PluginModePublic = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  players: string;
  editorBlurb: string;
  accentClass: string;
  badgeClass: string;
  base: string;
  hasMain: boolean;
};

export type CatalogManifestPayload = {
  permissions?: PluginPermission[];
  modes?: PluginModeSpec[];
  weapons?: unknown[];
  shopItems?: unknown[];
  entry?: string;
  name?: string;
  version?: string;
};

export function parseCatalogManifestJson(raw: string): CatalogManifestPayload {
  try {
    const row = JSON.parse(raw) as Record<string, unknown>;
    const permissions = Array.isArray(row.permissions)
      ? row.permissions.filter(isPluginPermission)
      : undefined;
    const modes = Array.isArray(row.modes)
      ? row.modes.map(parsePluginModeSpec).filter((spec): spec is PluginModeSpec => Boolean(spec))
      : undefined;
    return {
      permissions,
      modes,
      weapons: Array.isArray(row.weapons) ? row.weapons : undefined,
      shopItems: Array.isArray(row.shopItems) ? row.shopItems : undefined,
      entry: typeof row.entry === 'string' ? row.entry : undefined,
      name: typeof row.name === 'string' ? row.name : undefined,
      version: typeof row.version === 'string' ? row.version : undefined,
    };
  } catch {
    return {};
  }
}

export function collectPluginModesFromSources(input: {
  catalogManifests: string[];
  maps: Array<{ mode: string; documentJson?: string; isActive?: boolean }>;
}): PluginModePublic[] {
  const byId = new Map<string, ReturnType<typeof getKilrunModeInfo>>();
  const mains = new Set<string>();

  for (const json of input.catalogManifests) {
    const parsed = parseCatalogManifestJson(json);
    for (const spec of parsed.modes ?? []) {
      const info = registerPluginMode(spec);
      if (info) byId.set(info.id, info);
    }
  }

  for (const row of input.maps) {
    if (row.isActive && isPluginModeId(row.mode) && !isCoreKilrunMode(row.mode)) {
      mains.add(row.mode);
    }
    if (row.documentJson) {
      try {
        const document = JSON.parse(row.documentJson) as {
          pluginRuntime?: Array<{ modes?: PluginModeSpec[] }>;
        };
        for (const bundle of document.pluginRuntime ?? []) {
          for (const spec of bundle.modes ?? []) {
            const parsed = parsePluginModeSpec(spec);
            if (!parsed) continue;
            registerPluginMode(parsed);
            byId.set(parsed.id, getKilrunModeInfo(parsed.id));
          }
        }
      } catch {
        /* ignore corrupt docs */
      }
    }
    if (isPluginModeId(row.mode) && !isCoreKilrunMode(row.mode)) {
      byId.set(row.mode, getKilrunModeInfo(row.mode));
    }
  }

  return [...byId.values()].map((info) => ({
    id: info.id,
    title: info.title,
    shortTitle: info.shortTitle,
    description: info.description,
    players: info.players,
    editorBlurb: info.editorBlurb,
    accentClass: info.accentClass,
    badgeClass: info.badgeClass,
    base: info.base,
    hasMain: mains.has(info.id),
  }));
}

export function catalogSourceForPublish(
  source: string,
  permissions: PluginPermission[] | undefined
): string {
  if (!pluginHasPermission(permissions, 'server')) return '';
  return clipPluginSource(source);
}

export type CatalogOverlayRow = {
  pluginId: string;
  version: string;
  source: string;
  manifestJson: string;
};

export function overlayCatalogOnRuntime(
  runtime: MapPluginBundle[] | null | undefined,
  catalog: CatalogOverlayRow[]
): MapPluginBundle[] {
  const bundles = [...(runtime ?? [])];
  if (!catalog.length) return bundles;
  const byId = new Map(catalog.map((row) => [row.pluginId, row]));
  return bundles.map((bundle) => {
    const row = byId.get(bundle.id);
    if (!row || comparePluginVersions(row.version, bundle.version) < 0) return bundle;
    const parsed = parseCatalogManifestJson(row.manifestJson);
    return {
      ...bundle,
      version: row.version,
      source: row.source,
      permissions: parsed.permissions ?? bundle.permissions,
      modes: parsed.modes ?? bundle.modes,
      weapons: (parsed.weapons as MapPluginBundle['weapons']) ?? bundle.weapons,
      shopItems: (parsed.shopItems as MapPluginBundle['shopItems']) ?? bundle.shopItems,
    };
  });
}
