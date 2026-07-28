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
  it('applies authored XYZ scale on top of the 1.75m height-normalize baseline', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial()
    );
    const fitted = fitAvatarLikeEditor(mesh, stubPlayer([2, 3, 1.5]), false);
    // Wrapper carries the authored per-axis scale exactly as entered.
    expect(fitted.scale.x).toBeCloseTo(2);
    expect(fitted.scale.y).toBeCloseTo(3);
    expect(fitted.scale.z).toBeCloseTo(1.5);
    // Child mesh is first normalized to a common 1.75m baseline height (see
    // normalizeCharacter in asset-loader.ts — deliberate: keeps pack bodies,
    // full-body skins, and rebound clothes all proportionally consistent
    // regardless of each source model's native geometry size) — for this
    // height-2 box that's a uniform 1.75/2 = 0.875, BEFORE the wrapper's
    // authored-scale multiplier is applied on top of it.
    const child = fitted.children[0] as THREE.Object3D;
    expect(child.scale.x).toBeCloseTo(1.75 / 2);
  });

  it('reads authored scale with sane fallbacks', () => {
    expect(avatarAuthoredScale(stubPlayer([0.5, 2, 0.75]))).toEqual([0.5, 2, 0.75]);
    expect(avatarAuthoredScale(undefined)).toEqual([1, 1, 1]);
  });
});
