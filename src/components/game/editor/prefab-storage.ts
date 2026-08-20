import type { CsgLocalPad, EditorEntity, MapDocument } from './map-document';
import {
  ensureDeathrunSettings,
  entityExportsAsPlatform,
  ensureHazard,
  ensurePushBlock,
  ensurePushRail,
  ensureSpinHazard,
  ensurePlatformMotion,
  ensureWaveAnchor,
  generateId,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
  resolveCollideMaterial,
} from './map-document';
import type { KilrunMode } from '@/lib/game-modes';
import { normalizeKilrunMode } from '@/lib/game-modes';
import { modelFootprint } from './prototype-catalog';
import { LAND_STEP_CLIMB } from '@shared/sim-constants';

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
    // Same aliasing risk as map-document.ts's cloneEntity — these were
    // previously left as shallow spread, sharing array/object references
    // between the source entity and the saved stamp.
    scale: [...e.scale] as [number, number, number],
    rotation: [...e.rotation] as [number, number, number],
    spinHazard: e.spinHazard ? { ...e.spinHazard, size: [...e.spinHazard.size] as [number, number, number] } : undefined,
    pushRail: e.pushRail ? { ...e.pushRail } : undefined,
    pushBlock: e.pushBlock ? { ...e.pushBlock } : undefined,
    interact: e.interact ? { ...e.interact } : undefined,
    csgPads: e.csgPads ? e.csgPads.map((p) => ({ ...p })) : undefined,
    meshCollisionPads: e.meshCollisionPads ? e.meshCollisionPads.map((p) => ({ ...p })) : undefined,
    collisionSize: e.collisionSize ? ([...e.collisionSize] as [number, number, number]) : undefined,
  }));
  const stamp: PrefabStamp = {
    // Millisecond-timestamp-only IDs could collide on rapid double-fires of
    // the save action (same ms → same id), corrupting deletePrefab (which
    // matches by id) and React list keys. generateId() adds a random
    // component so this can't happen.
    id: generateId('prefab'),
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
    scale: [...e.scale] as [number, number, number],
    rotation: [...e.rotation] as [number, number, number],
    spinHazard: e.spinHazard ? { ...e.spinHazard, size: [...e.spinHazard.size] as [number, number, number] } : undefined,
    pushRail: e.pushRail ? { ...e.pushRail } : undefined,
    pushBlock: e.pushBlock ? { ...e.pushBlock } : undefined,
    interact: e.interact ? { ...e.interact } : undefined,
    csgPads: e.csgPads ? e.csgPads.map((p) => ({ ...p })) : undefined,
    meshCollisionPads: e.meshCollisionPads ? e.meshCollisionPads.map((p) => ({ ...p })) : undefined,
    collisionSize: e.collisionSize ? ([...e.collisionSize] as [number, number, number]) : undefined,
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
  /** True for pads meant to be walked over, never blocked against sideways
   * (floors, stair/ramp treads, jump pads, ice/conveyor/sand) — see the
   * matching field/comment on SimPad in src/lib/platformer-sim.ts. */
  topOnly?: boolean;
  boost?: number;
  height?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
  /** Optional editor entity id — client can move the mesh with the pad. */
  entityId?: string;
  /** True for a Solid door wired to a Button — starts closed, opens on activation. */
  doorControlled?: boolean;
  /** Yaw radians in sim XY — OBB colliders on the server. */
  rotYaw?: number;
  /** True analytic ramp support — dz per unit of LOCAL x/y (post-rotYaw).
   * 0/0 = flat. Lets one pad be a genuinely continuous sloped surface. */
  slopeGradX?: number;
  slopeGradY?: number;
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
  /** Sim Y extent (Three X). When omitted, width is used. */
  depth?: number;
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
  // Prefer measured GLB size, then catalog footprint, then a flat 2-unit
  // (Kenney prototype grid unit) legacy guess. `foot` is always an UNSCALED
  // local size — it gets multiplied by e.scale exactly once below. The old
  // fallback baked `* Math.abs(e.scale)` into the guess itself and then this
  // same multiplication happened again on the next line, squaring the
  // effective scale (e.g. a prop scaled 3x got a collision box 9x too big —
  // "massive gap walking into any solid" for any custom/model-library prefab
  // that hadn't finished its async GLB measurement yet).
  const foot = e.collisionSize ?? modelFootprint(e.model) ?? ([2, 2, 2] as [number, number, number]);
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
  // NOTE: this intentionally does NOT include wantsSolidVolume — every
  // placed prop defaults to Material 'solid' (resolveCollideMaterial), so
  // that used to make wallLike true for virtually everything (crates, slabs,
  // decor), forcing a 1.0m-tall collision box on objects with no "wall"
  // shape at all. wallLike now only fires for things that are actually
  // wall-shaped by name/kind or genuinely tall by measurement.
  const wallLike =
    !topOnly &&
    (isHammerSolid ||
      model.startsWith('wall') ||
      model.startsWith('column') ||
      model.includes('door') ||
      e.kind === 'door' ||
      rawY >= 1.0);
  // Floors keep a wider min footprint so tiny pads stay standable. Walls/solids
  // must keep authored thickness — inflating thin walls (e.g. 0.25 → 0.35) is
  // what made Play Test stop a full tile short of the visible mesh.
  const minXZ = topOnly ? 0.35 : 0.05;
  // Hand-placed Hammer solids / wall props are rarely aligned to sub-mm
  // precision — two abutting boxes that just barely touch can leave a
  // floating-point seam the player slips through at the join. Pad every
  // full-collision (non-top-only) box by a small skin on each side so
  // neighboring pieces always overlap slightly instead of only touching.
  // Top-only floors/pads keep their exact footprint (standability, not a
  // seam concern).
  const SEAM_SKIN = 0.03;
  const sizeX = Math.max(minXZ, rawX) + (topOnly ? 0 : SEAM_SKIN * 2);
  const sizeY = Math.max(0.12, rawY);
  const sizeZ = Math.max(minXZ, rawZ) + (topOnly ? 0 : SEAM_SKIN * 2);
  // True OBB yaw on the server — keep local extents (do not expand AABB).
  const yaw = ((e.rotation?.[1] ?? 0) * Math.PI) / 180;
  // `height` is ONLY the blocking volume's downward extent (topZ - height =
  // bottomZ) — it decides whether a short prop counts as a climbable curb
  // (<=LAND_STEP_CLIMB) or a full wall in resolveSolids' step-up check. It
  // must NEVER move topZ (the surface the player actually stands/glues to):
  // this used to feed straight into topZ below, so any prop that fell into
  // the wallLike/wantsSolidVolume buckets got its *visible standing surface*
  // shoved up to floor+1.0m / floor+0.8m regardless of its real measured
  // height — e.g. a 0.2m-tall slab reported flush at z=floor+1.0, a full
  // meter above the mesh you can see. That's the "floating on top of
  // prefabs" + "massive gap walking into solids" bug: the physics thought it
  // was flush (Δz-top=0.00) against a phantom box the eye can't see.
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
            : Math.max(0.12, sizeY);
  // topZ is always the real, measured top of the mesh (ty + sizeY) — matching
  // exactly what the player sees rendered — except for water, whose surface
  // is deliberately allowed to sit above a thin pool floor so the space is
  // actually swimmable. All catalog models are bottom-aligned at position.y
  // (plantLocalFeet in editor-mesh.ts shifts every loaded mesh so its AABB
  // base sits at y=0 relative to the entity), so ty + sizeY is exactly the
  // visible top face for every kind — solid, wall, hammer, or top-only.
  const topZ = mat === 'water' ? ty + height : ty + sizeY;

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
    topOnly: topOnly || undefined,
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
  const [sx, sy, sz] = stairs.position;
  const yaw = ((stairs.rotation?.[1] ?? 0) * Math.PI) / 180;
  // `foot` is an unscaled local size, multiplied by stairs.scale exactly
  // once below — see the matching fix/comment in entityToPad above.
  const foot =
    stairs.collisionSize ?? modelFootprint(stairs.model) ?? ([2, 2, 2] as [number, number, number]);
  const run = Math.max(1.2, foot[2] * Math.abs(stairs.scale[2]));
  const rise = Math.max(0.6, foot[1] * Math.abs(stairs.scale[1]));
  const width = Math.max(0.8, foot[0] * Math.abs(stairs.scale[0]));
  // Fixed step counts break on tall/steep stairs: e.g. 14 steps over a
  // 12-unit rise is ~0.86 per step, above LAND_STEP_CLIMB (0.75) — the
  // server can't smoothly climb/descend that seam. Scale up only when the
  // requested/default count would leave steps too tall — a named "stairs"
  // catalog prop is visually already discrete steps (not a smooth ramp), so
  // there's no benefit to subdividing further than that once each step is
  // already climbable in one motion; unlike rampEntityToSimPads (hand-tilted
  // solids meant to look like a continuous slope), this doesn't need the
  // extra visual-smoothness margin.
  const targetStepRise = LAND_STEP_CLIMB * 0.6;
  const n = Math.max(4, Math.min(64, Math.round(Math.max(steps, rise / targetStepRise))));
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
      // Each individual step must not block sideways or climbing the
      // staircase would mean bumping into every riser instead of walking
      // up — see the topOnly comment on resolveSolids in platformer-sim.ts.
      topOnly: true,
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
  // Only called from entityToCollisionPads, which is only reached for
  // entities that already passed the collision-eligibility filters upstream
  // (entityExportsAsPlatform / the legacy fallback) — this entity WILL
  // produce a solid pad either way. Gating this further on Material ===
  // 'solid' (or Hammer-only) meant a tilted prop with the default material,
  // or a non-Hammer catalog piece someone rotated by hand, silently fell
  // back to entityToPad's flat yaw-only AABB instead of the accurate sloped
  // pad below — "some ramps work, some don't" depending on a checkbox that
  // has nothing to do with whether the mesh is actually tilted.
  const pitch = Math.abs(e.rotation?.[0] ?? 0);
  const roll = Math.abs(e.rotation?.[2] ?? 0);
  // A few degrees of tolerance so slightly-off-axis walls don't get
  // needlessly subdivided; a real ramp is tilted well past that.
  return pitch > 3 || roll > 3;
}

