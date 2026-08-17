import { describe, expect, it } from 'vitest';
import { PadSpatialIndex } from '@shared/platform-spatial';
import { isPlayerOverlappingObstacle } from '@shared/obstacle-hit';

describe('PadSpatialIndex', () => {
  it('returns nearby pads and skips far ones', () => {
    const pads = [
      { x: 0, y: 0, width: 2, depth: 2 },
      { x: 80, y: 80, width: 2, depth: 2 },
    ];
    const index = new PadSpatialIndex().rebuild(pads);
    const near = index.nearby(0, 0);
    expect(near).toContain(pads[0]);
    expect(near).not.toContain(pads[1]);
  });

  it('still finds a large pad whose center is far from the player', () => {
    const huge = { x: 0, y: 0, width: 40, depth: 40 };
    const index = new PadSpatialIndex().rebuild([huge]);
    expect(index.nearby(18, 0)).toContain(huge);
  });
});

describe('isPlayerOverlappingObstacle', () => {
  it('uses depth on the sim Y axis instead of treating traps as squares of width', () => {
    const trap = { x: 0, y: 0, z: 0, width: 4, depth: 0.5, height: 2, active: true };
    expect(
      isPlayerOverlappingObstacle({ x: 0, y: 0, z: 0 }, trap, 0.35, 1.7)
    ).toBe(true);
    expect(
      isPlayerOverlappingObstacle({ x: 0, y: 2, z: 0 }, trap, 0.35, 1.7)
    ).toBe(false);
  });
});
