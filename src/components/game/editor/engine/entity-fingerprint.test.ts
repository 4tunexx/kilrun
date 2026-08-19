import { describe, expect, it } from 'vitest';
import type { EditorEntity } from '../map-document';
import {
  compactAssetKey,
  entityStructureFingerprint,
  entityVisualFingerprint,
} from './entity-fingerprint';

function entity(over: Partial<EditorEntity> = {}): EditorEntity {
  return {
    id: 'e1',
    name: 'Block',
    kind: 'prop',
    model: 'crate',
    layerId: 'layer_floor',
    position: [1, 2, 3],
    rotation: [0, 45, 0],
    scale: [1, 1, 1],
    ...over,
  };
}

const vis = { envTextureKey: '', layerHidden: false };

describe('compactAssetKey', () => {
  it('passes catalog paths through unchanged', () => {
    expect(compactAssetKey('wall-doorway-garage')).toBe('wall-doorway-garage');
    expect(compactAssetKey('/uploads/foo.glb')).toBe('/uploads/foo.glb');
  });

  it('never embeds a data-URL payload', () => {
    const glb = `data:model/gltf-binary;base64,${'A'.repeat(50_000)}`;
    const key = compactAssetKey(glb);
    expect(key.length).toBeLessThan(200);
    expect(key.startsWith('data:')).toBe(true);
    expect(key).toContain(String(glb.length));
  });

  it('changes when a data-URL is replaced with a different payload of the same type', () => {
    const a = `data:model/gltf-binary;base64,${'A'.repeat(8_000)}B`;
    const b = `data:model/gltf-binary;base64,${'A'.repeat(8_000)}C`;
    expect(compactAssetKey(a)).not.toBe(compactAssetKey(b));
  });
});

describe('entityVisualFingerprint', () => {
  it('ignores collision pads, clip catalogs, and CSG sources', () => {
    const a = entityVisualFingerprint(entity(), vis);
    const b = entityVisualFingerprint(
      entity({
        meshCollisionPads: [{ cx: 0, cy: 0, cz: 0, hx: 2, hy: 2, hz: 2 }],
        meshCollisionBakeKey: 'stale',
        csgSources: [entity({ id: 'other' })],
        animation: {
          trigger: 'none',
          radius: 2,
          loopActive: false,
          loopDefault: false,
          availableClips: Array.from({ length: 40 }, (_, i) => `clip_${i}`),
        },
      }),
      vis
    );
    expect(a).toBe(b);
  });

  it('changes when pose, color, or texture change', () => {
    const base = entityVisualFingerprint(entity(), vis);
    expect(entityVisualFingerprint(entity({ position: [9, 2, 3] }), vis)).not.toBe(base);
    expect(entityVisualFingerprint(entity({ color: '#ff0000' }), vis)).not.toBe(base);
    expect(entityVisualFingerprint(entity({ textureUrl: '/tex/brick.png' }), vis)).not.toBe(
      base
    );
  });

  it('folds layer visibility and the environment fallback texture in', () => {
    const base = entityVisualFingerprint(entity(), vis);
    expect(
      entityVisualFingerprint(entity(), { envTextureKey: '/tex/dirt.png', layerHidden: false })
    ).not.toBe(base);
    expect(entityVisualFingerprint(entity(), { envTextureKey: '', layerHidden: true })).not.toBe(
      base
    );
  });
});

describe('entityStructureFingerprint', () => {
  it('changes when the model or hammer shape changes, not when pose does', () => {
    const a = entityStructureFingerprint(entity());
    expect(entityStructureFingerprint(entity({ model: 'barrel' }))).not.toBe(a);
    expect(entityStructureFingerprint(entity({ position: [9, 9, 9] }))).toBe(a);
    expect(entityStructureFingerprint(entity({ primitive: 'wedge' }))).not.toBe(a);
  });
});