/**
 * Hammer "Wedge" / "Ramp" primitives (see hammer-shapes.ts makeHammerGeometry)
 * have an intrinsically sloped top face — rising from y=0 at the back edge to
 * y=height at the front edge — baked into the mesh itself, with ZERO entity
 * rotation required. `isTiltedRampSolid` only looks at e.rotation pitch/roll,
 * so a flat-placed Wedge/Ramp fell straight through to `entityToPad`'s single
 * flat AABB: the mesh looks sloped but the collision box was flat, so the
 * player's feet floated above (or clipped into) the visible slope depending
 * on where they stood. This fits the SAME slope the mesh actually has instead
 * of assuming rotation is the only way a solid can be tilted.
 */
function isWedgeRampPrimitive(e: EditorEntity): boolean {
  return isHammerSolidEntity(e) && (e.primitive === 'wedge' || e.primitive === 'ramp');
}

function wedgePrimitiveToSimPads(e: EditorEntity): SimPlatformBlueprint[] {
  const [ex, ey, ez] = e.position;
  const size = (e.collisionSize ?? [2, 1, 2]) as [number, number, number];
  const halfX = Math.max(0.15, (size[0] * Math.abs(e.scale[0])) / 2);
  const fullY = Math.max(0.12, size[1] * Math.abs(e.scale[1]));
  const halfZ = Math.max(0.15, (size[2] * Math.abs(e.scale[2])) / 2);
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

  // Mesh rises from local y=0 at z=-halfZ (back) to y=fullY at z=+halfZ
  // (front ridge), flat across x — see makeHammerGeometry's wedge/ramp case.
  // Fit the exact plane through 3 points on that slope, same technique
  // rampEntityToSimPads uses for hand-rotated blocks, but using this mesh's
  // OWN known slope as the local top face instead of assuming a flat
  // y=halfY top that only tilts from rotation.
  const [dx0, dy0, dz0] = rotateLocalXYZ([0, fullY / 2, 0], rotDeg);
  const [dx1, dy1, dz1] = rotateLocalXYZ([halfX, fullY / 2, 0], rotDeg);
  const [dx2, dy2, dz2] = rotateLocalXYZ([0, fullY, halfZ], rotDeg);
  const ax = dx1 - dx0, ay = dy1 - dy0, az = dz1 - dz0;
  const bx = dx2 - dx0, by = dy2 - dy0, bz = dz2 - dz0;
  const det = ax * bz - bx * az;
  const gThreeX = Math.abs(det) > 1e-6 ? (ay * bz - by * az) / det : 0;
  const gThreeZ = Math.abs(det) > 1e-6 ? (ax * by - bx * ay) / det : 0;
  const slopeGradX = gThreeZ;
  const slopeGradY = gThreeX;

  let minThreeX = Infinity, maxThreeX = -Infinity;
  let minThreeZ = Infinity, maxThreeZ = -Infinity;
  for (const sy of [0, fullY]) {
    for (const sx of [-halfX, halfX]) {
      for (const sz of [-halfZ, halfZ]) {
        const [rx, , rz] = rotateLocalXYZ([sx, sy, sz], rotDeg);
        minThreeX = Math.min(minThreeX, ex + rx);
        maxThreeX = Math.max(maxThreeX, ex + rx);
        minThreeZ = Math.min(minThreeZ, ez + rz);
        maxThreeZ = Math.max(maxThreeZ, ez + rz);
      }
    }
  }
  const centerThreeY = ey + dy0;

  return [
    {
      x: (minThreeZ + maxThreeZ) / 2,
      y: (minThreeX + maxThreeX) / 2,
      z: centerThreeY,
      width: Math.max(0.4, maxThreeZ - minThreeZ),
      depth: Math.max(0.4, maxThreeX - minThreeX),
      kind,
      // Sloped surface, not a wall — see the topOnly comment on
      // resolveSolids in platformer-sim.ts.
      topOnly: true,
      height: 0.3,
      slopeGradX,
      slopeGradY,
    },
  ];
}

