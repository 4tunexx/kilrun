import { describe, expect, it } from 'vitest';
import { astarPadPath, buildPadNavGraph, nextNavWaypoint } from '../../server/src/sim/horde-nav';

describe('horde pad nav', () => {
  it('paths around a gap between two pads', () => {
    const pads = [
      { x: 0, y: 0, z: 0, width: 6, depth: 2 },
      { x: 8, y: 0, z: 0, width: 6, depth: 2 },
      { x: 4, y: 3, z: 0, width: 10, depth: 2 },
    ];
    const { walkable } = buildPadNavGraph(pads);
    expect(walkable.size).toBeGreaterThan(4);
    const path = astarPadPath(walkable, { x: 0, y: 0 }, { x: 8, y: 0 });
    expect(path.length).toBeGreaterThan(1);
    expect(nextNavWaypoint(path, 0, 0)).toBeTruthy();
  });
});
