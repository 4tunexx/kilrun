import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { persistSiteImage } from '@/lib/site-asset-upload';
import { isSkinCosmeticSlot, parseSkinConfig } from '@/lib/player-skins';
import type { BannerConfig } from '@/lib/banner';

export type UpsertStoreItemInput = {
  id?: string;
  itemName: string;
  itemCategory: string;
  itemSku: string;
  vpPrice: number;
  imageUrl?: string;
  isAvailable?: boolean;
  cosmeticSlot?: string | null;
  bannerConfig?: BannerConfig | null;
  cosmeticConfig?: Record<string, unknown> | null;
};

async function persistSkinAssetUrls(
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const next = { ...config };
  const atts = Array.isArray(next.attachments) ? [...(next.attachments as unknown[])] : null;
  if (!atts) return next;

  const mapped = [];
  for (const raw of atts) {
    if (!raw || typeof raw !== 'object') {
      mapped.push(raw);
      continue;
    }
    const att = { ...(raw as Record<string, unknown>) };
    for (const key of ['textureUrl', 'customModelUrl'] as const) {
      const val = att[key];
      if (typeof val === 'string' && val.startsWith('data:image/')) {
        try {
          att[key] = await persistSiteImage(val, 'misc');
        } catch {
          /* keep data URL */
        }
      }
    }
    mapped.push(att);
  }
  next.attachments = mapped;
  return next;
}

const MAX_VP_PRICE = 1_000_000;

function validateStoreItemInput(input: UpsertStoreItemInput): void {
  if (!input.itemName?.trim()) throw new Error('Item name is required');
  if (input.itemName.trim().length > 120) throw new Error('Item name is too long (max 120 characters)');
  if (!input.itemCategory?.trim()) throw new Error('Item category is required');
  if (input.itemCategory.trim().length > 60) throw new Error('Item category is too long (max 60 characters)');
  if (!input.itemSku?.trim()) throw new Error('Item SKU is required');
  if (input.itemSku.trim().length > 80) throw new Error('Item SKU is too long (max 80 characters)');
  if (!Number.isFinite(input.vpPrice)) throw new Error('VP price must be a number');
  if (input.vpPrice < 0) throw new Error('VP price cannot be negative');
  if (input.vpPrice > MAX_VP_PRICE) throw new Error(`VP price is too large (max ${MAX_VP_PRICE})`);
}

export async function upsertStoreItemAsStaff(input: UpsertStoreItemInput) {
  validateStoreItemInput(input);
  const isSkin =
    input.itemCategory === 'Skins' || isSkinCosmeticSlot(input.cosmeticSlot ?? undefined);
  if (isSkin) {
    if (!input.cosmeticConfig) {
      throw new Error(
        'Skins require a mesh config. Use Cosmetics Studio → Skins or Model Editor → Publish to shop.'
      );
    }
    const parsed = parseSkinConfig(input.cosmeticConfig);
    if (!parsed?.attachments?.length) {
      throw new Error(
        'Skin cosmeticConfig must include at least one attachment (primitive / model).'
      );
    }
  }

  let imageUrl = input.imageUrl;
  if (imageUrl && /^data:image\//i.test(imageUrl)) {
    try {
      imageUrl = await persistSiteImage(imageUrl, 'misc');
    } catch (err) {
      console.warn('[upsertStoreItem] thumbnail persist failed, keeping data URL', err);
    }
  }

  let cosmeticConfig = input.cosmeticConfig;
  if (cosmeticConfig && typeof cosmeticConfig === 'object') {
    cosmeticConfig = await persistSkinAssetUrls(cosmeticConfig);
  }

  const cosmeticData =
    input.cosmeticSlot !== undefined
      ? {
          cosmeticSlot: input.cosmeticSlot,
          bannerConfig:
            input.bannerConfig === null
              ? null
              : input.bannerConfig !== undefined
                ? (input.bannerConfig as unknown as Prisma.InputJsonValue)
                : undefined,
          cosmeticConfig:
            cosmeticConfig === null
              ? null
              : cosmeticConfig !== undefined
                ? (cosmeticConfig as unknown as Prisma.InputJsonValue)
                : undefined,
        }
      : {};

  if (input.id) {
    return prisma.storeItem.update({
      where: { id: input.id },
      data: {
        itemName: input.itemName,
        itemCategory: input.itemCategory,
        itemSku: input.itemSku,
        vpPrice: input.vpPrice,
        imageUrl,
        isAvailable: input.isAvailable ?? true,
        ...cosmeticData,
      },
    });
  }
  return prisma.storeItem.create({
    data: {
      itemName: input.itemName,
      itemCategory: input.itemCategory,
      itemSku: input.itemSku,
      vpPrice: input.vpPrice,
      imageUrl,
      isAvailable: input.isAvailable ?? true,
      ...cosmeticData,
    },
  });
}
