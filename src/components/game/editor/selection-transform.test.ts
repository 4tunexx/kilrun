import { describe, expect, it } from 'vitest';
import {
  applySelectionTransformOp,
  flipPoseAroundPivot,
  nearestFaceAttach,
  nearestObbFaceAttach,
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