/**
 * Subdivide a tilted solid into N thin flat pads that follow its slope, the
 * same trick `stairEntityToSimPads` uses for named stair/ramp props — but
 * driven by the entity's ACTUAL rotation instead of requiring a specific
 * catalog model name, so any hand-tilted block works as a walkable ramp.
 */
export function rampEntityToSimPads(e: EditorEntity, _steps = 24): SimPlatformBlueprint[] {
  const [ex, ey, ez] = e.position;
  // `foot` is an unscaled local size, multiplied by e.scale exactly once
  // below — see the matching fix/comment in entityToPad above.
  const foot = e.collisionSize ?? modelFootprint(e.model) ?? ([2, 2, 2] as [number, number, number]);
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

  // Hammer solids are bottom-aligned — the entity's position/pivot IS the
  // box's bottom face (local y runs 0..fullY), not its center — see
  // makeHammerSolidObject in hammer-shapes.ts (mesh.position.y = size[1]*0.5
  // inside a group planted at ent.position) and the same convention already
  // used by entityToPad (`topZ = ty + sizeY` for Hammer). Using the
  // center-pivot assumption (top face at local y=+halfY) here for a
  // bottom-aligned mesh silently offset the fitted plane by halfY — a 45°
  // Hammer box built as a ramp got a collision surface floating/sunk by
  // roughly half its own thickness relative to what it visually looks like.
  const bottomAligned = isHammerSolidEntity(e);
  const yMin = bottomAligned ? 0 : -halfY;
  const yMax = bottomAligned ? 2 * halfY : halfY;
  const topLocalY = yMax;

  // A rigid box's top face stays perfectly flat no matter how it's rotated —
  // approximating it with N discrete flat shelves (the old approach) always
  // reads as walking up/down stairs no matter how thin the shelves get,
  // since the player's height still snaps between a finite set of levels.
  // Instead: fit the EXACT plane equation for the top face (3 points fully
  // determine a plane) and hand the server one continuous sloped surface —
  // mathematically zero stepping, not just less of it.
  const [dx0, dy0, dz0] = rotateLocalXYZ([0, topLocalY, 0], rotDeg);
  const [dx1, dy1, dz1] = rotateLocalXYZ([halfX, topLocalY, 0], rotDeg);
  const [dx2, dy2, dz2] = rotateLocalXYZ([0, topLocalY, halfZ], rotDeg);
  // Deltas from center, in world/three space.
  const ax = dx1 - dx0, ay = dy1 - dy0, az = dz1 - dz0;
  const bx = dx2 - dx0, by = dy2 - dy0, bz = dz2 - dz0;
  const det = ax * bz - bx * az;
  // dY/d(threeX) and dY/d(threeZ) solved from the 2x2 system; a near-zero
  // det means the "top" face is actually vertical (this block is really a
  // wall someone tilted almost 90°, not a walkable ramp) — treat as flat
  // rather than divide by ~0.
  const gThreeX = Math.abs(det) > 1e-6 ? (ay * bz - by * az) / det : 0;
  const gThreeZ = Math.abs(det) > 1e-6 ? (ax * by - bx * ay) / det : 0;
  // Sim convention: x=three.z, y=three.x, z(height)=three.y (see threeToSim).
  const slopeGradX = gThreeZ;
  const slopeGradY = gThreeX;

  // Footprint: axis-aligned bounding box of all 8 corners (top+bottom),
  // same technique already used elsewhere for rotated solids — a single
  // honest AABB is fine for the walkable-region check, only the HEIGHT
  // needs to be exact (handled above), not the footprint shape.
  let minThreeX = Infinity, maxThreeX = -Infinity;
  let minThreeZ = Infinity, maxThreeZ = -Infinity;
  for (const sy of [yMin, yMax]) {
    for (const sx of [-halfX, halfX]) {
      for (const sz of [-halfZ, halfZ]) {
        const [rx, , rz] = rotateLocalXYZ([sx, sy, sz], rotDeg);
        minThreeX = Math.min(minThreeX, ex + rx);
        maxThreeX = Math.max(maxThreeX, ex + rx);
        minThreeZ = Math.min(minThreeZ, ez + rz);
        maxThreeZ = Math.max(maxThreeZ, ez + rz);
      }
    }
  }
  const centerThreeY = ey + dy0;

  return [
    {
      x: (minThreeZ + maxThreeZ) / 2,
      y: (minThreeX + maxThreeX) / 2,
      z: centerThreeY,
      width: Math.max(0.4, maxThreeZ - minThreeZ),
      depth: Math.max(0.4, maxThreeX - minThreeX),
      kind,
      // A walkable ramp shouldn't also act as a flat-vertical-range side
      // wall (resolveSolids' box check would be wrong for a sloped surface)
      // — see the topOnly comment there.
      topOnly: true,
      height: 0.3,
      slopeGradX,
      slopeGradY,
    },
  ];
}

