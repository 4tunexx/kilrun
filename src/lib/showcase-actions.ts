'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { getLevelFromXp, getLevelProgress, getRankForLevel } from '@/lib/progression';
import { normalizeBannerConfig } from '@/lib/banner';
import {
  getShowcaseSlotCount,
  normalizeShowcaseLayout,
  parseShowcaseStorage,
  serializeShowcaseStorage,
  SHOWCASE_MAX_SLOTS,
  type ShowcaseDisplayItem,
  type ShowcaseEntry,
  type ShowcaseItemType,
  type ShowcaseLayout,
} from '@/lib/showcase';

async function requireUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  return user;
}

export type ShowcaseOption = {
  itemType: ShowcaseItemType;
  refId?: string;
  title: string;
  icon: string;
  iconImageUrl?: string | null;
  rarity?: string | null;
};

async function saveShowcase(userId: string, entries: ShowcaseEntry[], layout: ShowcaseLayout) {
  const payload = serializeShowcaseStorage(entries, layout);
  await prisma.user.update({
    where: { id: userId },
    data: { showcaseItems: payload as unknown as Prisma.InputJsonValue },
  });
}

/** Everything eligible to showcase, the player's current picks, and how many slots are unlocked. */
export async function getMyShowcaseEditor() {
  const user = await requireUser();
  const progress = getLevelProgress(user.xpProgress);
  const level = progress.level;
  const unlockedSlots = getShowcaseSlotCount(level);
  const stored = parseShowcaseStorage(user.showcaseItems);

  const [unlockedBadges, unlockedAchievements, inventory, repVotes] = await Promise.all([
    prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } }),
    prisma.userAchievement.findMany({ where: { userId: user.id }, include: { achievement: true } }),
    prisma.inventoryItem.findMany({ where: { userId: user.id } }),
    prisma.reputationVote.findMany({
      where: { targetId: user.id },
      select: { value: true },
    }),
  ]);

  const reputation = repVotes.reduce((sum, v) => sum + v.value, 0);

  const options: ShowcaseOption[] = [
    { itemType: 'rank', title: user.currentRank || 'Unranked', icon: 'crown' },
    ...(reputation > 0
      ? [
          {
            itemType: 'reputation' as const,
            title: `+${reputation} Reputation`,
            icon: 'thumbs-up',
            rarity: 'epic',
          },
        ]
      : []),
    ...unlockedBadges.map((ub) => ({
      itemType: 'badge' as const,
      refId: ub.badgeId,
      title: ub.badge.title,
      icon: ub.badge.icon,
      iconImageUrl: ub.badge.iconImageUrl,
      rarity: ub.badge.rarity,
    })),
    ...unlockedAchievements.map((ua) => ({
      itemType: 'achievement' as const,
      refId: ua.achievementId,
      title: ua.achievement.title,
      icon: ua.achievement.icon,
      iconImageUrl: ua.achievement.iconImageUrl,
    })),
    ...inventory.map((inv) => ({
      itemType: 'inventory' as const,
      refId: inv.id,
      title: inv.itemName,
      icon: 'package',
      iconImageUrl: inv.imageUrl,
    })),
  ];

  const entries = stored.entries.filter((e) => e.slot < unlockedSlots);
  const resolved = await resolveShowcaseEntries(user.id, entries);

  return {
    level,
    unlockedSlots,
    maxSlots: SHOWCASE_MAX_SLOTS,
    entries,
    options,
    layout: stored.layout,
    resolved,
    preview: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      statusMessage: user.statusMessage ?? '',
      role: user.role,
      isVip: user.isVip,
      currentRank: user.currentRank || getRankForLevel(level),
      level,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      levelProgressPercent: progress.percent,
      reputation,
      equippedBannerConfig: user.equippedBannerConfig
        ? normalizeBannerConfig(user.equippedBannerConfig)
        : null,
      equippedBannerImageUrl: user.equippedBannerImageUrl,
      equippedFrameConfig: user.equippedFrameConfig ?? null,
      equippedNicknameConfig: user.equippedNicknameConfig ?? null,
      showcase: resolved,
      showcaseLayout: stored.layout,
    },
  };
}

