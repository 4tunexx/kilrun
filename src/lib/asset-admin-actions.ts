'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import type { AssetCategory, AssetRarity } from '@/lib/asset-registry';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || !canAccessAdmin(user.role) || user.role !== 'admin') {
    throw new Error('Admin only');
  }
  return user;
}

export type AssetListFilters = {
  q?: string;
  category?: string;
  rarity?: string;
  enabled?: boolean;
  shopVisible?: boolean;
  featured?: boolean;
  take?: number;
  skip?: number;
};

export async function adminListAssets(filters: AssetListFilters = {}) {
  await requireAdmin();
  const where: Record<string, unknown> = {};
  if (filters.category) where.category = filters.category;
  if (filters.rarity) where.rarity = filters.rarity;
  if (typeof filters.enabled === 'boolean') where.enabled = filters.enabled;
  if (typeof filters.shopVisible === 'boolean') where.shopVisible = filters.shopVisible;
  if (typeof filters.featured === 'boolean') where.featured = filters.featured;
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { displayName: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { assetId: { contains: q, mode: 'insensitive' } },
    ];
  }
  const take = Math.min(Math.max(filters.take ?? 100, 1), 500);
  const skip = Math.max(filters.skip ?? 0, 0);
  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
      take,
      skip,
    }),
    prisma.asset.count({ where }),
  ]);
  return { items, total };
}

export async function adminUpsertAsset(input: {
  assetId: string;
  name: string;
  displayName: string;
  category: AssetCategory | string;
  rarity?: AssetRarity | string;
  price?: number;
  currency?: string;
  modelPath: string;
  texturePath?: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  enabled?: boolean;
  hidden?: boolean;
  featured?: boolean;
  shopVisible?: boolean;
  equipSlot: string;
  tags?: string[];
  sortOrder?: number;
}) {
  await requireAdmin();
  return prisma.asset.upsert({
    where: { assetId: input.assetId },
    create: {
      assetId: input.assetId,
      name: input.name,
      displayName: input.displayName,
      category: input.category,
      rarity: input.rarity ?? 'common',
      price: input.price ?? 0,
      currency: input.currency ?? 'vp',
      modelPath: input.modelPath,
      texturePath: input.texturePath ?? '',
      previewUrl: input.previewUrl,
      thumbnailUrl: input.thumbnailUrl,
      enabled: input.enabled ?? true,
      hidden: input.hidden ?? false,
      featured: input.featured ?? false,
      shopVisible: input.shopVisible ?? false,
      equipSlot: input.equipSlot,
      tags: input.tags ?? [],
      sortOrder: input.sortOrder ?? 0,
    },
    update: {
      name: input.name,
      displayName: input.displayName,
      category: input.category,
      rarity: input.rarity,
      price: input.price,
      currency: input.currency,
      modelPath: input.modelPath,
      texturePath: input.texturePath,
      previewUrl: input.previewUrl,
      thumbnailUrl: input.thumbnailUrl,
      enabled: input.enabled,
      hidden: input.hidden,
      featured: input.featured,
      shopVisible: input.shopVisible,
      equipSlot: input.equipSlot,
      tags: input.tags,
      sortOrder: input.sortOrder,
    },
  });
}

export async function adminDeleteAsset(assetId: string) {
  await requireAdmin();
  await prisma.asset.delete({ where: { assetId } });
  return { ok: true };
}

export async function adminBulkUpdateAssets(
  assetIds: string[],
  changes: {
    enabled?: boolean;
    hidden?: boolean;
    featured?: boolean;
    shopVisible?: boolean;
    rarity?: string;
    price?: number;
  }
) {
  await requireAdmin();
  const result = await prisma.asset.updateMany({
    where: { assetId: { in: assetIds } },
    data: changes,
  });
  return { updated: result.count };
}

export async function adminPublishAssetToShop(assetId: string, priceOverride?: number) {
  await requireAdmin();
  const asset = await prisma.asset.findUnique({ where: { assetId } });
  if (!asset) throw new Error('Asset not found');

  const sku = `asset_${asset.assetId}`;
  const vpPrice = typeof priceOverride === 'number' ? priceOverride : asset.price;
  const skinSlot = asset.equipSlot.replace(/^skin_/, '') || 'addon';
  const cosmeticConfig = {
    kind: 'player_skin',
    version: 3,
    id: asset.assetId,
    name: asset.displayName,
    baseModelKey: 'pack-body-blue-001',
    primarySlot: skinSlot,
    attachments: [
      {
        id: asset.assetId,
        slot: skinSlot,
        customModelUrl: asset.modelPath,
        textureUrl: asset.texturePath || undefined,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        // Pack cosmetics are skinned and rebound automatically. This value is
        // only used by genuinely rigid custom props.
        attachMode: asset.category === 'fullbody' ? 'body' : 'bone',
      },
    ],
    thumbnail: asset.thumbnailUrl ?? asset.previewUrl,
  };

  await prisma.storeItem.upsert({
    where: { itemSku: sku },
    create: {
      itemName: asset.displayName,
      itemCategory: asset.category === 'fullbody' ? 'Skins' : 'Cosmetics',
      itemSku: sku,
      vpPrice,
      imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? undefined,
      isAvailable: true,
      cosmeticSlot: asset.equipSlot,
      cosmeticConfig,
    },
    update: {
      itemName: asset.displayName,
      vpPrice,
      imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? undefined,
      isAvailable: true,
      cosmeticSlot: asset.equipSlot,
      cosmeticConfig,
    },
  });

  await prisma.asset.update({
    where: { assetId },
    data: { shopVisible: true, price: vpPrice },
  });

  return { ok: true, sku };
}

export async function adminRemoveAssetFromShop(assetId: string) {
  await requireAdmin();
  const sku = `asset_${assetId}`;
  await prisma.storeItem.updateMany({
    where: { itemSku: sku },
    data: { isAvailable: false },
  });
  await prisma.asset.update({
    where: { assetId },
    data: { shopVisible: false },
  });
  return { ok: true };
}

/** Public/editor: list enabled assets (falls back empty if table missing). */
export async function listPublicAssets(category?: string) {
  try {
    return await prisma.asset.findMany({
      where: {
        enabled: true,
        hidden: false,
        ...(category ? { category } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
      take: 500,
    });
  } catch {
    return [];
  }
}