/**
 * Baked Subtract/Union result — pads are pre-computed local boxes (see
 * `EditorEntity.csgPads`), not re-derived from the mesh at runtime (this
 * project has no general triangle-mesh collision solver).
 */
function localPadsToSimPads(e: EditorEntity, pads: CsgLocalPad[]): SimPlatformBlueprint[] {
  if (!pads.length) return [];
  const [ex, ey, ez] = e.position;
  const baseYaw = ((e.rotation?.[1] ?? 0) * Math.PI) / 180;
  const sx = Math.abs(e.scale[0]);
  const sy = Math.abs(e.scale[1]);
  const sz = Math.abs(e.scale[2]);
  const mat = resolveCollideMaterial(e);
  let kind: SimPlatformKind = 'solid';
  if (mat === 'ice') kind = 'ice';
  else if (mat === 'water') kind = 'water';
  else if (mat === 'sand') kind = 'sand';
  const cos = Math.cos(baseYaw);
  const sin = Math.sin(baseYaw);
  return pads.map((p) => {
    const lcx = p.cx * sx;
    const lcy = p.cy * sy;
    const lcz = p.cz * sz;
    const wx = ex + (lcx * cos + lcz * sin);
    const wz = ez + (-lcx * sin + lcz * cos);
    const wy = ey + lcy;
    // Baked boxes (mesh-voxelize / CSG) built before the seam-skin fix have
    // their old exact-touching half-extents cached on the entity forever —
    // re-baking is the only way to change the stored pads, but every map
    // must work without that manual step. Pad here, at the final sim-pad
    // conversion every baked pad (fresh or years-old) always passes
    // through, so old saved maps get the fix for free.
    const SEAM_SKIN = kind === 'solid' ? 0.03 : 0;
    const hx = Math.max(0.05, p.hx * sx) + SEAM_SKIN;
    // Side-collision (resolveSolids, platformer-sim.ts) used to ignore any
    // pad whose height was <= 0.35 (inferred "thin floor slab, top-only by
    // design"), so a baked mesh-collision box for a genuinely short Solid
    // prop (a slab, a low crate) got floored to a minimum 0.4m tall here to
    // avoid falling under that cutoff — which pushed its top surface up to
    // half that (0.2m) above the real mesh, "floating" the player standing
    // on it. resolveSolids now keys off an explicit topOnly flag instead of
    // height (these baked pads never set it — a baked box is always a real
    // full-volume solid), so that workaround is gone: just the real
    // measured half-height, with a tiny floor for degenerate zero-thickness
    // voxels.
    const hy = Math.max(0.02, p.hy * sy);
    const hz = Math.max(0.05, p.hz * sz) + SEAM_SKIN;
    return {
      x: wz,
      y: wx,
      z: wy + hy,
      width: hz * 2,
      depth: hx * 2,
      height: hy * 2,
      kind,
      rotYaw: baseYaw + (p.yaw ?? 0),
      entityId: e.id,
    };
  });
}

