import { describe, expect, it } from 'vitest';
import {
  applySelectionTransformOp,
  flipPoseAroundPivot,
  nearestFaceAttach,
  nearestObbFaceAttach,
  nearestPointSnap,
  obbCorners,
  obbEdgeMidpoints,
  rotatePoseAroundPivot,
  type Vec3,
} from './selection-transform';

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

describe('selection transform presets', () => {
  it('rotates a satellite 90° around Y about the group pivot', () => {
    const next = rotatePoseAroundPivot([2, 0, 0], [0, 0, 0], [0, 0, 0], [0, 90, 0]);
    expect(round3(next.position[0])).toBe(0);
    expect(round3(next.position[2])).toBe(-2);
    expect(round3(next.rotation[1])).toBe(90);
  });

  it('horizontal flip (180° Y) turns an object around and keeps it on the same footprint', () => {
    const next = flipPoseAroundPivot([1, 0, 0], [0, 45, 0], [1, 0, 0], 'y');
    expect(round3(next.position[0])).toBe(1);
    expect(round3(next.rotation[1])).toBe(225);
  });

  it('setYaw on a group member orbits around the pivot by the yaw delta', () => {
    const next = applySelectionTransformOp([2, 0, 0], [0, 0, 0], [0, 0, 0], {
      type: 'setYaw',
      deg: 180,
    });
    expect(round3(next.position[0])).toBe(-2);
    expect(round3(next.rotation[1])).toBe(180);
  });
});

describe('nearestFaceAttach', () => {
  const cube = { c: [0, 1, 0] as Vec3, h: [1, 1, 1] as Vec3 };

  it('clicks a nearby box flush onto the +X face', () => {
    const hit = nearestFaceAttach({ c: [2.35, 1, 0.2], h: [1, 1, 1] }, [cube], 0.6);
    expect(hit).not.toBeNull();
    expect(round3(hit!.c[0])).toBe(2);
    expect(round3(hit!.c[1])).toBe(1);
    expect(round3(hit!.c[2])).toBe(0.2);
  });

  it('stacks on top when that gap is the smallest', () => {
    const hit = nearestFaceAttach({ c: [0.1, 3.2, 0], h: [1, 1, 1] }, [cube], 0.6);
    expect(hit).not.toBeNull();
    expect(round3(hit!.c[1])).toBe(3);
  });

  it('does not attach when the nearest face is farther than maxDist', () => {
    expect(nearestFaceAttach({ c: [5, 1, 0], h: [1, 1, 1] }, [cube], 0.6)).toBeNull();
  });
});

describe('nearestObbFaceAttach', () => {
  it('matches AABB click-on for unrotated cubes', () => {
    const cube = { c: [0, 1, 0] as Vec3, h: [1, 1, 1] as Vec3, rotDeg: [0, 0, 0] as Vec3 };
    const hit = nearestObbFaceAttach(
      { c: [2.35, 1, 0.2], h: [1, 1, 1], rotDeg: [0, 0, 0] },
      [cube],
      0.6
    );
    expect(hit).not.toBeNull();
    expect(round3(hit!.c[0])).toBe(2);
    expect(round3(hit!.c[1])).toBe(1);
    expect(round3(hit!.c[2])).toBe(0.2);
  });

  it('clicks onto a yaw-rotated wall along its thin world-X face', () => {
    // 2×2×0.4 slab, 90° yaw: local Z (thin) lines up with world X.
    const wall = { c: [0, 1, 0] as Vec3, h: [1, 1, 0.2] as Vec3, rotDeg: [0, 90, 0] as Vec3 };
    const hit = nearestObbFaceAttach(
      { c: [0.55, 1, 0.1], h: [1, 1, 0.2], rotDeg: [0, 90, 0] },
      [wall],
      0.6
    );
    expect(hit).not.toBeNull();
    expect(round3(hit!.c[0])).toBe(0.4);
    expect(round3(hit!.c[1])).toBe(1);
  });
});

describe('obbCorners', () => {
  it('gives the 8 corners of an unrotated box', () => {
    const corners = obbCorners({ c: [0, 0, 0], h: [1, 2, 3] });
    expect(corners).toHaveLength(8);
    for (const c of corners) {
      expect([Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])]).toEqual([1, 2, 3]);
    }
  });

  it('follows the box rotation', () => {
    // 90° yaw swaps the X and Z extents.
    const corners = obbCorners({ c: [0, 0, 0], h: [1, 1, 3], rotDeg: [0, 90, 0] });
    for (const c of corners) {
      expect(round3(Math.abs(c[0]))).toBe(3);
      expect(round3(Math.abs(c[2]))).toBe(1);
    }
  });
});

describe('obbEdgeMidpoints', () => {
  it('gives 12 midpoints, each on the surface but not at a corner', () => {
    const mids = obbEdgeMidpoints({ c: [0, 0, 0], h: [1, 1, 1] });
    expect(mids).toHaveLength(12);
    for (const m of mids) {
      // An edge midpoint is centered on exactly one axis and extreme on the other two.
      const centered = m.filter((v) => Math.abs(v) < 1e-9).length;
      expect(centered).toBe(1);
    }
  });
});

describe('nearestPointSnap', () => {
  it('returns the delta that lands the closest pair together', () => {
    const hit = nearestPointSnap(
      [
        [0.9, 0, 0],
        [-5, 0, 0],
      ],
      [[1, 0.1, 0]],
      0.5
    );
    expect(hit).not.toBeNull();
    expect(hit!.delta.map(round3)).toEqual([0.1, 0.1, 0]);
  });

  it('ignores pairs beyond maxDist', () => {
    expect(nearestPointSnap([[0, 0, 0]], [[3, 0, 0]], 0.5)).toBeNull();
  });

  it('snaps a cube corner onto a neighbour corner', () => {
    const anchor = obbCorners({ c: [0, 1, 0], h: [1, 1, 1] });
    // Overlapping slightly, corner-to-corner within snap range.
    const moving = obbCorners({ c: [2.1, 1.1, 0.1], h: [1, 1, 1] });
    const hit = nearestPointSnap(moving, anchor, 0.5);
    expect(hit).not.toBeNull();
    expect(hit!.delta.map(round3)).toEqual([-0.1, -0.1, -0.1]);
  });
});
