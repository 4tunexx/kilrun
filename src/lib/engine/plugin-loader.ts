import { isKilrunEngineDesktop } from './runtime';
import {
  listDesktopPlugins,
  readDesktopPluginFile,
} from './desktop-bridge';
import { engineMeetsRequirement, parsePluginManifest } from './plugin-manifest';
import {
  applyPluginShopItem,
  applyPluginWeapon,
  attachKilrunGlobal,
  bindDiskEditorPanels,
  notifyPluginsChanged,
  peekPluginRegistrations,
  preparePluginHost,
  resetPluginRuntime,
} from './plugin-sdk';
import { listSandboxPluginIds, createPluginSandbox, destroyAllPluginSandboxes } from './plugin-sandbox';
import { clearPluginModes, registerPluginMode } from '@/lib/game-modes';
import { hasEngineSession, publishCloudPlugin } from './platform-client';
import { peekPluginRuntimeBundles, setLoadedPluginBundles, type MapPluginBundle } from './plugin-runtime-store';

export type PluginLoadResult = {
  loaded: string[];
  errors: { id: string; error: string }[];
};

async function syncLoadedPluginsToCatalog() {
  if (!hasEngineSession()) return;
  for (const bundle of peekPluginRuntimeBundles()) {
    try {
      await publishCloudPlugin(bundle);
    } catch {
      /* catalog API may not be deployed yet */
    }
  }
}

export async function loadDesktopPlugins(): Promise<PluginLoadResult> {
  const result: PluginLoadResult = { loaded: [], errors: [] };
  if (!isKilrunEngineDesktop()) return result;

  resetPluginRuntime();
  destroyAllPluginSandboxes();
  clearPluginModes();
  attachKilrunGlobal();
  preparePluginHost();

  const installed = await listDesktopPlugins();
  const bundles: MapPluginBundle[] = [];

  for (const plugin of installed) {
    if (!plugin.enabled) continue;
    if (!engineMeetsRequirement(plugin.engine)) {
      result.errors.push({
        id: plugin.id,
        error: `Needs Engine ${plugin.engine}+`,
      });
      continue;
    }
    try {
      const rawJson = await readDesktopPluginFile(plugin.id, 'plugin.json');
      const manifest = parsePluginManifest(rawJson ? JSON.parse(rawJson) : plugin);
      const source = await readDesktopPluginFile(plugin.id, manifest.entry);
      if (!source) throw new Error(`Missing ${manifest.entry}`);
      for (const spec of manifest.modes ?? []) registerPluginMode(spec);
      await createPluginSandbox(manifest.id, source, manifest.permissions);
      const captured = peekPluginRegistrations().get(manifest.id);
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
    } catch (err) {
      result.errors.push({
        id: plugin.id,
        error: err instanceof Error ? err.message : 'Failed to load plugin',
      });
    }
    if (!result.errors.some((row) => row.id === plugin.id)) {
      result.loaded.push(plugin.id);
    }
  }

  setLoadedPluginBundles(bundles);
  bindDiskEditorPanels();
  notifyPluginsChanged();
  void syncLoadedPluginsToCatalog();
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
