'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/audit';

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !isAdminRole(user.role)) {
    throw new Error('Admin only');
  }
  return user;
}

export async function adminListCases() {
  await requireAdmin();
  return prisma.caseDefinition.findMany({
    include: { items: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function adminCreateCase(input: {
  name: string;
  imageUrl?: string;
  openImageUrl?: string;
  description?: string;
  acquireType: string;
  vpPrice?: number;
  requirementMetric?: string;
  requirementTarget?: number;
}) {
  const staff = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) throw new Error('Case name is too short');
  if (input.acquireType === 'auto_requirement' && !input.requirementMetric?.trim()) {
    throw new Error('Pick a requirement type for an auto-grant case');
  }

  const created = await prisma.caseDefinition.create({
    data: {
      name,
      imageUrl: (input.imageUrl ?? '').trim(),
      openImageUrl: (input.openImageUrl ?? '').trim(),
      description: (input.description ?? '').trim().slice(0, 500),
      acquireType: input.acquireType,
      vpPrice: Math.max(0, Math.floor(input.vpPrice ?? 0)),
      requirementMetric:
        input.acquireType === 'auto_requirement' ? input.requirementMetric!.trim() : null,
      requirementTarget:
        input.acquireType === 'auto_requirement'
          ? Math.max(1, Math.floor(input.requirementTarget ?? 1))
          : null,
    },
  });
  await writeAuditLog({
    action: 'admin_case_create',
    detail: `caseId=${created.id} name=${name} by=${staff.id}`,
  }).catch(() => {});
  return created;
}

export async function adminUpdateCase(
  caseId: string,
  input: {
    name?: string;
    imageUrl?: string;
    openImageUrl?: string;
    description?: string;
    acquireType?: string;
    vpPrice?: number;
    isActive?: boolean;
    sortOrder?: number;
    requirementMetric?: string | null;
    requirementTarget?: number | null;
  }
) {
  await requireAdmin();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl.trim();
  if (input.openImageUrl !== undefined) data.openImageUrl = input.openImageUrl.trim();
  if (input.description !== undefined) data.description = input.description.trim().slice(0, 500);
  if (input.acquireType !== undefined) {
    data.acquireType = input.acquireType;
    if (input.acquireType !== 'auto_requirement') {
      data.requirementMetric = null;
      data.requirementTarget = null;
    }
  }
  if (input.vpPrice !== undefined) data.vpPrice = Math.max(0, Math.floor(input.vpPrice));
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = Math.floor(input.sortOrder);
  if (input.requirementMetric !== undefined) {
    data.requirementMetric = input.requirementMetric?.trim() || null;
  }
  if (input.requirementTarget !== undefined) {
    data.requirementTarget =
      input.requirementTarget == null ? null : Math.max(1, Math.floor(input.requirementTarget));
  }

  const updated = await prisma.caseDefinition.update({ where: { id: caseId }, data });
  await writeAuditLog({
    action: 'admin_case_update',
    detail: `caseId=${caseId} ${JSON.stringify(input)}`,
  }).catch(() => {});
  return updated;
}

export async function adminDeleteCase(caseId: string) {
  await requireAdmin();

  // Any unopened crate already sitting in a player's inventory points at
  // this caseDefId — once the definition is gone, openCaseFromInventory()
  // would fail with "Case not found" and strand that row forever. Refund
  // each one's stored vpValue (same amount its own resell would return, at
  // 100% since this is an admin removal, not a player choice) instead of
  // leaving a broken crate players can never open or get rid of.
  const strandedCrates = await prisma.inventoryItem.findMany({
    where: { itemCategory: 'crate', caseDefId: caseId },
  });
  for (const crate of strandedCrates) {
    try {
      // vpValue is stored per unit — a stacked row (quantity > 1) must refund
      // the full owned amount, not just one copy's worth.
      const refundAmount = crate.vpValue * Math.max(1, crate.quantity ?? 1);
      await prisma.$transaction([
        prisma.inventoryItem.delete({ where: { id: crate.id } }),
        prisma.user.update({
          where: { id: crate.userId },
          data: { vpCurrency: { increment: refundAmount } },
        }),
      ]);
      await prisma.notification.create({
        data: {
          userId: crate.userId,
          title: 'Crate refunded',
          body: `${crate.itemName} was removed by an admin — you were refunded ${refundAmount} VP.`,
          type: 'case_granted',
        },
      }).catch(() => {});
    } catch {
      /* best-effort per-row refund — don't let one failure block the rest */
    }
  }

  // Dedup rows for the now-deleted "auto_requirement" grant tracking would
  // otherwise reference a caseId that no longer resolves to anything.
  await prisma.userCaseAutoGrant.deleteMany({ where: { caseId } }).catch(() => {});

  await prisma.caseItem.deleteMany({ where: { caseId } });
  await prisma.caseDefinition.delete({ where: { id: caseId } });
  await writeAuditLog({
    action: 'admin_case_delete',
    detail: `caseId=${caseId}${strandedCrates.length ? ` refunded=${strandedCrates.length}` : ''}`,
  }).catch(() => {});
  return { ok: true as const, refundedCrateCount: strandedCrates.length };
}

/** Add an item to a case — a cosmetic (StoreItem/Asset) or a VP/XP currency reward. */
export async function adminAddCaseItem(
  caseId: string,
  input:
    | { source: 'store'; itemSku: string; rarity?: string; dropWeight?: number }
    | { source: 'asset'; assetId: string; rarity?: string; dropWeight?: number }
    | {
        source: 'currency';
        vpAmount?: number;
        xpAmount?: number;
        displayName?: string;
        rarity?: string;
        dropWeight?: number;
      }
) {
  await requireAdmin();
  const dropWeight = Math.max(1, Math.floor(input.dropWeight ?? 100));
  const rarity = input.rarity ?? 'common';

  if (input.source === 'store') {
    const item = await prisma.storeItem.findUnique({ where: { itemSku: input.itemSku } });
    if (!item) throw new Error('Store item not found');
    const created = await prisma.caseItem.create({
      data: {
        caseId,
        rewardType: 'cosmetic',
        storeItemSku: item.itemSku,
        displayName: item.itemName,
        displayImage: item.imageUrl ?? '',
        cosmeticSlot: item.cosmeticSlot ?? undefined,
        bannerConfig: item.bannerConfig ?? undefined,
        cosmeticConfig: item.cosmeticConfig ?? undefined,
        rarity,
        dropWeight,
      },
    });
    return created;
  }

  if (input.source === 'asset') {
    const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new Error('Asset not found');
    const created = await prisma.caseItem.create({
      data: {
        caseId,
        rewardType: 'cosmetic',
        assetId: asset.id,
        displayName: asset.displayName,
        displayImage: asset.thumbnailUrl ?? asset.previewUrl ?? '',
        rarity,
        dropWeight,
      },
    });
    return created;
  }

  const vpAmount = Math.max(0, Math.floor(input.vpAmount ?? 0));
  const xpAmount = Math.max(0, Math.floor(input.xpAmount ?? 0));
  if (vpAmount <= 0 && xpAmount <= 0) {
    throw new Error('Set a VP or XP amount for a currency reward');
  }
  const parts = [
    vpAmount > 0 ? `${vpAmount} VP` : null,
    xpAmount > 0 ? `${xpAmount} XP` : null,
  ].filter(Boolean);
  const displayName = input.displayName?.trim() || parts.join(' + ');

  const created = await prisma.caseItem.create({
    data: {
      caseId,
      rewardType: 'currency',
      vpAmount,
      xpAmount,
      displayName,
      displayImage: '',
      rarity,
      dropWeight,
    },
  });
  return created;
}

export async function adminUpdateCaseItem(
  caseItemId: string,
  input: {
    rarity?: string;
    dropWeight?: number;
    vpAmount?: number;
    xpAmount?: number;
    displayName?: string;
  }
) {
  await requireAdmin();
  const data: Record<string, unknown> = {};
  if (input.rarity !== undefined) data.rarity = input.rarity;
  if (input.dropWeight !== undefined) data.dropWeight = Math.max(1, Math.floor(input.dropWeight));
  if (input.vpAmount !== undefined) data.vpAmount = Math.max(0, Math.floor(input.vpAmount));
  if (input.xpAmount !== undefined) data.xpAmount = Math.max(0, Math.floor(input.xpAmount));
  if (input.displayName !== undefined) data.displayName = input.displayName.trim();
  return prisma.caseItem.update({ where: { id: caseItemId }, data });
}

export async function adminRemoveCaseItem(caseItemId: string) {
  await requireAdmin();
  await prisma.caseItem.delete({ where: { id: caseItemId } });
  return { ok: true as const };
}

/** Award an unopened crate to a specific player — lands directly in their
 *  Inventory (itemCategory "crate") where they can open, sell, or delete it. */
export async function adminGrantCaseToUser(userId: string, caseId: string) {
  const staff = await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const { grantCrateToInventory } = await import('@/lib/case-actions');
  const invItem = await grantCrateToInventory(userId, caseId, 'admin_grant');

  await writeAuditLog({
    action: 'admin_case_grant',
    detail: `caseId=${caseId} userId=${userId} inventoryItemId=${invItem.id} by=${staff.id}`,
  }).catch(() => {});

  return invItem;
}

/** Recent crate grants/purchases/rewards for a given user — shown in their admin detail sheet. */
export async function adminListUserCaseGrants(userId: string) {
  await requireAdmin();
  const items = await prisma.inventoryItem.findMany({
    where: { userId, itemCategory: 'crate' },
    orderBy: { acquiredAt: 'desc' },
    take: 50,
  });
  return items.map((i) => ({
    id: i.id,
    caseName: i.itemName,
    source: i.crateSource ?? 'unknown',
    acquiredAt: i.acquiredAt,
  }));
}

/** Lightweight pickers for the "add item" dialog — store cosmetics + assets. */
export async function adminSearchStoreItemsForCase(query?: string) {
  await requireAdmin();
  const q = (query ?? '').trim();
  return prisma.storeItem.findMany({
    where: q
      ? {
          OR: [
            { itemName: { contains: q, mode: 'insensitive' } },
            { itemSku: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { itemName: 'asc' },
    take: 60,
  });
}

export async function adminSearchAssetsForCase(query?: string) {
  await requireAdmin();
  const q = (query ?? '').trim();
  return prisma.asset.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { assetId: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {},
    orderBy: { displayName: 'asc' },
    take: 60,
  });
}
