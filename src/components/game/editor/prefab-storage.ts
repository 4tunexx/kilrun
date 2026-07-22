import type { EditorEntity, MapDocument } from './map-document';
import {
  ensureDeathrunSettings,
  entityExportsAsPlatform,
  ensureHazard,
  generateId,
  resolveCollideMaterial,
} from './map-document';
import type { KilrunMode } from '@/lib/game-modes';
import { normalizeKilrunMode } from '@/lib/game-modes';
import { modelFootprint } from './prototype-catalog';

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
  | 'conveyor'
  | 'water'
  | 'sand';

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
  // Prefer measured GLB size, then catalog footprint, then legacy scale*2 heuristic.
  const foot =
    e.collisionSize ??
    modelFootprint(e.model) ??
    ([
      Math.max(1, Math.abs(e.scale[0]) * 2),
      Math.max(0.2, Math.abs(e.scale[1]) * 2),
      Math.max(1, Math.abs(e.scale[2]) * 2),
    ] as [number, number, number]);
  const sizeX = Math.max(0.35, foot[0] * Math.abs(e.scale[0]));
  const sizeY = Math.max(0.12, foot[1] * Math.abs(e.scale[1]));
  const sizeZ = Math.max(0.35, foot[2] * Math.abs(e.scale[2]));
  // Yaw expands the axis-aligned pad so rotated floors/walls still block.
  const yaw = ((e.rotation?.[1] ?? 0) * Math.PI) / 180;
  const absC = Math.abs(Math.cos(yaw));
  const absS = Math.abs(Math.sin(yaw));
  const worldSizeX = sizeX * absC + sizeZ * absS;
  const worldSizeZ = sizeX * absS + sizeZ * absC;
  const jump = e.jumpPad?.enabled || e.kind === 'jump_pad';
  const mat = resolveCollideMaterial(e);
  const ice = mat === 'ice' || !!e.surface?.ice;
  const conveyor = !!e.surface?.conveyor;
  let kind: SimPlatformKind = 'solid';
  if (e.kind === 'finish') kind = 'finish';
  else if (e.kind === 'checkpoint') kind = 'checkpoint';
  else if (jump) kind = 'jumpPad';
  else if (conveyor) kind = 'conveyor';
  else if (ice) kind = 'ice';
  else if (mat === 'water') kind = 'water';
  else if (mat === 'sand') kind = 'sand';

  const model = e.model ?? '';
  const isHammerSolid = e.primitive === 'box' || model === 'hammer-solid';
  const wantsSolidVolume =
    mat === 'solid' || e.solid === true || e.kind === 'door';
  // Hammer++ / box solids are authoring volumes — always full collision when marked
  // solid (even short blocks). Do NOT force top-only for sizeY < 0.6.
  const topOnly =
    !isHammerSolid &&
    (e.kind === 'finish' ||
      e.kind === 'checkpoint' ||
      e.kind === 'jump_pad' ||
      jump ||
      ice ||
      conveyor ||
      mat === 'sand' ||
      !!e.teleport?.enabled ||
      model.includes('floor') ||
      model.startsWith('platform'));
  // Water keeps full volume so deep pools can swim; floors stay thin tops.
  const wallLike =
    !topOnly &&
    (isHammerSolid ||
      model.startsWith('wall') ||
      model.startsWith('column') ||
      model.includes('door') ||
      e.kind === 'door' ||
      sizeY >= 1.0 ||
      wantsSolidVolume);
  const height =
    mat === 'water'
      ? Math.max(0.5, sizeY)
      : topOnly
        ? Math.min(0.35, Math.max(0.2, sizeY))
        : isHammerSolid
          ? // Full authored height (even thin walls must side-collide).
            Math.max(0.4, sizeY)
          : wallLike
            ? Math.max(1.0, sizeY)
            : wantsSolidVolume
              ? Math.max(0.8, sizeY)
              : Math.max(0.35, sizeY * 0.5);
  // Hammer meshes are bottom-aligned at position.y — pad top = feet + sizeY.
  const topZ = isHammerSolid
    ? ty + sizeY
    : topOnly && mat !== 'water'
      ? ty + sizeY * 0.5
      : ty + height * 0.5;

  const dirSimX = Math.cos(yaw);
  const dirSimY = Math.sin(yaw);

  return {
    x: tz,
    y: tx,
    z: topZ,
    width: worldSizeZ,
    depth: worldSizeX,
    kind,
    boost: jump ? Math.max(4, e.jumpPad?.boost ?? 14) : undefined,
    height,
    conveyorSpeed: conveyor ? Math.max(0.5, e.surface?.conveyorSpeed ?? 4) : undefined,
    conveyorDirX: conveyor ? dirSimX : undefined,
    conveyorDirY: conveyor ? dirSimY : undefined,
  };
}

/**
 * Expand stairs/ramps into stepped solid pads so players can climb the mesh
 * instead of walking through a single thin top slab.
 */
