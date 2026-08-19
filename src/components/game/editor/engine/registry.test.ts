import { describe, expect, it, beforeEach } from 'vitest';
import {
  getMapEditorPlugins,
  getSidebarPlugin,
  getSidebarPlugins,
  isStudioPluginTab,
  registerMapEditorPlugin,
  resetMapEditorPluginRegistry,
  setBuiltinMapEditorPlugins,
} from './registry';
import type { MapEditorBrains, MapEditorPlugin } from './types';

const icon = (() => null) as unknown as MapEditorPlugin['icon'];

function plugin(id: string, order: number, extra: Partial<MapEditorPlugin> = {}): MapEditorPlugin {
  return { id, slot: 'sidebar', label: id, icon, order, render: () => null, ...extra };
}

describe('map editor plugin registry', () => {
  beforeEach(() => {
    resetMapEditorPluginRegistry();
  });

  it('sorts the rail by ascending order, not registration order', () => {
    setBuiltinMapEditorPlugins([plugin('c', 30), plugin('a', 10), plugin('b', 20)]);
    expect(getSidebarPlugins().map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps registration order for plugins sharing an order value', () => {
    setBuiltinMapEditorPlugins([plugin('first', 10), plugin('second', 10)]);
    expect(getSidebarPlugins().map((p) => p.id)).toEqual(['first', 'second']);
  });

  it('looks a panel up by tab id', () => {
    setBuiltinMapEditorPlugins([plugin('world', 50)]);
    expect(getSidebarPlugin('world')?.id).toBe('world');
    expect(getSidebarPlugin('nope')).toBeUndefined();
  });

  it('treats only plugins declaring studio options as studio tabs', () => {
    setBuiltinMapEditorPlugins([
      plugin('assets', 10),
      plugin('weapon', 100, { studio: {} }),
      plugin('player', 80, { studio: { ensurePlayerEntity: true, clearSelection: true } }),
    ]);
    expect(isStudioPluginTab('weapon')).toBe(true);
    expect(isStudioPluginTab('player')).toBe(true);
    expect(isStudioPluginTab('assets')).toBe(false);
    // Unknown tabs must not be mistaken for studios or the sidebar would vanish.
    expect(isStudioPluginTab('unknown')).toBe(false);
  });

  it('exposes add-ons registered without touching map-editor.tsx', () => {
    setBuiltinMapEditorPlugins([plugin('assets', 10)]);
    registerMapEditorPlugin(plugin('addon', 15));
    expect(getMapEditorPlugins().map((p) => p.id)).toContain('addon');
    expect(getSidebarPlugins().map((p) => p.id)).toEqual(['assets', 'addon']);
  });

  it('passes brains straight through to onActivate', () => {
    let seen: MapEditorBrains | null = null;
    const brains = { tab: 'weapon' } as MapEditorBrains;
    setBuiltinMapEditorPlugins([plugin('weapon', 100, { onActivate: (b) => { seen = b; } })]);
    getSidebarPlugin('weapon')?.onActivate?.(brains);
    expect(seen).toBe(brains);
  });

  it('replaces an add-on re-registered with the same id (HMR / double import)', () => {
    setBuiltinMapEditorPlugins([plugin('assets', 10)]);
    registerMapEditorPlugin(plugin('addon', 15, { label: 'first' }));
    registerMapEditorPlugin(plugin('addon', 15, { label: 'second' }));
    const addons = getSidebarPlugins().filter((p) => p.id === 'addon');
    expect(addons).toHaveLength(1);
    expect(addons[0].label).toBe('second');
  });

  it('lets an add-on replace a built-in with the same id instead of duplicating it', () => {
    setBuiltinMapEditorPlugins([plugin('world', 50, { label: 'built-in' })]);
    registerMapEditorPlugin(plugin('world', 50, { label: 'override' }));
    const worlds = getSidebarPlugins().filter((p) => p.id === 'world');
    expect(worlds).toHaveLength(1);
    expect(worlds[0].label).toBe('override');
  });
});
