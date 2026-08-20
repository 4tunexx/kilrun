import type { Server } from 'colyseus';
import { DeathrunRoom } from './rooms/DeathrunRoom.js';
import { DeathrunPracticeRoom } from './rooms/DeathrunPracticeRoom.js';
import { HordeRoom } from './rooms/HordeRoom.js';
import { HordePracticeRoom } from './rooms/HordePracticeRoom.js';
import { CompetitiveRoom } from './rooms/CompetitiveRoom.js';
import { CompetitivePracticeRoom } from './rooms/CompetitivePracticeRoom.js';
import { publishedMapModeKey } from '../../shared/plugin-source.js';
import { refreshPluginCatalog } from './plugin-catalog.js';

export { publishedMapModeKey };

const CORE = new Set([
  'deathrun',
  'deathrun_practice',
  'horde',
  'horde_practice',
  'competitive',
  'competitive_practice',
  'competitive_ranked',
]);

const defined = new Set<string>(CORE);

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*' || raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

type PluginModeRow = {
  id: string;
  base?: string;
};

function roomForBase(base: string) {
  if (base === 'horde') return { live: HordeRoom, practice: HordePracticeRoom };
  if (base === 'competitive') return { live: CompetitiveRoom, practice: CompetitivePracticeRoom };
  return { live: DeathrunRoom, practice: DeathrunPracticeRoom };
}

export function definePluginModeRooms(gameServer: Server, modes: PluginModeRow[]) {
  for (const spec of modes) {
    const id = String(spec.id || '').trim().toLowerCase();
    if (!id || CORE.has(id) || defined.has(id)) continue;
    const { live, practice } = roomForBase(spec.base || 'deathrun');
    gameServer.define(id, live);
    gameServer.define(`${id}_practice`, practice);
    defined.add(id);
    defined.add(`${id}_practice`);
    console.log(`[plugin-rooms] defined ${id} (base ${spec.base || 'deathrun'})`);
  }
}

export async function fetchPluginModes(): Promise<PluginModeRow[]> {
  const base = resolveWebAppUrl();
  if (!base) return [];
  const url = `${base}/api/game/plugin-modes?t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'cache-control': 'no-store' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; modes?: PluginModeRow[] };
    return Array.isArray(data?.modes) ? data.modes : [];
  } catch (err) {
    console.warn('[plugin-rooms] fetch failed', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function syncPluginRooms(gameServer: Server) {
  await refreshPluginCatalog();
  const modes = await fetchPluginModes();
  definePluginModeRooms(gameServer, modes);
}