export async function setShowcaseSlot(
  slot: number,
  entry: { itemType: ShowcaseItemType; refId?: string } | null
) {
  const user = await requireUser();
  const level = getLevelFromXp(user.xpProgress);
  const unlockedSlots = getShowcaseSlotCount(level);
  if (slot < 0 || slot >= unlockedSlots) throw new Error('This showcase slot is not unlocked yet');

  const stored = parseShowcaseStorage(user.showcaseItems);

  if (entry) {
    if (entry.itemType === 'badge') {
      if (!entry.refId) throw new Error('Missing badge id');
      const owned = await prisma.userBadge.findFirst({
        where: { userId: user.id, badgeId: entry.refId },
      });
      if (!owned) throw new Error('Badge not unlocked');
    } else if (entry.itemType === 'achievement') {
      if (!entry.refId) throw new Error('Missing achievement id');
      const owned = await prisma.userAchievement.findFirst({
        where: { userId: user.id, achievementId: entry.refId },
      });
      if (!owned) throw new Error('Achievement not unlocked');
    } else if (entry.itemType === 'inventory') {
      if (!entry.refId) throw new Error('Missing item id');
      const owned = await prisma.inventoryItem.findFirst({
        where: { userId: user.id, id: entry.refId },
      });
      if (!owned) throw new Error('Item not owned');
    } else if (entry.itemType === 'reputation') {
      if (user.reputation <= 0) throw new Error('Need positive reputation to showcase');
    } else if (entry.itemType !== 'rank') {
      throw new Error('Invalid showcase type');
    }
  }

  const current = stored.entries.filter((e) => e.slot !== slot && e.slot < unlockedSlots);
  const next: ShowcaseEntry[] = entry
    ? [...current, { slot, itemType: entry.itemType, refId: entry.refId }]
    : current;

  await saveShowcase(user.id, next, stored.layout);
  return { ok: true as const };
}

export async function setShowcaseLayout(layout: Partial<ShowcaseLayout>) {
  const user = await requireUser();
  const stored = parseShowcaseStorage(user.showcaseItems);
  const next = normalizeShowcaseLayout({ ...stored.layout, ...layout });
  await saveShowcase(user.id, stored.entries, next);
  return { ok: true as const, layout: next };
}

/** Resolves stored showcase entries into ready-to-render display items, in slot order. */
export async function resolveShowcaseEntries(
  userId: string,
  entries: ShowcaseEntry[]
): Promise<ShowcaseDisplayItem[]> {
  if (entries.length === 0) return [];

  const badgeIds = entries.filter((e) => e.itemType === 'badge' && e.refId).map((e) => e.refId!);
  const achievementIds = entries
    .filter((e) => e.itemType === 'achievement' && e.refId)
    .map((e) => e.refId!);
  const inventoryIds = entries
    .filter((e) => e.itemType === 'inventory' && e.refId)
    .map((e) => e.refId!);
  const needsRank = entries.some((e) => e.itemType === 'rank' || e.itemType === 'reputation');

  const [badges, achievements, inventoryItems, user] = await Promise.all([
    badgeIds.length ? prisma.badgeDefinition.findMany({ where: { id: { in: badgeIds } } }) : [],
    achievementIds.length
      ? prisma.achievementDefinition.findMany({ where: { id: { in: achievementIds } } })
      : [],
    inventoryIds.length
      ? prisma.inventoryItem.findMany({ where: { id: { in: inventoryIds }, userId } })
      : [],
    needsRank ? prisma.user.findUnique({ where: { id: userId } }) : null,
  ]);

  const badgeMap = new Map(badges.map((b) => [b.id, b]));
  const achievementMap = new Map(achievements.map((a) => [a.id, a]));
  const inventoryMap = new Map(inventoryItems.map((i) => [i.id, i]));

  return entries
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((entry): ShowcaseDisplayItem | null => {
      if (entry.itemType === 'rank') {
        if (!user) return null;
        return {
          itemType: 'rank',
          title: user.currentRank || 'Unranked',
          icon: 'crown',
          iconImageUrl: null,
          rarity: null,
        };
      }
      if (entry.itemType === 'reputation') {
        if (!user || user.reputation <= 0) return null;
        return {
          itemType: 'reputation',
          title: `+${user.reputation} REP`,
          icon: 'thumbs-up',
          iconImageUrl: null,
          rarity: 'epic',
          value: user.reputation,
        };
      }
      if (entry.itemType === 'badge' && entry.refId) {
        const badge = badgeMap.get(entry.refId);
        if (!badge) return null;
        return {
          itemType: 'badge',
          title: badge.title,
          icon: badge.icon,
          iconImageUrl: badge.iconImageUrl,
          rarity: badge.rarity,
        };
      }
      if (entry.itemType === 'achievement' && entry.refId) {
        const achievement = achievementMap.get(entry.refId);
        if (!achievement) return null;
        return {
          itemType: 'achievement',
          title: achievement.title,
          icon: achievement.icon,
          iconImageUrl: achievement.iconImageUrl,
          rarity: null,
        };
      }
      if (entry.itemType === 'inventory' && entry.refId) {
        const item = inventoryMap.get(entry.refId);
        if (!item) return null;
        return {
          itemType: 'inventory',
          title: item.itemName,
          icon: 'package',
          iconImageUrl: item.imageUrl,
          rarity: null,
        };
      }
      return null;
    })
    .filter((item): item is ShowcaseDisplayItem => item !== null);
}
