import type { EditorEntity, MapDocument } from './map-document';
import { entityExportsAsPlatform, ensureHazard, generateId } from './map-document';
import type { KilrunMode } from '@/lib/game-modes';
import { normalizeKilrunMode } from '@/lib/game-modes';

const PREFAB_KEY = 'kilrun.prefabs.v1';
export const ACTIVE_PLAY_MAP_KEY = 'kilrun.activePlayMapId.v1';
const ACTIVE_PLAY_MAP_BY_MODE_KEY = 'kilrun.activePlayMapByMode.v1';

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
    surface: e.surface ? { ...e.surface } : undefined,
    teleport: e.teleport ? { ...e.teleport } : undefined,
    light: e.light ? { ...e.light } : undefined,
    monsterSpawn: e.monsterSpawn ? { ...e.monsterSpawn } : undefined,
    redZone: e.redZone ? { ...e.redZone } : undefined,
    revive: e.revive ? { ...e.revive } : undefined,
    healthFloor: e.healthFloor ? { ...e.healthFloor } : undefined,
    waveAnchor: e.waveAnchor ? { ...e.waveAnchor } : undefined,
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
    playerAnims: e.playerAnims ? { ...e.playerAnims } : undefined,
    hazard: e.hazard ? { ...e.hazard } : undefined,
    jumpPad: e.jumpPad ? { ...e.jumpPad } : undefined,
    surface: e.surface ? { ...e.surface } : undefined,
    teleport: e.teleport ? { ...e.teleport } : undefined,
    light: e.light ? { ...e.light } : undefined,
    monsterSpawn: e.monsterSpawn ? { ...e.monsterSpawn } : undefined,
    redZone: e.redZone ? { ...e.redZone } : undefined,
    revive: e.revive ? { ...e.revive } : undefined,
    healthFloor: e.healthFloor ? { ...e.healthFloor } : undefined,
    waveAnchor: e.waveAnchor ? { ...e.waveAnchor } : undefined,
  }));
}

function readActiveByMode(): Partial<Record<KilrunMode, string>> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_PLAY_MAP_BY_MODE_KEY) || '{}') as Partial<
      Record<KilrunMode, string>
    >;
  } catch {
    return {};
  }
}

function writeActiveByMode(map: Partial<Record<KilrunMode, string>>) {
  localStorage.setItem(ACTIVE_PLAY_MAP_BY_MODE_KEY, JSON.stringify(map));
}

/** Legacy single active map (Deathrun). Prefer setActivePlayMapIdForMode. */
export function setActivePlayMapId(id: string | null) {
  setActivePlayMapIdForMode('deathrun', id);
}

export function getActivePlayMapId(): string | null {
  return getActivePlayMapIdForMode('deathrun');
}

export function setActivePlayMapIdForMode(mode: KilrunMode, id: string | null) {
  if (typeof window === 'undefined') return;
  const m = normalizeKilrunMode(mode);
  const next = { ...readActiveByMode() };
  if (id) next[m] = id;
  else delete next[m];
  writeActiveByMode(next);
  // Keep legacy key in sync for Deathrun so older clients still work.
  if (m === 'deathrun') {
    if (id) localStorage.setItem(ACTIVE_PLAY_MAP_KEY, id);
    else localStorage.removeItem(ACTIVE_PLAY_MAP_KEY);
  }
}

export function getActivePlayMapIdForMode(mode: KilrunMode): string | null {
  if (typeof window === 'undefined') return null;
  const m = normalizeKilrunMode(mode);
  const byMode = readActiveByMode()[m];
  if (byMode) return byMode;
  // Migrate legacy Deathrun key once.
  if (m === 'deathrun') {
    const legacy = localStorage.getItem(ACTIVE_PLAY_MAP_KEY);
    if (legacy) {
      setActivePlayMapIdForMode('deathrun', legacy);
      return legacy;
    }
  }
  return null;
}

/** Editor Three (Y-up) → server sim (x forward, y lateral, z height). */
export type SimPlatformKind =
  | 'solid'
  | 'checkpoint'
  | 'jumpPad'
  | 'finish'
  | 'ice'
  | 'conveyor';

export interface SimPlatformBlueprint {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  kind?: SimPlatformKind;
  boost?: number;
  height?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
}

export interface SimHazardBlueprint {
  id: string;
  kind?: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  damage: number;
  intervalMs: number;
  activeMs?: number;
  alwaysActive: boolean;
  buttonControlled?: boolean;
  instantKill: boolean;
}

export interface SimFinishBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface SimButtonBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  activatesObstacleIds: string[];
  holdMs: number;
  cooldownMs: number;
}

export interface SimTeleportBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  cooldownMs: number;
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
  const ice = !!e.surface?.ice;
  const conveyor = !!e.surface?.conveyor;
  let kind: SimPlatformKind = 'solid';
  if (e.kind === 'finish') kind = 'finish';
  else if (e.kind === 'checkpoint') kind = 'checkpoint';
  else if (jump) kind = 'jumpPad';
  else if (conveyor) kind = 'conveyor';
  else if (ice) kind = 'ice';

  const model = e.model ?? '';
  const topOnly =
    e.kind === 'finish' ||
    e.kind === 'checkpoint' ||
    jump ||
    ice ||
    conveyor ||
    !!e.teleport?.enabled ||
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
  const topZ = topOnly ? ty : ty + height * 0.5;

  const yaw = ((e.rotation?.[1] ?? 0) * Math.PI) / 180;
  const dirSimX = Math.cos(yaw);
  const dirSimY = Math.sin(yaw);

  return {
    x: tz,
    y: tx,
    z: topZ,
    width: sizeZ,
    depth: sizeX,
    kind,
    boost: jump ? Math.max(4, e.jumpPad?.boost ?? 14) : undefined,
    height,
    conveyorSpeed: conveyor ? Math.max(0.5, e.surface?.conveyorSpeed ?? 4) : undefined,
    conveyorDirX: conveyor ? dirSimX : undefined,
    conveyorDirY: conveyor ? dirSimY : undefined,
  };
}

