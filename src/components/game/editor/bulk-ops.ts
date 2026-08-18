import { cloneEntity, generateId } from './map-document';
import type { EditorEntity } from './map-document';
import { rotatePoseAroundPivot } from './selection-transform';
import type { Vec3 } from './selection-transform';

export type Axis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** The two axes spanning the plane perpendicular to `axis`. */
function planeAxes(axis: Axis): [0 | 1 | 2, 0 | 1 | 2] {
  const ai = AXIS_INDEX[axis];
  return ai === 0 ? [1, 2] : ai === 1 ? [0, 2] : [0, 1];
}

/** Where a bulk op measures from, per axis. */
export type AlignEdge = 'min' | 'center' | 'max';

/**
 * Half-extent of an entity along each world axis, ignoring rotation.
 *
 * Bulk ops only need this to butt copies against each other and to align on
 * bounds, both of which stay predictable with an axis-aligned approximation —
 * the OBB maths in `selection-transform.ts` is reserved for snapping, where a
 * rotated face has to line up exactly.
 */
export function entityHalfExtents(ent: EditorEntity): Vec3 {
  const size = ent.collisionSize ?? [1, 1, 1];
  return [
    (Math.abs(size[0]) * Math.abs(ent.scale[0])) / 2,
    (Math.abs(size[1]) * Math.abs(ent.scale[1])) / 2,
    (Math.abs(size[2]) * Math.abs(ent.scale[2])) / 2,
  ];
}

/** Bounding box of a set of entities, as min/max corners plus the center. */
export function selectionBounds(entities: EditorEntity[]): { min: Vec3; max: Vec3; center: Vec3 } {
  if (!entities.length) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const ent of entities) {
    const h = entityHalfExtents(ent);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], ent.position[i] - h[i]);
      max[i] = Math.max(max[i], ent.position[i] + h[i]);
    }
  }
  return {
    min,
    max,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  };
}

/**
 * Deep-copy a cluster of entities, rewiring every reference that points inside
 * the cluster to the copy instead of the original.
 *
 * Without the rewiring a duplicated button/trap pair keeps pointing at the
 * originals, so pressing the new button arms the old trap.
 */
export function copyEntityCluster(
  sources: EditorEntity[],
  opts: { nameSuffix?: string; groupId?: string } = {}
): EditorEntity[] {
  const idMap = new Map<string, string>();
  for (const src of sources) idMap.set(src.id, generateId());
  const groupMap = new Map<string, string>();

  return sources.map((src) => {
    const copy = cloneEntity(src);
    copy.id = idMap.get(src.id)!;
    copy.name = opts.nameSuffix ? `${src.name} ${opts.nameSuffix}` : src.name;
    copy.locked = false;
    copy.position = [...src.position] as Vec3;

    if (opts.groupId) {
      copy.groupId = opts.groupId;
    } else if (src.groupId) {
      if (!groupMap.has(src.groupId)) groupMap.set(src.groupId, generateId('grp'));
      copy.groupId = groupMap.get(src.groupId);
    }

    if (copy.animation?.listenToEntityId && idMap.has(copy.animation.listenToEntityId)) {
      copy.animation.listenToEntityId = idMap.get(copy.animation.listenToEntityId);
    }
    if (copy.animation?.activatesEntityIds?.length) {
      copy.animation.activatesEntityIds = copy.animation.activatesEntityIds.map(
        (id) => idMap.get(id) ?? id
      );
    }
    if (copy.teleport?.targetEntityId && idMap.has(copy.teleport.targetEntityId)) {
      copy.teleport = { ...copy.teleport, targetEntityId: idMap.get(copy.teleport.targetEntityId) };
    }
    return copy;
  });
}

/** Each array step copies the whole selection, so multi-object steps stay grouped. */
function stepGroupId(selection: EditorEntity[]): string | undefined {
  return selection.length > 1 ? generateId('grp') : undefined;
}

export type LinearArrayParams = {
  /** Copies to create, not counting the original. */
  count: number;
  /** Per-step world offset. */
  offset: Vec3;
  /** Per-step rotation in degrees, accumulated. */
  rotationStep?: Vec3;
  /** Per-step scale multiplier, compounded. */
  scaleStep?: Vec3;
};

/**
 * `count` copies marching away from the selection along `offset`.
 *
 * Returns only the new entities; the caller appends them in one go so a single
 * undo step covers the whole array.
 */
