import type { EditorEntity, MapDocument } from './map-document';
import {
  ensureDeathrunSettings,
  entityExportsAsPlatform,
  ensureHazard,
  ensurePushBlock,
  ensurePushRail,
  ensureSpinHazard,
  ensurePlatformMotion,
  generateId,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
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
    motion: e.motion
      ? {
          ...e.motion,
          offset: [...(e.motion.offset ?? [0, 0, 4])] as [number, number, number],
        }
      : undefined,
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
    motion: e.motion
      ? {
          ...e.motion,
          offset: [...(e.motion.offset ?? [0, 0, 4])] as [number, number, number],
        }
      : undefined,
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
  /** Optional editor entity id — client can move the mesh with the pad. */
  entityId?: string;
  /** Yaw radians in sim XY — OBB colliders on the server. */
  rotYaw?: number;
  /** Moving platform (sim space): home = rest pose, amp = B-home. */
  motionPeriodMs?: number;
  motionPhaseMs?: number;
  motionAmpX?: number;
  motionAmpY?: number;
  motionAmpZ?: number;
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
  /** Rotating hazard visual / feel (client). */
  spinSpeed?: number;
  spinAxis?: 'x' | 'y' | 'z';
}

/** Competitive payload rail + block. */
export interface SimPushPayloadBlueprint {
  railId: string;
  blockId: string;
  /** Rail center in sim coords. */
  x: number;
  y: number;
  z: number;
  /** Rail yaw in radians (along length). */
  yaw: number;
  length: number;
  width: number;
  /** 0 = Team A end, 1 = Team B end. */
  t: number;
  pushStrength: number;
  pushRadius: number;
  winEpsilon: number;
  blockModelUrl?: string;
  blockModelId?: string;
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
  const rawX = Math.abs(foot[0] * Math.abs(e.scale[0]));
  const rawY = Math.abs(foot[1] * Math.abs(e.scale[1]));
  const rawZ = Math.abs(foot[2] * Math.abs(e.scale[2]));
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
  const isHammerSolid = isHammerSolidEntity(e);
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
      rawY >= 1.0 ||
      wantsSolidVolume);
  // Floors keep a wider min footprint so tiny pads stay standable. Walls/solids
  // must keep authored thickness — inflating thin walls (e.g. 0.25 → 0.35) is
  // what made Play Test stop a full tile short of the visible mesh.
  const minXZ = topOnly ? 0.35 : 0.05;
  const sizeX = Math.max(minXZ, rawX);
  const sizeY = Math.max(0.12, rawY);
  const sizeZ = Math.max(minXZ, rawZ);
  // True OBB yaw on the server — keep local extents (do not expand AABB).
  const yaw = ((e.rotation?.[1] ?? 0) * Math.PI) / 180;
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

  const motion = ensurePlatformMotion(e);
  // Three offset → sim: x_sim = z_three, y_sim = x_three, z_sim = y_three
  const [ox, oy, oz] = motion.offset;
  const ampSimX = oz;
  const ampSimY = ox;
  const ampSimZ = oy;

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
    rotYaw: yaw,
    entityId: e.id,
    ...(motion.enabled
      ? {
          motionPeriodMs: motion.periodMs,
          motionPhaseMs: motion.phaseMs,
          motionAmpX: ampSimX,
          motionAmpY: ampSimY,
          motionAmpZ: ampSimZ,
        }
      : {}),
  };
}

/**
 * Expand stairs/ramps into stepped solid pads so players can climb the mesh
 * instead of walking through a single thin top slab.
 */
export function stairEntityToSimPads(stairs: EditorEntity, steps = 18): SimPlatformBlueprint[] {
  const n = Math.max(3, Math.min(28, Math.round(steps)));
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
      height: Math.min(0.35, Math.max(0.18, stepRise * 0.85)),
      // Steps are already yaw-baked into AABB; leave rotYaw 0.
      rotYaw: 0,
    });
  }
  return pads;
}

/**
 * Rotate a local-space point by an entity's full [x,y,z] Euler rotation
 * (degrees), matching three.js's default 'XYZ' order used when actually
 * rendering entities (`obj.rotation.set(rx, ry, rz)`). Sequential X → Y → Z,
 * each using the previous step's updated coordinates.
 */
function rotateLocalXYZ(
  [x, y, z]: [number, number, number],
  [rxDeg, ryDeg, rzDeg]: [number, number, number]
): [number, number, number] {
  const rx = (rxDeg * Math.PI) / 180;
  const ry = (ryDeg * Math.PI) / 180;
  const rz = (rzDeg * Math.PI) / 180;
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  const z1 = y * Math.sin(rx) + z * Math.cos(rx);
  const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
  const x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
  const y3 = x2 * Math.sin(rz) + y1 * Math.cos(rz);
  return [x3, y3, z2];
}

