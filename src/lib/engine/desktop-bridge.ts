import { isKilrunEngineDesktop } from './runtime';
import { KILRUN_ENGINE_VERSION } from './version';
import type { MapDocument } from '@/components/game/editor/map-document';

export type DesktopProjectListItem = {
  id: string;
  name: string;
  gameMode?: string;
  updatedAt: string;
  createdAt?: string;
  sizeBytes?: number;
  hasThumbnail?: boolean;
};

export type DesktopProjectFile = {
  id: string;
  mapJson: string;
  thumbnail?: string | null;
  updatedAt: string;
};

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invokeImpl: TauriInvoke | null = null;
let invokeTried = false;

async function getInvoke(): Promise<TauriInvoke | null> {
  if (!isKilrunEngineDesktop()) return null;
  if (invokeImpl) return invokeImpl;
  if (invokeTried) return invokeImpl;
  invokeTried = true;
  try {
    const mod = await import('@tauri-apps/api/core');
    invokeImpl = (cmd, args) => mod.invoke(cmd, args);
    return invokeImpl;
  } catch {
    invokeImpl = null;
    return null;
  }
}

let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>) {
  writeChain = writeChain.then(task).catch((err) => {
    console.warn('[kilrun-engine] desktop project write failed', err);
  });
}

export async function desktopEngineInfo(): Promise<{
  version: string;
  os: string;
  projectsRoot: string;
  dataRoot?: string;
  platformUrl: string;
  sessionToken?: string | null;
} | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    return await invoke('engine_info');
  } catch (err) {
    console.warn('[kilrun-engine] engine_info failed', err);
    return null;
  }
}

export async function listDesktopProjects(): Promise<DesktopProjectListItem[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  try {
    return await invoke('list_projects');
  } catch (err) {
    console.warn('[kilrun-engine] list_projects failed', err);
    return [];
  }
}

export async function readDesktopProject(id: string): Promise<DesktopProjectFile | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    return await invoke('read_project', { id });
  } catch (err) {
    console.warn('[kilrun-engine] read_project failed', err);
    return null;
  }
}

export type KilrunDiskFolder = 'Projects' | 'Assets' | 'Prefabs' | 'Plugins' | 'Cache' | 'Exports';

export async function openDesktopProjectsFolder(): Promise<void> {
  return openDesktopKilrunFolder('Projects');
}

export async function openDesktopKilrunFolder(name: KilrunDiskFolder): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  await invoke('open_kilrun_folder', { name });
}

export async function setDesktopPlatformUrl(url: string): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  await invoke('set_platform_url', { url });
}

export async function setDesktopEngineSession(token: string | null): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  if (token) await invoke('set_engine_session', { token });
  else await invoke('clear_engine_session');
}

export async function openDesktopExternalUrl(url: string): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await invoke('open_external_url', { url });
}

export async function reloadEngineWindow(url: string): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) return;
  await invoke('navigate_engine', { url });
}

export function syncMapToDesktop(opts: {
  id: string;
  serialized: string;
  thumbnail?: string | null;
}): void {
  if (!isKilrunEngineDesktop()) return;
  enqueueWrite(async () => {
    const invoke = await getInvoke();
    if (!invoke) return;
    await invoke('save_project', {
      id: opts.id,
      mapJson: opts.serialized,
      thumbnail: opts.thumbnail ?? null,
      engineVersion: KILRUN_ENGINE_VERSION,
    });
  });
}

export function deleteMapOnDesktop(id: string): void {
  if (!isKilrunEngineDesktop()) return;
  enqueueWrite(async () => {
    const invoke = await getInvoke();
    if (!invoke) return;
    await invoke('delete_project', { id });
  });
}

export type HydrateDesktopResult = {
  pulled: number;
  projectsRoot: string | null;
};

/**
 * Pull Documents/Kilrun/Projects into the in-memory/localStorage working cache
 * the existing editor already uses. Disk wins when it is newer.
 */
export async function hydrateDesktopProjectsIntoLocal(handlers: {
  loadMap: (id: string) => MapDocument | null;
  saveMap: (
    id: string,
    doc: MapDocument,
    opts?: { thumbnailDataUrl?: string | null; skipDesktopSync?: boolean }
  ) => void;
  setMapThumbnail: (id: string, url: string | null | undefined) => void;
}): Promise<HydrateDesktopResult> {
  const info = await desktopEngineInfo();
  const projects = await listDesktopProjects();
  let pulled = 0;
  for (const item of projects) {
    const file = await readDesktopProject(item.id);
    if (!file?.mapJson) continue;
    let doc: MapDocument;
    try {
      doc = JSON.parse(file.mapJson) as MapDocument;
    } catch {
      continue;
    }
    const local = handlers.loadMap(item.id);
    const localUpdated = local?.meta?.updatedAt ?? '';
    const diskUpdated = file.updatedAt || item.updatedAt || '';
    const shouldWrite =
      !local || !localUpdated || diskUpdated.localeCompare(localUpdated) > 0;
    if (shouldWrite) {
      handlers.saveMap(item.id, doc, {
        thumbnailDataUrl: file.thumbnail ?? undefined,
        skipDesktopSync: true,
      });
      if (file.thumbnail) handlers.setMapThumbnail(item.id, file.thumbnail);
      pulled += 1;
    }
  }
  return { pulled, projectsRoot: info?.projectsRoot ?? null };
}
