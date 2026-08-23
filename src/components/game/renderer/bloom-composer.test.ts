import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isBloomExcludedObject } from './bloom-composer';

describe('isBloomExcludedObject', () => {
  it('excludes the transform helper and its handles so hover cannot paint darkMesh yellow', () => {
    const helper = new THREE.Group();
    helper.userData.skipBloom = true;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.01));
    plate.name = 'XZ';
    helper.add(plate);
    expect(isBloomExcludedObject(helper)).toBe(true);
    expect(isBloomExcludedObject(plate)).toBe(true);
  });

  it('excludes collision pads under the editor gizmo group', () => {
    const group = new THREE.Group();
    group.name = '__gizmos';
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 2));
    group.add(pad);
    expect(isBloomExcludedObject(pad)).toBe(true);
  });

  it('leaves ordinary map meshes in the bloom pass', () => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(isBloomExcludedObject(box)).toBe(false);
  });
});
