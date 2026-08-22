import { describe, expect, it } from 'vitest';
import {
  hostMessageAllowed,
  pluginHasPermission,
} from './plugin-manifest';
import {
  attachPluginRuntimeToDoc,
  catalogWeaponToShopItem,
  mergeShopItemsById,
  pluginShopItemsFromBundles,
  setLoadedPluginBundles,
  type MapPluginBundle,
} from './plugin-runtime-store';
import { collectPluginModesFromSources } from './plugin-catalog';
import { clearPluginModes } from '@/lib/game-modes';
import type { MapDocument } from '@/components/game/editor/map-document';
import type { CatalogWeaponDef } from '@/lib/weapon-catalog';

function emptyDoc(over: Partial<MapDocument> = {}): MapDocument {
  return {
    version: 1,
    name: 'Test',
    entities: [],
    layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
    gridSize: 1,
    ...over,
  } as MapDocument;
}

const pulse: CatalogWeaponDef = {
  id: 'plugin_pulse_bat',
  label: 'Pulse Bat',
  modelUrl: '/game/weapons/baseball_bat_001.glb',
  kind: 'melee',
  combat: { kind: 'melee', damage: 42, range: 2.4, cooldownMs: 480 },
  modes: ['horde', 'competitive'],
  gripHint: 'Example',
};

describe('plugin permissions', () => {
  it('denies registerWeapon without weapons', () => {
    expect(hostMessageAllowed([], 'registerWeapon')).toBe(false);
    expect(hostMessageAllowed(['editor'], 'registerWeapon')).toBe(false);
    expect(hostMessageAllowed(['weapons'], 'registerWeapon')).toBe(true);
    expect(pluginHasPermission(['editor'], 'weapons')).toBe(false);
  });

  it('treats missing permissions as legacy allow', () => {
    expect(hostMessageAllowed(undefined, 'registerWeapon')).toBe(true);
  });

  it('never grants server access from missing permissions, even though everything else legacy-allows', () => {
    // A manifest that omits `permissions` entirely used to be treated as
    // "allow everything," including `server` — the exact opt-in gate that
    // decides whether a plugin's server-executable source ships to the live
    // catalog at all. Omitting the field must not be a way to skip that gate.
    expect(pluginHasPermission(undefined, 'server')).toBe(false);
    expect(pluginHasPermission(null, 'server')).toBe(false);
    expect(pluginHasPermission([], 'server')).toBe(false);
    expect(pluginHasPermission(['server'], 'server')).toBe(true);
  });

  it('strips live source without server permission', () => {
    setLoadedPluginBundles([
      {
        id: 'demo',
        version: '1.0.0',
        entry: 'index.js',
        source: 'export default function activate() {}',
        permissions: ['weapons', 'modes'],
        weapons: [pulse],
      },
    ]);
    const next = attachPluginRuntimeToDoc(emptyDoc());
    expect(next.pluginRuntime?.[0].source).toBe('');
    expect(next.pluginRuntime?.[0].weapons?.[0].id).toBe('plugin_pulse_bat');
    setLoadedPluginBundles([]);
  });

  it('keeps source when server permission is present', () => {
    const bundle: MapPluginBundle = {
      id: 'demo',
      version: '1.0.0',
      entry: 'index.js',
      source: 'export default function activate() {}',
      permissions: ['server', 'weapons'],
    };
    setLoadedPluginBundles([bundle]);
    const next = attachPluginRuntimeToDoc(emptyDoc());
    expect(next.pluginRuntime?.[0].source).toContain('activate');
    setLoadedPluginBundles([]);
  });
});

describe('plugin shop merge', () => {
  it('merges extras by id without wiping authored rows', () => {
    const authored = [
      { id: 'pistol_001', label: 'Pistol', shopPrice: 0 },
      { id: 'plugin_pulse_bat', label: 'Old bat', shopPrice: 50 },
    ];
    const extras = pluginShopItemsFromBundles([
      {
        id: 'kilrun-example',
        version: '1.2.0',
        entry: 'index.js',
        source: '',
        weapons: [pulse],
      },
    ]);
    const merged = mergeShopItemsById(authored, extras);
    expect(merged).toHaveLength(2);
    expect(merged.find((row) => row.id === 'pistol_001')?.label).toBe('Pistol');
    expect(merged.find((row) => row.id === 'plugin_pulse_bat')?.label).toBe('Pulse Bat');
  });

  it('converts a catalog weapon into a shop item', () => {
    const item = catalogWeaponToShopItem(pulse);
    expect(item.id).toBe('plugin_pulse_bat');
    expect(item.kind).toBe('melee');
    expect(item.damage).toBe(42);
    expect(item.modes).toEqual(['horde', 'competitive']);
  });
});

describe('plugin-modes catalog', () => {
  it('lists catalog modes without a MAIN map and marks hasMain', () => {
    clearPluginModes();
    const modes = collectPluginModesFromSources({
      catalogManifests: [
        JSON.stringify({
          modes: [{ id: 'gauntlet', title: 'Gauntlet', base: 'deathrun' }],
        }),
      ],
      maps: [],
    });
    expect(modes.some((row) => row.id === 'gauntlet' && row.hasMain === false)).toBe(true);
    const withMain = collectPluginModesFromSources({
      catalogManifests: [
        JSON.stringify({
          modes: [{ id: 'gauntlet', title: 'Gauntlet', base: 'deathrun' }],
        }),
      ],
      maps: [{ mode: 'gauntlet', isActive: true, documentJson: '{}' }],
    });
    expect(withMain.find((row) => row.id === 'gauntlet')?.hasMain).toBe(true);
    clearPluginModes();
  });
});