/**
 * A block tilted on pitch/roll (not just yaw) reads as a ramp visually, but
 * `entityToPad`'s single AABB only accounts for yaw — pitch/roll are
 * silently dropped, so the collision box stays flat while the mesh looks
 * sloped. That's "can't walk up ramps, have to jump onto the top."
 */
function isTiltedRampSolid(e: EditorEntity): boolean {
  const wantsSolid =
    isHammerSolidEntity(e) || resolveCollideMaterial(e) === 'solid' || e.solid === true;
  if (!wantsSolid) return false;
  const pitch = Math.abs(e.rotation?.[0] ?? 0);
  const roll = Math.abs(e.rotation?.[2] ?? 0);
  // A few degrees of tolerance so slightly-off-axis walls don't get
  // needlessly subdivided; a real ramp is tilted well past that.
  return pitch > 3 || roll > 3;
}

/**
 * Subdivide a tilted solid into N thin flat pads that follow its slope, the
 * same trick `stairEntityToSimPads` uses for named stair/ramp props — but
 * driven by the entity's ACTUAL rotation instead of requiring a specific
 * catalog model name, so any hand-tilted block works as a walkable ramp.
 */
export function rampEntityToSimPads(e: EditorEntity, steps = 24): SimPlatformBlueprint[] {
  const n = Math.max(4, Math.min(36, Math.round(steps)));
  const [ex, ey, ez] = e.position;
  const foot =
    e.collisionSize ??
    modelFootprint(e.model) ??
    ([
      Math.max(1, Math.abs(e.scale[0]) * 2),
      Math.max(0.2, Math.abs(e.scale[1]) * 2),
      Math.max(1, Math.abs(e.scale[2]) * 2),
    ] as [number, number, number]);
  const halfX = Math.max(0.15, (foot[0] * Math.abs(e.scale[0])) / 2);
  const halfY = Math.max(0.06, (foot[1] * Math.abs(e.scale[1])) / 2);
  const halfZ = Math.max(0.15, (foot[2] * Math.abs(e.scale[2])) / 2);
  const rotDeg: [number, number, number] = [
    e.rotation?.[0] ?? 0,
    e.rotation?.[1] ?? 0,
    e.rotation?.[2] ?? 0,
  ];
  const mat = resolveCollideMaterial(e);
  let kind: SimPlatformKind = 'solid';
  if (mat === 'ice') kind = 'ice';
  else if (mat === 'water') kind = 'water';
  else if (mat === 'sand') kind = 'sand';

  const stepDepth = (halfZ * 2) / n;
  const pads: SimPlatformBlueprint[] = [];
  for (let i = 0; i < n; i++) {
    const localZ = -halfZ + (i + 0.5) * stepDepth;
    // Bounding box (in world/sim space) of this thin step's top face, from
    // its 4 local corners rotated by the entity's full 3D rotation — this
    // stays correct for any yaw+pitch+roll combination, not just yaw.
    let minThreeX = Infinity;
    let maxThreeX = -Infinity;
    let minThreeZ = Infinity;
    let maxThreeZ = -Infinity;
    let sumThreeY = 0;
    for (const sx of [-halfX, halfX]) {
      for (const sz of [localZ - stepDepth / 2, localZ + stepDepth / 2]) {
        const [rx, ry, rz] = rotateLocalXYZ([sx, halfY, sz], rotDeg);
        const worldThreeX = ex + rx;
        const worldThreeY = ey + ry;
        const worldThreeZ = ez + rz;
        minThreeX = Math.min(minThreeX, worldThreeX);
        maxThreeX = Math.max(maxThreeX, worldThreeX);
        minThreeZ = Math.min(minThreeZ, worldThreeZ);
        maxThreeZ = Math.max(maxThreeZ, worldThreeZ);
        sumThreeY += worldThreeY;
      }
    }
    const centerThreeY = sumThreeY / 4;
    // Sim convention: x=three.z, y=three.x, z(height)=three.y (see threeToSim).
    pads.push({
      x: (minThreeZ + maxThreeZ) / 2,
      y: (minThreeX + maxThreeX) / 2,
      z: centerThreeY,
      width: Math.max(0.4, maxThreeZ - minThreeZ),
      depth: Math.max(0.4, maxThreeX - minThreeX),
      kind,
      height: Math.min(0.35, Math.max(0.18, halfY * 2 * 0.85)),
    });
  }
  return pads;
}

