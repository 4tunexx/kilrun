import type { EditorEntity, MapDocument } from './map-document';
import { entityExportsAsPlatform, ensureHazard, generateId } from './map-document';

const PREFAB_KEY = 'kilrun.prefabs.v1';
export const ACTIVE_PLAY_MAP_KEY = 'kilrun.activePlayMapId.v1';

export interface PrefabStamp {
  id: string;
  name: string;
  createdAt: string;
  /** Entities relative to stamp origin (min corner / first entity). */
  entities: EditorEntity[];
}

export function listPrefabs(): PrefabStamp[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(PREFAB_KEY) || '[]') as PrefabStamp[];
  } catch {
    return [];
  }
}

export function savePrefab(name: string, entities: EditorEntity[]): PrefabStamp {
  if (!entities.length) throw new Error('Select entities first');
  const origin = entities[0].position;
  const relative = entities.map((e) => ({
    ...e,
    id: generateId(),
    position: [
      e.position[0] - origin[0],
      e.position[1] - origin[1],
      e.position[2] - origin[2],
    ] as [number, number, number],
    animation: e.animation
      ? { ...e.animation, availableClips: [...e.animation.availableClips] }
      : undefined,
    playerAnims: e.playerAnims ? { ...e.playerAnims } : undefined,
    hazard: e.hazard ? { ...e.hazard } : undefined,
    jumpPad: e.jumpPad ? { ...e.jumpPad } : undefined,
    light: e.light ? { ...e.light } : undefined,
  }));
  const stamp: PrefabStamp = {
    id: `prefab_${Date.now().toString(36)}`,
    name,
    createdAt: new Date().toISOString(),
    entities: relative,
  };
  const next = [stamp, ...listPrefabs()].slice(0, 40);
  localStorage.setItem(PREFAB_KEY, JSON.stringify(next));
  return stamp;
}

export function deletePrefab(id: string) {
  localStorage.setItem(PREFAB_KEY, JSON.stringify(listPrefabs().filter((p) => p.id !== id)));
}

export function instantiatePrefab(
  stamp: PrefabStamp,
  at: [number, number, number],
  layerId: string
): EditorEntity[] {
  return stamp.entities.map((e) => ({
    ...e,
    id: generateId(),
    layerId,
    position: [
      at[0] + e.position[0],
      at[1] + e.position[1],
      at[2] + e.position[2],
    ] as [number, number, number],
    animation: e.animation
      ? { ...e.animation, availableClips: [...(e.animation.availableClips ?? [])] }
      : undefined,
    hazard: e.hazard ? { ...e.hazard } : undefined,
    jumpPad: e.jumpPad ? { ...e.jumpPad } : undefined,
    light: e.light ? { ...e.light } : undefined,
  }));
}

export function setActivePlayMapId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(ACTIVE_PLAY_MAP_KEY, id);
  else localStorage.removeItem(ACTIVE_PLAY_MAP_KEY);
}

export function getActivePlayMapId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_PLAY_MAP_KEY);
}

/** Editor Three (Y-up) → server sim (x forward, y lateral, z height). */
export type SimPlatformKind = 'solid' | 'checkpoint' | 'jumpPad' | 'finish';

export interface SimPlatformBlueprint {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  kind?: SimPlatformKind;
  /** Jump-pad launch speed (sim vz). */
  boost?: number;
  /** Vertical thickness below top (tall = wall box). */
  height?: number;
}

/** Always-on (or timed) damage volumes exported from editor hazards. */
export interface SimHazardBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  damage: number;
  intervalMs: number;
  alwaysActive: boolean;
  instantKill: boolean;
}

/** Touch / step-on finish trigger (sim space). */
export interface SimFinishBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface SimWorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function entityToPad(e: EditorEntity): SimPlatformBlueprint {
  const [tx, ty, tz] = e.position;
  const sizeX = Math.max(1.2, Math.abs(e.scale[0]) * 2);
  const sizeZ = Math.max(1.2, Math.abs(e.scale[2]) * 2);
  const jump = e.jumpPad?.enabled;
  const kind: SimPlatformKind = jump
    ? 'jumpPad'
    : e.kind === 'finish'
      ? 'finish'
      : e.kind === 'checkpoint'
        ? 'checkpoint'
        : 'solid';
  const model = e.model ?? '';
  const topOnly =
    e.kind === 'finish' ||
    e.kind === 'checkpoint' ||
    jump ||
    model.includes('floor') ||
    model.startsWith('platform');
  const wallLike =
    !topOnly &&
    (model.startsWith('wall') ||
      model.startsWith('column') ||
      model.includes('door') ||
      Math.abs(e.scale[1]) >= 1.15 ||
      e.solid === true);
  const height = topOnly
    ? 0.25
    : wallLike
      ? Math.max(0.8, Math.abs(e.scale[1]) * 2)
      : 0.45;
  // Walls: treat entity Y as center → top = y + height/2. Floors: Y is top.
  const topZ = topOnly ? ty : ty + height * 0.5;
  return {
    x: tz,
    y: tx,
    z: topZ,
    width: sizeZ,
    depth: sizeX,
    kind,
    boost: jump ? Math.max(4, e.jumpPad?.boost ?? 14) : undefined,
    height,
  };
}

