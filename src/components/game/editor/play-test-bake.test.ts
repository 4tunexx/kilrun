import { describe, expect, it } from 'vitest';
import { PLAY_TEST_MESH_BAKE_OPTS } from './play-test-bake';

describe('Play Test collision bake flags', () => {
  it('force-rebakes mesh collision before Play Test and Live Play Test', () => {
    expect(PLAY_TEST_MESH_BAKE_OPTS.force).toBe(true);
    expect(PLAY_TEST_MESH_BAKE_OPTS.silent).toBe(true);
  });
});