function entityToCollisionPads(e: EditorEntity): SimPlatformBlueprint[] {
  // Belt-and-suspenders: spawn cones / checkpoints / other invisible gizmo
  // markers must NEVER produce collision, full stop — not conditional on
  // which upstream filter path (entityExportsAsPlatform vs. the legacy
  // no-explicit-platforms fallback) let this entity through to here.
  if (isInvisibleMarkerKind(e.kind)) return [];
  if (resolveCollideMaterial(e) === 'walkthrough') return [];
  const model = e.model ?? '';
  if (model.includes('stair') || model.includes('ramp')) {
    return stairEntityToSimPads(e, 14);
  }
  if (isTiltedRampSolid(e)) {
    return rampEntityToSimPads(e, 24);
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
        // Never let spawn cones / checkpoints / other invisible gizmo
        // markers become solid collision through this loose fallback path
        // — entityExportsAsPlatform already excludes them explicitly, but
        // this heuristic (for legacy maps with no authored platforms) was
        // never checking it, so a map with only a Start marker and no real
        // floor placed yet would make the spawn cone itself solid.
        !isInvisibleMarkerKind(e.kind) &&
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
      if (e.kind === 'spinner') return ensureSpinHazard(e).enabled !== false;
      const hz = ensureHazard(e);
      return e.kind === 'hazard' || e.kind === 'trap' || hz.enabled;
    })
    .map((e) => {
      if (e.kind === 'spinner') {
        const spin = ensureSpinHazard(e);
        const [tx, ty, tz] = e.position;
        const [sw, sh, sd] = spin.size;
        const width = Math.max(1.2, sw * Math.abs(e.scale[0]));
        const depth = Math.max(1.2, sd * Math.abs(e.scale[2]));
        const height = Math.max(1.0, sh * Math.abs(e.scale[1]));
        return {
          id: e.id,
          kind: 'saw' as const,
          x: tz,
          y: tx,
          z: ty,
          width: Math.max(width, depth),
          height,
          damage: spin.instantKill ? 999 : Math.max(1, spin.damage),
          intervalMs: Math.max(100, spin.intervalMs),
          activeMs: 999999,
          alwaysActive: true,
          buttonControlled: false,
          instantKill: !!spin.instantKill,
          spinSpeed: spin.speed,
          spinAxis: spin.axis,
        };
      }
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
        displayName: ms?.displayName,
        modelUrl: ms?.modelUrl || e.customModelUrl,
        modelId: ms?.modelId || e.model,
        level: ms?.level ?? 1,
        hp: ms?.hp ?? 0,
        damage: ms?.damage ?? 0,
        speed: ms?.speed ?? 0,
        radius: ms?.radius ?? 0,
        waveMin: ms?.waveMin ?? 1,
        waveMax: ms?.waveMax ?? 0,
        countPerWave: ms?.countPerWave ?? 2,
        spawnIntervalSec: ms?.spawnIntervalSec ?? 1.5,
      };
    });
}

/** Competitive push-block payloads (rail + block pairs). */
export function mapDocPushPayloads(doc: MapDocument): SimPushPayloadBlueprint[] {
  const rails = doc.entities.filter((e) => e.visible !== false && e.kind === 'push_rail');
  const blocks = doc.entities.filter((e) => e.visible !== false && e.kind === 'push_block');
  const out: SimPushPayloadBlueprint[] = [];
  for (const block of blocks) {
    const pb = ensurePushBlock(block);
    const rail =
      (pb.railEntityId && rails.find((r) => r.id === pb.railEntityId)) ||
      rails.find((r) => {
        const dx = r.position[0] - block.position[0];
        const dz = r.position[2] - block.position[2];
        return Math.hypot(dx, dz) < ensurePushRail(r).length * 0.6;
      }) ||
      rails[0];
    if (!rail) continue;
    const pr = ensurePushRail(rail);
    const yaw = ((rail.rotation?.[1] ?? 0) * Math.PI) / 180;
    out.push({
      railId: rail.id,
      blockId: block.id,
      x: rail.position[2],
      y: rail.position[0],
      z: rail.position[1],
      yaw,
      length: pr.length,
      width: pr.width,
      t: pr.startT,
      pushStrength: pb.pushStrength,
      pushRadius: pb.pushRadius,
      winEpsilon: pb.winEpsilon,
      blockModelUrl: pb.modelUrl || block.customModelUrl,
      blockModelId: pb.modelId || block.model,
    });
  }
  return out;
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
