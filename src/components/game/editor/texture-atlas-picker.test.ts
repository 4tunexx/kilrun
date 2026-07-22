import { describe, expect, it } from 'vitest';
import { regionToUv, uvToRegion } from './texture-atlas-picker';

describe('texture atlas UV helpers', () => {
  it('maps a top-left region to Three.js repeat/offset', () => {
    const uv = regionToUv({ u: 0.25, v: 0, w: 0.25, h: 0.25 });
    expect(uv.repeat[0]).toBeCloseTo(0.25);
    expect(uv.repeat[1]).toBeCloseTo(0.25);
    // Three.js V origin is bottom-left → top strip sits near v=0.75
    expect(uv.offset[0]).toBeCloseTo(0.25);
    expect(uv.offset[1]).toBeCloseTo(0.75);
  });

  it('round-trips full image', () => {
    const region = { u: 0, v: 0, w: 1, h: 1 };
    const uv = regionToUv(region);
    const back = uvToRegion(uv.repeat, uv.offset);
    expect(back.u).toBeCloseTo(0);
    expect(back.v).toBeCloseTo(0);
    expect(back.w).toBeCloseTo(1);
    expect(back.h).toBeCloseTo(1);
  });
});
