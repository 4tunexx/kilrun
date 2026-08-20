'use client';

import React from 'react';
import { Puzzle } from 'lucide-react';
import type { MapDocument, MapShopItem } from '@/components/game/editor/map-document';
import { setShopItemExtrasProvider } from '@/components/game/editor/map-document';
import {
  registerMapEditorPlugin,
  removeMapEditorPlugins,
} from '@/components/game/editor/engine/registry';
import type { MapEditorBrains } from '@/components/game/editor/engine/types';
import type { CatalogWeaponDef } from '@/lib/weapon-catalog';
import { registerCatalogWeapon } from '@/lib/weapon-catalog';
import { registerPluginMode } from '@/lib/game-modes';
import { desktopPluginAssetDataUrl } from '@/lib/engine/desktop-bridge';
import { KILRUN_ENGINE_VERSION } from '@/lib/engine/version';
import {
  adoptPluginIframe,
  parkPluginIframe,
  postToAllPlugins,
  postToPlugin,
  setPlaytestDamageSink,
  setPluginHostHandlers,
} from '@/lib/engine/plugin-sandbox';

export type PluginPanelMount = (
  el: HTMLElement,
  ctx: PluginEditorCtx
) => void | (() => void);

export type PluginEditorCtx = {
  getDoc: () => MapDocument;
  mutateDoc: (fn: (doc: MapDocument) => MapDocument) => void;
  toast: (opts: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => void;
  startPlay: () => void;
  selectedId: () => string | null;
};

export type PlaytestEvent = 'beforeStart' | 'ready' | 'exit' | 'tick';

export type PlaytestPayload = {
  live?: boolean;
  mode?: string;
  mapId?: string;
  dt?: number;
  hp?: number;
  x?: number;
  y?: number;
  z?: number;
};

export type EntityScriptHit = {
  entityId: string;
  script: string;
  dt: number;
  x: number;
  y: number;
  z: number;
  damage: (amount: number) => void;
};

export type EntityScriptHandlers = {
  onTouch?: (hit: EntityScriptHit) => void;
  onTick?: (hit: EntityScriptHit) => void;
};

type PanelSpec = {
  pluginId: string;
  id: string;
  label: string;
  order: number;
};

type Listener = (payload: PlaytestPayload) => void;

type PluginCapture = {
  weapons: CatalogWeaponDef[];
  shopItems: MapShopItem[];
};

const panels: PanelSpec[] = [];
const shopExtras: MapShopItem[] = [];
const captures = new Map<string, PluginCapture>();
const playtestListeners: Record<PlaytestEvent, Listener[]> = {
  beforeStart: [],
  ready: [],
  exit: [],
  tick: [],
};

let brainsRead: (() => MapEditorBrains) | null = null;

export function setActivePluginEditorBrains(read: (() => MapEditorBrains) | null) {
  brainsRead = read;
}

function isMapDocument(value: unknown): value is MapDocument {
  if (!value || typeof value !== 'object') return false;
  const row = value as MapDocument;
  return row.version === 1 && Array.isArray(row.entities) && Array.isArray(row.layers);
}

function captureFor(pluginId: string): PluginCapture {
  let rec = captures.get(pluginId);
  if (!rec) {
    rec = { weapons: [], shopItems: [] };
    captures.set(pluginId, rec);
  }
  return rec;
}

export function applyPluginWeapon(pluginId: string, def: unknown) {
  if (!def || typeof def !== 'object' || typeof (def as CatalogWeaponDef).id !== 'string') return;
  const next = def as CatalogWeaponDef;
  registerCatalogWeapon(next);
  const rec = captureFor(pluginId);
  const index = rec.weapons.findIndex((row) => row.id === next.id);
  if (index >= 0) rec.weapons[index] = next;
  else rec.weapons.push(next);
}

export function applyPluginShopItem(pluginId: string, item: unknown) {
  if (!item || typeof item !== 'object' || typeof (item as MapShopItem).id !== 'string') return;
  const next = item as MapShopItem;
  const extrasIndex = shopExtras.findIndex((row) => row.id === next.id);
  if (extrasIndex >= 0) shopExtras[extrasIndex] = next;
  else shopExtras.push(next);
  const rec = captureFor(pluginId);
  const index = rec.shopItems.findIndex((row) => row.id === next.id);
  if (index >= 0) rec.shopItems[index] = next;
  else rec.shopItems.push(next);
}

export function peekPluginRegistrations(): Map<string, PluginCapture> {
  return captures;
}

function applyHostHandlers() {
  setPluginHostHandlers({
    onRegisterPanel: (pluginId, spec) => {
      if (panels.some((row) => row.pluginId === pluginId && row.id === spec.id)) return;
      panels.push({ pluginId, id: spec.id, label: spec.label, order: spec.order });
    },
    onRegisterWeapon: (pluginId, def) => {
      applyPluginWeapon(pluginId, def);
    },
    onRegisterShopItem: (pluginId, item) => {
      applyPluginShopItem(pluginId, item);
    },
    onRegisterMode: (_pluginId, spec) => {
      registerPluginMode(spec);
    },
    onMutateDoc: (_pluginId, doc) => {
      const brains = brainsRead?.();
      if (!brains || !isMapDocument(doc)) return;
      if ((doc.entities?.length ?? 0) > 8000) return;
      brains.mutateLiveDoc((current) => ({
        ...doc,
        pluginRuntime: current.pluginRuntime,
      }));
    },
    onToast: (opts) => {
      brainsRead?.().toast(opts);
    },
    onStartPlay: () => {
      void brainsRead?.().startPlay();
    },
    onAssetRequest: (pluginId, rel) => desktopPluginAssetDataUrl(pluginId, rel),
  });
  setShopItemExtrasProvider(() => shopExtras);
}

function DiskPluginPanel({
  pluginId,
  panelId,
  brains,
}: {
  pluginId: string;
  panelId: string;
  brains: MapEditorBrains;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const brainsRef = React.useRef(brains);
  brainsRef.current = brains;

  React.useEffect(() => {
    setActivePluginEditorBrains(() => brainsRef.current);
    const el = hostRef.current;
    if (!el) return;
    adoptPluginIframe(pluginId, el);
    postToPlugin(pluginId, { type: 'doc', doc: brainsRef.current.doc });
    postToPlugin(pluginId, { type: 'selected', id: brainsRef.current.selectedId });
    postToPlugin(pluginId, { type: 'mount', panelId });
    return () => {
      parkPluginIframe(pluginId);
    };
  }, [pluginId, panelId]);

  React.useEffect(() => {
    postToAllPlugins({ type: 'doc', doc: brains.doc });
    postToAllPlugins({ type: 'selected', id: brains.selectedId });
  }, [brains.doc, brains.selectedId]);

  return React.createElement('div', {
    ref: hostRef,
    className: 'flex-1 min-h-0 overflow-hidden',
  });
}

export type KilrunPluginApi = {
  version: string;
  definePlugin: (fn: (api: KilrunPluginApi) => void) => void;
  editor: {
    registerPanel: (spec: {
      id: string;
      label: string;
      order?: number;
      mount: PluginPanelMount;
    }) => void;
  };
  weapons: { register: (def: CatalogWeaponDef) => void };
  shop: { registerItem: (item: MapShopItem) => void };
  playtest: {
    on: (event: PlaytestEvent, fn: Listener) => () => void;
  };
  entities: { registerScript: (id: string, handlers: EntityScriptHandlers) => void };
  modes: { register: (spec: unknown) => void };
  assets: { loadDataUrl: (rel: string) => Promise<string | null> };
};

export function resetPluginRuntime() {
  panels.length = 0;
  shopExtras.length = 0;
  captures.clear();
  (Object.keys(playtestListeners) as PlaytestEvent[]).forEach((key) => {
    playtestListeners[key] = [];
  });
  removeMapEditorPlugins((plugin) => plugin.id.startsWith('disk:'));
  setPlaytestDamageSink(null);
  setPluginHostHandlers(null);
  setShopItemExtrasProvider(() => []);
}

export function preparePluginHost() {
  applyHostHandlers();
}

export function bindDiskEditorPanels() {
  for (const spec of panels) {
    const pluginId = spec.pluginId;
    const panelId = spec.id;
    registerMapEditorPlugin({
      id: `disk:${spec.pluginId}:${spec.id}`,
      slot: 'sidebar',
      label: spec.label,
      icon: Puzzle,
      order: spec.order,
      render: (brains) => React.createElement(DiskPluginPanel, { pluginId, panelId, brains }),
    });
  }
}

export function pluginShopExtras(): MapShopItem[] {
  return shopExtras;
}

export function emitPlaytest(event: PlaytestEvent, payload: PlaytestPayload = {}) {
  postToAllPlugins({ type: 'playtest', event, payload });
  for (const fn of playtestListeners[event]) {
    try {
      fn(payload);
    } catch (err) {
      console.warn('[kilrun-plugin playtest]', err);
    }
  }
}

export function runEntityPluginScripts(input: {
  entities: Array<{
    id: string;
    pluginScript?: string;
    visible?: boolean;
    position: [number, number, number];
    scale: [number, number, number];
    collisionSize?: [number, number, number];
  }>;
  player: { x: number; y: number; z: number };
  dt: number;
  damage: (amount: number) => void;
}) {
  setPlaytestDamageSink(input.damage);
  const packed = [];
  for (const ent of input.entities) {
    if (!ent.pluginScript || ent.visible === false) continue;
    const [tx, ty, tz] = ent.position;
    const simX = tz;
    const simY = tx;
    const simZ = ty;
    const hx = Math.max(0.4, Math.abs((ent.collisionSize?.[2] ?? ent.scale[2] * 2) / 2));
    const hy = Math.max(0.4, Math.abs((ent.collisionSize?.[0] ?? ent.scale[0] * 2) / 2));
    const hz = Math.max(0.4, Math.abs((ent.collisionSize?.[1] ?? ent.scale[1] * 2) / 2));
    const hit =
      Math.abs(input.player.x - simX) <= hx + 0.35 &&
      Math.abs(input.player.y - simY) <= hy + 0.35 &&
      input.player.z < simZ + hz &&
      input.player.z + 1.6 > simZ - hz;
    packed.push({
      id: ent.id,
      pluginScript: ent.pluginScript,
      hit,
    });
  }
  if (!packed.length) return;
  postToAllPlugins({
    type: 'entity',
    dt: input.dt,
    player: input.player,
    entities: packed,
  });
}

export function notifyPluginsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('kilrun-plugins-changed'));
}

export function attachKilrunGlobal() {
  (window as Window & { Kilrun?: { version: string; sandboxed: true } }).Kilrun = {
    version: KILRUN_ENGINE_VERSION,
    sandboxed: true,
  };
}

export function setActivePluginId(_id: string) {
  /* sandbox isolate — host no longer runs plugin activate() in-page */
}
