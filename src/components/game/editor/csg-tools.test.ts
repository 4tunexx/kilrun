import { describe, expect, it } from 'vitest';
import type { EditorEntity } from './map-document';
import { isCsgDeleteResult, isCsgEligible, subtractEntities, unionEntities } from './csg-tools';
import { mapDocToSimPlatforms } from './prefab-storage';
import type { MapDocument } from './map-document';

// GLTFExporter's binary path uses the browser FileReader API (real in the
// editor, which only ever runs client-side) — Node's test env has Blob but
// not FileReader, so shim just enough of it to exercise the real export code.
if (typeof (globalThis as { FileReader?: unknown }).FileReader === 'undefined') {
  class NodeFileReaderShim {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = NodeFileReaderShim;
}

function boxEntity(overrides: Partial<EditorEntity> = {}): EditorEntity {
  return {
    id: 'e1',
    name: 'Box',
    kind: 'prop',
    model: 'hammer-solid',
    primitive: 'box',
    solid: true,
    collideMaterial: 'solid',
    collisionSize: [4, 4, 4],
    layerId: 'l1',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...overrides,
  };
}

function baseDoc(entities: EditorEntity[]): MapDocument {
  return {
    version: 1,
    name: 'Test',
    gridSize: 1,
    layers: [{ id: 'l1', name: 'Floor', visible: true, locked: false, order: 0 }],
    entities,
  };
}

describe('isCsgEligible', () => {
  it('accepts non-arch hammer solids and prior CSG bakes, rejects everything else', () => {
    expect(isCsgEligible(boxEntity())).toBe(true);
    expect(isCsgEligible(boxEntity({ primitive: 'cylinder' }))).toBe(true);
    expect(isCsgEligible(boxEntity({ primitive: 'arch' }))).toBe(false);
    expect(isCsgEligible(boxEntity({ model: 'crate_01', primitive: undefined }))).toBe(false);
    expect(isCsgEligible(boxEntity({ csgOp: 'union', model: undefined, primitive: undefined }))).toBe(true);
  });
});

describe('subtractEntities', () => {
  it('carves an exact doorway out of an aligned wall (box minus box)', async () => {
    // 4x4x1 wall centered at x=0,z=0, feet at y=0 (bottom-aligned).
    const wall = boxEntity({ id: 'wall', collisionSize: [4, 4, 1], position: [0, 0, 0] });
    // A narrower, shorter box centered in the wall's footprint — a doorway,
    // touching the floor (y=0) and not reaching the top.
    const doorway = boxEntity({
      id: 'door',
      collisionSize: [1.5, 3, 1.4],
      position: [0, 0, 0],
    });
    const result = await subtractEntities(wall, doorway);
    expect('error' in result).toBe(false);
    if ('error' in result || isCsgDeleteResult(result)) throw new Error('unexpected result shape');

    expect(result.customModelUrl.startsWith('data:model/gltf-binary;base64,')).toBe(true);
    expect(result.warning).toBeUndefined(); // aligned box-box carve is exact
    expect(result.csgPads.length).toBeGreaterThan(0);

    const doc = baseDoc([{ ...wall, ...result, id: 'wall', kind: 'prop' }]);
    const pads = mapDocToSimPlatforms(doc);
    expect(pads.length).toBe(result.csgPads.length);

    // A point in the doorway's carved-out gap (mid-height, dead center) must
    // NOT be covered by any resulting collision pad...
    const gapSimX = 0; // sim x = three z
    const gapSimY = 0; // sim y = three x
    const gapSimZ = 1.5; // mid-height (three y), well inside 0..3 doorway range
    const gapCovered = pads.some(
      (p) =>
        Math.abs(gapSimX - p.x) < p.width / 2 &&
        Math.abs(gapSimY - p.y) < p.depth / 2 &&
        gapSimZ <= p.z &&
        gapSimZ >= p.z - (p.height ?? 0)
    );
    expect(gapCovered).toBe(false);

    // ...while a point in the wall well outside the doorway (near a top
    // corner) must still be covered — the rest of the wall survives.
    // sim x = three z (wall thickness, ±0.5) — stay well inside it.
    // sim y = three x (wall width, ±2) — go past the doorway's ±0.75 span.
    const solidSimX = 0.3;
    const solidSimY = 1.9;
    const solidSimZ = 3.9; // near the top, above the doorway's 3-unit height
    const solidCovered = pads.some(
      (p) =>
        Math.abs(solidSimX - p.x) < p.width / 2 &&
        Math.abs(solidSimY - p.y) < p.depth / 2 &&
        solidSimZ <= p.z &&
        solidSimZ >= p.z - (p.height ?? 0)
    );
    expect(solidCovered).toBe(true);
  });

  it('deletes the base entirely when the cutter fully covers it', async () => {
    const base = boxEntity({ id: 'small', collisionSize: [2, 2, 2], position: [0, 0, 0] });
    const cutter = boxEntity({ id: 'big', collisionSize: [10, 10, 10], position: [0, 0, 0] });
    const result = await subtractEntities(base, cutter);
    expect(isCsgDeleteResult(result)).toBe(true);
  });

  it('falls back to the uncut base box (with a warning) when yaws do not match', async () => {
    const base = boxEntity({ id: 'wall', collisionSize: [4, 4, 1], position: [0, 0, 0] });
    const cutter = boxEntity({
      id: 'door',
      collisionSize: [1, 1, 1],
      position: [0, 0, 0],
      rotation: [0, 37, 0],
    });
    const result = await subtractEntities(base, cutter);
    if ('error' in result || isCsgDeleteResult(result)) throw new Error('unexpected result shape');
    expect(result.warning).toBeTruthy();
    expect(result.csgPads.length).toBe(1); // uncut base, single box
  });

  it('rejects Arch and non-Hammer entities', async () => {
    const base = boxEntity({ primitive: 'arch' });
    const cutter = boxEntity({ id: 'c' });
    const result = await subtractEntities(base, cutter);
    expect('error' in result).toBe(true);
  });
});

describe('unionEntities', () => {
  it('merges two separate boxes into one entity with both collision pieces preserved', async () => {
    const a = boxEntity({ id: 'a', collisionSize: [2, 2, 2], position: [-2, 0, 0] });
    const b = boxEntity({ id: 'b', collisionSize: [2, 2, 2], position: [2, 0, 0] });
    const result = await unionEntities([a, b]);
    if ('error' in result || isCsgDeleteResult(result)) throw new Error('unexpected result shape');

    expect(result.customModelUrl.startsWith('data:model/gltf-binary;base64,')).toBe(true);
    expect(result.csgPads.length).toBe(2);

    const merged: EditorEntity = {
      id: 'merged',
      name: 'Union',
      kind: 'prop',
      layerId: 'l1',
      position: result.position,
      rotation: result.rotation,
      scale: result.scale,
      customModelUrl: result.customModelUrl,
      collisionSize: result.collisionSize,
      csgPads: result.csgPads,
      csgOp: result.csgOp,
      solid: true,
      collideMaterial: 'solid',
    };
    const pads = mapDocToSimPlatforms(baseDoc([merged]));
    expect(pads.length).toBe(2);
    // Both original box centers (three x=-2 and x=2 → sim y=-2/2) must each
    // still be covered by exactly one of the merged pads.
    for (const simY of [-2, 2]) {
      const covered = pads.some((p) => Math.abs(simY - p.y) < p.depth / 2);
      expect(covered).toBe(true);
    }
  });

  it('requires at least 2 objects', async () => {
    const a = boxEntity();
    const result = await unionEntities([a]);
    expect('error' in result).toBe(true);
  });
});
