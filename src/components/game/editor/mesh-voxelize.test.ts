import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { voxelizeGeometryToPads, compactCollisionPads } from './mesh-voxelize';

describe('voxelizeGeometryToPads', () => {
  it('a plain solid box voxelizes to a single box matching its bounds', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2);
    const pads = voxelizeGeometryToPads(geo, { resolution: 6 });
    expect(pads.length).toBeGreaterThanOrEqual(1);
    // Total volume should roughly match the original box (allow voxelization slop).
    const vol = pads.reduce((sum, p) => sum + p.hx * p.hy * p.hz * 8, 0);
    expect(vol).toBeGreaterThan(6);
    expect(vol).toBeLessThanOrEqual(10);
  });

  it('leaves a hollow interior empty instead of filling it as one big box', () => {
    // Outer 4x4x4 box minus an inner 2x2x2 box through the middle — a
    // hollow shell, the same shape class as an arch / curved wall opening.
    const outer = new Brush(new THREE.BoxGeometry(4, 4, 4));
    const inner = new Brush(new THREE.BoxGeometry(2, 6, 2));
    outer.updateMatrixWorld();
    inner.updateMatrixWorld();
    const evaluator = new Evaluator();
    const result = evaluator.evaluate(outer, inner, SUBTRACTION);
    result.geometry.computeVertexNormals();

    const pads = voxelizeGeometryToPads(result.geometry, { resolution: 10 });
    expect(pads.length).toBeGreaterThan(0);

    // The hollow tunnel runs through the center (x∈[-1,1], z∈[-1,1], all Y).
    // No pad should claim to fill that central column.
    const centerPoint = new THREE.Vector3(0, 0, 0);
    const claimsCenter = pads.some(
      (p) =>
        Math.abs(centerPoint.x - p.cx) < p.hx - 0.05 &&
        Math.abs(centerPoint.y - p.cy) < p.hy - 0.05 &&
        Math.abs(centerPoint.z - p.cz) < p.hz - 0.05
    );
    expect(claimsCenter).toBe(false);

    // But a point in the solid shell (corner of the outer box) should be covered.
    const shellPoint = new THREE.Vector3(1.8, 1.8, 1.8);
    const claimsShell = pads.some(
      (p) =>
        Math.abs(shellPoint.x - p.cx) <= p.hx + 0.05 &&
        Math.abs(shellPoint.y - p.cy) <= p.hy + 0.05 &&
        Math.abs(shellPoint.z - p.cz) <= p.hz + 0.05
    );
    expect(claimsShell).toBe(true);
  });

  it('returns no pads for an empty/degenerate geometry', () => {
    const geo = new THREE.BufferGeometry();
    expect(voxelizeGeometryToPads(geo)).toEqual([]);
  });

  it('caps pad count via compactCollisionPads', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      cx: i * 0.1,
      cy: 0,
      cz: 0,
      hx: 0.04,
      hy: 0.04,
      hz: 0.04,
    }));
    const compact = compactCollisionPads(many, 48);
    expect(compact.length).toBeLessThanOrEqual(48);
    expect(compact.length).toBeGreaterThan(0);
  });
});
