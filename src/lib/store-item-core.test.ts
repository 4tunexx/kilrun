import { beforeEach, describe, expect, it, vi } from 'vitest';

// upsertStoreItemAsStaff used to write vpPrice/itemName/itemSku straight to
// the database with no validation at all — negative/NaN/absurd prices and
// unbounded strings all passed through untouched.

const created: Array<Record<string, unknown>> = [];

vi.mock('@/lib/prisma', () => ({
  prisma: {
    storeItem: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'new-item', ...data };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'existing', ...data })),
    },
  },
}));
vi.mock('@/lib/site-asset-upload', () => ({ persistSiteImage: vi.fn(async (url: string) => url) }));
vi.mock('@/lib/player-skins', () => ({
  isSkinCosmeticSlot: () => false,
  parseSkinConfig: () => null,
}));

function validInput(over: Partial<import('./store-item-core').UpsertStoreItemInput> = {}) {
  return {
    itemName: 'Cool Hat',
    itemCategory: 'Skins',
    itemSku: 'hat-001',
    vpPrice: 100,
    ...over,
  };
}

describe('upsertStoreItemAsStaff validation', () => {
  beforeEach(() => {
    created.length = 0;
  });

  it('accepts a well-formed item', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: 250 }))).resolves.toBeTruthy();
  });

  it('rejects a negative price', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: -50 }))
    ).rejects.toThrow(/cannot be negative/i);
  });

  it('rejects NaN/Infinity prices', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: NaN }))
    ).rejects.toThrow(/must be a number/i);
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: Infinity }))
    ).rejects.toThrow(/must be a number/i);
  });

  it('rejects an absurdly large price', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: 50_000_000 }))
    ).rejects.toThrow(/too large/i);
  });

  it('rejects an empty item name', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', itemName: '   ' }))
    ).rejects.toThrow(/name is required/i);
  });

  it('rejects an oversized item name', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', itemName: 'x'.repeat(200) }))
    ).rejects.toThrow(/too long/i);
  });

  it('rejects a missing SKU', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', itemSku: '' }))
    ).rejects.toThrow(/SKU is required/i);
  });

  it('never reaches the database for invalid input', async () => {
    const { upsertStoreItemAsStaff } = await import('./store-item-core');
    await expect(
      upsertStoreItemAsStaff(validInput({ itemCategory: 'Other', vpPrice: -1 }))
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });
});
