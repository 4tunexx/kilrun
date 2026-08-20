/**
 * Shared plugin source helpers used by Engine (iframe sandbox) and the
 * Colyseus game server (node:vm). Keep this file DOM-free.
 */

export const PLUGIN_SOURCE_MAX_BYTES = 256 * 1024;

export function clipPluginSource(source: string, max = PLUGIN_SOURCE_MAX_BYTES): string {
  const text = String(source || '').replace(/\u0000/g, '');
  if (text.length <= max) return text;
  return text.slice(0, max);
}

/**
 * Turn a plugin entry that uses `export default function activate(Kilrun)`
 * (or `module.exports`) into a body that can run inside `new Function('Kilrun', body)`.
 */
export function wrapPluginSourceAsCjs(source: string): string {
  let body = clipPluginSource(source);
  body = body.replace(/<\/script/gi, '<\\/script');
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

export function publishedMapModeKey(roomName: string | undefined | null): string {
  const name = String(roomName || 'deathrun').trim();
  return name.replace(/_practice$/, '').replace(/_ranked$/, '');
}

export function comparePluginVersions(a: string, b: string): number {
  const parts = (raw: string) =>
    String(raw || '0')
      .split('.')
      .map((part) => Number.parseInt(part.replace(/[^\d]/g, ''), 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

const CORE_SIM_IDS = new Set(['deathrun', 'horde', 'competitive']);

/** HUD / results label: plugin room `gauntlet_practice` → `gauntlet`. */
export function pluginRoomModeTag(
  roomName: string | undefined | null,
  fallback: string
): string {
  const raw = String(roomName || fallback).trim() || fallback;
  if (raw === 'competitive_ranked') return 'competitive_ranked';
  const key = publishedMapModeKey(raw);
  if (key && key !== fallback && !CORE_SIM_IDS.has(key)) return key;
  if (raw.endsWith('_practice')) return `${fallback}_practice`;
  return fallback;
}

export function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  if (!extra.length) return base;
  const out = [...base];
  for (const item of extra) {
    if (!item?.id) continue;
    const index = out.findIndex((row) => row.id === item.id);
    if (index >= 0) out[index] = { ...out[index], ...item };
    else out.push(item);
  }
  return out;
}
