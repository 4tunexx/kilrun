/**
 * Loads built-in sidebar plugins. Import this from map-editor.tsx once.
 * Add-ons need no host edit at all:
 *   registerMapEditorPlugin({ id, slot: 'sidebar', label, icon, order, render })
 * `order` places the icon in the left rail; add `studio: {}` for a panel that
 * replaces the map sidebar instead of sitting beside it.
 */
import { setBuiltinMapEditorPlugins } from './registry';
import { assetsPlugin } from '../plugins/assets-plugin';
import { helpPlugin } from '../plugins/help-plugin';
import { layersPlugin } from '../plugins/layers-plugin';
import { outlinerPlugin } from '../plugins/outliner-plugin';
import { prefabsPlugin } from '../plugins/prefabs-plugin';
import { settingsPlugin } from '../plugins/settings-plugin';
import { studioPlugins } from '../plugins/studio-plugins';
import { texturesPlugin } from '../plugins/textures-plugin';
import { worldPlugin } from '../plugins/world-plugin';

setBuiltinMapEditorPlugins([
  assetsPlugin,
  layersPlugin,
  outlinerPlugin,
  worldPlugin,
  prefabsPlugin,
  texturesPlugin,
  settingsPlugin,
  helpPlugin,
  ...studioPlugins,
]);
