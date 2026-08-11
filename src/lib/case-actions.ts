'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';
import { processWebsiteAction, grantXp, metricCountPublic } from '@/lib/progression-actions';
import { getLevelFromXp } from '@/lib/progression';
import { getInventorySlotCap, MAX_STACK_QUANTITY } from '@/lib/inventory-slots';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Weighted expected VP value of a case's contents — used as the crate's
 * `vpValue` in the inventory so resale reflects "value of items inside" via
 * the normal inventory resellRate fee, rather than a flat admin-set number.
 * Currency items use their VP amount (XP is not converted); cosmetic items
 * use the referenced StoreItem/Asset price.
 */
export async function computeCaseExpectedValue(
  items: {
    rewardType: string;
    vpAmount: number;
    storeItemSku: string | null;
    assetId: string | null;
    dropWeight: number;
  }[]
): Promise<number> {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((sum, i) => sum + i.dropWeight, 0) || 1;

  const storeSkus = items.filter((i) => i.storeItemSku).map((i) => i.storeItemSku!);
  const assetIds = items.filter((i) => i.assetId).map((i) => i.assetId!);
  const [storeItems, assets] = await Promise.all([
    storeSkus.length
      ? prisma.storeItem.findMany({ where: { itemSku: { in: storeSkus } } })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.asset.findMany({ where: { id: { in: assetIds } } })
      : Promise.resolve([]),
  ]);
  const storeMap = new Map(storeItems.map((s) => [s.itemSku, s.vpPrice]));
  const assetMap = new Map(assets.map((a) => [a.id, a.price]));

  let expected = 0;
  for (const item of items) {
    let value = 0;
    if (item.rewardType === 'currency') {
      value = item.vpAmount;
    } else if (item.storeItemSku) {
      value = storeMap.get(item.storeItemSku) ?? 0;
    } else if (item.assetId) {
      value = assetMap.get(item.assetId) ?? 0;
    }
    expected += value * (item.dropWeight / totalWeight);
  }
  return Math.round(expected);
}

/** Throws if the player has no free inventory row for one more distinct
 *  item (crates, and non-stacking cosmetic wins, each cost one row). */
async function assertSlotAvailable(userId: string) {
  const [user, rowCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xpProgress: true, extraInventorySlots: true },
    }),
    prisma.inventoryItem.count({ where: { userId } }),
  ]);
  if (!user) throw new Error('User not found');
  const level = getLevelFromXp(user.xpProgress);
  const cap = getInventorySlotCap(level, user.extraInventorySlots);
  if (rowCount >= cap) {
    throw new Error(
      `Inventory full (${rowCount}/${cap} slots). Sell/delete items, level up, or buy more slots.`
    );
  }
}

/**
 * Adds one unit of an item to a user's inventory, stacking onto an existing
 * row with room (quantity below MAX_STACK_QUANTITY) instead of always creating a
 * new row. Once every row of that item is full, a new row is created if a
 * slot is free; if the inventory is completely full, `payoutVpOnFull` (when
 * given) is credited instead so the duplicate is never silently discarded.
 * Returns the row that was updated or created.
 */
async function grantStackableItem(
  userId: string,
  itemSku: string,
  rowData: Omit<Prisma.InventoryItemUncheckedCreateInput, 'userId' | 'itemSku' | 'quantity'>,
  payoutVpOnFull?: number
) {
  const rows = await prisma.inventoryItem.findMany({
    where: { userId, itemSku },
    orderBy: { acquiredAt: 'asc' },
  });
  const target = rows.find((r) => r.quantity < MAX_STACK_QUANTITY);
  if (target) {
    return prisma.inventoryItem.update({
      where: { id: target.id },
      data: { quantity: { increment: 1 } },
    });
  }

  try {
    await assertSlotAvailable(userId);
  } catch (err) {
    if (payoutVpOnFull && payoutVpOnFull > 0) {
      return prisma.user.update({
        where: { id: userId },
        data: { vpCurrency: { increment: payoutVpOnFull } },
      });
    }
    throw err;
  }

  return prisma.inventoryItem.create({
    data: { userId, itemSku, quantity: 1, ...rowData },
  });
}

