import { isKilrunEngineDesktop } from './runtime';
import {
  installDesktopModuleSource,
  listDesktopModules,
  readDesktopModuleFile,
} from './desktop-bridge';
import { engineMeetsRequirement, parsePluginManifest } from './plugin-manifest';
import { MODULE_KIND_META, MODULE_KINDS, parseModuleKind, type ModuleKind } from './module-kind';
import {
  applyPluginShopItem,
  applyPluginWeapon,
  attachKilrunGlobal,
  bindDiskEditorPanels,
  notifyPluginsChanged,
  peekPluginRegistrations,
  preparePluginHost,
  rememberModuleKind,
  resetPluginRuntime,
} from './plugin-sdk';
import { listSandboxPluginIds, createPluginSandbox, destroyAllPluginSandboxes } from './plugin-sandbox';
import { clearPluginModes, registerPluginMode } from '@/lib/game-modes';
import {
  fetchOfficialCatalog,
  type OfficialCatalogRow,
} from './platform-client';
import { setLoadedPluginBundles, type MapPluginBundle } from './plugin-runtime-store';
import { comparePluginVersions } from '@shared/plugin-source';

export type PluginLoadResult = {
  loaded: string[];
  errors: { id: string; error: string }[];
};

export async function syncOfficialModules(): Promise<{ installed: string[]; skipped: number }> {
  const result = { installed: [] as string[], skipped: 0 };
  if (!isKilrunEngineDesktop()) return result;
  let catalog: OfficialCatalogRow[] = [];
  try {
    catalog = await fetchOfficialCatalog();
  } catch {
    return result;
  }
  if (!catalog.length) return result;

  const local: InstalledLocal[] = [];
  for (const kind of MODULE_KINDS) {
    const rows = await listDesktopModules(kind);
    for (const row of rows) local.push({ id: row.id, version: row.version, kind });
  }

  for (const row of catalog) {
    const kind = parseModuleKind(row.kind);
    const have = local.find((item) => item.id === row.moduleId && item.kind === kind);
    if (have && comparePluginVersions(row.version, have.version) <= 0) {
      result.skipped += 1;
      continue;
    }
    try {
      const manifest = {
        id: row.moduleId,
        name: row.name || row.moduleId,
        version: row.version,
        entry: row.entry || 'index.js',
        kind,
        permissions: row.permissions,
        modes: row.modes,
      };
      await installDesktopModuleSource({
        kind,
        id: row.moduleId,
        manifestJson: JSON.stringify(manifest),
        source: row.source,
      });
      result.installed.push(row.moduleId);
    } catch (err) {
      console.warn('[kilrun-engine] official module sync failed', row.moduleId, err);
    }
  }
  return result;
}

type InstalledLocal = { id: string; version: string; kind: ModuleKind };

export async function loadDesktopPlugins(): Promise<PluginLoadResult> {
  return loadDesktopModules();
}

export async function loadDesktopModules(): Promise<PluginLoadResult> {
  const result: PluginLoadResult = { loaded: [], errors: [] };
  if (!isKilrunEngineDesktop()) return result;

  resetPluginRuntime();
  destroyAllPluginSandboxes();
  clearPluginModes();
  attachKilrunGlobal();
  preparePluginHost();

  const installed = [];
  for (const kind of MODULE_KINDS) {
    installed.push(...(await listDesktopModules(kind)));
  }
  const bundles: MapPluginBundle[] = [];

  for (const plugin of installed) {
    const kind = parseModuleKind(plugin.kind);
    if (!plugin.enabled) continue;
    if (!engineMeetsRequirement(plugin.engine)) {
      result.errors.push({
        id: plugin.id,
        error: `Needs Engine ${plugin.engine}+`,
      });
      continue;
    }
    try {
      const manifestName = MODULE_KIND_META[kind].manifestFile;
      const rawJson = await readDesktopModuleFile(kind, plugin.id, manifestName);
      const manifest = parsePluginManifest(rawJson ? JSON.parse(rawJson) : plugin, {
        defaultKind: kind,
      });
      const source = await readDesktopModuleFile(kind, plugin.id, manifest.entry);
      if (!source) throw new Error(`Missing ${manifest.entry}`);
      rememberModuleKind(manifest.id, kind);
      for (const spec of manifest.modes ?? []) registerPluginMode(spec);
      await createPluginSandbox(manifest.id, source, manifest.permissions);
      const captured = peekPluginRegistrations().get(manifest.id);
      if (kind === 'plugin') {
        bundles.push({
          id: manifest.id,
          version: manifest.version,
          entry: manifest.entry,
          source,
          modes: manifest.modes,
          permissions: manifest.permissions,
          weapons: captured?.weapons,
          shopItems: captured?.shopItems,
        });
      }
    } catch (err) {
      result.errors.push({
        id: plugin.id,
        error: err instanceof Error ? err.message : 'Failed to load module',
      });
    }
    if (!result.errors.some((row) => row.id === plugin.id)) {
      result.loaded.push(plugin.id);
    }
  }

  setLoadedPluginBundles(bundles);
  bindDiskEditorPanels();
  notifyPluginsChanged();
  return result;
}

/** Website / live client: run plugin JS from a published map's pluginRuntime. */
export async function loadMapEmbeddedPlugins(
  runtime: MapPluginBundle[] | null | undefined
): Promise<PluginLoadResult> {
  const result: PluginLoadResult = { loaded: [], errors: [] };
  if (!runtime?.length || typeof document === 'undefined') return result;
  preparePluginHost();
  const already = new Set(listSandboxPluginIds());
  let created = false;
  for (const bundle of runtime) {
    try {
      for (const spec of bundle.modes ?? []) registerPluginMode(spec);
      for (const weapon of bundle.weapons ?? []) applyPluginWeapon(bundle.id, weapon);
      for (const item of bundle.shopItems ?? []) applyPluginShopItem(bundle.id, item);
      if (already.has(bundle.id)) {
        result.loaded.push(bundle.id);
        continue;
      }
      if (bundle.source) {
        await createPluginSandbox(bundle.id, bundle.source, bundle.permissions);
        already.add(bundle.id);
        created = true;
      }
      result.loaded.push(bundle.id);
    } catch (err) {
      result.errors.push({
        id: bundle.id,
        error: err instanceof Error ? err.message : 'Failed to load map plugin',
      });
    }
  }
  if (created) bindDiskEditorPanels();
  notifyPluginsChanged();
  return result;
}
