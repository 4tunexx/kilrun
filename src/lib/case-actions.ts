'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processWebsiteAction, grantXp } from '@/lib/progression-actions';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type CaseItemPublic = {
  id: string;
  displayName: string;
  displayImage: string;
  rarity: string;
  dropWeight: number;
  chancePercent: number;
  rewardType: 'cosmetic' | 'currency';
  vpAmount: number;
  xpAmount: number;
};

export type CaseDto = {
  id: string;
  name: string;
  imageUrl: string;
  openImageUrl: string;
  description: string;
  acquireType: string;
  vpPrice: number;
  items: CaseItemPublic[];
  /** Whether the viewer can open it right now (free cooldown elapsed, or can afford it). */
  canOpen: boolean;
  /** ISO timestamp when a free case becomes available again, if on cooldown. */
  nextFreeAt: string | null;
};

export type CaseOpenResultDto = {
  wonItemId: string;
  wonName: string;
  wonImage: string;
  wonRarity: string;
  wonRewardType: 'cosmetic' | 'currency';
  wonVpAmount: number;
  wonXpAmount: number;
  /** Closed/opened crate artwork, so the unboxing animation doesn't need a second fetch. */
  caseImageUrl: string;
  caseOpenImageUrl: string;
  /** Full reordered item list (with the won item at a fixed index) for the unboxing reel animation. */
  reel: CaseItemPublic[];
  wonIndex: number;
};

async function requireSessionUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Account banned');
  return user;
}

function toItemPublic(item: {
  id: string;
  displayName: string;
  displayImage: string;
  rarity: string;
  dropWeight: number;
  rewardType: string;
  vpAmount: number;
  xpAmount: number;
}, totalWeight: number): CaseItemPublic {
  return {
    id: item.id,
    displayName: item.displayName,
    displayImage: item.displayImage,
    rarity: item.rarity,
    dropWeight: item.dropWeight,
    chancePercent: totalWeight > 0 ? Math.round((item.dropWeight / totalWeight) * 1000) / 10 : 0,
    rewardType: item.rewardType === 'currency' ? 'currency' : 'cosmetic',
    vpAmount: item.vpAmount,
    xpAmount: item.xpAmount,
  };
}

function freeCooldownMs(acquireType: string): number | null {
  if (acquireType === 'free_daily') return DAY_MS;
  if (acquireType === 'free_weekly') return WEEK_MS;
  return null;
}

export async function getAvailableCases(): Promise<CaseDto[]> {
  const user = await requireSessionUser();
  const cases = await prisma.caseDefinition.findMany({
    where: { isActive: true },
    include: { items: true },
    orderBy: { sortOrder: 'asc' },
  });

  const lastFreeMap = (user.lastFreeCaseAt as Record<string, string> | null) ?? {};

  return cases.map((c) => {
    const totalWeight = c.items.reduce((sum, i) => sum + i.dropWeight, 0);
    const items = c.items.map((i) => toItemPublic(i, totalWeight));
    const cooldownMs = freeCooldownMs(c.acquireType);

    let canOpen = true;
    let nextFreeAt: string | null = null;
    if (cooldownMs) {
      const last = lastFreeMap[c.id] ? new Date(lastFreeMap[c.id]).getTime() : 0;
      const readyAt = last + cooldownMs;
      canOpen = Date.now() >= readyAt;
      nextFreeAt = canOpen ? null : new Date(readyAt).toISOString();
    } else if (c.acquireType === 'vp_purchase') {
      canOpen = user.vpCurrency >= c.vpPrice;
    } else if (c.acquireType === 'admin_grant') {
      canOpen = false; // only opened via admin-granted access, not shown as directly openable
    }

    return {
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl,
      openImageUrl: c.openImageUrl,
      description: c.description,
      acquireType: c.acquireType,
      vpPrice: c.vpPrice,
      items,
      canOpen,
      nextFreeAt,
    };
  });
}