export function linearArray(selection: EditorEntity[], params: LinearArrayParams): EditorEntity[] {
  const count = Math.max(0, Math.floor(params.count));
  if (!selection.length || count === 0) return [];

  const out: EditorEntity[] = [];
  for (let step = 1; step <= count; step++) {
    const copies = copyEntityCluster(selection, {
      nameSuffix: `${step}`,
      groupId: stepGroupId(selection),
    });
    for (const copy of copies) {
      copy.position = [
        copy.position[0] + params.offset[0] * step,
        copy.position[1] + params.offset[1] * step,
        copy.position[2] + params.offset[2] * step,
      ];
      if (params.rotationStep) {
        copy.rotation = [
          copy.rotation[0] + params.rotationStep[0] * step,
          copy.rotation[1] + params.rotationStep[1] * step,
          copy.rotation[2] + params.rotationStep[2] * step,
        ];
      }
      if (params.scaleStep) {
        copy.scale = [
          copy.scale[0] * params.scaleStep[0] ** step,
          copy.scale[1] * params.scaleStep[1] ** step,
          copy.scale[2] * params.scaleStep[2] ** step,
        ];
      }
    }
    out.push(...copies);
  }
  return out;
}

export type RadialArrayParams = {
  /** Pieces in the ring, counting the original. */
  count: number;
  axis: Axis;
  /** Ring center in world space. */
  center: Vec3;
  /**
   * Distance from the center to place the ring on. Omit to spin the selection
   * around the center from wherever it already sits.
   */
  radius?: number;
  /** Sweep in degrees; 360 wraps, so the last copy stops short of the original. */
  arcDeg?: number;
};

/**
 * A ring of copies around `center`. The original stays put and counts as the
 * first piece, so `count: 8` produces 7 copies.
 */
export function radialArray(selection: EditorEntity[], params: RadialArrayParams): EditorEntity[] {
  const count = Math.max(0, Math.floor(params.count));
  if (!selection.length || count < 2) return [];

  const arc = params.arcDeg ?? 360;
  const wraps = Math.abs(arc - 360) < 1e-6;
  const stepDeg = wraps ? arc / count : arc / (count - 1);
  const ai = AXIS_INDEX[params.axis];
  const [u, v] = planeAxes(params.axis);

  // One rigid in-plane nudge for the whole cluster, so its internal layout and
  // its heading relative to the center survive the seeding.
  const seed: Vec3 = [0, 0, 0];
  if (params.radius !== undefined) {
    const pivot = selectionBounds(selection).center;
    const du = pivot[u] - params.center[u];
    const dv = pivot[v] - params.center[v];
    const len = Math.hypot(du, dv);
    const [nu, nv] = len > 1e-6 ? [du / len, dv / len] : [1, 0];
    seed[u] = params.center[u] + nu * params.radius - pivot[u];
    seed[v] = params.center[v] + nv * params.radius - pivot[v];
  }

  const out: EditorEntity[] = [];
  for (let step = 1; step < count; step++) {
    const copies = copyEntityCluster(selection, {
      nameSuffix: `${step}`,
      groupId: stepGroupId(selection),
    });
    const deltaDeg: Vec3 = [0, 0, 0];
    deltaDeg[ai] = stepDeg * step;
    for (const copy of copies) {
      const start: Vec3 = [
        copy.position[0] + seed[0],
        copy.position[1] + seed[1],
        copy.position[2] + seed[2],
      ];
      const posed = rotatePoseAroundPivot(start, copy.rotation, params.center, deltaDeg);
      copy.position = posed.position;
      copy.rotation = posed.rotation;
    }
    out.push(...copies);
  }
  return out;
}

/**
 * Orientation of a piece after reflecting the world across the plane normal to
 * `axis`.
 *
 * Conjugating a rotation by a reflection is still a rotation, and for XYZ Euler
 * angles it works out to negating the two angles that are not about the mirror
 * axis. Note this mirrors the *pose*, not the mesh: a truly asymmetric piece
 * would need negative scale, which inverts face winding and breaks lighting, so
 * we deliberately don't.
 */
export function mirroredRotation(rotation: Vec3, axis: Axis): Vec3 {
  if (axis === 'x') return [rotation[0], -rotation[1], -rotation[2]];
  if (axis === 'y') return [-rotation[0], rotation[1], -rotation[2]];
  return [-rotation[0], -rotation[1], rotation[2]];
}

/**
 * Mirror across the world plane through `pivot` normal to `axis`.
 *
 * The toolbar's `flip` rotates 180° in place, which is not a mirror — it can't
 * produce the opposite-hand piece a symmetrical level needs.
 */
