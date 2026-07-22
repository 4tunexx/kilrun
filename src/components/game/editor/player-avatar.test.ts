import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { avatarAuthoredScale, fitAvatarLikeEditor } from './player-avatar';
import type { EditorEntity } from './map-document';

function stubPlayer(scale: [number, number, number], model = 'figurine-cube'): EditorEntity {
  return {
    id: 'p1',
    name: 'Player',
    kind: 'player',
    model,
    layerId: 'l1',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale,
  } as EditorEntity;
}

describe('fitAvatarLikeEditor', () => {
  it('applies authored XYZ scale without forcing a target height', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial()
    );
    const fitted = fitAvatarLikeEditor(mesh, stubPlayer([2, 3, 1.5]), false);
    expect(fitted.scale.x).toBeCloseTo(2);
    expect(fitted.scale.y).toBeCloseTo(3);
    expect(fitted.scale.z).toBeCloseTo(1.5);
    // Child keeps native geometry size (not height-normalized away).
    const child = fitted.children[0] as THREE.Object3D;
    expect(child.scale.x).toBeCloseTo(1);
  });

  it('reads authored scale with sane fallbacks', () => {
    expect(avatarAuthoredScale(stubPlayer([0.5, 2, 0.75]))).toEqual([0.5, 2, 0.75]);
    expect(avatarAuthoredScale(undefined)).toEqual([1, 1, 1]);
  });
});
