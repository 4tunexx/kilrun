import * as THREE from 'three';

export type Vec3 = [number, number, number];

export type SelectionTransformOp =
  | { type: 'rotateDelta'; deg: Vec3 }
  | { type: 'setYaw'; deg: number }
  | { type: 'flip'; axis: 'x' | 'y' | 'z' };

function eulerToQuat(rotDeg: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(rotDeg[0]),
      THREE.MathUtils.degToRad(rotDeg[1]),
      THREE.MathUtils.degToRad(rotDeg[2]),
      'XYZ'
    )
  );
}

function quatToEulerDeg(q: THREE.Quaternion): Vec3 {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

export function rotatePoseAroundPivot(
  position: Vec3,
  rotation: Vec3,
  pivot: Vec3,
  deltaDeg: Vec3
): { position: Vec3; rotation: Vec3 } {
  const offset = new THREE.Vector3(
    position[0] - pivot[0],
    position[1] - pivot[1],
    position[2] - pivot[2]
  );
  const axes = [
    Math.abs(deltaDeg[0]) > 1e-8,
    Math.abs(deltaDeg[1]) > 1e-8,
    Math.abs(deltaDeg[2]) > 1e-8,
  ];
  const singleAxis = axes.filter(Boolean).length === 1;
  // Single-axis 90/180 turns keep Euler components stable (no XYZ unwrap to
  // an equivalent [180,0,180] that later "set yaw" would misread).
  if (singleAxis) {
    const axis = axes[0] ? 'x' : axes[1] ? 'y' : 'z';
    const deg = axis === 'x' ? deltaDeg[0] : axis === 'y' ? deltaDeg[1] : deltaDeg[2];
    const unit =
      axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    offset.applyAxisAngle(unit, THREE.MathUtils.degToRad(deg));
    const nextRot: Vec3 = [rotation[0], rotation[1], rotation[2]];
    if (axis === 'x') nextRot[0] += deg;
    if (axis === 'y') nextRot[1] += deg;
    if (axis === 'z') nextRot[2] += deg;
    return {
      position: [pivot[0] + offset.x, pivot[1] + offset.y, pivot[2] + offset.z],
      rotation: nextRot,
    };
  }
  const delta = eulerToQuat(deltaDeg);
  offset.applyQuaternion(delta);
  const nextRot = delta.clone().multiply(eulerToQuat(rotation));
  return {
    position: [pivot[0] + offset.x, pivot[1] + offset.y, pivot[2] + offset.z],
    rotation: quatToEulerDeg(nextRot),
  };
}

/** 180° around a world axis through the pivot — works for one object or a group. */
export function flipPoseAroundPivot(
  position: Vec3,
  rotation: Vec3,
  pivot: Vec3,
  axis: 'x' | 'y' | 'z'
): { position: Vec3; rotation: Vec3 } {
  const delta: Vec3 = axis === 'x' ? [180, 0, 0] : axis === 'y' ? [0, 180, 0] : [0, 0, 180];
  return rotatePoseAroundPivot(position, rotation, pivot, delta);
}

export function applySelectionTransformOp(
  position: Vec3,
  rotation: Vec3,
  pivot: Vec3,
  op: SelectionTransformOp
): { position: Vec3; rotation: Vec3 } {
  if (op.type === 'rotateDelta') {
    return rotatePoseAroundPivot(position, rotation, pivot, op.deg);
  }
  if (op.type === 'setYaw') {
    const next = rotatePoseAroundPivot(position, rotation, pivot, [0, op.deg - rotation[1], 0]);
    return { position: next.position, rotation: [next.rotation[0], op.deg, next.rotation[2]] };
  }
  return flipPoseAroundPivot(position, rotation, pivot, op.axis);
}

export type SnapAabb = { c: Vec3; h: Vec3 };

/** Oriented box for drag-attach — `rotDeg` is the entity Euler in degrees. */
export type SnapObb = { c: Vec3; h: Vec3; rotDeg?: Vec3 };

function obbAxes(rotDeg?: Vec3): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const q = rotDeg ? eulerToQuat(rotDeg) : new THREE.Quaternion();
  return [
    new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    new THREE.Vector3(0, 0, 1).applyQuaternion(q),
  ];
}