function entityToCollisionPads(e: EditorEntity): SimPlatformBlueprint[] {
  // Spawn cones / action gizmos must never produce collision. Checkpoints
  // are the exception: they stay invisible in overlay but export a thin
  // top-only pad so Deathrun / Play Test can save a respawn.
  if (isInvisibleMarkerKind(e.kind) && e.kind !== 'checkpoint') return [];
  if (resolveCollideMaterial(e) === 'walkthrough') return [];
  if (e.csgOp && e.csgPads) return localPadsToSimPads(e, e.csgPads);
  // "Bake mesh collision" result on a catalog prop (see mesh-voxelize.ts) —
  // a voxel-approximated multi-box fit to the real mesh, so a concave/hollow
  // shape (an arch, a doorway opening) doesn't collide as its full bounding
  // box. Low sample resolution combined with a heavily non-uniform-scaled
  // instance can leave real gaps in the approximation (see VOXEL_RESOLUTION
  // in mesh-voxelize.ts) — that's fixed at the source (higher resolution, plus
  // a VOXELIZER_VERSION bump that makes every cached bake stale so Play Test
  // re-fits it, see bakeAllSolidMeshCollision in map-editor.tsx), not by
  // discarding the approximation here.
  if (e.meshCollisionPads?.length) return localPadsToSimPads(e, e.meshCollisionPads);
  const model = e.model ?? '';
  if (model.includes('stair') || model.includes('ramp')) {
    return stairEntityToSimPads(e, 14);
  }
  if (isWedgeRampPrimitive(e)) {
    return wedgePrimitiveToSimPads(e);
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
        // Door respects its own Material choice like everywhere else now —
        // it used to be force-excluded here too, compounding the same bug
        // fixed in entityExportsAsPlatform (Solid dropdown doing nothing).
        resolveCollideMaterial(e) !== 'walkthrough' &&
        !e.model.startsWith('wall') &&
        !e.model.startsWith('column') &&
        !e.model.startsWith('pipe') &&
        !e.model.startsWith('figurine') &&
        !e.model.startsWith('button')
    );
  }

  const runner =
    doc.entities.find((e) => e.kind === 'start') ??
    doc.entities.find((e) => e.kind === 'spawn_runner') ??
    doc.entities.find((e) => e.kind === 'player');
  const doorControlledIds = collectActivatorControlledDoorIds(doc);
  const pads = source.flatMap((e) => {
    const basePads = entityToCollisionPads(e);
    if (e.kind !== 'door' || !doorControlledIds.has(e.id)) return basePads;
    return basePads.map((p) => ({ ...p, doorControlled: true }));
  });

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
        let width = Math.max(0.4, sw * Math.abs(e.scale[2]));
        let depth = Math.max(0.4, sd * Math.abs(e.scale[0]));
        let height = Math.max(0.4, sh * Math.abs(e.scale[1]));
        // Sweep AABB of the spin plane so a rotating bar still hits at every angle.
        if (spin.axis === 'x') {
          const r = Math.max(depth, height);
          depth = r;
          height = r;
        } else if (spin.axis === 'z') {
          const r = Math.max(width, height);
          width = r;
          height = r;
        } else {
          const r = Math.max(width, depth);
          width = r;
          depth = r;
        }
        return {
          id: e.id,
          kind: 'saw' as const,
          x: tz,
          y: tx,
          z: ty,
          width,
          depth,
          height,
          damage: spin.instantKill ? 9999 : Math.max(1, spin.damage),
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
      const width = Math.max(0.4, Math.abs(e.scale[2]) * 2);
      const depth = Math.max(0.4, Math.abs(e.scale[0]) * 2);
      const height = Math.max(0.4, Math.abs(e.scale[1]) * 2);
      const mode = hz.mode ?? (e.kind === 'trap' ? 'timed' : 'always');
      return {
        id: e.id,
        kind: hz.obstacleKind ?? (e.kind === 'trap' ? 'spike' : 'damage'),
        x: tz,
        y: tx,
        z: ty,
        width,
        depth,
        height,
        damage: hz.instantKill ? 9999 : Math.max(1, hz.damage),
        intervalMs: Math.max(100, hz.intervalMs),
        activeMs: Math.max(100, hz.activeMs ?? (mode === 'timed' ? 900 : 1500)),
        alwaysActive: mode === 'always',
        buttonControlled: mode === 'button',
        instantKill: hz.instantKill,
      };
    });
}

