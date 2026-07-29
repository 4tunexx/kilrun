/**
 * Loads the data-driven Power definitions (see shared/power-definitions.ts)
 * from the Next.js app into this Colyseus process, so admin-tuned numbers
 * and brand-new custom powers (created in the Power Editor) actually affect
 * real matches — not just the static 11-ability fallback baked into the
 * shared module.
 *
 * Mirrors the `active-map.ts` fetch pattern: best-effort HTTP GET with a
 * short timeout, cached for a while so every room onCreate() doesn't hammer
 * the web app, and silently keeps the previous (or static fallback) data if
 * the web app is unreachable — this must never be able to crash a room.
 */

import { applyDynamicPowerDefinitions, type PowerDefinitionRecord } from '../../shared/power-definitions.js';

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

let lastFetchAt = 0;
let inFlight: Promise<void> | null = null;
const REFRESH_INTERVAL_MS = 60_000;

async function doFetch(): Promise<void> {
  const base = resolveWebAppUrl();
  if (!base) return;
  const url = `${base}/api/game/power-definitions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return;
    const data = (await res.json()) as { ok?: boolean; powers?: PowerDefinitionRecord[] };
    if (!data?.ok || !Array.isArray(data.powers) || data.powers.length === 0) return;
    applyDynamicPowerDefinitions(data.powers);
    console.log(`[power-defs] loaded ${data.powers.length} power definitions from web app`);
  } catch (err) {
    console.warn('[power-defs] fetch failed, keeping previous/static definitions:', err);
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget, throttled refresh — call from every room's onCreate(). */
export function ensurePowerDefinitionsLoaded(): Promise<void> {
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now - lastFetchAt < REFRESH_INTERVAL_MS) return Promise.resolve();
  lastFetchAt = now;
  inFlight = doFetch().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
