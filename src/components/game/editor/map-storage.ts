import type { MapDocument, MapEnvironment } from './map-document';
import { createEmptyMap, ensureEnvironment } from './map-document';

const INDEX_KEY = 'kilrun.mapIndex.v1';
const DOC_PREFIX = 'kilrun.mapDoc.v1.';
const THUMB_PREFIX = 'kilrun.mapThumb.v1.';

export interface MapListItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt?: string;
  entityCount?: number;
  floorCount?: number;
  trapCount?: number;
  hazardCount?: number;
  sizeBytes?: number;
  hasThumbnail?: boolean;
}

export interface MapStats {
  entityCount: number;
  floorCount: number;
  trapCount: number;
  hazardCount: number;
  buttonCount: number;
  spawnCount: number;
  sizeBytes: number;
  createdAt?: string;
  updatedAt?: string;
}

function readIndex(): MapListItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as MapListItem[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(items: MapListItem[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items));
}

export function computeMapStats(doc: MapDocument, json?: string): MapStats {
  const ents = doc.entities ?? [];
  const serialized = json ?? JSON.stringify(doc);
  return {
    entityCount: ents.length,
    floorCount: ents.filter((e) => e.model?.includes('floor')).length,
    trapCount: ents.filter((e) => e.kind === 'trap').length,
    hazardCount: ents.filter(
      (e) => e.kind === 'hazard' || e.hazard?.enabled
    ).length,
    buttonCount: ents.filter((e) => e.kind === 'button').length,
    spawnCount: ents.filter(
      (e) => e.kind === 'spawn_runner' || e.kind === 'spawn_trapper'
    ).length,
    sizeBytes: new Blob([serialized]).size,
    createdAt: doc.meta?.createdAt,
    updatedAt: doc.meta?.updatedAt,
  };
}

function indexEntryFromDoc(id: string, doc: MapDocument, serialized: string): MapListItem {
  const stats = computeMapStats(doc, serialized);
  return {
    id,
    name: doc.name,
    updatedAt: doc.meta?.updatedAt ?? new Date().toISOString(),
    createdAt: doc.meta?.createdAt,
    entityCount: stats.entityCount,
    floorCount: stats.floorCount,
    trapCount: stats.trapCount,
    hazardCount: stats.hazardCount,
    sizeBytes: stats.sizeBytes,
    hasThumbnail: !!localStorage.getItem(THUMB_PREFIX + id),
  };
}

