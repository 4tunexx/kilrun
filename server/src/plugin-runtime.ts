import vm from 'node:vm';
import { wrapPluginSourceAsCjs, clipPluginSource } from '../../shared/plugin-source.js';
import {
  collectShopFromRuntime,
  overlayCatalogOnRuntime,
} from './plugin-catalog.js';

export type PluginEntitySim = {
  id: string;
  pluginScript: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

const TOUCH_COOLDOWN_MS = 400;
const MAX_DMG_PER_CALL = 250;
const MAX_DMG_PER_TICK = 800;
const INVOKE_TIMEOUT_MS = 25;
const LOAD_TIMEOUT_MS = 80;

type LoadedVm = {
  context: vm.Context;
  scripts: Set<string>;
};

function asEntities(raw: unknown): PluginEntitySim[] {
  if (!Array.isArray(raw)) return [];
  const out: PluginEntitySim[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const pluginScript = String(rec.pluginScript || '');
    if (!pluginScript) continue;
    const x = Number(rec.x);
    const y = Number(rec.y);
    const z = Number(rec.z);
    if (![x, y, z].every(Number.isFinite)) continue;
    out.push({
      id: String(rec.id || pluginScript),
      pluginScript,
      x,
      y,
      z,
      hx: Math.max(0.2, Number(rec.hx) || 0.6),
      hy: Math.max(0.2, Number(rec.hy) || 0.6),
      hz: Math.max(0.2, Number(rec.hz) || 0.6),
    });
  }
  return out.slice(0, 400);
}

function loadOne(source: string): LoadedVm {
  const scripts = new Set<string>();
  const context = vm.createContext({
    __scripts: Object.create(null) as Record<string, { onTouch?: unknown; onTick?: unknown }>,
    __hit: null as Record<string, unknown> | null,
    __dmg: 0,
    Kilrun: {
      version: 'server',
      definePlugin(fn: (api: unknown) => void) {
        fn((context as { Kilrun: unknown }).Kilrun);
      },
      editor: { registerPanel() {} },
      weapons: { register() {} },
      shop: { registerItem() {} },
      playtest: {
        on() {
          return () => {};
        },
      },
      modes: { register() {} },
      assets: { loadDataUrl: async () => null },
      entities: {
        registerScript(id: string, handlers: { onTouch?: unknown; onTick?: unknown }) {
          if (typeof id !== 'string' || !id || !handlers || typeof handlers !== 'object') return;
          (context as { __scripts: Record<string, unknown> }).__scripts[id] = handlers;
          scripts.add(id);
        },
      },
    },
    console: { log() {}, warn() {}, error() {} },
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
  });
  vm.runInContext(wrapPluginSourceAsCjs(clipPluginSource(source)), context, {
    timeout: LOAD_TIMEOUT_MS,
    displayErrors: false,
  });
  return { context, scripts };
}

const INVOKE_SRC = `
__dmg = 0;
var __h = __scripts[__hit.script];
if (__h) {
  var payload = {
    entityId: __hit.entityId,
    script: __hit.script,
    dt: __hit.dt,
    x: __hit.x,
    y: __hit.y,
    z: __hit.z,
    damage: function (n) {
      var v = Number(n);
      if (!isFinite(v) || v <= 0) return;
      if (v > ${MAX_DMG_PER_CALL}) v = ${MAX_DMG_PER_CALL};
      __dmg = __dmg + v;
    }
  };
  if (__hit.doTick && typeof __h.onTick === 'function') __h.onTick(payload);
  if (__hit.doTouch && typeof __h.onTouch === 'function') __h.onTouch(payload);
}
`;

export class RoomPluginRuntime {
  private vms: LoadedVm[] = [];
  private disabled = new Set<string>();
  private entities: PluginEntitySim[] = [];
  private lastTouch = new Map<string, number>();
  private shopItems: Array<Record<string, unknown> & { id: string }> = [];

  shopPool() {
    return this.shopItems;
  }

  load(payload: Record<string, unknown> | null | undefined) {
    this.vms = [];
    this.disabled.clear();
    this.entities = [];
    this.lastTouch.clear();
    this.shopItems = [];
    if (!payload) return;
    this.entities = asEntities(payload.pluginEntities);
    const runtime = overlayCatalogOnRuntime(payload.pluginRuntime);
    this.shopItems = collectShopFromRuntime(runtime);
    if (!Array.isArray(runtime)) return;
    for (const bundle of runtime.slice(0, 16)) {
      if (!bundle || typeof bundle !== 'object') continue;
      const source = String((bundle as { source?: unknown }).source || '');
      if (!source) continue;
      try {
        this.vms.push(loadOne(source));
      } catch (err) {
        console.warn('[plugin-vm] load failed', err);
      }
    }
  }

  tickPlayer(
    player: { x: number; y: number; z: number },
    dt: number,
    now: number,
    damage: (amount: number) => void
  ) {
    if (!this.entities.length || !this.vms.length) return;
    let dealt = 0;

    for (const ent of this.entities) {
      if (this.disabled.has(ent.pluginScript)) continue;
      const owners = this.vms.filter((row) => row.scripts.has(ent.pluginScript));
      if (!owners.length) continue;
      const hit =
        Math.abs(player.x - ent.x) <= ent.hx + 0.35 &&
        Math.abs(player.y - ent.y) <= ent.hy + 0.35 &&
        player.z < ent.z + ent.hz &&
        player.z + 1.6 > ent.z - ent.hz;
      let doTouch = hit;
      if (hit) {
        const last = this.lastTouch.get(ent.id) ?? 0;
        if (now - last < TOUCH_COOLDOWN_MS) doTouch = false;
        else this.lastTouch.set(ent.id, now);
      }
      for (const row of owners) {
        try {
          (row.context as { __hit: unknown }).__hit = {
            entityId: ent.id,
            script: ent.pluginScript,
            dt,
            x: player.x,
            y: player.y,
            z: player.z,
            doTick: true,
            doTouch,
          };
          vm.runInContext(INVOKE_SRC, row.context, { timeout: INVOKE_TIMEOUT_MS });
          const add = Number((row.context as { __dmg: unknown }).__dmg) || 0;
          if (add > 0 && dealt < MAX_DMG_PER_TICK) {
            const use = Math.min(MAX_DMG_PER_TICK - dealt, add);
            dealt += use;
            damage(use);
          }
        } catch (err) {
          this.disabled.add(ent.pluginScript);
          console.warn('[plugin-vm] disabled', ent.pluginScript, err);
        }
      }
    }
  }
}
