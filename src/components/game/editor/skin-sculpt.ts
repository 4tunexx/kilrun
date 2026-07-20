/**
 * ZBrush-lite blob sculpt: add / remove / smooth on a skin mesh.
 */
import * as THREE from 'three';
import type { SkinSculptBrush, SkinSculptData } from '@/lib/player-skins';

export interface SculptStrokeOptions {
  brush: SkinSculptBrush;
  /** World-space brush radius. */
  radius: number;
  /** 0–1 strength. */
  strength: number;
}

const _localHit = new THREE.Vector3();
const _worldV = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _avg = new THREE.Vector3();
const _tmp = new THREE.Vector3();

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

  // Approximate local radius from world radius using average scale
  const sx = mesh.getWorldScale(_tmp).x || 1;
  const localRadius = Math.max(0.001, opts.radius / Math.max(0.001, Math.abs(sx)));
  const radiusSq = localRadius * localRadius;
  const strength = Math.max(0.01, Math.min(1, opts.strength)) * 0.08;

  // Normals for add/remove
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;

  let changed = false;

  if (opts.brush === 'smooth') {
    // Two-pass Laplacian-ish smooth toward neighbor average (use nearby verts in brush)
    const indices: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      _worldV.fromBufferAttribute(pos, i);
      if (_worldV.distanceToSquared(_localHit) <= radiusSq) indices.push(i);
    }
    if (indices.length < 2) return false;
    const originals = indices.map((i) =>
      new THREE.Vector3().fromBufferAttribute(pos, i)
    );
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      _avg.set(0, 0, 0);
      let n = 0;
      for (let j = 0; j < indices.length; j++) {
        if (j === k) continue;
        _avg.add(originals[j]);
        n += 1;
      }
      if (!n) continue;
      _avg.multiplyScalar(1 / n);
      const cur = originals[k];
      const fall =
        1 - Math.min(1, cur.distanceTo(_localHit) / localRadius);
      const t = strength * 2.2 * fall * fall;
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
    for (let i = 0; i < pos.count; i++) {
      _worldV.fromBufferAttribute(pos, i);
      const dSq = _worldV.distanceToSquared(_localHit);
      if (dSq > radiusSq) continue;
      const d = Math.sqrt(dSq);
      const fall = 1 - d / localRadius;
      const w = fall * fall; // soft brush
      _normal.fromBufferAttribute(nrm, i).normalize();
      pos.setXYZ(
        i,
        _worldV.x + _normal.x * strength * w * sign,
        _worldV.y + _normal.y * strength * w * sign,
        _worldV.z + _normal.z * strength * w * sign
      );
      changed = true;
    }
  }

  if (changed) {
    pos.needsUpdate = true;
    geo.computeVertexNormals();
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
