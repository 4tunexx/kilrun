import { describe, expect, it } from 'vitest';
import type { EditorEntity, MapDocument } from './map-document';
import {
  entitiesNeedingCollisionBake,
  findCollisionMismatches,
  shouldFlagMissingBake,
} from './collision-mismatch';

function ent(over: Partial<EditorEntity>): EditorEntity {
  return {
    id: 'e1',
    kind: 'prop',
    name: 'Arch',
    model: 'arch-stone',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [4, 4, 2],
    solid: true,
    ...over,
  } as EditorEntity;
}

describe('collision mismatch', () => {
  it('flags hollow-looking solids without a mesh bake', () => {
    expect(shouldFlagMissingBake(ent({}))).toBe(true);
    expect(
      shouldFlagMissingBake(ent({ meshCollisionPads: [{ cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 }] }))
    ).toBe(false);
  });

  it('lists mismatches on a map', () => {
    const doc = {
      version: 1,
      name: 't',
      entities: [ent({})],
      layers: [{ id: 'd', name: 'D', visible: true, locked: false }],
      gridSize: 1,
    } as MapDocument;
    expect(findCollisionMismatches(doc).map((r) => r.reason)).toEqual(['no-bake']);
    expect(entitiesNeedingCollisionBake(doc).map((e) => e.id)).toEqual(['e1']);
  });

  it('flags a huge solid that only has one pad', () => {
    const doc = {
      version: 1,
      name: 't',
      entities: [
        ent({
          id: 'big',
          name: 'Block',
          model: 'box',
          scale: [6, 6, 6],
          meshCollisionPads: [{ cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 }],
        }),
      ],
      layers: [{ id: 'd', name: 'D', visible: true, locked: false }],
      gridSize: 1,
    } as MapDocument;
    expect(findCollisionMismatches(doc).map((r) => r.reason)).toEqual(['volume-mismatch']);
  });
});
