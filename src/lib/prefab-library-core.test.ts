import { beforeEach, describe, expect, it, vi } from 'vitest';

// deletePrefabModelAsStaff used to only delete the MapPrefabModel row and
// never touch the underlying file — a permanent storage-cost leak on every
// delete. The fix must also never delete a file that's still referenced
// elsewhere (placing a prefab copies its URL into the map/prefab JSON
// rather than keeping a live foreign key), or a live map's model 404s.

const state = {
  prefabRows: [] as Array<{ id: string; name: string; modelUrl: string; previewUrl: string | null }>,
  gameMaps: [] as Array<{ id: string; documentJson: string }>,
  gamePrefabs: [] as Array<{ id: string; entitiesJson: string }>,
};

const deletePersistedAsset = vi.fn(async () => {});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    mapPrefabModel: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        state.prefabRows.find((r) => r.id === id) ?? null,
      findFirst: async ({ where }: { where: { id?: { not: string }; OR?: Array<Record<string, string>> } }) =>
        state.prefabRows.find((r) => {
          if (where.id && r.id === where.id.not) return false;
          return (where.OR ?? []).some(
            (cond) => ('modelUrl' in cond && cond.modelUrl === r.modelUrl) ||
              ('previewUrl' in cond && cond.previewUrl === r.previewUrl)
          );
        }) ?? null,
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        state.prefabRows = state.prefabRows.filter((r) => r.id !== id);
      },
    },
    gameMap: {
      findFirst: async ({ where }: { where: { documentJson: { contains: string } } }) =>
        state.gameMaps.find((m) => m.documentJson.includes(where.documentJson.contains)) ?? null,
    },
    gamePrefab: {
      findFirst: async ({ where }: { where: { entitiesJson: { contains: string } } }) =>
        state.gamePrefabs.find((p) => p.entitiesJson.includes(where.entitiesJson.contains)) ?? null,
    },
    user: {
      findUnique: async () => ({ username: 'staff' }),
    },
  },
}));
vi.mock('@/lib/site-asset-upload', () => ({ persistSiteImage: vi.fn() }));
vi.mock('@/lib/model-asset-core', () => ({
  persistModelFromDataUrl: vi.fn(),
  deletePersistedAsset,
}));
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(async () => {}) }));

describe('deletePrefabModelAsStaff (orphaned asset cleanup)', () => {
  beforeEach(() => {
    vi.resetModules();
    deletePersistedAsset.mockClear();
    state.prefabRows = [
      { id: 'p1', name: 'Crate', modelUrl: '/uploads/models/model-abc.glb', previewUrl: '/uploads/site/misc-1.png' },
    ];
    state.gameMaps = [];
    state.gamePrefabs = [];
  });

  it('deletes the model + preview files when nothing else references them', async () => {
    const { deletePrefabModelAsStaff } = await import('./prefab-library-core');
    await deletePrefabModelAsStaff('p1', 'staff-1');
    expect(deletePersistedAsset).toHaveBeenCalledWith('/uploads/models/model-abc.glb');
    expect(deletePersistedAsset).toHaveBeenCalledWith('/uploads/site/misc-1.png');
  });

  it('does not delete the model file if another prefab row still uses it (dedup)', async () => {
    state.prefabRows.push({
      id: 'p2',
      name: 'Crate variant',
      modelUrl: '/uploads/models/model-abc.glb',
      previewUrl: null,
    });
    const { deletePrefabModelAsStaff } = await import('./prefab-library-core');
    await deletePrefabModelAsStaff('p1', 'staff-1');
    expect(deletePersistedAsset).not.toHaveBeenCalledWith('/uploads/models/model-abc.glb');
  });

  it('does not delete the model file if a published GameMap still embeds its URL', async () => {
    state.gameMaps.push({
      id: 'map1',
      documentJson: JSON.stringify({ entities: [{ customModelUrl: '/uploads/models/model-abc.glb' }] }),
    });
    const { deletePrefabModelAsStaff } = await import('./prefab-library-core');
    await deletePrefabModelAsStaff('p1', 'staff-1');
    expect(deletePersistedAsset).not.toHaveBeenCalledWith('/uploads/models/model-abc.glb');
    // Preview wasn't referenced anywhere, so it's still safe to clean up.
    expect(deletePersistedAsset).toHaveBeenCalledWith('/uploads/site/misc-1.png');
  });

  it('does not delete the model file if a saved cloud prefab stamp still embeds its URL', async () => {
    state.gamePrefabs.push({
      id: 'gp1',
      entitiesJson: JSON.stringify([{ customModelUrl: '/uploads/models/model-abc.glb' }]),
    });
    const { deletePrefabModelAsStaff } = await import('./prefab-library-core');
    await deletePrefabModelAsStaff('p1', 'staff-1');
    expect(deletePersistedAsset).not.toHaveBeenCalledWith('/uploads/models/model-abc.glb');
  });

  it('still removes the database row even when the file is kept', async () => {
    state.gameMaps.push({
      id: 'map1',
      documentJson: JSON.stringify({ entities: [{ customModelUrl: '/uploads/models/model-abc.glb' }] }),
    });
    const { deletePrefabModelAsStaff } = await import('./prefab-library-core');
    await deletePrefabModelAsStaff('p1', 'staff-1');
    expect(state.prefabRows.find((r) => r.id === 'p1')).toBeUndefined();
  });
});