export type MapPluginEntitySim = {
  id: string;
  pluginScript: string;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
};

/** Entities with a plugin script, already converted to sim-space AABBs. */
export function mapDocPluginEntities(doc: MapDocument): MapPluginEntitySim[] {
  return doc.entities
    .filter((e) => e.visible !== false && Boolean(e.pluginScript))
    .map((e) => {
      const [tx, ty, tz] = e.position;
      return {
        id: e.id,
        pluginScript: String(e.pluginScript),
        x: tz,
        y: tx,
        z: ty,
        hx: Math.max(0.4, Math.abs((e.collisionSize?.[2] ?? e.scale[2] * 2) / 2)),
        hy: Math.max(0.4, Math.abs((e.collisionSize?.[0] ?? e.scale[0] * 2) / 2)),
        hz: Math.max(0.4, Math.abs((e.collisionSize?.[1] ?? e.scale[1] * 2) / 2)),
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

/**
 * Ids an activator (Button or Action) triggers: explicit `activatesEntityIds`
 * plus reverse `listenToEntityId` wiring (any entity listening to this one).
 */
function resolveActivatorTargetIds(doc: MapDocument, activator: EditorEntity): string[] {
  const targets = activator.animation?.activatesEntityIds ?? [];
  const listeners = doc.entities
    .filter((o) => o.animation?.listenToEntityId === activator.id)
    .map((o) => o.id);
  return Array.from(new Set([...targets, ...listeners]));
}

/** Ids of Door entities wired to (at least) one Button or Action — see mapDocToSimPlatforms. */
function collectActivatorControlledDoorIds(doc: MapDocument): Set<string> {
  const ids = new Set<string>();
  for (const e of doc.entities) {
    if (e.kind !== 'button' && e.kind !== 'action') continue;
    for (const id of resolveActivatorTargetIds(doc, e)) ids.add(id);
  }
  const doorIds = new Set(doc.entities.filter((e) => e.kind === 'door').map((e) => e.id));
  for (const id of Array.from(ids)) {
    if (!doorIds.has(id)) ids.delete(id);
  }
  return ids;
}

/**
 * How long a button / action keeps its targets armed.
 *
 * Every room resolves this as `zone.holdMs > 0 ? zone.holdMs : obs.activeMs`,
 * so hardcoding a non-zero holdMs here made the authored per-trap "stays ON"
 * duration (`hazard.activeMs`) unreachable — the trap editor's Active ms field
 * did nothing for button-wired traps. Prefer the authored value, and fall back
 * to the previous constant when no target has one so unauthored maps behave
 * exactly as before. The longest target wins, since one value covers them all
 * and a shorter hold would cut the slower trap short.
 */
function resolveActivatorHoldMs(
  doc: MapDocument,
  targetIds: string[],
  fallbackMs: number
): number {
  let authored = 0;
  for (const id of targetIds) {
    const target = doc.entities.find((e) => e.id === id);
    const activeMs = target?.hazard?.activeMs;
    if (typeof activeMs === 'number' && activeMs > 0) authored = Math.max(authored, activeMs);
  }
  return authored > 0 ? authored : fallbackMs;
}

/** Cooldown between presses. Not author-controlled yet — no UI exposes it. */
const BUTTON_PRESS_COOLDOWN_MS = 600;
const ACTION_TRIGGER_COOLDOWN_MS = 500;
const BUTTON_DEFAULT_HOLD_MS = 2500;
const ACTION_DEFAULT_HOLD_MS = 2000;

export function mapDocToSimButtons(doc: MapDocument): SimButtonBlueprint[] {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'button')
    .map((e) => {
      const anim = e.animation;
      const [tx, ty, tz] = e.position;
      const activatesObstacleIds = resolveActivatorTargetIds(doc, e);
      return {
        id: e.id,
        x: tz,
        y: tx,
        z: ty,
        radius: Math.max(1.2, anim?.radius ?? 2.5),
        activatesObstacleIds,
        holdMs: resolveActivatorHoldMs(doc, activatesObstacleIds, BUTTON_DEFAULT_HOLD_MS),
        cooldownMs: BUTTON_PRESS_COOLDOWN_MS,
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
      const activatesObstacleIds = resolveActivatorTargetIds(doc, e);
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
        holdMs: resolveActivatorHoldMs(doc, activatesObstacleIds, ACTION_DEFAULT_HOLD_MS),
        cooldownMs: ACTION_TRIGGER_COOLDOWN_MS,
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
  const teamA = doc.entities.find((e) => e.kind === 'spawn_team_a');
  const teamB = doc.entities.find((e) => e.kind === 'spawn_team_b');
  const toSim = (e?: EditorEntity) =>
    e ? { x: e.position[2], y: e.position[0], z: e.position[1] } : null;
  return {
    runner: toSim(runner),
    trapper: toSim(trapper),
    teamA: toSim(teamA),
    teamB: toSim(teamB),
  };
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

/**
 * Per-wave difficulty overrides — a Wave Anchor placed in the editor targets
 * one wave number and scales that wave's monster count/stats on top of the
 * mode-wide difficultyScale. (Wave gating itself still comes from each
 * spawn_monster's own waveMin/waveMax — anchors are a difficulty dial, not a
 * spatial zone.)
 */
export function mapDocWaveAnchors(doc: MapDocument): { waveNumber: number; difficultyMultiplier: number }[] {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'wave_anchor')
    .map((e) => {
      const wa = ensureWaveAnchor(e);
      return {
        waveNumber: Math.max(1, Math.round(wa.waveNumber)),
        difficultyMultiplier: Math.max(0.1, wa.difficultyMultiplier),
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
        maxHealPercent: e.healthFloor?.maxHealPercent ?? 100,
      })
    );
}

export function mapDocRedZones(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'red_zone')
    .map((e) =>
      padZoneFromEntity(e, {
        // Matches the hazard/obstacle convention above: instant kill is carried
        // as a flag AND a lethal damage value, so a server that only reads
        // `damagePerTick` still kills.
        damagePerTick: e.redZone?.instantKill ? 9999 : e.redZone?.damagePerTick ?? 15,
        intervalMs: e.redZone?.intervalMs ?? 500,
        instantKill: e.redZone?.instantKill ? 1 : 0,
      })
    );
}

export function mapDocRevivePads(doc: MapDocument) {
  return doc.entities
    .filter((e) => e.visible !== false && e.kind === 'revive_pad')
    .map((e) =>
      padZoneFromEntity(e, {
        reviveTimeMs: e.revive?.reviveTimeMs ?? 4000,
        capacity: e.revive?.capacity ?? 1,
      })
    );
}
