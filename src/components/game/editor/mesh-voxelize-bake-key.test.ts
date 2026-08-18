import { describe, expect, it } from 'vitest';
import {
  MAX_MESH_COLLISION_PADS,
  VOXELIZER_VERSION,
  meshCollisionBakeKeyFor,
  needsMeshCollisionBake,
} from './mesh-voxelize';
import type { CsgLocalPad, EditorEntity } from './map-document';

const PADS: CsgLocalPad[] = [{ cx: 0, cy: 0, cz: 0, hx: 1, hy: 1, hz: 1 }];

function entity(over: Partial<EditorEntity> = {}): EditorEntity {
  return {
    id: 'e1',
    kind: 'prop',
    position: [0, 0, 0],
    model: 'wall-doorway-garage',
    ...over,
  } as EditorEntity;
}

describe('mesh collision bake key', () => {
  it('is stable for the same model and options', () => {
    expect(meshCollisionBakeKeyFor(entity())).toBe(meshCollisionBakeKeyFor(entity()));
  });

  it('records the voxelizer version so a bump invalidates every cached bake', () => {
    expect(meshCollisionBakeKeyFor(entity())).toContain(`v${VOXELIZER_VERSION}`);
  });

  it('records the effective (clamped) options, not the requested ones', () => {
    // voxelizeGeometryToPads clamps resolution into [2, 32] and maxPads to >= 4.
    expect(meshCollisionBakeKeyFor(entity(), { resolution: 999 })).toBe(
      meshCollisionBakeKeyFor(entity(), { resolution: 32 })
    );
    expect(meshCollisionBakeKeyFor(entity(), { maxPads: 1 })).toBe(
      meshCollisionBakeKeyFor(entity(), { maxPads: 4 })
    );
    expect(meshCollisionBakeKeyFor(entity(), { maxPads: MAX_MESH_COLLISION_PADS })).toBe(
      meshCollisionBakeKeyFor(entity())
    );
  });

  it('changes when the model changes', () => {
    expect(meshCollisionBakeKeyFor(entity({ model: 'crate' }))).not.toBe(
      meshCollisionBakeKeyFor(entity({ model: 'barrel' }))
    );
  });

  it('changes when a lower resolution or pad cap would produce different pads', () => {
    const base = meshCollisionBakeKeyFor(entity());
    expect(meshCollisionBakeKeyFor(entity(), { resolution: 8 })).not.toBe(base);
    expect(meshCollisionBakeKeyFor(entity(), { maxPads: 12 })).not.toBe(base);
  });

  it('is null for entities with no bakeable model', () => {
    expect(meshCollisionBakeKeyFor(entity({ model: undefined }))).toBeNull();
  });

  it('ignores scale and collisionSize — pads are baked in local space at scale 1', () => {
    const base = meshCollisionBakeKeyFor(entity());
    expect(meshCollisionBakeKeyFor(entity({ scale: [3, 0.5, 2] }))).toBe(base);
    expect(meshCollisionBakeKeyFor(entity({ collisionSize: [9, 9, 9] }))).toBe(base);
  });
});

describe('needsMeshCollisionBake', () => {
  it('bakes an entity that has no pads at all', () => {
    expect(needsMeshCollisionBake(entity())).toBe(true);
  });

  it('bakes pads saved before bake keys existed', () => {
    expect(needsMeshCollisionBake(entity({ meshCollisionPads: PADS }))).toBe(true);
  });

  it('skips an entity whose key still matches — the repeat Play Test case', () => {
    const e = entity();
    const fresh = entity({
      meshCollisionPads: PADS,
      meshCollisionBakeKey: meshCollisionBakeKeyFor(e)!,
    });
    expect(needsMeshCollisionBake(fresh)).toBe(false);
  });

  it('re-bakes when the model was swapped under an existing bake', () => {
    const stale = entity({
      model: 'barrel',
      meshCollisionPads: PADS,
      meshCollisionBakeKey: meshCollisionBakeKeyFor(entity({ model: 'crate' }))!,
    });
    expect(needsMeshCollisionBake(stale)).toBe(true);
  });

  it('re-bakes when the key came from an older voxelizer version', () => {
    const stale = entity({
      meshCollisionPads: PADS,
      meshCollisionBakeKey: meshCollisionBakeKeyFor(entity())!.replace(
        `v${VOXELIZER_VERSION}`,
        `v${VOXELIZER_VERSION - 1}`
      ),
    });
    expect(needsMeshCollisionBake(stale)).toBe(true);
  });

  it('leaves existing pads alone when no key can be derived', () => {
    const e = entity({ model: undefined, meshCollisionPads: PADS });
    expect(needsMeshCollisionBake(e)).toBe(false);
  });
});