export function stairEntityToSimPads(stairs: EditorEntity, steps = 8): SimPlatformBlueprint[] {
  const n = Math.max(3, Math.min(16, Math.round(steps)));
  const [sx, sy, sz] = stairs.position;
  const yaw = ((stairs.rotation?.[1] ?? 0) * Math.PI) / 180;
  const foot =
    stairs.collisionSize ??
    modelFootprint(stairs.model) ??
    ([
      Math.max(1, Math.abs(stairs.scale[0]) * 2),
      Math.max(0.8, Math.abs(stairs.scale[1]) * 2),
      Math.max(1, Math.abs(stairs.scale[2]) * 2),
    ] as [number, number, number]);
  const run = Math.max(1.2, foot[2] * Math.abs(stairs.scale[2]));
  const rise = Math.max(0.6, foot[1] * Math.abs(stairs.scale[1]));
  const width = Math.max(0.8, foot[0] * Math.abs(stairs.scale[0]));
  const stepRun = run / n;
  const stepRise = rise / n;
  const mat = resolveCollideMaterial(stairs);
  let kind: SimPlatformKind = 'solid';
  if (mat === 'ice') kind = 'ice';
  else if (mat === 'water') kind = 'water';
  else if (mat === 'sand') kind = 'sand';

  const pads: SimPlatformBlueprint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const along = (t - 0.5) * run;
    const px = sx + Math.sin(yaw) * along;
    const pz = sz + Math.cos(yaw) * along;
    const topY = sy - rise * 0.5 + (i + 1) * stepRise;
    const stepW = Math.max(0.45, stepRun * 0.95);
    const absC = Math.abs(Math.cos(yaw));
    const absS = Math.abs(Math.sin(yaw));
    const worldSizeX = width * absC + stepW * absS;
    const worldSizeZ = width * absS + stepW * absC;
    pads.push({
      x: pz,
      y: px,
      z: topY,
      width: worldSizeZ,
      depth: worldSizeX,
      kind,
      height: Math.max(0.18, stepRise * 0.85),
    });
  }
  return pads;
}

function entityToCollisionPads(e: EditorEntity): SimPlatformBlueprint[] {
  if (resolveCollideMaterial(e) === 'walkthrough') return [];
  const model = e.model ?? '';
  if (model.includes('stair') || model.includes('ramp')) {
    return stairEntityToSimPads(e, 8);
  }
  return [entityToPad(e)];
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
        resolveCollideMaterial(e) !== 'walkthrough' &&
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
  const pads = source.flatMap(entityToCollisionPads);

  if (pads.length === 0 && runner) {
    const [tx, ty, tz] = runner.position;
    pads.push({ x: tz, y: tx, z: ty, width: 6, depth: 6, kind: 'solid' });
  }

  return pads;
}

/** Legacy "Bake stairs → solid steps" props — remove from maps; collision is automatic now. */
export function isLegacyBakedStairPad(e: EditorEntity): boolean {
  return (
    e.kind === 'prop' &&
    (e.model === 'floor-square' || !e.model) &&
    / Step \d+$/i.test(e.name) &&
    Math.abs(e.scale[1]) <= 0.3
  );
}

export function stripLegacyBakedStairPads(doc: MapDocument): MapDocument {
  const entities = doc.entities.filter((e) => !isLegacyBakedStairPad(e));
  if (entities.length === doc.entities.length) return doc;
  return { ...doc, entities };
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

export interface SimActionBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** proximity = auto on enter; interact = Use/E; collide = touch */
  trigger: 'proximity' | 'interact' | 'collide' | 'always';
  activatesObstacleIds: string[];
  holdMs: number;
  cooldownMs: number;
}

/** Invisible Action markers — fire signals / arm traps like buttons. */
export function mapDocToSimActions(doc: MapDocument): SimActionBlueprint[] {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'action')
    .map((e) => {
      const anim = e.animation;
      const [tx, ty, tz] = e.position;
      const targets = anim?.activatesEntityIds ?? [];
      const listeners = doc.entities
        .filter((o) => o.animation?.listenToEntityId === e.id)
        .map((o) => o.id);
      const activatesObstacleIds = Array.from(new Set([...targets, ...listeners]));
      const raw = anim?.trigger;
      const trigger: SimActionBlueprint['trigger'] =
        raw === 'interact' || raw === 'collide' || raw === 'always' || raw === 'proximity'
          ? raw
          : 'proximity';
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        radius: Math.max(1.0, anim?.radius ?? 2.0),
        trigger,
        activatesObstacleIds,
        holdMs: 2000,
        cooldownMs: 500,
      };
    })
    .filter((a) => a.activatesObstacleIds.length > 0 || a.trigger === 'always');
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

/**
 * Play Test needs a spawn point. If the creator never placed Start, invent an
 * ephemeral one on the first solid floor (or origin) — never requires the author
 * to place a spawn prop by hand.
 */
