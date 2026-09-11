/**
 * Plugin isolate — runs map plugin JS in a worker with a stripped env.
 * Host process keeps GAME_SERVER_ADMIN_SECRET / DB creds; this thread does not.
 */
import { parentPort, workerData } from 'node:worker_threads';
import vm from 'node:vm';

const TOUCH_COOLDOWN_MS = 400;
const MAX_DMG_PER_CALL = 250;
const MAX_DMG_PER_TICK = 800;
const INVOKE_TIMEOUT_MS = 25;
const LOAD_TIMEOUT_MS = 80;

function wrapCjs(source) {
  let body = clip(source).replace(/<\/script/gi, '<\\/script');
  body = body.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, 'function $1');
  body = body.replace(/export\s+default\s+/g, 'module.exports.default = ');
  body = body.replace(/^import\s+[^;]+;?\s*$/gm, '');
  return `
var module = { exports: {} };
var exports = module.exports;
${body}
var __activate = module.exports.default || module.exports.activate;
if (typeof __activate !== 'function' && typeof activate === 'function') __activate = activate;
if (typeof __activate === 'function') __activate(Kilrun);
`;
}

function clip(source) {
  const text = String(source || '');
  return text.length > 80_000 ? text.slice(0, 80_000) : text;
}

function loadOne(source) {
  const scripts = new Set();
  const context = vm.createContext({
    __scripts: Object.create(null),
    __hit: null,
    __dmg: 0,
    Kilrun: {
      version: 'server-isolate',
      definePlugin(fn) {
        fn(context.Kilrun);
      },
      editor: { registerPanel() {} },
      weapons: { register() {} },
      shop: { registerItem() {} },
      playtest: { on() { return () => {}; } },
      modes: { register() {} },
      assets: { loadDataUrl: async () => null },
      entities: {
        registerScript(id, handlers) {
          if (typeof id !== 'string' || !id || !handlers || typeof handlers !== 'object') return;
          context.__scripts[id] = handlers;
          scripts.add(id);
        },
      },
    },
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(wrapCjs(clip(source)), context, {
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
    x: __hit.x, y: __hit.y, z: __hit.z,
    damage: function (n) {
      var v = Number(n);
      if (!isFinite(v) || v <= 0) return;
      if (v > ${MAX_DMG_PER_CALL}) v = ${MAX_DMG_PER_CALL};
      __dmg = __dmg + v;
    }
  };
  if (__hit.doTick && typeof __h.onTick === "function") __h.onTick(payload);
  if (__hit.doTouch && typeof __h.onTouch === "function") __h.onTouch(payload);
}
`;

let vms = [];
let entities = [];
const lastTouch = new Map();
const disabled = new Set();

function asEntities(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const pluginScript = String(row.pluginScript || '');
    if (!pluginScript) continue;
    const x = Number(row.x);
    const y = Number(row.y);
    const z = Number(row.z);
    if (![x, y, z].every(Number.isFinite)) continue;
    out.push({
      id: String(row.id || pluginScript),
      pluginScript,
      x, y, z,
      hx: Math.max(0.2, Number(row.hx) || 0.6),
      hy: Math.max(0.2, Number(row.hy) || 0.6),
      hz: Math.max(0.2, Number(row.hz) || 0.6),
    });
  }
  return out.slice(0, 400);
}

parentPort?.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'load') {
    vms = [];
    entities = asEntities(msg.pluginEntities);
    disabled.clear();
    lastTouch.clear();
    const runtime = Array.isArray(msg.pluginRuntime) ? msg.pluginRuntime.slice(0, 16) : [];
    for (const bundle of runtime) {
      const source = String(bundle?.source || '');
      if (!source) continue;
      try {
        vms.push(loadOne(source));
      } catch (err) {
        parentPort.postMessage({ type: 'warn', message: String(err?.message || err) });
      }
    }
    parentPort.postMessage({ type: 'loaded', scripts: vms.reduce((n, v) => n + v.scripts.size, 0) });
    return;
  }
  if (msg.type === 'tick') {
    const player = msg.player || { x: 0, y: 0, z: 0 };
    const dt = Number(msg.dt) || 0;
    const now = Number(msg.now) || Date.now();
    let dealt = 0;
    for (const ent of entities) {
      if (disabled.has(ent.pluginScript)) continue;
      const owners = vms.filter((row) => row.scripts.has(ent.pluginScript));
      if (!owners.length) continue;
      const hit =
        Math.abs(player.x - ent.x) <= ent.hx + 0.35 &&
        Math.abs(player.y - ent.y) <= ent.hy + 0.35 &&
        player.z < ent.z + ent.hz &&
        player.z + 1.6 > ent.z - ent.hz;
      let doTouch = hit;
      if (hit) {
        const last = lastTouch.get(ent.id) ?? 0;
        if (now - last < TOUCH_COOLDOWN_MS) doTouch = false;
        else lastTouch.set(ent.id, now);
      }
      for (const row of owners) {
        try {
          row.context.__hit = {
            entityId: ent.id,
            script: ent.pluginScript,
            dt,
            x: player.x, y: player.y, z: player.z,
            doTick: true,
            doTouch,
          };
          vm.runInContext(INVOKE_SRC, row.context, { timeout: INVOKE_TIMEOUT_MS });
          const add = Number(row.context.__dmg) || 0;
          if (add > 0 && dealt < MAX_DMG_PER_TICK) {
            dealt += Math.min(MAX_DMG_PER_TICK - dealt, add);
          }
        } catch (err) {
          disabled.add(ent.pluginScript);
          parentPort.postMessage({ type: 'warn', message: String(err?.message || err) });
        }
      }
    }
    parentPort.postMessage({ type: 'damage', amount: dealt, reqId: msg.reqId });
  }
});

void workerData;
