/**
 * ZBrush-lite blob sculpt: add / remove / smooth on a skin mesh.
 * Add uses a coherent brush-region normal so clay piles without tearing holes.
 */
import * as THREE from 'three';
import type { SkinSculptBrush, SkinSculptData } from '@/lib/player-skins';

export interface SculptStrokeOptions {
  brush: SkinSculptBrush;
  /** World-space brush radius. */
  radius: number;
  /** 0–1 strength. */
  strength: number;
  /** Mirror dab across local X (left/right symmetry). */
  symmetryX?: boolean;
}

const _localHit = new THREE.Vector3();
const _vert = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _avg = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Apply one sculpt dab at a world-space hit point on the mesh.
 * Mutates geometry positions in place.
 */
export function applySculptStroke(
  mesh: THREE.Mesh,
  worldHit: THREE.Vector3,
  opts: SculptStrokeOptions
): boolean {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (!pos) return false;

  mesh.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  _localHit.copy(worldHit).applyMatrix4(inv);

  let changed = applySculptDabLocal(mesh, pos, geo, _localHit.clone(), opts);
  if (opts.symmetryX) {
    const mirrored = _localHit.clone();
    mirrored.x *= -1;
    changed = applySculptDabLocal(mesh, pos, geo, mirrored, opts) || changed;
  }

  if (changed) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return changed;
}

function applySculptDabLocal(
  mesh: THREE.Mesh,
  pos: THREE.BufferAttribute,
  geo: THREE.BufferGeometry,
  localHit: THREE.Vector3,
  opts: SculptStrokeOptions
): boolean {
  const sx = mesh.getWorldScale(_tmp).x || 1;
  const localRadius = Math.max(0.001, opts.radius / Math.max(0.001, Math.abs(sx)));
  const radiusSq = localRadius * localRadius;
  // Gentler per-dab so repeated Add piles clay instead of shredding faces.
  const strength = Math.max(0.01, Math.min(1, opts.strength)) * 0.045;

  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;

  const indices: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    _vert.fromBufferAttribute(pos, i);
    if (_vert.distanceToSquared(localHit) <= radiusSq) indices.push(i);
  }
  if (indices.length < 2) return false;

  let changed = false;

  if (opts.brush === 'smooth') {
    // Distance-weighted local laplacian — softens bumps without collapsing to a void.
    const originals = indices.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const cur = originals[k];
      _avg.set(0, 0, 0);
      let wSum = 0;
      for (let j = 0; j < indices.length; j++) {
        if (j === k) continue;
        const other = originals[j];
        const d = cur.distanceTo(other);
        if (d > localRadius || d < 1e-8) continue;
        const w = 1 - d / localRadius;
        _avg.addScaledVector(other, w * w);
        wSum += w * w;
      }
      if (wSum < 1e-6) continue;
      _avg.multiplyScalar(1 / wSum);
      const fall = 1 - Math.min(1, cur.distanceTo(localHit) / localRadius);
      const t = Math.min(0.45, strength * 1.6 * fall * fall);
      pos.setXYZ(
        i,
        cur.x + (_avg.x - cur.x) * t,
        cur.y + (_avg.y - cur.y) * t,
        cur.z + (_avg.z - cur.z) * t
      );
      changed = true;
    }
  } else {
    const sign = opts.brush === 'add' ? 1 : -1;
    // One coherent push direction for the whole dab (avoids inverted normals tearing holes).
    _avg.set(0, 0, 0);
    let nCount = 0;
    for (const i of indices) {
      _normal.fromBufferAttribute(nrm, i);
      if (!_normal.lengthSq()) continue;
      _avg.add(_normal);
      nCount += 1;
    }
    if (nCount > 0) _avg.normalize();
    else _avg.set(0, 1, 0);

    for (const i of indices) {
      _vert.fromBufferAttribute(pos, i);
      const d = _vert.distanceTo(localHit);
      const fall = 1 - d / localRadius;
      // Smooth clay falloff (cubic) — soft edges, solid mound in the center.
      const w = fall * fall * (3 - 2 * fall);

      // Blend region normal with gentle inflate so volume grows outward, not inward.
      _dir.copy(_vert).sub(localHit);
      if (_dir.lengthSq() < 1e-10) {
        _dir.copy(_avg);
      } else {
        _dir.normalize();
        // Prefer outward: if inflate points against the surface, flip it.
        if (_dir.dot(_avg) < 0) _dir.multiplyScalar(-1);
      }
      _dir.multiplyScalar(0.35).addScaledVector(_avg, 0.65).normalize();

      pos.setXYZ(
        i,
        _vert.x + _dir.x * strength * w * sign,
        _vert.y + _dir.y * strength * w * sign,
        _vert.z + _dir.z * strength * w * sign
      );
      changed = true;
    }
  }
  return changed;
}

export function readSculptData(mesh: THREE.Mesh): SkinSculptData | null {
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return null;
  return {
    positions: Array.from(pos.array as ArrayLike<number>),
    count: pos.count,
  };
}

export function applySculptDataToGeometry(
  geo: THREE.BufferGeometry,
  sculpt?: SkinSculptData | null
): boolean {
  if (!sculpt?.positions?.length) return false;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos || pos.count !== sculpt.count) return false;
  if (sculpt.positions.length !== pos.array.length) return false;
  (pos.array as Float32Array).set(sculpt.positions);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return true;
}

/** Find first Mesh under an object (for sculpt target). */
export function findSculptMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (found) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) found = m;
  });
  return found;
}
