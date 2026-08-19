import type { MapEditorPlugin } from './types';

const extraPlugins: MapEditorPlugin[] = [];

/** Built-ins are filled by registerBuiltinPlugins() from plugins/*.tsx */
let builtins: MapEditorPlugin[] = [];

export function setBuiltinMapEditorPlugins(plugins: MapEditorPlugin[]) {
  builtins = plugins;
}

/** Test helper — HMR / vitest re-imports must not stack duplicate add-ons. */
export function resetMapEditorPluginRegistry() {
  builtins = [];
  extraPlugins.length = 0;
}

/** Add a sidebar/studio plugin without editing map-editor.tsx. Same id replaces. */
export function registerMapEditorPlugin(plugin: MapEditorPlugin) {
  const i = extraPlugins.findIndex((p) => p.id === plugin.id);
  if (i >= 0) extraPlugins[i] = plugin;
  else extraPlugins.push(plugin);
}

/**
 * Built-ins first, then add-ons. An add-on with the same id replaces the
 * built-in in-place so HMR / double-register cannot produce duplicate rail
 * icons (getSidebarPlugin would otherwise return the first match).
 */
export function getMapEditorPlugins(): MapEditorPlugin[] {
  const byId = new Map<string, MapEditorPlugin>();
  for (const p of builtins) byId.set(p.id, p);
  for (const p of extraPlugins) byId.set(p.id, p);
  return [...byId.values()];
}

export function getSidebarPlugin(tabId: string): MapEditorPlugin | undefined {
  return getMapEditorPlugins().find((p) => p.slot === 'sidebar' && p.id === tabId);
}

/** Rail order — ascending `order`, registration order as the tiebreak. */
export function getSidebarPlugins(): MapEditorPlugin[] {
  return getMapEditorPlugins()
    .filter((p) => p.slot === 'sidebar')
    .sort((a, b) => a.order - b.order);
}

/** True for panels that replace the map sidebar (Player Model, Weapon, etc). */
export function isStudioPluginTab(tabId: string): boolean {
  return Boolean(getSidebarPlugin(tabId)?.studio);
}