export function mirrorSelection(
  selection: EditorEntity[],
  axis: Axis,
  pivot: Vec3,
  opts: { copy?: boolean } = {}
): { added: EditorEntity[]; updated: EditorEntity[] } {
  const copy = opts.copy !== false;
  const targets = copy
    ? copyEntityCluster(selection, { nameSuffix: 'Mirror', groupId: stepGroupId(selection) })
    : selection.map((e) => ({ ...e }));
  const ai = AXIS_INDEX[axis];

  for (const ent of targets) {
    const pos: Vec3 = [...ent.position] as Vec3;
    pos[ai] = 2 * pivot[ai] - pos[ai];
    ent.position = pos;
    ent.rotation = mirroredRotation(ent.rotation, axis);
  }

  return copy ? { added: targets, updated: [] } : { added: [], updated: targets };
}

/** Move every entity so the chosen edge of its box lines up on one axis. */
export function alignSelection(
  selection: EditorEntity[],
  axis: Axis,
  edge: AlignEdge
): EditorEntity[] {
  if (selection.length < 2) return [];
  const ai = AXIS_INDEX[axis];
  const bounds = selectionBounds(selection);
  const target =
    edge === 'min' ? bounds.min[ai] : edge === 'max' ? bounds.max[ai] : bounds.center[ai];

  return selection.map((ent) => {
    const h = entityHalfExtents(ent)[ai];
    const pos: Vec3 = [...ent.position] as Vec3;
    pos[ai] = edge === 'min' ? target + h : edge === 'max' ? target - h : target;
    return { ...ent, position: pos };
  });
}

/**
 * Even spacing between the two outermost entities on one axis. The extremes stay
 * put; everything between them is redistributed in its current order.
 */
export function distributeSelection(selection: EditorEntity[], axis: Axis): EditorEntity[] {
  if (selection.length < 3) return [];
  const ai = AXIS_INDEX[axis];
  const ordered = [...selection].sort((a, b) => a.position[ai] - b.position[ai]);
  const first = ordered[0].position[ai];
  const step = (ordered[ordered.length - 1].position[ai] - first) / (ordered.length - 1);

  return ordered.map((ent, i) => {
    const pos: Vec3 = [...ent.position] as Vec3;
    pos[ai] = first + step * i;
    return { ...ent, position: pos };
  });
}

export type RandomizeParams = {
  /** Max rotation jitter per axis, in degrees. */
  rotationDeg?: Vec3;
  /** Max scale jitter per axis, as a fraction (0.2 → ±20%). */
  scaleFraction?: Vec3;
  /** Max position jitter per axis, in world units. */
  positionJitter?: Vec3;
};

/**
 * Jitter rotation, scale and position within a range, for prop scatter that
 * doesn't look stamped. `random` is injectable so results can be asserted.
 */
export function randomizeSelection(
  selection: EditorEntity[],
  params: RandomizeParams,
  random: () => number = Math.random
): EditorEntity[] {
  const signed = () => random() * 2 - 1;
  return selection.map((ent) => {
    const next = { ...ent };
    if (params.rotationDeg) {
      next.rotation = [
        ent.rotation[0] + signed() * params.rotationDeg[0],
        ent.rotation[1] + signed() * params.rotationDeg[1],
        ent.rotation[2] + signed() * params.rotationDeg[2],
      ];
    }
    if (params.scaleFraction) {
      next.scale = [
        Math.max(0.01, ent.scale[0] * (1 + signed() * params.scaleFraction[0])),
        Math.max(0.01, ent.scale[1] * (1 + signed() * params.scaleFraction[1])),
        Math.max(0.01, ent.scale[2] * (1 + signed() * params.scaleFraction[2])),
      ];
    }
    if (params.positionJitter) {
      next.position = [
        ent.position[0] + signed() * params.positionJitter[0],
        ent.position[1] + signed() * params.positionJitter[1],
        ent.position[2] + signed() * params.positionJitter[2],
      ];
    }
    return next;
  });
}

/**
 * Per-step offset that butts array copies against each other along `axis`, with
 * an optional gap — saves measuring the selection by hand for the common "make a
 * wall out of these blocks" case.
 */
export function touchingStepOffset(selection: EditorEntity[], axis: Axis, gap = 0): Vec3 {
  const ai = AXIS_INDEX[axis];
  const bounds = selectionBounds(selection);
  const offset: Vec3 = [0, 0, 0];
  offset[ai] = bounds.max[ai] - bounds.min[ai] + gap;
  return offset;
}