function supportObb(o: SnapObb, dir: THREE.Vector3): number {
  const [ex, ey, ez] = obbAxes(o.rotDeg);
  return (
    Math.abs(ex.dot(dir)) * o.h[0] + Math.abs(ey.dot(dir)) * o.h[1] + Math.abs(ez.dot(dir)) * o.h[2]
  );
}

function facePlaneOverlaps(moving: SnapObb, anchor: SnapObb, dir: THREE.Vector3, slack: number): boolean {
  const mc = new THREE.Vector3(...moving.c);
  const ac = new THREE.Vector3(...anchor.c);
  const delta = mc.clone().sub(ac);
  for (const axis of obbAxes(anchor.rotDeg)) {
    if (Math.abs(axis.dot(dir)) > 0.85) continue;
    const sep = Math.abs(delta.dot(axis));
    if (sep > supportObb(anchor, axis) + supportObb(moving, axis) + slack) return false;
  }
  return true;
}

/**
 * Same idea as nearestFaceAttach, but faces follow each box's rotation so
 * tilted walls / ramps click together on the real face instead of the AABB.
 */
export function nearestObbFaceAttach(
  moving: SnapObb,
  anchors: SnapObb[],
  maxDist: number
): { c: Vec3; dist: number } | null {
  let best: { c: Vec3; dist: number } | null = null;
  const mc = new THREE.Vector3(...moving.c);
  for (const a of anchors) {
    const ac = new THREE.Vector3(...a.c);
    for (const axis of obbAxes(a.rotDeg)) {
      for (const sign of [1, -1] as const) {
        const dir = axis.clone().multiplyScalar(sign);
        const gap = mc.clone().sub(ac).dot(dir) - supportObb(a, dir) - supportObb(moving, dir);
        const dist = Math.abs(gap);
        if (dist > maxDist) continue;
        if (!facePlaneOverlaps(moving, a, dir, Math.max(0.35, maxDist * 0.5))) continue;
        const next = mc.clone().addScaledVector(dir, -gap);
        const cand = { c: [next.x, next.y, next.z] as Vec3, dist };
        if (!best || cand.dist < best.dist) best = cand;
      }
    }
  }
  return best;
}

/**
 * If `moving` is close enough to any anchor, return a new center that sits
 * flush on the nearest face (side or stack). Other axes stay put so you can
 * slide along a wall and still click on.
 */
export function nearestFaceAttach(
  moving: SnapAabb,
  anchors: SnapAabb[],
  maxDist: number
): { c: Vec3; dist: number } | null {
  let best: { c: Vec3; dist: number } | null = null;
  for (const a of anchors) {
    const cands: { c: Vec3; dist: number }[] = [
      {
        c: [a.c[0] + a.h[0] + moving.h[0], moving.c[1], moving.c[2]],
        dist: Math.abs(moving.c[0] - moving.h[0] - (a.c[0] + a.h[0])),
      },
      {
        c: [a.c[0] - a.h[0] - moving.h[0], moving.c[1], moving.c[2]],
        dist: Math.abs(a.c[0] - a.h[0] - (moving.c[0] + moving.h[0])),
      },
      {
        c: [moving.c[0], a.c[1] + a.h[1] + moving.h[1], moving.c[2]],
        dist: Math.abs(moving.c[1] - moving.h[1] - (a.c[1] + a.h[1])),
      },
      {
        c: [moving.c[0], a.c[1] - a.h[1] - moving.h[1], moving.c[2]],
        dist: Math.abs(a.c[1] - a.h[1] - (moving.c[1] + moving.h[1])),
      },
      {
        c: [moving.c[0], moving.c[1], a.c[2] + a.h[2] + moving.h[2]],
        dist: Math.abs(moving.c[2] - moving.h[2] - (a.c[2] + a.h[2])),
      },
      {
        c: [moving.c[0], moving.c[1], a.c[2] - a.h[2] - moving.h[2]],
        dist: Math.abs(a.c[2] - a.h[2] - (moving.c[2] + moving.h[2])),
      },
    ];
    for (const cand of cands) {
      if (cand.dist > maxDist) continue;
      if (!best || cand.dist < best.dist) best = cand;
    }
  }
  return best;
}
