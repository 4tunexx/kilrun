import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { isSaneGizmoPosition, MAX_SCENE_COORD } from './editor-viewport';

// Reproduces the "hovering over the gizmo turns the whole screen yellow" bug:
// TransformControls scales every handle by a camera-distance-proportional
// factor. If the attached object's position is corrupt (NaN, or blown up by
// a bad mirror/array/CSG op), that factor explodes and the hovered handle
// renders gigantic and fully opaque (its hover-highlight color is yellow),
// covering the viewport. isSaneGizmoPosition is the guard editor-viewport.ts
// checks in attachSelectionGizmo() before ever attaching TransformControls
// to an object, so the runaway factor is never computed in the first place.

describe('isSaneGizmoPosition', () => {
  it('accepts ordinary map coordinates', () => {
    expect(isSaneGizmoPosition({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(isSaneGizmoPosition({ x: 512, y: -30, z: 1200 })).toBe(true);
    expect(isSaneGizmoPosition({ x: MAX_SCENE_COORD, y: 0, z: 0 })).toBe(true);
  });

  it('rejects NaN and Infinity', () => {
    expect(isSaneGizmoPosition({ x: NaN, y: 0, z: 0 })).toBe(false);
    expect(isSaneGizmoPosition({ x: 0, y: Infinity, z: 0 })).toBe(false);
    expect(isSaneGizmoPosition({ x: 0, y: 0, z: -Infinity })).toBe(false);
  });

  it('rejects positions beyond the sane-map bound', () => {
    expect(isSaneGizmoPosition({ x: MAX_SCENE_COORD + 1, y: 0, z: 0 })).toBe(false);
    expect(isSaneGizmoPosition({ x: 0, y: 1e9, z: 0 })).toBe(false);
  });
});

describe('TransformControls handle scale (empirical root cause)', () => {
  function maxVisibleHandleScale(transform: TransformControls): number {
    const helper = (transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper
      ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
      : (transform as unknown as THREE.Object3D);
    helper.updateMatrixWorld(true);
    let max = 0;
    helper.traverse((child) => {
      if (!child.visible) return;
      const s = (child as THREE.Object3D).scale;
      if (!s) return;
      const m = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
      max = Number.isFinite(m) ? Math.max(max, m) : Infinity;
    });
    return max;
  }

  it('stays modest for an in-sane-bound position at a normal camera distance', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    scene.add(mesh);
    const transform = new TransformControls(camera, undefined);
    transform.attach(mesh);
    expect(maxVisibleHandleScale(transform)).toBeLessThan(50);
  });

  it('explodes for a corrupted position — this is the actual bug mechanism', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1e12);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(1e9, 0, 0);
    scene.add(mesh);
    const transform = new TransformControls(camera, undefined);
    transform.attach(mesh);
    // Proves the failure mode: an ordinary handle scale check alone (a small
    // fixed cap) would either always trip on legitimate far zoom or fail to
    // catch this — which is why the real fix validates position at attach
    // time instead of guessing a scale threshold after the fact.
    expect(maxVisibleHandleScale(transform)).toBeGreaterThan(1_000_000);
    expect(isSaneGizmoPosition(mesh.position)).toBe(false);
  });
});