/**
 * Convert map entities → standable pads.
 * Prefer explicit `solid` / jumpPad / checkpoint; fall back to floor* heuristic
 * so older maps keep working.
 */
export function mapDocToSimPlatforms(doc: MapDocument): SimPlatformBlueprint[] {
  const explicit = doc.entities.filter(entityExportsAsPlatform);
  // Legacy fallback: if nothing marked solid/floor, keep old floor-like heuristic
  let source = explicit;
  if (source.length === 0) {
    source = doc.entities.filter(
      (e) =>
        e.visible !== false &&
        e.kind !== 'light' &&
        !!e.model &&
        !e.model.startsWith('wall') &&
        !e.model.startsWith('column') &&
        !e.model.startsWith('pipe') &&
        !e.model.startsWith('figurine') &&
        !e.model.startsWith('door') &&
        !e.model.startsWith('button')
    );
  }

  const runner =
    doc.entities.find((e) => e.kind === 'start') ??
    doc.entities.find((e) => e.kind === 'spawn_runner') ??
    doc.entities.find((e) => e.kind === 'player');
  const pads = source.map(entityToPad);

  if (pads.length === 0 && runner) {
    const [tx, ty, tz] = runner.position;
    pads.push({ x: tz, y: tx, z: ty, width: 6, depth: 6, kind: 'solid' });
  }

  return pads;
}

/** Hazard / damage volumes for authoritative match damage. */
export function mapDocToSimHazards(doc: MapDocument): SimHazardBlueprint[] {
  return doc.entities
    .filter((e) => {
      if (e.visible === false) return false;
      const hz = ensureHazard(e);
      return e.kind === 'hazard' || hz.enabled;
    })
    .map((e) => {
      const hz = ensureHazard(e);
      const [tx, ty, tz] = e.position;
      const width = Math.max(1.2, Math.abs(e.scale[0]) * 2);
      const depth = Math.max(1.2, Math.abs(e.scale[2]) * 2);
      const height = Math.max(1.2, Math.abs(e.scale[1]) * 2);
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        width: Math.max(width, depth),
        height,
        damage: hz.instantKill ? 999 : Math.max(1, hz.damage),
        intervalMs: Math.max(100, hz.intervalMs),
        alwaysActive: true,
        instantKill: hz.instantKill,
      };
    });
}

/** Finish trigger volumes — stepping on / touching marks the runner finished. */
export function mapDocToSimFinishes(doc: MapDocument): SimFinishBlueprint[] {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'finish')
    .map((e) => {
      const [tx, ty, tz] = e.position;
      const width = Math.max(1.4, Math.abs(e.scale[0]) * 2);
      const depth = Math.max(1.4, Math.abs(e.scale[2]) * 2);
      const height = Math.max(1.6, Math.abs(e.scale[1]) * 2.5);
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        width,
        depth,
        height,
      };
    });
}

/** Expand sim clamp box from pads / finishes / spawns so big maps aren't walled in. */
export function mapDocToWorldBounds(
  doc: MapDocument,
  platforms: SimPlatformBlueprint[],
  finishes: SimFinishBlueprint[]
): SimWorldBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const expand = (x: number, y: number, halfW: number, halfD: number) => {
    minX = Math.min(minX, x - halfW);
    maxX = Math.max(maxX, x + halfW);
    minY = Math.min(minY, y - halfD);
    maxY = Math.max(maxY, y + halfD);
  };

  for (const p of platforms) expand(p.x, p.y, p.width / 2 + 2, p.depth / 2 + 2);
  for (const f of finishes) expand(f.x, f.y, f.width / 2 + 2, f.depth / 2 + 2);

  const spawns = mapDocSpawnPoints(doc);
  for (const s of [spawns.runner, spawns.trapper]) {
    if (s) expand(s.x, s.y, 3, 3);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 48, minY: 0, maxY: 10 };
  }

  // Padding so players can stand near edges without clamping into geometry.
  const pad = 2.5;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
  };
}

export function mapDocSpawnPoints(doc: MapDocument) {
  const runner =
    doc.entities.find((e) => e.kind === 'start') ??
    doc.entities.find((e) => e.kind === 'spawn_runner') ??
    doc.entities.find((e) => e.kind === 'player');
  const trapper = doc.entities.find((e) => e.kind === 'spawn_trapper');
  const toSim = (e?: EditorEntity) =>
    e
      ? { x: e.position[2], y: e.position[0], z: e.position[1] }
      : null;
  return { runner: toSim(runner), trapper: toSim(trapper) };
}
