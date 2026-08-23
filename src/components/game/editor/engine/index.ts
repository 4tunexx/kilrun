export type { MapEditorBrains, MapEditorPlugin, MapEditorStudioOptions } from './types';
export {
  registerMapEditorPlugin,
  getSidebarPlugin,
  getSidebarPlugins,
  getInspectorPlugins,
  getMapEditorPlugins,
  isStudioPluginTab,
  removeMapEditorPlugins,
} from './registry';
