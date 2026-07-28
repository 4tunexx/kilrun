/**
 * Grant StoreItems linked via unlockType + unlockRef when a mission /
 * achievement / badge unlocks. Idempotent per user + itemSku.
 */

import { prisma } from '@/lib/prisma';

export async function grantStoreItemsForUnlock(
  userId: string,
  unlockType: string,
  unlockRef: string
): Promise<number> {
  if (!userId || !unlockType || !unlockRef) return 0;
  const type = unlockType.trim().toLowerCase();
  const ref = unlockRef.trim();
  if (!ref) return 0;
  if (!['mission', 'achievement', 'badge', 'event'].includes(type)) return 0;

  const items = await prisma.storeItem.findMany({
    where: {
      isAvailable: true,
      unlockType: type,
      unlockRef: ref,
    },
  });
  if (!items.length) return 0;

  let granted = 0;
  for (const item of items) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { userId, itemSku: item.itemSku },
    });
    if (existing) continue;

    await prisma.inventoryItem.create({
      data: {
        userId,
        itemName: item.itemName,
        itemCategory: item.itemCategory,
        itemSku: item.itemSku,
        imageUrl: item.imageUrl ?? null,
        cosmeticSlot: item.cosmeticSlot ?? null,
        cosmeticConfig: item.cosmeticConfig ?? undefined,
        bannerConfig: item.bannerConfig ?? undefined,
        vpValue: 0,
        isEquipped: false,
      },
    });
    granted += 1;
  }
  return granted;
}
