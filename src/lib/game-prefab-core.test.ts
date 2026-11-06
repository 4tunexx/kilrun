import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPrefab: vi.fn(),
  findPrefab: vi.fn(),
  updatePrefab: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gamePrefab: {
      create: mocks.createPrefab,
      findFirst: mocks.findPrefab,
      update: mocks.updatePrefab,
    },
  },
}));
vi.mock('@/lib/site-asset-upload', () => ({ persistSiteImage: vi.fn() }));

describe('publishCloudPrefabAsStaff', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createPrefab.mockReset();
    mocks.findPrefab.mockReset();
    mocks.updatePrefab.mockReset();
  });

  it('rejects oversized inline model assets without writing a lossy prefab', async () => {
    const { publishCloudPrefabAsStaff } = await import('./game-prefab-core');
    const heavyUrl = `data:model/gltf-binary;base64,${'A'.repeat(9000)}`;

    await expect(
      publishCloudPrefabAsStaff('staff-1', {
        name: 'Inline model',
        entities: [{ id: 'entity-1', customModelUrl: heavyUrl } as never],
      })
    ).rejects.toThrow('Upload the model and use its /game/... URL before publishing');
    expect(mocks.createPrefab).not.toHaveBeenCalled();
    expect(mocks.updatePrefab).not.toHaveBeenCalled();
  });
});
