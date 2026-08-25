import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidFxDirector } from './solid-fx-director';
import { ensureSolidFx } from '@shared/solid-fx';

function appearBox() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3366ff });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, mat };
}

describe('SolidFxDirector', () => {
  it('hides Appear meshes at progress 0 and shows them while unveiling', () => {
    const { root, mesh, mat } = appearBox();
    const director = new SolidFxDirector();
    director.attach(
      'p1',
      root,
      ensureSolidFx({ enabled: true, mode: 'appear', style: 'glitch' }),
      { ghost: true }
    );
    expect(mesh.visible).toBe(false);
    expect(root.visible).toBe(true);
    director.setProgress('p1', 0.5);
    expect(mesh.visible).toBe(true);
    director.setProgress('p1', 1);
    expect(mesh.visible).toBe(true);
    director.detach('p1');
    expect(mesh.visible).toBe(true);
    expect(mesh.material).toBe(mat);
  });

  it('puts owned FX materials back after a texture-style clone steal', () => {
    const { root, mesh } = appearBox();
    const director = new SolidFxDirector();
    director.attach(
      'p1',
      root,
      ensureSolidFx({ enabled: true, mode: 'appear', style: 'glitch' })
    );
    const owned = mesh.material as THREE.Material;
    mesh.material = owned.clone();
    director.update(0.016);
    expect(mesh.material).toBe(owned);
    expect(mesh.visible).toBe(false);
    director.detach('p1');
  });
});