export function prepareDocForPlayTest(doc: MapDocument): {
  doc: MapDocument;
  autoStart: boolean;
} {
  const hasStart = doc.entities.some(
    (e) => e.visible !== false && (e.kind === 'start' || e.kind === 'spawn_runner')
  );
  if (hasStart) return { doc, autoStart: false };

  const player =
    doc.entities.find((e) => e.kind === 'player' && e.visible !== false) ??
    doc.entities.find((e) => e.kind === 'player');

  const floor =
    doc.entities.find(
      (e) =>
        e.visible !== false &&
        entityExportsAsPlatform(e) &&
        (e.model?.includes('floor') || e.model?.startsWith('platform') || e.solid === true)
    ) ?? doc.entities.find((e) => e.visible !== false && entityExportsAsPlatform(e));

  const layerId =
    doc.layers.find((l) => /spawn/i.test(l.name))?.id ??
    doc.layers[doc.layers.length - 1]?.id ??
    doc.layers[0]?.id ??
    'layer_0';

  let position: [number, number, number] = [0, 0.5, 0];
  if (player) {
    position = [player.position[0], player.position[1], player.position[2]];
  } else if (floor) {
    const foot =
      floor.collisionSize ??
      modelFootprint(floor.model) ??
      ([1, 0.2, 1] as [number, number, number]);
    const top = floor.position[1] + (foot[1] * Math.abs(floor.scale[1])) * 0.5 + 0.05;
    position = [floor.position[0], top, floor.position[2]];
  }

  const start: EditorEntity = {
    id: generateId(),
    name: 'Start (auto)',
    kind: 'start',
    layerId,
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#22c55e',
  };

  return {
    doc: { ...doc, entities: [...doc.entities, start] },
    autoStart: true,
  };
}

/** All player / runner start positions (Deathrun capped by modeSettings.maxRunners). */
export function mapDocPlayerSpawns(doc: MapDocument): { x: number; y: number; z: number }[] {
  const mode = normalizeKilrunMode(doc.gameMode);
  const max =
    mode === 'deathrun'
      ? ensureDeathrunSettings(doc).maxRunners
      : mode === 'horde'
        ? 4
        : 16;
  const starts = doc.entities.filter(
    (e) =>
      e.visible !== false &&
      (e.kind === 'start' || e.kind === 'spawn_runner' || e.kind === 'player')
  );
  if (!starts.length) {
    const fallback = mapDocSpawnPoints(doc).runner;
    return fallback ? [fallback] : [];
  }
  return starts.slice(0, Math.max(1, max)).map((e) => ({
    x: e.position[2],
    y: e.position[0],
    z: e.position[1],
  }));
}

export function mapDocMonsterSpawns(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'spawn_monster')
    .map((e) => {
      const ms = e.monsterSpawn;
      return {
        id: e.id,
        x: e.position[2],
        y: e.position[0],
        z: e.position[1],
        monsterType: ms?.monsterType ?? ('basic' as const),
        waveMin: ms?.waveMin ?? 1,
        waveMax: ms?.waveMax ?? 0,
        countPerWave: ms?.countPerWave ?? 2,
        spawnIntervalSec: ms?.spawnIntervalSec ?? 1.5,
      };
    });
}

export function mapDocTeamSpawns(doc: MapDocument) {
  const toSim = (e: EditorEntity) => ({
    x: e.position[2],
    y: e.position[0],
    z: e.position[1],
  });
  return {
    teamA: doc.entities
      .filter((e) => e.visible !== false && e.kind === 'spawn_team_a')
      .map(toSim),
    teamB: doc.entities
      .filter((e) => e.visible !== false && e.kind === 'spawn_team_b')
      .map(toSim),
  };
}

function padZoneFromEntity(
  e: EditorEntity,
  extra: Record<string, number | undefined> = {}
) {
  return {
    id: e.id,
    x: e.position[2],
    y: e.position[0],
    z: e.position[1],
    width: Math.max(1.2, Math.abs(e.scale[0]) * 2),
    depth: Math.max(1.2, Math.abs(e.scale[2]) * 2),
    height: Math.max(1.2, Math.abs(e.scale[1]) * 2),
    ...extra,
  };
}

export function mapDocHealthFloors(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'health_floor')
    .map((e) =>
      padZoneFromEntity(e, {
        healPerTick: e.healthFloor?.healPerTick ?? 8,
        intervalMs: e.healthFloor?.intervalMs ?? 500,
      })
    );
}

export function mapDocRedZones(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'red_zone')
    .map((e) =>
      padZoneFromEntity(e, {
        damagePerTick: e.redZone?.damagePerTick ?? 15,
        intervalMs: e.redZone?.intervalMs ?? 500,
      })
    );
}

export function mapDocRevivePads(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'revive_pad')
    .map((e) =>
      padZoneFromEntity(e, {
        reviveTimeMs: e.revive?.reviveTimeMs ?? 4000,
      })
    );
}

/** @deprecated Prefer stairEntityToSimPads — visual bake creates undeletable clutter. */
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
