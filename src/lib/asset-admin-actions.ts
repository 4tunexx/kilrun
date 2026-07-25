'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { Prisma } from '@/generated/prisma';
import type { AssetCategory, AssetRarity } from '@/lib/asset-registry';
import { classifyAssetFilename } from '@/lib/asset-registry';

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

export interface AssetShopListingOptions {
  price?: number;
  itemName?: string;
  /** null/'purchase' = buyable; event | mission | achievement | badge = earned. */
  unlockType?: string | null;
  /** Which event/mission/achievement/badge grants it (player-facing). */
  unlockRef?: string | null;
  /** Event countdown end (ISO string). */
  eventEndsAt?: string | null;
  /** Feature on the home dashboard. */
  promoted?: boolean;
  /** Dashboard promo banner: { headline?, colors?, angle? }. */
  promoBanner?: Record<string, unknown> | null;
}

export async function adminPublishAssetToShop(
  assetId: string,
  priceOverride?: number,
  options: AssetShopListingOptions = {}
) {
  await requireAdmin();
  const asset = await prisma.asset.findUnique({ where: { assetId } });
  if (!asset) throw new Error('Asset not found');

  const sku = `asset_${asset.assetId}`;
  const vpPrice =
    typeof options.price === 'number'
      ? options.price
      : typeof priceOverride === 'number'
        ? priceOverride
        : asset.price;
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

  const itemName = options.itemName?.trim() || asset.displayName;
  const unlockType =
    options.unlockType && options.unlockType !== 'purchase' ? options.unlockType : null;
  const listingMeta = {
    unlockType,
    unlockRef: unlockType ? options.unlockRef?.trim() || null : null,
    eventEndsAt: options.eventEndsAt ? new Date(options.eventEndsAt) : null,
    promoted: options.promoted ?? false,
    promoBanner: options.promoBanner
      ? (options.promoBanner as Prisma.InputJsonValue)
      : null,
  };

  await prisma.storeItem.upsert({
    where: { itemSku: sku },
    create: {
      itemName,
      itemCategory: asset.category === 'fullbody' ? 'Skins' : 'Cosmetics',
      itemSku: sku,
      vpPrice,
      imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? undefined,
      isAvailable: true,
      cosmeticSlot: asset.equipSlot,
      cosmeticConfig,
      ...listingMeta,
    },
    update: {
      itemName,
      vpPrice,
      imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? undefined,
      isAvailable: true,
      cosmeticSlot: asset.equipSlot,
      cosmeticConfig,
      ...listingMeta,
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

/**
 * Upload a new skin asset (GLB/FBX as data URL) into the registry.
 * The asset starts disabled — activate it in the Assets tab, then list it
 * via Shop → Cosmetics Studio → Skins.
 */
export async function adminUploadAsset(input: {
  fileName: string;
  modelDataUrl: string;
  thumbnailDataUrl?: string | null;
  displayName?: string;
  category?: string;
  equipSlot?: string;
  rarity?: string;
  price?: number;
}) {
  await requireAdmin();

  const { uploadModelGlb } = await import('@/lib/model-asset-upload');
  const modelPath = await uploadModelGlb(input.modelDataUrl);

  let thumbnailUrl: string | null = null;
  if (input.thumbnailDataUrl?.startsWith('data:image/')) {
    try {
      const { persistSiteImage } = await import('@/lib/site-asset-upload');
      thumbnailUrl = await persistSiteImage(input.thumbnailDataUrl, 'misc');
    } catch {
      thumbnailUrl = null;
    }
  }

  const classified = classifyAssetFilename(input.fileName);
  const category = input.category || classified?.category || 'addon';
  const equipSlot = input.equipSlot || classified?.equipSlot || 'skin_addon';
  const base = input.fileName.replace(/\.[^.]+$/, '');
  const assetId = `upload_${base.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
  const displayName = input.displayName?.trim() || base.replace(/[_-]+/g, ' ');

  const row = await prisma.asset.create({
    data: {
      assetId,
      name: base,
      displayName,
      category,
      rarity: input.rarity ?? 'common',
      price: input.price ?? 0,
      currency: 'vp',
      modelPath,
      texturePath: '',
      thumbnailUrl,
      enabled: false,
      hidden: false,
      featured: false,
      shopVisible: false,
      equipSlot,
      tags: ['uploaded'],
      sortOrder: 999,
    },
  });
  return { ok: true as const, assetId: row.assetId };
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
