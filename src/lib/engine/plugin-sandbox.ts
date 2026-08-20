'use client';

import { wrapPluginSourceAsCjs } from '@shared/plugin-source';
import { hostMessageAllowed, type PluginPermission } from './plugin-manifest';
import { KILRUN_ENGINE_VERSION } from './version';

const NS_FROM = 'kilrun-plugin';
const NS_TO = 'kilrun-plugin-host';

type SandboxRecord = {
  pluginId: string;
  iframe: HTMLIFrameElement;
  source: string;
  permissions?: PluginPermission[];
};

const sandboxes = new Map<string, SandboxRecord>();
let park: HTMLDivElement | null = null;
let hostListening = false;
let hostHandler: ((ev: MessageEvent) => void) | null = null;
let playtestDamage: ((amount: number) => void) | null = null;

export type PluginHostHandlers = {
  onRegisterPanel: (pluginId: string, spec: { id: string; label: string; order: number }) => void;
  onRegisterWeapon: (pluginId: string, def: unknown) => void;
  onRegisterShopItem: (pluginId: string, item: unknown) => void;
  onRegisterMode: (pluginId: string, spec: unknown) => void;
  onMutateDoc: (pluginId: string, doc: unknown) => void;
  onToast: (opts: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => void;
  onStartPlay: () => void;
  onAssetRequest: (pluginId: string, rel: string, reqId: string) => Promise<string | null>;
};

let handlers: PluginHostHandlers | null = null;

export function setPluginHostHandlers(next: PluginHostHandlers | null) {
  handlers = next;
}

export function setPlaytestDamageSink(fn: ((amount: number) => void) | null) {
  playtestDamage = fn;
}

function getPark() {
  if (typeof document === 'undefined') return null;
  if (!park) {
    park = document.createElement('div');
    park.setAttribute('data-kilrun-plugin-park', '1');
    park.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(park);
  }
  return park;
}

function clampDamage(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.min(250, Math.max(0, n));
}

function buildSrcDoc(pluginId: string, source: string, permissions?: PluginPermission[]): string {
  const wrapped = wrapPluginSourceAsCjs(source);
  const payload = JSON.stringify({
    pluginId,
    wrapped,
    version: KILRUN_ENGINE_VERSION,
    permissions: permissions ?? null,
  });
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  html,body{margin:0;padding:0;background:transparent;color:#e2e8f0;font:12px/1.45 system-ui,sans-serif;}
  #panel{min-height:100%;}
</style>
</head>
<body>
<div id="panel"></div>
<script>
(function () {
  var boot = ${payload};
  var PLUGIN_ID = boot.pluginId;
  var PERMS = boot.permissions;
  var pendingAssets = {};
  function can(p) {
    if (!PERMS) return true;
    if (p === 'editor' || p === 'map') return PERMS.indexOf('editor') >= 0 || PERMS.indexOf('map') >= 0;
    return PERMS.indexOf(p) >= 0;
  }
  function send(msg) {
    parent.postMessage(Object.assign({ ns: '${NS_FROM}', pluginId: PLUGIN_ID }, msg), '*');
  }
  window.fetch = function () { return Promise.reject(new Error('blocked')); };
  window.XMLHttpRequest = function () { throw new Error('blocked'); };
  window.WebSocket = function () { throw new Error('blocked'); };
  window.Worker = function () { throw new Error('blocked'); };
  window.SharedWorker = function () { throw new Error('blocked'); };
  var lastDoc = { version: 1, name: '', entities: [], layers: [], gridSize: 1 };
  var lastSelected = null;
  var panels = {};
  var scripts = {};
  var play = { beforeStart: [], ready: [], exit: [], tick: [] };
  var Kilrun = {
    version: boot.version,
    definePlugin: function (fn) { fn(Kilrun); },
    editor: {
      registerPanel: function (spec) {
        if (!spec || !spec.id || !can('editor')) return;
        panels[spec.id] = spec;
        send({ type: 'registerPanel', spec: { id: String(spec.id), label: String(spec.label || spec.id), order: spec.order || 180 } });
      }
    },
    weapons: { register: function (def) { if (can('weapons')) send({ type: 'registerWeapon', def: def }); } },
    shop: { registerItem: function (item) { if (can('weapons')) send({ type: 'registerShopItem', item: item }); } },
    playtest: {
      on: function (event, fn) {
        if (!can('playtest')) return function () {};
        if (!play[event]) play[event] = [];
        play[event].push(fn);
        return function () { play[event] = play[event].filter(function (row) { return row !== fn; }); };
      }
    },
    entities: { registerScript: function (id, handlers) { if (id) scripts[id] = handlers || {}; } },
    modes: { register: function (spec) { if (can('modes')) send({ type: 'registerMode', spec: spec }); } },
    assets: {
      loadDataUrl: function (rel) {
        if (!can('assets')) return Promise.resolve(null);
        var reqId = Math.random().toString(36).slice(2);
        return new Promise(function (resolve) {
          pendingAssets[reqId] = resolve;
          send({ type: 'assetRequest', rel: String(rel || ''), reqId: reqId });
          setTimeout(function () {
            if (pendingAssets[reqId]) { pendingAssets[reqId](null); delete pendingAssets[reqId]; }
          }, 4000);
        });
      }
    }
  };
  window.Kilrun = Kilrun;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.ns !== '${NS_TO}') return;
    if (d.type === 'doc') lastDoc = d.doc || lastDoc;
    if (d.type === 'selected') lastSelected = d.id || null;
    if (d.type === 'assetResult' && pendingAssets[d.reqId]) {
      pendingAssets[d.reqId](d.url || null);
      delete pendingAssets[d.reqId];
    }
    if (d.type === 'mount') {
      var spec = panels[d.panelId];
      var el = document.getElementById('panel');
      if (!spec || !el || typeof spec.mount !== 'function') return;
      el.innerHTML = '';
      try {
        spec.mount(el, {
          getDoc: function () { return lastDoc; },
          mutateDoc: function (fn) {
            if (!can('editor')) return;
            try {
              var next = typeof fn === 'function' ? fn(JSON.parse(JSON.stringify(lastDoc))) : fn;
              lastDoc = next;
              send({ type: 'mutateDoc', doc: next });
            } catch (err) {
              send({ type: 'toast', title: 'Plugin mutate failed', description: String(err && err.message || err), variant: 'destructive' });
            }
          },
          toast: function (o) { send(Object.assign({ type: 'toast' }, o || {})); },
          startPlay: function () { if (can('playtest')) send({ type: 'startPlay' }); },
          selectedId: function () { return lastSelected; }
        });
      } catch (err) {
        el.textContent = String(err && err.message || err);
      }
    }
    if (d.type === 'playtest') {
      (play[d.event] || []).forEach(function (fn) { try { fn(d.payload || {}); } catch (err) {} });
    }
    if (d.type === 'entity') {
      var list = d.entities || [];
      var player = d.player || { x: 0, y: 0, z: 0 };
      for (var i = 0; i < list.length; i++) {
        var ent = list[i];
        var handlers = scripts[ent.pluginScript];
        if (!handlers) continue;
        var payload = {
          entityId: ent.id,
          script: ent.pluginScript,
          dt: d.dt || 0,
          x: player.x, y: player.y, z: player.z,
          damage: function (n) { send({ type: 'damage', amount: n }); }
        };
        try {
          if (handlers.onTick) handlers.onTick(payload);
          if (ent.hit && handlers.onTouch) handlers.onTouch(payload);
        } catch (err) {}
      }
    }
  });
  try {
    (new Function('Kilrun', boot.wrapped))(Kilrun);
    send({ type: 'ready' });
  } catch (err) {
    send({ type: 'error', error: String(err && err.message || err) });
  }
})();
</script>
</body>
</html>`;
}

function onHostMessage(ev: MessageEvent) {
  const data = ev.data as Record<string, unknown> | null;
  if (!data || data.ns !== NS_FROM || typeof data.pluginId !== 'string') return;
  const pluginId = data.pluginId;
  const rec = sandboxes.get(pluginId);
  if (!rec || ev.source !== rec.iframe.contentWindow) return;
  if (ev.origin !== 'null' && ev.origin !== window.location.origin) return;

  const type = String(data.type || '');
  if (!hostMessageAllowed(rec.permissions, type)) return;
  if (type === 'damage') {
    playtestDamage?.(clampDamage(data.amount));
    return;
  }
  if (!handlers) return;
  if (type === 'registerPanel' && data.spec && typeof data.spec === 'object') {
    const spec = data.spec as { id?: string; label?: string; order?: number };
    if (spec.id) {
      handlers.onRegisterPanel(pluginId, {
        id: String(spec.id),
        label: String(spec.label || spec.id),
        order: typeof spec.order === 'number' ? spec.order : 180,
      });
    }
    return;
  }
  if (type === 'registerWeapon') {
    handlers.onRegisterWeapon(pluginId, data.def);
    return;
  }
  if (type === 'registerShopItem') {
    handlers.onRegisterShopItem(pluginId, data.item);
    return;
  }
  if (type === 'registerMode') {
    handlers.onRegisterMode(pluginId, data.spec);
    return;
  }
  if (type === 'mutateDoc') {
    handlers.onMutateDoc(pluginId, data.doc);
    return;
  }
  if (type === 'toast') {
    handlers.onToast({
      title: data.title ? String(data.title) : undefined,
      description: data.description ? String(data.description) : undefined,
      variant: data.variant === 'destructive' ? 'destructive' : 'default',
    });
    return;
  }
  if (type === 'startPlay') {
    handlers.onStartPlay();
    return;
  }
  if (type === 'assetRequest' && typeof data.reqId === 'string') {
    const reqId = data.reqId;
    void handlers.onAssetRequest(pluginId, String(data.rel || ''), reqId).then((url) => {
      postToPlugin(pluginId, { type: 'assetResult', reqId, url });
    });
  }
}

function ensureHostListener() {
  if (hostListening || typeof window === 'undefined') return;
  hostListening = true;
  hostHandler = onHostMessage;
  window.addEventListener('message', onHostMessage);
}

export function postToPlugin(pluginId: string, msg: Record<string, unknown>) {
  const rec = sandboxes.get(pluginId);
  rec?.iframe.contentWindow?.postMessage({ ns: NS_TO, ...msg }, '*');
}

export function postToAllPlugins(msg: Record<string, unknown>) {
  for (const id of sandboxes.keys()) postToPlugin(id, msg);
}

export async function createPluginSandbox(
  pluginId: string,
  source: string,
  permissions?: PluginPermission[]
): Promise<void> {
  if (typeof document === 'undefined') throw new Error('Plugin sandbox needs a browser');
  destroyPluginSandbox(pluginId);
  ensureHostListener();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.title = `Kilrun plugin ${pluginId}`;
  iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent;display:block';
  const rec: SandboxRecord = { pluginId, iframe, source, permissions };
  sandboxes.set(pluginId, rec);

  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onReady);
      reject(new Error('Plugin sandbox timed out'));
    }, 5000);
    const onReady = (ev: MessageEvent) => {
      const data = ev.data as Record<string, unknown> | null;
      if (ev.source !== iframe.contentWindow || !data) return;
      if (data.ns !== NS_FROM || data.pluginId !== pluginId) return;
      if (data.type === 'ready') {
        window.clearTimeout(timer);
        window.removeEventListener('message', onReady);
        resolve();
      }
      if (data.type === 'error') {
        window.clearTimeout(timer);
        window.removeEventListener('message', onReady);
        reject(new Error(String(data.error || 'Plugin failed')));
      }
    };
    window.addEventListener('message', onReady);
  });

  iframe.srcdoc = buildSrcDoc(pluginId, source, permissions);
  getPark()?.appendChild(iframe);
  await ready;
}

export function destroyPluginSandbox(pluginId: string) {
  const rec = sandboxes.get(pluginId);
  if (!rec) return;
  rec.iframe.remove();
  sandboxes.delete(pluginId);
}

export function destroyAllPluginSandboxes() {
  for (const id of [...sandboxes.keys()]) destroyPluginSandbox(id);
}

export function adoptPluginIframe(pluginId: string, host: HTMLElement) {
  const rec = sandboxes.get(pluginId);
  if (!rec) return;
  rec.iframe.style.opacity = '1';
  rec.iframe.style.pointerEvents = 'auto';
  host.appendChild(rec.iframe);
}

export function parkPluginIframe(pluginId: string) {
  const rec = sandboxes.get(pluginId);
  const holder = getPark();
  if (!rec || !holder) return;
  rec.iframe.style.opacity = '0';
  rec.iframe.style.pointerEvents = 'none';
  holder.appendChild(rec.iframe);
}

export function listSandboxPluginIds(): string[] {
  return [...sandboxes.keys()];
}