/** Grants an unopened crate into a player's inventory (admin award, shop purchase, or mission/achievement reward). */
export async function grantCrateToInventory(
  userId: string,
  caseId: string,
  source: 'admin_grant' | 'vp_purchase' | 'mission' | 'achievement'
) {
  const def = await prisma.caseDefinition.findUnique({
    where: { id: caseId },
    include: { items: true },
  });
  if (!def) throw new Error('Case not found');

  const vpValue = await computeCaseExpectedValue(def.items);

  // Unopened crates of the same case stack into one row (up to
  // MAX_STACK_QUANTITY) rather than costing a fresh slot each time — no VP
  // fallback here since a crate has no standalone sell price to pay out.
  const created = await grantStackableItem(userId, `crate:${def.id}`, {
    itemName: def.name,
    itemCategory: 'crate',
    imageUrl: def.imageUrl || null,
    vpValue,
    caseDefId: def.id,
    crateSource: source,
  });

  await prisma.notification.create({
    data: {
      userId,
      title: source === 'admin_grant' ? 'You were awarded a crate' : 'You received a crate',
      body: `${def.name} — head to your Inventory to open it.`,
      type: 'case_granted',
    },
  }).catch(() => {});

  return created;
}

/** Buys an unopened crate with VP for the shop's Crates section — lands in
 *  inventory instead of opening immediately, same as openCase's vp_purchase
 *  path but without auto-resolving a reward. */
export async function purchaseCrateFromShop(caseId: string) {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Account banned');

  const def = await prisma.caseDefinition.findUnique({ where: { id: caseId } });
  if (!def || !def.isActive) throw new Error('Case not available');
  if (def.acquireType !== 'vp_purchase') throw new Error('This case is not purchasable');
  if (def.vpPrice <= 0) throw new Error('This case has no price configured');

  const paid = await prisma.user.updateMany({
    where: { id: user.id, vpCurrency: { gte: def.vpPrice } },
    data: { vpCurrency: { decrement: def.vpPrice } },
  });
  if (paid.count === 0) throw new Error('Not enough VP');

  try {
    return await grantCrateToInventory(user.id, caseId, 'vp_purchase');
  } catch (err) {
    // Refund if the inventory grant failed after the VP debit.
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { vpCurrency: { increment: def.vpPrice } },
      });
    } catch {
      /* ignore refund failure */
    }
    throw err;
  }
}

/**
 * Checks all active "auto_requirement" CaseDefinitions against a player's
 * current metric counts and grants any newly-crossed ones exactly once
 * (tracked in UserCaseAutoGrant). Called from processWebsiteAction so it
 * piggybacks on the same event hooks missions/achievements already use —
 * pass the metric that just changed to avoid scanning every case on every
 * action; cases whose requirementMetric doesn't match are skipped cheaply.
 */
export async function tryAutoGrantCases(userId: string, metric: string) {
  try {
    const candidates = await prisma.caseDefinition.findMany({
      where: { isActive: true, acquireType: 'auto_requirement', requirementMetric: metric },
    });
    if (candidates.length === 0) return;

    for (const def of candidates) {
      if (!def.requirementTarget || def.requirementTarget <= 0) continue;
      const already = await prisma.userCaseAutoGrant.findUnique({
        where: { userId_caseId: { userId, caseId: def.id } },
      });
      if (already) continue;

      const count = await metricCountPublic(userId, metric);
      if (count < def.requirementTarget) continue;

      try {
        await grantCrateToInventory(userId, def.id, 'mission');
        await prisma.userCaseAutoGrant.create({ data: { userId, caseId: def.id } });
      } catch {
        // Slot full / grant failed — don't record it as granted, retry next
        // time this metric fires.
      }
    }
  } catch {
    /* best-effort — never block the underlying action on this */
  }
}