/** Rebuild missing stats on older index rows. */
export function listMaps(): MapListItem[] {
  const index = readIndex();
  let dirty = false;
  const enriched = index.map((item) => {
    if (
      item.entityCount != null &&
      item.sizeBytes != null &&
      item.createdAt
    ) {
      return {
        ...item,
        hasThumbnail: !!localStorage.getItem(THUMB_PREFIX + item.id),
      };
    }
    const doc = loadMap(item.id);
    if (!doc) return item;
    dirty = true;
    return indexEntryFromDoc(item.id, doc, JSON.stringify(doc));
  });
  if (dirty) writeIndex(enriched);
  return enriched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveMap(
  id: string,
  doc: MapDocument,
  opts?: { thumbnailDataUrl?: string | null }
): void {
  const updatedAt = new Date().toISOString();
  const next: MapDocument = {
    ...doc,
    environment: ensureEnvironment(doc),
    meta: { ...doc.meta, updatedAt, createdAt: doc.meta?.createdAt ?? updatedAt },
  };
  const serialized = JSON.stringify(next);
  localStorage.setItem(DOC_PREFIX + id, serialized);
  if (opts?.thumbnailDataUrl) {
    try {
      localStorage.setItem(THUMB_PREFIX + id, opts.thumbnailDataUrl);
    } catch {
      // quota — skip thumb
    }
  }
  const index = readIndex().filter((m) => m.id !== id);
  index.push(indexEntryFromDoc(id, next, serialized));
  writeIndex(index);
}

export function loadMap(id: string): MapDocument | null {
  try {
    const raw = localStorage.getItem(DOC_PREFIX + id);
    return raw ? (JSON.parse(raw) as MapDocument) : null;
  } catch {
    return null;
  }
}

export function getMapThumbnail(id: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(THUMB_PREFIX + id);
}

export function deleteMap(id: string): void {
  localStorage.removeItem(DOC_PREFIX + id);
  localStorage.removeItem(THUMB_PREFIX + id);
  writeIndex(readIndex().filter((m) => m.id !== id));
}

export function duplicateMap(id: string, newName?: string): string | null {
  const doc = loadMap(id);
  if (!doc) return null;
  const newId = `map_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const copy: MapDocument = {
    ...doc,
    name: newName ?? `${doc.name} Copy`,
    meta: { createdAt: now, updatedAt: now },
  };
  const thumb = getMapThumbnail(id);
  saveMap(newId, copy, { thumbnailDataUrl: thumb });
  return newId;
}

export function createNewMap(name = 'Untitled Map'): { id: string; doc: MapDocument } {
  const id = `map_${Date.now().toString(36)}`;
  const doc = createEmptyMap(name);
  saveMap(id, doc);
  return { id, doc };
}

/** Ensure older maps without floors get starter pads so Deathrun + thumbs work. */
export function ensureStarterFloors(doc: MapDocument): MapDocument {
  const hasFloor = (doc.entities ?? []).some((e) => e.model?.includes('floor'));
  if (hasFloor) return doc;

  const floorLayer =
    doc.layers.find((l) => /floor/i.test(l.name))?.id ?? doc.layers[0]?.id ?? 'layer_floor';

  const mkFloor = (name: string, z: number, scale: [number, number, number]) => ({
    id: `ent_floor_${Math.random().toString(36).slice(2, 9)}`,
    name,
    kind: 'prop' as const,
    model: 'floor-square',
    layerId: floorLayer,
    position: [0, 0, z] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale,
    color: '#3d5a80',
  });

  return {
    ...doc,
    entities: [
      mkFloor('Start Floor', 0, [2, 1, 2]),
      mkFloor('Course Floor', 8, [1.5, 1, 1.5]),
      mkFloor('End Floor', 16, [2, 1, 2]),
      ...(doc.entities ?? []),
    ],
  };
}

/** Load map and backfill floors if needed (persists when mutated). */
export function loadMapPlayable(id: string): MapDocument | null {
  const doc = loadMap(id);
  if (!doc) return null;
  const next = ensureStarterFloors(doc);
  if (next !== doc) {
    saveMap(id, next);
    return next;
  }
  return doc;
}

export function exportJson(doc: MapDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function importJson(text: string): MapDocument {
  const parsed = JSON.parse(text) as MapDocument;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entities)) {
    throw new Error('Invalid map JSON');
  }
  return parsed;
}

export function formatBytes(n: number | undefined): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ensureStarterMap(): { id: string; doc: MapDocument } {
  const existing = listMaps()[0];
  if (existing) {
    const doc = loadMap(existing.id);
    if (doc) return { id: existing.id, doc };
  }
  return createNewMap('Deathrun Prototype 1');
}

/** Mood / sky+fog+floor packages for World tab. */
export const MOOD_PRESETS: {
  id: string;
  label: string;
  env: Partial<MapEnvironment>;
}[] = [
  {
    id: 'cavern',
    label: 'Cavern',
    env: {
      sky: 'cavern',
      skyColor: '#0a1220',
      fogColor: '#0c1830',
      fogDensity: 0.022,
      floor: 'grid',
      floorColor: '#1a2740',
    },
  },
  {
    id: 'neon',
    label: 'Neon Arena',
    env: {
      sky: 'custom',
      skyColor: '#050510',
      fogColor: '#1a0530',
      fogDensity: 0.018,
      floor: 'solid',
      floorColor: '#120820',
    },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    env: {
      sky: 'dusk',
      skyColor: '#1a1028',
      fogColor: '#2a1838',
      fogDensity: 0.015,
      floor: 'solid',
      floorColor: '#2a2030',
    },
  },
  {
    id: 'bright',
    label: 'Bright',
    env: {
      sky: 'bright',
      skyColor: '#87b8e8',
      fogColor: '#c8d8e8',
      fogDensity: 0.006,
      floor: 'grid',
      floorColor: '#4a6080',
    },
  },
  {
    id: 'void',
    label: 'Void',
    env: {
      sky: 'void',
      skyColor: '#000000',
      fogColor: '#000000',
      fogDensity: 0.04,
      floor: 'void',
      floorColor: '#000000',
    },
  },
];