function weightedPick<T extends { dropWeight: number }>(items: T[]): T {
  const total = items.reduce((sum, i) => sum + i.dropWeight, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.dropWeight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export async function openCase(caseId: string): Promise<CaseOpenResultDto> {
  const user = await requireSessionUser();
  const def = await prisma.caseDefinition.findUnique({
    where: { id: caseId },
    include: { items: true },
  });
  if (!def || !def.isActive) throw new Error('Case not available');
  if (def.items.length === 0) throw new Error('This case has no items configured');

  const cooldownMs = freeCooldownMs(def.acquireType);
  const lastFreeMap = { ...((user.lastFreeCaseAt as Record<string, string> | null) ?? {}) };

  if (cooldownMs) {
    const last = lastFreeMap[def.id] ? new Date(lastFreeMap[def.id]).getTime() : 0;
    if (Date.now() < last + cooldownMs) {
      throw new Error('This free case is on cooldown');
    }
  } else if (def.acquireType === 'vp_purchase') {
    if (def.vpPrice > 0) {
      const paid = await prisma.user.updateMany({
        where: { id: user.id, vpCurrency: { gte: def.vpPrice } },
        data: { vpCurrency: { decrement: def.vpPrice } },
      });
      if (paid.count === 0) throw new Error('Not enough VP');
    }
  } else if (def.acquireType === 'admin_grant') {
    throw new Error('This case can only be granted by staff');
  }

  const won = weightedPick(def.items);

  try {
    // Currency reward — credit VP/XP directly, no inventory item.
    if (won.rewardType === 'currency') {
      if (won.vpAmount > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { vpCurrency: { increment: won.vpAmount } },
        });
      }
      if (won.xpAmount > 0) {
        await grantXp(user.id, won.xpAmount, `Case: ${def.name}`).catch(() => {});
      }
    }
    // Grant into inventory if it references a StoreItem cosmetic — same
    // snapshot pattern as a normal purchase, so later catalog edits don't
    // retroactively change what the player already won.
    else if (won.storeItemSku) {
      const storeItem = await prisma.storeItem.findUnique({ where: { itemSku: won.storeItemSku } });
      if (storeItem) {
        const owned = await prisma.inventoryItem.findFirst({
          where: { userId: user.id, itemSku: storeItem.itemSku },
        });
        if (!owned) {
          await prisma.inventoryItem.create({
            data: {
              userId: user.id,
              itemSku: storeItem.itemSku,
              itemName: storeItem.itemName,
              itemCategory: storeItem.itemCategory,
              cosmeticSlot: storeItem.cosmeticSlot ?? null,
              bannerConfig: storeItem.bannerConfig ?? undefined,
              cosmeticConfig: storeItem.cosmeticConfig ?? undefined,
              imageUrl: storeItem.imageUrl ?? null,
              vpValue: 0,
            },
          });
        }
      }
    } else if (won.assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: won.assetId } });
      if (asset) {
        const owned = await prisma.inventoryItem.findFirst({
          where: { userId: user.id, itemSku: asset.assetId },
        });
        if (!owned) {
          await prisma.inventoryItem.create({
            data: {
              userId: user.id,
              itemSku: asset.assetId,
              itemName: asset.displayName,
              itemCategory: asset.category,
              cosmeticSlot: asset.equipSlot,
              imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? null,
              vpValue: 0,
            },
          });
        }
      }
    }

    await prisma.caseOpenLog.create({
      data: {
        userId: user.id,
        caseId: def.id,
        caseItemId: won.id,
        wonName: won.displayName,
        wonImage: won.displayImage,
        wonRarity: won.rarity,
      },
    });

    if (cooldownMs) {
      lastFreeMap[def.id] = new Date().toISOString();
      await prisma.user.update({
        where: { id: user.id },
        data: { lastFreeCaseAt: lastFreeMap },
      });
    }
  } catch (err) {
    // Best-effort VP refund if the grant/log write fails after debit.
    if (def.acquireType === 'vp_purchase' && def.vpPrice > 0) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { vpCurrency: { increment: def.vpPrice } },
        });
      } catch {
        /* ignore refund failure */
      }
    }
    throw err;
  }

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Case opened',
      body: `You won ${won.displayName} (${won.rarity}) from ${def.name}.`,
      type: 'case_opened',
    },
  });

  await processWebsiteAction(user.id, 'cases_opened').catch(() => {});
  if (won.rarity === 'legendary') {
    await processWebsiteAction(user.id, 'legendary_cases_opened').catch(() => {});
  }

  const totalWeight = def.items.reduce((sum, i) => sum + i.dropWeight, 0);
  const reel = def.items.map((i) => toItemPublic(i, totalWeight));
  const wonIndex = reel.findIndex((i) => i.id === won.id);

  return {
    wonItemId: won.id,
    wonName: won.displayName,
    wonImage: won.displayImage,
    wonRarity: won.rarity,
    wonRewardType: won.rewardType === 'currency' ? 'currency' : 'cosmetic',
    wonVpAmount: won.vpAmount,
    wonXpAmount: won.xpAmount,
    caseImageUrl: def.imageUrl,
    caseOpenImageUrl: def.openImageUrl,
    reel,
    wonIndex: wonIndex >= 0 ? wonIndex : 0,
  };
}

export async function getCaseOpenHistory(limit = 20) {
  const user = await requireSessionUser();
  const rows = await prisma.caseOpenLog.findMany({
    where: { userId: user.id },
    orderBy: { openedAt: 'desc' },
    take: Math.min(100, Math.max(1, limit)),
  });
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    wonName: r.wonName,
    wonImage: r.wonImage,
    wonRarity: r.wonRarity,
    openedAt: r.openedAt.toISOString(),
  }));
}
