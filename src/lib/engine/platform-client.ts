/**
 * Desktop → website map API. Used by the Windows app instead of Next server actions.
 * Saves still write to Documents/Kilrun first; these calls push the same MapDocument
 * onto the live web game (Mongo GameMap / Active MAIN).
 */
import type { MapDocument } from '@/components/game/editor/map-document';
import type { KilrunMode } from '@/lib/game-modes';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';

export type CloudMapListItem = {
  id: string;
  localId: string | null;
  name: string;
  mode: KilrunMode;
  thumbnailUrl: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type CloudMapDocumentRow = CloudMapListItem & { document: MapDocument };

export type EngineSessionUser = {
  username: string;
  role: string;
  steamId: string;
};

type PlatformState = {
  origin: string;
  token: string | null;
};

let platform: PlatformState = {
  origin: '',
  token: null,
};

function envSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

export function configureEnginePlatform(next: { origin?: string; token?: string | null }) {
  if (next.origin) platform.origin = next.origin.replace(/\/$/, '');
  if (next.token !== undefined) platform.token = next.token;
  if (typeof window !== 'undefined') {
    if (platform.origin) window.__KILRUN_PLATFORM_URL__ = platform.origin;
  }
}

export function enginePlatformOrigin(): string {
  if (platform.origin) return platform.origin;
  if (typeof window !== 'undefined' && window.__KILRUN_PLATFORM_URL__) {
    return window.__KILRUN_PLATFORM_URL__.replace(/\/$/, '');
  }
  const fromEnv = envSiteUrl();
  if (fromEnv) return fromEnv;
  if (isKilrunEngineDesktop()) return 'https://kilrun.vercel.app';
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    if (!/tauri\.localhost/i.test(origin)) return origin;
  }
  return 'http://localhost:3000';
}

export function hasEngineSession(): boolean {
  return Boolean(platform.token);
}

async function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const origin = enginePlatformOrigin();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (platform.token) headers.set('Authorization', `Bearer ${platform.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${origin}${path}`, { ...init, headers });
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* ignore */
  }
  return `Website returned ${res.status}`;
}

export async function fetchEngineSession(): Promise<EngineSessionUser | null> {
  if (!platform.token) return null;
  const res = await engineFetch('/api/engine/session');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { user?: EngineSessionUser };
  return data.user ?? null;
}

/** 404 means /api/engine is not deployed on the live site yet. */
export async function probeEngineApi(): Promise<'ok' | 'missing' | 'error'> {
  try {
    const origin = enginePlatformOrigin();
    const res = await fetch(`${origin}/api/engine/session`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return 'missing';
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function publishCloudMap(input: {
  localId?: string;
  name: string;
  mode: string;
  document: MapDocument;
  thumbnailDataUrl?: string | null;
  setActive?: boolean;
}): Promise<CloudMapListItem> {
  if (!platform.token) {
    throw new Error('Link the live game with Steam (staff) to upload this map');
  }
  const res = await engineFetch('/api/engine/maps', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { map?: CloudMapListItem; error?: string };
  if (!data.map) throw new Error(data.error || 'Publish failed');
  return data.map;
}

export async function setActiveCloudMap(mapId: string, mode: string) {
  const res = await engineFetch('/api/engine/maps', {
    method: 'POST',
    body: JSON.stringify({ id: mapId, mode, setActive: true }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return { ok: true as const };
}

export async function listCloudMaps(mode?: string): Promise<CloudMapListItem[]> {
  const rows = await listCloudMapDocuments((mode || 'deathrun') as KilrunMode);
  return rows.map(({ document: _doc, ...item }) => item);
}

export async function listCloudMapDocuments(mode: KilrunMode): Promise<CloudMapDocumentRow[]> {
  if (!platform.token) return [];
  const res = await engineFetch(`/api/engine/maps?mode=${encodeURIComponent(mode)}`);
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { maps?: CloudMapDocumentRow[] };
  return data.maps ?? [];
}

export async function getCloudMapDocument(_id: string) {
  return null;
}

export async function getActiveCloudMapDocument(mode?: string) {
  const rows = await listCloudMapDocuments((mode || 'deathrun') as KilrunMode);
  const active = rows.find((row) => row.isActive);
  return active
    ? {
        id: active.id,
        localId: active.localId,
        name: active.name,
        document: active.document,
        thumbnailUrl: active.thumbnailUrl,
        updatedAt: active.updatedAt,
      }
    : null;
}

export async function deleteCloudMap(_mapId: string, _force = false) {
  return { ok: true as const };
}

export async function deleteCloudMapsMatching(_input: unknown) {
  return { ok: true as const, deleted: 0 };
}

export async function forkCloudMap(_id: string) {
  return null;
}
