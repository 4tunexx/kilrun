import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUniqueUser: vi.fn(),
  findManyMaps: vi.fn(),
  deleteManyMaps: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/roles', () => ({ canAccessAdmin: () => true }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUniqueUser },
    gameMap: {
      findMany: mocks.findManyMaps,
      deleteMany: mocks.deleteManyMaps,
    },
  },
}));
vi.mock('@/lib/game-map-core', () => ({
  listCloudMapDocumentsForStaff: vi.fn(),
  publishCloudMapAsStaff: vi.fn(),
  setActiveCloudMapForStaff: vi.fn(),
}));

describe('deleteCloudMapsMatching active-map safety', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.auth.mockResolvedValue({ user: { steamId: 'staff-steam-id' } });
    mocks.findUniqueUser.mockResolvedValue({ id: 'staff-1', role: 'admin', isBanned: false });
    mocks.findManyMaps.mockReset();
    mocks.deleteManyMaps.mockReset();
  });

  it('refuses to delete an active matching map', async () => {
    mocks.findManyMaps.mockResolvedValue([
      { id: 'active-1', name: 'Live Arena', mode: 'deathrun', isActive: true },
      { id: 'draft-1', name: 'Live Arena', mode: 'deathrun', isActive: false },
    ]);
    const { deleteCloudMapsMatching } = await import('./game-map-actions');

    await expect(
      deleteCloudMapsMatching({ mode: 'deathrun', localId: 'map-local', name: 'Live Arena' })
    ).rejects.toThrow('is the live Active map for deathrun');
    expect(mocks.deleteManyMaps).not.toHaveBeenCalled();
  });

  it('deletes matching rows when none is active', async () => {
    mocks.findManyMaps.mockResolvedValue([
      { id: 'draft-1', name: 'Draft Arena', mode: 'deathrun', isActive: false },
    ]);
    const { deleteCloudMapsMatching } = await import('./game-map-actions');

    await expect(
      deleteCloudMapsMatching({ mode: 'deathrun', localId: 'map-local', name: 'Draft Arena' })
    ).resolves.toEqual({ deleted: 1, names: ['Draft Arena'] });
    expect(mocks.deleteManyMaps).toHaveBeenCalledWith({ where: { id: { in: ['draft-1'] } } });
  });
});
