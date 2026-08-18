import { describe, expect, it } from 'vitest';
import {
  alignSelection,
  copyEntityCluster,
  distributeSelection,
  linearArray,
  mirrorSelection,
  mirroredRotation,
  radialArray,
  randomizeSelection,
  selectionBounds,
  touchingStepOffset,
} from './bulk-ops';
import type { EditorEntity } from './map-document';

function stub(id: string, over: Partial<EditorEntity> = {}): EditorEntity {
  return {
    id,
    name: id,
    kind: 'prop',
    model: 'floor-square',
    layerId: 'l1',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collisionSize: [2, 2, 2],
    ...over,
  } as EditorEntity;
}

/** Deterministic stand-in for Math.random, cycling through fixed values. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('selectionBounds', () => {
  it('spans the boxes, not just the centers', () => {
    const b = selectionBounds([stub('a'), stub('b', { position: [10, 0, 0] })]);
    expect(b.min[0]).toBe(-1);
    expect(b.max[0]).toBe(11);
    expect(b.center[0]).toBe(5);
  });

  it('accounts for scale', () => {
    const b = selectionBounds([stub('a', { scale: [3, 1, 1] })]);
    expect(b.min[0]).toBe(-3);
    expect(b.max[0]).toBe(3);
  });
});

describe('copyEntityCluster', () => {
  it('rewires references that point inside the cluster', () => {
    const button = stub('btn', {
      kind: 'button',
      animation: {
        availableClips: [],
        trigger: 'interact',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
        activatesEntityIds: ['door'],
      },
    });
    const door = stub('door', { kind: 'door' });
    const copies = copyEntityCluster([button, door]);
    const [copiedButton, copiedDoor] = copies;
    expect(copiedButton.animation?.activatesEntityIds).toEqual([copiedDoor.id]);
    expect(copiedButton.id).not.toBe('btn');
  });

  it('leaves references that point outside the cluster alone', () => {
    const button = stub('btn', {
      kind: 'button',
      animation: {
        availableClips: [],
        trigger: 'interact',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
        activatesEntityIds: ['far-away-door'],
      },
    });
    const [copy] = copyEntityCluster([button]);
    expect(copy.animation?.activatesEntityIds).toEqual(['far-away-door']);
  });

  it('does not alias arrays with the source entity', () => {
    const src = stub('a', { position: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 2, 2] });
    const [copy] = copyEntityCluster([src]);
    copy.position[0] = 99;
    copy.rotation[1] = 99;
    copy.scale[0] = 99;
    expect(src.position[0]).toBe(1);
    expect(src.rotation[1]).toBe(90);
    expect(src.scale[0]).toBe(2);
  });
});

describe('linearArray', () => {
  it('steps each copy further along the offset', () => {
    const copies = linearArray([stub('a')], { count: 3, offset: [4, 0, 0] });
    expect(copies.map((c) => c.position[0])).toEqual([4, 8, 12]);
  });

  it('accumulates rotation and compounds scale per step', () => {
    const copies = linearArray([stub('a')], {
      count: 2,
      offset: [0, 0, 0],
      rotationStep: [0, 15, 0],
      scaleStep: [2, 1, 1],
    });
    expect(copies.map((c) => c.rotation[1])).toEqual([15, 30]);
    expect(copies.map((c) => c.scale[0])).toEqual([2, 4]);
  });

  it('keeps each multi-object step together as its own group', () => {
    const copies = linearArray([stub('a'), stub('b')], { count: 2, offset: [4, 0, 0] });
    expect(copies).toHaveLength(4);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[2].groupId).toBe(copies[3].groupId);
    expect(copies[0].groupId).not.toBe(copies[2].groupId);
  });

  it('returns nothing for an empty selection or zero count', () => {
    expect(linearArray([], { count: 5, offset: [1, 0, 0] })).toEqual([]);
    expect(linearArray([stub('a')], { count: 0, offset: [1, 0, 0] })).toEqual([]);
  });

  it('butts copies together when stepped by the selection span', () => {
    const src = stub('a');
    const offset = touchingStepOffset([src], 'x');
    const [copy] = linearArray([src], { count: 1, offset });
    // Faces flush: the copy's near face sits exactly on the source's far face.
    expect(copy.position[0] - 1).toBeCloseTo(src.position[0] + 1, 10);
  });
});

describe('radialArray', () => {
  it('spaces a full ring evenly with no piece on top of the original', () => {
    const copies = radialArray([stub('a', { position: [4, 0, 0] })], {
      count: 4,
      axis: 'y',
      center: [0, 0, 0],
    });
    expect(copies).toHaveLength(3);
    // 90° steps around Y starting from +X.
    expect(copies[0].position[0]).toBeCloseTo(0, 6);
    expect(copies[0].position[2]).toBeCloseTo(-4, 6);
    expect(copies[1].position[0]).toBeCloseTo(-4, 6);
    expect(copies[2].position[2]).toBeCloseTo(4, 6);
  });

  it('turns each copy to face along the ring', () => {
    const copies = radialArray([stub('a', { position: [4, 0, 0] })], {
      count: 4,
      axis: 'y',
      center: [0, 0, 0],
    });
    expect(copies.map((c) => Math.round(c.rotation[1]))).toEqual([90, 180, 270]);
  });

  it('reaches the end of a partial arc instead of wrapping', () => {
    const copies = radialArray([stub('a', { position: [4, 0, 0] })], {
      count: 3,
      axis: 'y',
      center: [0, 0, 0],
      arcDeg: 180,
    });
    expect(copies).toHaveLength(2);
    expect(Math.round(copies[1].rotation[1])).toBe(180);
  });

  it('seeds the ring at an explicit radius', () => {
    const copies = radialArray([stub('a', { position: [1, 0, 0] })], {
      count: 4,
      axis: 'y',
      center: [0, 0, 0],
      radius: 10,
    });
    for (const c of copies) {
      expect(Math.hypot(c.position[0], c.position[2])).toBeCloseTo(10, 6);
    }
  });

  it('needs at least two pieces to make a ring', () => {
    expect(radialArray([stub('a')], { count: 1, axis: 'y', center: [0, 0, 0] })).toEqual([]);
  });
});

describe('mirrorSelection', () => {
  it('reflects position across the plane through the pivot', () => {
    const { added } = mirrorSelection([stub('a', { position: [3, 1, 0] })], 'x', [1, 0, 0]);
    expect(added[0].position).toEqual([-1, 1, 0]);
  });

  it('produces copies by default and can transform in place instead', () => {
    const src = stub('a', { position: [3, 0, 0] });
    expect(mirrorSelection([src], 'x', [0, 0, 0]).added).toHaveLength(1);
    const inPlace = mirrorSelection([src], 'x', [0, 0, 0], { copy: false });
    expect(inPlace.added).toHaveLength(0);
    expect(inPlace.updated[0].id).toBe('a');
    expect(src.position[0]).toBe(3);
  });

  it('negates the two rotations that are not about the mirror axis', () => {
    expect(mirroredRotation([10, 20, 30], 'x')).toEqual([10, -20, -30]);
    expect(mirroredRotation([10, 20, 30], 'y')).toEqual([-10, 20, -30]);
    expect(mirroredRotation([10, 20, 30], 'z')).toEqual([-10, -20, 30]);
  });

  it('round-trips: mirroring twice about the same plane is the identity', () => {
    const pivot: [number, number, number] = [2, 0, 0];
    const once = mirrorSelection([stub('a', { position: [5, 0, 0], rotation: [0, 45, 0] })], 'x', pivot);
    const twice = mirrorSelection(once.added, 'x', pivot);
    expect(twice.added[0].position[0]).toBeCloseTo(5, 10);
    expect(twice.added[0].rotation[1]).toBeCloseTo(45, 10);
  });
});

describe('alignSelection', () => {
  it('lines up min faces, not centers', () => {
    const out = alignSelection(
      [stub('a', { position: [0, 0, 0] }), stub('b', { position: [10, 0, 0], scale: [4, 1, 1] })],
      'x',
      'min'
    );
    // Selection min face is at -1 (a) — both near faces land there.
    expect(out[0].position[0]).toBe(0);
    expect(out[1].position[0]).toBe(3);
  });

  it('centers on the selection bounds center', () => {
    const out = alignSelection(
      [stub('a', { position: [0, 0, 0] }), stub('b', { position: [10, 0, 0] })],
      'x',
      'center'
    );
    expect(out.map((e) => e.position[0])).toEqual([5, 5]);
  });

  it('needs two entities to have anything to align to', () => {
    expect(alignSelection([stub('a')], 'x', 'min')).toEqual([]);
  });
});

describe('distributeSelection', () => {
  it('evenly spaces the middle entities and leaves the extremes put', () => {
    const out = distributeSelection(
      [
        stub('a', { position: [0, 0, 0] }),
        stub('c', { position: [9, 0, 0] }),
        stub('b', { position: [1, 0, 0] }),
      ],
      'x'
    );
    expect(out.map((e) => e.position[0])).toEqual([0, 4.5, 9]);
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('needs three entities to have a middle to move', () => {
    expect(distributeSelection([stub('a'), stub('b')], 'x')).toEqual([]);
  });
});

describe('randomizeSelection', () => {
  it('jitters within the requested range', () => {
    // 0 and 1 map to the extremes of the signed range.
    const high = randomizeSelection([stub('a')], { rotationDeg: [0, 90, 0] }, seeded([1]));
    const low = randomizeSelection([stub('a')], { rotationDeg: [0, 90, 0] }, seeded([0]));
    expect(high[0].rotation[1]).toBe(90);
    expect(low[0].rotation[1]).toBe(-90);
  });

  it('never scales an entity down to zero', () => {
    const out = randomizeSelection([stub('a')], { scaleFraction: [5, 5, 5] }, seeded([0]));
    expect(out[0].scale[0]).toBeGreaterThan(0);
  });

  it('leaves fields alone when no range is given for them', () => {
    const out = randomizeSelection([stub('a', { position: [1, 2, 3] })], { rotationDeg: [10, 10, 10] });
    expect(out[0].position).toEqual([1, 2, 3]);
    expect(out[0].scale).toEqual([1, 1, 1]);
  });
});
