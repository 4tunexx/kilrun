/**
 * Shared Play Test / Live Play Test collision bake flags.
 *
 * `force: false` because staleness is now tracked per entity via
 * `EditorEntity.meshCollisionBakeKey` (see needsMeshCollisionBake in
 * mesh-voxelize.ts). Props whose model and voxelizer version are unchanged keep
 * their existing pads, so a second Play Test entry costs nothing instead of
 * re-voxelizing every Solid prop on the main thread. Anything missing a bake,
 * pointing at a different model, or baked by an older VOXELIZER_VERSION is
 * still re-fit automatically, which is the only thing `force: true` was
 * actually buying.
 */
export const PLAY_TEST_MESH_BAKE_OPTS = { silent: true, force: false } as const;