export function mapDocToSimPlatforms(doc: MapDocument): SimPlatformBlueprint[] {
  const explicit = doc.entities.filter(entityExportsAsPlatform);
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

export function mapDocToSimHazards(doc: MapDocument): SimHazardBlueprint[] {
  return doc.entities
    .filter((e) => {
      if (e.visible === false) return false;
      const hz = ensureHazard(e);
      return e.kind === 'hazard' || e.kind === 'trap' || hz.enabled;
    })
    .map((e) => {
      const hz = ensureHazard(e);
      const [tx, ty, tz] = e.position;
      const width = Math.max(1.2, Math.abs(e.scale[0]) * 2);
      const depth = Math.max(1.2, Math.abs(e.scale[2]) * 2);
      const height = Math.max(1.2, Math.abs(e.scale[1]) * 2);
      const mode = hz.mode ?? (e.kind === 'trap' ? 'timed' : 'always');
      return {
        id: e.id,
        kind: hz.obstacleKind ?? (e.kind === 'trap' ? 'spike' : 'damage'),
        x: tz,
        y: tx,
        z: ty,
        width: Math.max(width, depth),
        height,
        damage: hz.instantKill ? 999 : Math.max(1, hz.damage),
        intervalMs: Math.max(100, hz.intervalMs),
        activeMs: Math.max(100, hz.activeMs ?? (mode === 'timed' ? 900 : 1500)),
        alwaysActive: mode === 'always',
        buttonControlled: mode === 'button',
        instantKill: hz.instantKill,
      };
    });
}

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

export function mapDocToSimButtons(doc: MapDocument): SimButtonBlueprint[] {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'button')
    .map((e) => {
      const anim = e.animation;
      const [tx, ty, tz] = e.position;
      const targets = anim?.activatesEntityIds ?? [];
      const listeners = doc.entities
        .filter((o) => o.animation?.listenToEntityId === e.id)
        .map((o) => o.id);
      const activatesObstacleIds = Array.from(new Set([...targets, ...listeners]));
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        radius: Math.max(1.2, anim?.radius ?? 2.5),
        activatesObstacleIds,
        holdMs: 2500,
        cooldownMs: 600,
      };
    })
    .filter((b) => b.activatesObstacleIds.length > 0);
}

export function mapDocToSimTeleports(doc: MapDocument): SimTeleportBlueprint[] {
  const byId = new Map(doc.entities.map((e) => [e.id, e]));
  return doc.entities
    .filter((e) => e.visible !== false && e.teleport?.enabled && e.teleport.targetEntityId)
    .map((e) => {
      const target = byId.get(e.teleport!.targetEntityId!);
      if (!target) return null;
      const [tx, ty, tz] = e.position;
      const [ox, oy, oz] = target.position;
      const width = Math.max(1.2, Math.abs(e.scale[0]) * 2);
      const depth = Math.max(1.2, Math.abs(e.scale[2]) * 2);
      const height = Math.max(1.4, Math.abs(e.scale[1]) * 2);
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        width,
        depth,
        height,
        targetX: oz,
        targetY: ox,
        targetZ: oy + 0.05,
        cooldownMs: Math.max(200, e.teleport?.cooldownMs ?? 800),
      };
    })
    .filter((t): t is SimTeleportBlueprint => !!t);
}

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
    e ? { x: e.position[2], y: e.position[0], z: e.position[1] } : null;
  return { runner: toSim(runner), trapper: toSim(trapper) };
}

/** Bake a stairs-like prop into thin solid pads for climbable collision. */
export function bakeStairsToPads(stairs: EditorEntity, steps = 6): EditorEntity[] {
  const n = Math.max(3, Math.min(16, Math.round(steps)));
  const [sx, sy, sz] = stairs.position;
  const yaw = ((stairs.rotation?.[1] ?? 0) * Math.PI) / 180;
  const run = Math.max(2, Math.abs(stairs.scale[2]) * 2);
  const rise = Math.max(1, Math.abs(stairs.scale[1]) * 2);
  const width = Math.max(1.2, Math.abs(stairs.scale[0]) * 2);
  const stepRun = run / n;
  const stepRise = rise / n;
  const pads: EditorEntity[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const along = (t - 0.5) * run;
    const px = sx + Math.sin(yaw) * along;
    const pz = sz + Math.cos(yaw) * along;
    const py = sy + (i + 1) * stepRise * 0.5;
    pads.push({
      id: generateId(),
      name: `${stairs.name} Step ${i + 1}`,
      kind: 'prop',
      model: 'floor-square',
      layerId: stairs.layerId,
      position: [px, py, pz],
      rotation: [0, stairs.rotation?.[1] ?? 0, 0],
      scale: [width / 2, 0.15, Math.max(0.35, stepRun * 0.55)],
      solid: true,
      color: '#5b7c99',
    });
  }
  return pads;
}
