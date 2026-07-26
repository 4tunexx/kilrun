/**
 * Ghost mesh helper for Play Test WR replay.
 */
import * as THREE from 'three';
import type { GhostSample } from '@/lib/ghost-actions';
import { simToThree } from '@/lib/platformer-sim';

export function createGhostMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
  );
  body.position.y = 0.85;
  g.add(body);
  g.visible = false;
  return g;
}

export function sampleGhostAt(
  samples: GhostSample[],
  elapsedMs: number
): { x: number; y: number; z: number } | null {
  if (!samples.length) return null;
  if (elapsedMs <= samples[0].t) {
    return { x: samples[0].x, y: samples[0].y, z: samples[0].z };
  }
  const last = samples[samples.length - 1];
  if (elapsedMs >= last.t) {
    return { x: last.x, y: last.y, z: last.z };
  }
  let i = 1;
  while (i < samples.length && samples[i].t < elapsedMs) i += 1;
  const a = samples[i - 1];
  const b = samples[i];
  const u = (elapsedMs - a.t) / Math.max(1, b.t - a.t);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

export function applyGhostPose(mesh: THREE.Object3D, sample: { x: number; y: number; z: number }) {
  const [tx, ty, tz] = simToThree(sample.x, sample.y, sample.z);
  mesh.position.set(tx, ty, tz);
  mesh.visible = true;
}
