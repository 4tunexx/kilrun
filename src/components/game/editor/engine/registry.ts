import type { MapEditorPlugin } from './types';

const extraPlugins: MapEditorPlugin[] = [];

/** Built-ins are filled by registerBuiltinPlugins() from plugins/*.tsx */
let builtins: MapEditorPlugin[] = [];

export function setBuiltinMapEditorPlugins(plugins: MapEditorPlugin[]) {
  builtins = plugins;
}

/** Add a sidebar/studio plugin without editing map-editor.tsx. */
export function registerMapEditorPlugin(plugin: MapEditorPlugin) {
  extraPlugins.push(plugin);
}

export function getMapEditorPlugins(): MapEditorPlugin[] {
  return [...builtins, ...extraPlugins];
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
