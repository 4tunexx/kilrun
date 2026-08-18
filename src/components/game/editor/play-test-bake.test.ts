import { describe, expect, it } from 'vitest';
import { PLAY_TEST_MESH_BAKE_OPTS } from './play-test-bake';

describe('Play Test collision bake flags', () => {
  it('bakes only stale mesh collision, so a second Play Test entry is instant', () => {
    // force: true re-voxelized every solid prop on every entry. Staleness is
    // now tracked by meshCollisionBakeKey, so unchanged entities are skipped.
    expect(PLAY_TEST_MESH_BAKE_OPTS.force).toBe(false);
    expect(PLAY_TEST_MESH_BAKE_OPTS.silent).toBe(true);
  });
});