export type CaseItemPublic = {
  id: string;
  displayName: string;
  displayImage: string;
  cosmeticSlot: string | null;
  bannerConfig: unknown;
  cosmeticConfig: unknown;
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
  wonCosmeticSlot: string | null;
  wonBannerConfig: unknown;
  wonCosmeticConfig: unknown;
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
  cosmeticSlot?: string | null;
  bannerConfig?: unknown;
  cosmeticConfig?: unknown;
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
    cosmeticSlot: item.cosmeticSlot ?? null,
    bannerConfig: item.bannerConfig ?? null,
    cosmeticConfig: item.cosmeticConfig ?? null,
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

/**
 * @param scope
 *  - 'cases' (default): the Cases page — free_daily / free_weekly crates
 *    only. VP-purchase crates live in the Shop instead, and admin_grant /
 *    auto_requirement crates never appear in a listing (they land directly
 *    in inventory).
 *  - 'shop': the Store's Crates section — vp_purchase crates only.
 */
export async function getAvailableCases(scope: 'cases' | 'shop' = 'cases'): Promise<CaseDto[]> {
  const user = await requireSessionUser();
  const acquireTypes = scope === 'shop' ? ['vp_purchase'] : ['free_daily', 'free_weekly'];
  const cases = await prisma.caseDefinition.findMany({
    where: { isActive: true, acquireType: { in: acquireTypes } },
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

type CaseDefWithItems = Prisma.CaseDefinitionGetPayload<{ include: { items: true } }>;

/** Picks the won item, applies its reward, logs the open, and builds the unboxing reel/result. Shared by openCase and openCaseFromInventory. */
async function resolveCaseWin(
  user: { id: string },
  def: CaseDefWithItems
): Promise<CaseOpenResultDto> {
  const won = weightedPick(def.items);

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
    // retroactively change what the player already won. Re-winning an
    // already-owned item stacks a quantity onto it (up to MAX_STACK_QUANTITY
    // per row, then a fresh row) rather than vanishing; VP is only paid out
    // as a last resort if the inventory is completely full.
  else if (won.storeItemSku) {
    const storeItem = await prisma.storeItem.findUnique({ where: { itemSku: won.storeItemSku } });
    if (storeItem) {
      await grantStackableItem(
        user.id,
        storeItem.itemSku,
        {
          itemName: storeItem.itemName,
          itemCategory: storeItem.itemCategory,
          cosmeticSlot: storeItem.cosmeticSlot ?? null,
          bannerConfig: storeItem.bannerConfig ?? undefined,
          cosmeticConfig: storeItem.cosmeticConfig ?? undefined,
          imageUrl: storeItem.imageUrl ?? null,
          vpValue: storeItem.vpPrice,
        },
        storeItem.vpPrice
      );
    }
  } else if (won.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: won.assetId } });
    if (asset) {
      await grantStackableItem(
        user.id,
        asset.assetId,
        {
          itemName: asset.displayName,
          itemCategory: asset.category,
          cosmeticSlot: asset.equipSlot,
          imageUrl: asset.thumbnailUrl ?? asset.previewUrl ?? null,
          vpValue: asset.price,
        },
        asset.price
      );
    }
  }

  // The reward itself (VP/XP credit or inventory item, above) is already
  // granted at this point — a failure past this line must NOT bubble up to
  // the caller's catch block, since both openCase() and
  // openCaseFromInventory() treat a thrown error here as "grant the refund /
  // restore the crate", which would double-dip the player (keep the reward
  // AND get the money/crate back). Log/notification are non-critical, so
  // swallow failures instead of throwing.
  await prisma.caseOpenLog.create({
    data: {
      userId: user.id,
      caseId: def.id,
      caseItemId: won.id,
      wonName: won.displayName,
      wonImage: won.displayImage,
      wonRarity: won.rarity,
    },
  }).catch((err) => {
    // Swallowed on purpose (see comment above — must not trigger the
    // caller's refund/restore path), but silent failure here means the
    // carousel's "Crate Opened" feed and the player's own open-history both
    // go quietly empty with zero trace. Log loudly so a real failure is
    // actually visible in server logs instead of looking like "nothing to show."
    console.error(`[resolveCaseWin] caseOpenLog.create failed for user ${user.id}, case ${def.id}`, err);
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Case opened',
      body: `You won ${won.displayName} (${won.rarity}) from ${def.name}.`,
      type: 'case_opened',
    },
  }).catch(() => {});

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
    wonCosmeticSlot: won.cosmeticSlot ?? null,
    wonBannerConfig: won.bannerConfig ?? null,
    wonCosmeticConfig: won.cosmeticConfig ?? null,
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

/** Opens a free/daily/weekly or VP-purchase case directly (not from inventory). */
export async function openCase(caseId: string): Promise<CaseOpenResultDto> {
  const user = await requireSessionUser();
  const def = await prisma.caseDefinition.findUnique({
    where: { id: caseId },
    include: { items: true },
  });
  if (!def || !def.isActive) throw new Error('Case not available');
  if (def.acquireType === 'admin_grant') {
    throw new Error('Open this crate from your Inventory');
  }
  if (def.items.length === 0) throw new Error('This case has no items configured');

  const cooldownMs = freeCooldownMs(def.acquireType);
  const lastFreeMap = { ...((user.lastFreeCaseAt as Record<string, string> | null) ?? {}) };

  if (cooldownMs) {
    const last = lastFreeMap[def.id] ? new Date(lastFreeMap[def.id]).getTime() : 0;
    if (Date.now() < last + cooldownMs) {
      throw new Error('This free case is on cooldown');
    }
  } else if (def.acquireType === 'vp_purchase' && def.vpPrice > 0) {
    const paid = await prisma.user.updateMany({
      where: { id: user.id, vpCurrency: { gte: def.vpPrice } },
      data: { vpCurrency: { decrement: def.vpPrice } },
    });
    if (paid.count === 0) throw new Error('Not enough VP');
  }

  try {
    const result = await resolveCaseWin(user, def);
    if (cooldownMs) {
      lastFreeMap[def.id] = new Date().toISOString();
      await prisma.user.update({
        where: { id: user.id },
        data: { lastFreeCaseAt: lastFreeMap },
      });
    }
    return result;
  } catch (err) {
    // Best-effort VP refund if the reward grant/log write fails after debit.
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
}

/** Opens an unopened crate the player already owns in their inventory (admin-awarded, purchased, or earned from a mission/achievement). */
export async function openCaseFromInventory(inventoryItemId: string): Promise<CaseOpenResultDto> {
  const user = await requireSessionUser();
  const invItem = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!invItem || invItem.userId !== user.id) throw new Error('Crate not found');
  if (invItem.itemCategory !== 'crate' || !invItem.caseDefId) {
    throw new Error('This item is not an unopened crate');
  }

  const def = await prisma.caseDefinition.findUnique({
    where: { id: invItem.caseDefId },
    include: { items: true },
  });
  if (!def) throw new Error('Case not found');
  if (def.items.length === 0) throw new Error('This case has no items configured');

  // Consume the crate up front — if resolveCaseWin fails partway, we don't
  // want the player able to open the same inventory row twice.
  const claimed = await prisma.inventoryItem.deleteMany({
    where: { id: invItem.id, userId: user.id },
  });
  if (claimed.count === 0) throw new Error('That crate was already opened');

  try {
    return await resolveCaseWin(user, def);
  } catch (err) {
    // Restore the crate to inventory if opening failed after it was consumed.
    try {
      await prisma.inventoryItem.create({
        data: {
          userId: user.id,
          itemSku: invItem.itemSku,
          itemName: invItem.itemName,
          itemCategory: 'crate',
          imageUrl: invItem.imageUrl,
          vpValue: invItem.vpValue,
          caseDefId: invItem.caseDefId,
          crateSource: invItem.crateSource,
        },
      });
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  }
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
