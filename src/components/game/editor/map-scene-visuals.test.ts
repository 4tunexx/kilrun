import { describe, expect, it } from 'vitest';
import {
  applyEntityGlow,
  applyEntityOpacity,
  makeGameplayFallback,
  resolveFogColor,
  resolveSkyColor,
  shouldUseGameplayFallback,
} from '@/components/game/editor/map-scene-visuals';
import { DEFAULT_ENVIRONMENT } from '@/components/game/editor/map-document';
import type { EditorEntity } from '@/components/game/editor/map-document';
import * as THREE from 'three';

function stubEntity(partial: Partial<EditorEntity>): EditorEntity {
  return {
    id: 'e1',
    name: 'Entity',
    kind: 'prop',
    model: '',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    layerId: 'default',
    ...partial,
  } as EditorEntity;
}

describe('map-scene-visuals', () => {
  it('resolves sky presets instead of always using skyColor', () => {
    expect(resolveSkyColor({ ...DEFAULT_ENVIRONMENT, sky: 'dusk', skyColor: '#000000' })).toBe(
      '#1a1530'
    );
    expect(resolveSkyColor({ ...DEFAULT_ENVIRONMENT, sky: 'custom', skyColor: '#112233' })).toBe(
      '#112233'
    );
  });

  it('falls back fog to sky / horizon', () => {
    expect(
      resolveFogColor({
        ...DEFAULT_ENVIRONMENT,
        fogColor: '',
        horizonColor: '#abcdef',
        sky: 'cavern',
      })
    ).toBe('#abcdef');
  });

  it('applies entity opacity to mesh materials', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    applyEntityOpacity(mesh, 0.4);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.opacity).toBe(0.4);
    expect(mat.transparent).toBe(true);
  });

  it('marks glow materials emissive without extra shell meshes', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    applyEntityGlow(mesh, {
      enabled: true,
      color: '#00f0ff',
      intensity: 1,
      bloom: 0.4,
      pulse: 'none',
    });
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.emissive.getHexString()).toBe('00f0ff');
    expect(mat.emissiveIntensity).toBeCloseTo(0.42);
    expect(mat.toneMapped).toBe(true);
    expect(mesh.userData.bloom).toBe(true);
    expect(mesh.userData.bloomStrength).toBeCloseTo(0.4);
    expect(mesh.children.some((c) => c.name === '__glow_halo__')).toBe(false);

    applyEntityGlow(mesh, {
      enabled: true,
      color: '#00f0ff',
      intensity: 1.1,
      bloom: 0,
      pulse: 'none',
    });
    expect((mesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeCloseTo(0.462);
    expect(mesh.userData.bloom).toBe(false);
  });

  it('provides gameplay fallbacks for marker kinds that vanish without models', () => {
    expect(makeGameplayFallback(stubEntity({ kind: 'red_zone' }))).toBeTruthy();
    expect(makeGameplayFallback(stubEntity({ kind: 'revive_pad' }))).toBeTruthy();
    expect(makeGameplayFallback(stubEntity({ kind: 'health_floor' }))).toBeTruthy();
    expect(makeGameplayFallback(stubEntity({ kind: 'door' }))).toBeTruthy();
    expect(shouldUseGameplayFallback(stubEntity({ kind: 'red_zone' }), 'missing-model')).toBe(
      true
    );
  });
});
