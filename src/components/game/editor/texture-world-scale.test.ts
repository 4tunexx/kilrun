import { describe, expect, it } from 'vitest';
import { resolveEntityTextureRepeat, worldScaleToUvRepeat } from './editor-mesh';

describe('worldScaleToUvRepeat', () => {
  it('keeps the same density across different object sizes', () => {
    const scale = 1; // 1 world unit per tile
    const small = worldScaleToUvRepeat([2, 1, 2], scale);
    const large = worldScaleToUvRepeat([8, 1, 8], scale);
    expect(small).toEqual([2, 2]);
    expect(large).toEqual([8, 8]);
    // Tile density (repeat / size) matches
    expect(small[0] / 2).toBeCloseTo(large[0] / 8);
    expect(small[1] / 2).toBeCloseTo(large[1] / 8);
  });
});

describe('resolveEntityTextureRepeat', () => {
  it('derives UV from textureWorldScale and entity size', () => {
    const repeat = resolveEntityTextureRepeat({
      scale: [1, 1, 1],
      collisionSize: [4, 0.5, 2],
      textureWorldScale: 1,
      textureRepeat: [99, 99],
    });
    expect(repeat).toEqual([4, 2]);
  });

  it('falls back to stored UV when world scale is absent', () => {
    const repeat = resolveEntityTextureRepeat({
      scale: [1, 1, 1],
      textureRepeat: [3, 1.5],
    });
    expect(repeat).toEqual([3, 1.5]);
  });
});
