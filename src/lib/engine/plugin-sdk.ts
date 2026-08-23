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
import { desktopModuleAssetDataUrl } from '@/lib/engine/desktop-bridge';
import { KILRUN_ENGINE_VERSION } from '@/lib/engine/version';
import type { ModuleKind } from '@/lib/engine/module-kind';
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

export type ExtensionToolSpec = {
  moduleId: string;
  id: string;
  label: string;
  order: number;
};

export type AddonHomeCard = {
  moduleId: string;
  id: string;
  title: string;
  body: string;
};

export type AddonTexture = {
  moduleId: string;
  id: string;
  name: string;
  dataUrl: string;
};

type Listener = (payload: PlaytestPayload) => void;

type PluginCapture = {
  weapons: CatalogWeaponDef[];
  shopItems: MapShopItem[];
};

const panels: PanelSpec[] = [];
const extensionTools: ExtensionToolSpec[] = [];
const addonHomeCards: AddonHomeCard[] = [];
const addonTextures: AddonTexture[] = [];
const shopExtras: MapShopItem[] = [];
const captures = new Map<string, PluginCapture>();
const moduleKinds = new Map<string, ModuleKind>();
const THEME_VAR_RE = /^--kilrun-[a-z0-9-]+$/i;

export function rememberModuleKind(id: string, kind: ModuleKind) {
  moduleKinds.set(id, kind);
}
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
    onRegisterTool: (pluginId, spec) => {
      if (extensionTools.some((row) => row.moduleId === pluginId && row.id === spec.id)) return;
      extensionTools.push({ moduleId: pluginId, id: spec.id, label: spec.label, order: spec.order });
    },
    onRegisterTheme: (_pluginId, spec) => {
      applyAddonTheme(spec);
    },
    onRegisterTextures: (pluginId, rows) => {
      applyAddonTextures(pluginId, rows);
    },
    onRegisterHomeCard: (pluginId, spec) => {
      applyAddonHomeCard(pluginId, spec);
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
    onAssetRequest: (pluginId, rel) =>
      desktopModuleAssetDataUrl(moduleKinds.get(pluginId) || 'plugin', pluginId, rel),
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
    postToPlugin(pluginId, {
      type: 'selected',
      id: brainsRef.current.selectedId,
      ids: brainsRef.current.selectedIds,
    });
    postToPlugin(pluginId, { type: 'mount', panelId });
    return () => {
      parkPluginIframe(pluginId);
    };
  }, [pluginId, panelId]);

  React.useEffect(() => {
    postToAllPlugins({ type: 'doc', doc: brains.doc });
    postToAllPlugins({ type: 'selected', id: brains.selectedId, ids: brains.selectedIds });
  }, [brains.doc, brains.selectedId, brains.selectedIds]);

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
  tools: {
    register: (spec: {
      id: string;
      label: string;
      order?: number;
      onActivate: (ctx: PluginEditorCtx) => void;
    }) => void;
  };
  theme: { register: (spec: { id?: string; name?: string; vars?: Record<string, string> }) => void };
  content: { registerTextures: (rows: Array<{ id: string; name?: string; dataUrl?: string }>) => void };
  engine: { registerHomeCard: (spec: { id: string; title: string; body?: string }) => void };
  assets: { loadDataUrl: (rel: string) => Promise<string | null> };
};

function applyAddonTheme(spec: unknown) {
  if (!spec || typeof spec !== 'object' || typeof document === 'undefined') return;
  const vars = (spec as { vars?: Record<string, unknown> }).vars;
  if (!vars || typeof vars !== 'object') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    if (!THEME_VAR_RE.test(key)) continue;
    const text = String(value ?? '').trim().slice(0, 80);
    if (!text) continue;
    root.style.setProperty(key, text);
  }
}

function applyAddonTextures(moduleId: string, rows: unknown) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as { id?: unknown; name?: unknown; dataUrl?: unknown };
    const id = String(rec.id || '').trim();
    const dataUrl = String(rec.dataUrl || '');
    if (!id || !dataUrl.startsWith('data:image/')) continue;
    const next = { moduleId, id, name: String(rec.name || id), dataUrl: dataUrl.slice(0, 2_000_000) };
    const index = addonTextures.findIndex((item) => item.moduleId === moduleId && item.id === id);
    if (index >= 0) addonTextures[index] = next;
    else addonTextures.push(next);
  }
}

function applyAddonHomeCard(moduleId: string, spec: unknown) {
  if (!spec || typeof spec !== 'object') return;
  const row = spec as { id?: unknown; title?: unknown; body?: unknown };
  const id = String(row.id || '').trim();
  const title = String(row.title || '').trim();
  if (!id || !title) return;
  const next = { moduleId, id, title, body: String(row.body || '').trim() };
  const index = addonHomeCards.findIndex((item) => item.moduleId === moduleId && item.id === id);
  if (index >= 0) addonHomeCards[index] = next;
  else addonHomeCards.push(next);
}

export function listExtensionTools(): ExtensionToolSpec[] {
  return [...extensionTools].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function activateExtensionTool(moduleId: string, toolId: string) {
  postToPlugin(moduleId, { type: 'toolActivate', toolId });
}

export function listAddonHomeCards(): AddonHomeCard[] {
  return [...addonHomeCards];
}

export function listAddonTextures(): AddonTexture[] {
  return [...addonTextures];
}

export function resetPluginRuntime() {
  panels.length = 0;
  extensionTools.length = 0;
  addonHomeCards.length = 0;
  addonTextures.length = 0;
  shopExtras.length = 0;
  captures.clear();
  moduleKinds.clear();
  if (typeof document !== 'undefined') {
    const style = document.documentElement.style;
    for (let i = style.length - 1; i >= 0; i -= 1) {
      const name = style.item(i);
      if (name.startsWith('--kilrun-')) style.removeProperty(name);
    }
  }
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
