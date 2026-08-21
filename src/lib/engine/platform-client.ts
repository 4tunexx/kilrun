/**
 * Desktop → website map API. Used by the Windows app instead of Next server actions.
 * Saves still write to Documents/Kilrun first; these calls push the same MapDocument
 * onto the live web game (Mongo GameMap / Active MAIN).
 */
import type { MapDocument } from '@/components/game/editor/map-document';
import type { KilrunMode } from '@/lib/game-modes';
import type { MapPluginBundle } from '@/lib/engine/plugin-runtime-store';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';
import { buildEngineFetchHeaders } from '@/lib/engine/engine-fetch-headers';

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

export type EnginePrefabRow = {
  id: string;
  localId: string | null;
  name: string;
  mode: string;
  updatedAt: string;
  entityCount: number;
  thumbnailUrl?: string | null;
};

export type EngineSessionUser = {
  id?: string;
  username: string;
  role: string;
  steamId: string;
  avatarUrl?: string;
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
  const prevToken = platform.token;
  if (next.origin) platform.origin = next.origin.replace(/\/$/, '');
  if (next.token !== undefined) platform.token = next.token;
  if (typeof window !== 'undefined') {
    if (platform.origin) window.__KILRUN_PLATFORM_URL__ = platform.origin;
    if (next.token !== undefined && next.token !== prevToken) {
      window.dispatchEvent(
        new CustomEvent('kilrun-engine-live-session', {
          detail: { linked: Boolean(platform.token) },
        })
      );
    }
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

export async function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const origin = enginePlatformOrigin();
  const headers = buildEngineFetchHeaders(init, platform.token);
  return fetch(`${origin}${path}`, { ...init, headers });
}

/** Website path in the browser; Engine staff path on desktop when live game is linked. */
export async function siteOrEngineFetch(
  sitePath: string,
  enginePath: string,
  init: RequestInit = {}
): Promise<Response> {
  if (isKilrunEngineDesktop()) {
    if (!platform.token) {
      throw new Error('Link live game first (Build → Link live game)');
    }
    return engineFetch(enginePath, init);
  }
  return fetch(sitePath, init);
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

/** Short-lived Colyseus join token for desktop Play Test (Live). Needs a linked staff session. */
export async function mintEngineJoinToken(): Promise<{
  token: string | null;
  user: { id: string; username: string; avatarUrl?: string; role: string } | null;
}> {
  if (!platform.token) return { token: null, user: null };
  const res = await engineFetch('/api/engine/join-token', { method: 'POST' });
  if (res.status === 404) return { token: null, user: null };
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    token?: string | null;
    user?: { id: string; username: string; avatarUrl?: string; role: string };
  };
  return { token: data.token ?? null, user: data.user ?? null };
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

export async function publishCloudPlugin(bundle: MapPluginBundle): Promise<void> {
  if (!platform.token) return;
  const res = await engineFetch('/api/engine/plugins', {
    method: 'POST',
    body: JSON.stringify({
      pluginId: bundle.id,
      version: bundle.version,
      source: bundle.source,
      entry: bundle.entry,
      permissions: bundle.permissions,
      modes: bundle.modes,
      weapons: bundle.weapons,
      shopItems: bundle.shopItems,
    }),
  });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(await readError(res));
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
  if (!platform.token) {
    throw new Error('Link live game first — Pull needs a staff Steam session');
  }
  const res = await engineFetch(`/api/engine/maps?mode=${encodeURIComponent(mode)}`);
  if (res.status === 404) {
    throw new Error('Live login is not on the website yet — deploy /api/engine');
  }
  if (res.status === 401) {
    throw new Error('Link live game first — session expired');
  }
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

export async function listEnginePrefabs(mode?: string) {
  if (!platform.token) throw new Error('Link live game first — Pull needs a staff Steam session');
  const qs = mode ? `?mode=${encodeURIComponent(mode)}` : '';
  const res = await engineFetch(`/api/engine/prefabs${qs}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { prefabs?: EnginePrefabRow[] };
  return data.prefabs ?? [];
}

export async function getEnginePrefabEntities(id: string) {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch(`/api/engine/prefabs?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { entities?: unknown[] };
  return data.entities ?? [];
}

export async function publishEnginePrefab(input: {
  localId?: string;
  name: string;
  mode?: string;
  entities: unknown[];
  thumbnailDataUrl?: string | null;
}) {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch('/api/engine/prefabs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { prefab?: EnginePrefabRow };
  if (!data.prefab) throw new Error('Publish failed');
  return data.prefab;
}

export async function upsertEngineShopItem(input: Record<string, unknown>) {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch('/api/engine/shop', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { ok: boolean; item?: unknown };
}

export async function deleteEnginePrefab(id: string) {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch(`/api/engine/prefabs?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await readError(res));
  return { ok: true as const };
}

export type EnginePrefabModelRow = {
  id: string;
  name: string;
  category: string;
  modelUrl: string;
  previewUrl: string | null;
  createdAt: string;
};

function absolutizeSiteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const origin = enginePlatformOrigin();
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export async function listEnginePrefabModels(): Promise<EnginePrefabModelRow[]> {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch('/api/engine/models');
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { models?: EnginePrefabModelRow[]; categories?: string[] };
  return (data.models ?? []).map((row) => ({
    ...row,
    modelUrl: absolutizeSiteUrl(row.modelUrl) ?? row.modelUrl,
    previewUrl: absolutizeSiteUrl(row.previewUrl),
  }));
}

export async function listEnginePrefabModelCategories(): Promise<string[]> {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch('/api/engine/models');
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { categories?: string[] };
  return data.categories ?? [];
}

export async function uploadEnginePrefabModel(input: {
  name: string;
  category: string;
  modelDataUrl: string;
  originalFilename?: string;
  previewDataUrl?: string;
}): Promise<EnginePrefabModelRow> {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch('/api/engine/models', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { model?: EnginePrefabModelRow };
  if (!data.model) throw new Error('Upload failed');
  return {
    ...data.model,
    modelUrl: absolutizeSiteUrl(data.model.modelUrl) ?? data.model.modelUrl,
    previewUrl: absolutizeSiteUrl(data.model.previewUrl),
  };
}

export async function deleteEnginePrefabModel(id: string) {
  if (!platform.token) throw new Error('Link live game first');
  const res = await engineFetch(`/api/engine/models?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await readError(res));
  return { ok: true as const };
}

export async function uploadSiteImageFile(file: File, kind = 'misc'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  const res = await siteOrEngineFetch('/api/admin/upload-site-image', '/api/engine/images', {
    method: 'POST',
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || (res.ok ? 'Upload failed' : `Website returned ${res.status}`));
  }
  return absolutizeSiteUrl(data.url) ?? data.url;
}
