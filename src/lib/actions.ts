'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  ensurePlayerMissions,
  grantXp,
  processMatchProgression,
} from '@/lib/progression-actions';

export type StatsSummary = {
  totalRuns: number;
  bestScore: number;
  bestDistance: number;
  avgScore: number;
  avgDistance: number;
  lastPlayedAt: Date | null;
};

/** Reads the authenticated player's profile document directly from MongoDB. */
export async function getSessionUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  return prisma.user.findUnique({ where: { steamId } });
}

/** Live item-shop catalog, replacing the old hardcoded `shopItems` array. */
export async function getStoreItems() {
  return prisma.storeItem.findMany({
    where: { isAvailable: true },
    orderBy: { vpPrice: 'asc' },
  });
}

export type LandingStats = {
  registeredPlayers: number;
  matchesPlayed: number;
  matchesPlayedToday: number;
  vpEarned: number;
};

export type LandingTopPlayer = {
  id: string;
  username: string;
  avatarUrl: string;
  xpProgress: number;
  currentRank: string;
  isVip: boolean;
  role: string;
};

export type LandingStoreItem = {
  id: string;
  itemName: string;
  itemCategory: string;
  vpPrice: number;
  imageUrl: string | null;
};

/**
 * Public landing aggregates — real MongoDB counts/users/catalog only.
 * No auth required; safe for the unauthenticated landing page.
 */
export async function getLandingPageData(): Promise<{
  stats: LandingStats;
  topPlayers: LandingTopPlayer[];
  popularItems: LandingStoreItem[];
}> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [
    registeredPlayers,
    matchesPlayed,
    matchesPlayedToday,
    vpAgg,
    topPlayers,
    purchaseGroups,
    catalogFallback,
  ] = await Promise.all([
    prisma.user.count({ where: { isBanned: false } }),
    prisma.matchResult.count(),
    prisma.matchResult.count({ where: { playedAt: { gte: startOfToday } } }),
    prisma.matchResult.aggregate({ _sum: { vpEarned: true } }),
    prisma.user.findMany({
      where: { isBanned: false },
      orderBy: [{ xpProgress: 'desc' }, { vpCurrency: 'desc' }],
      take: 5,
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        xpProgress: true,
        currentRank: true,
        isVip: true,
        role: true,
      },
    }),
    prisma.purchase.groupBy({
      by: ['itemSku'],
      _count: { itemSku: true },
      orderBy: { _count: { itemSku: 'desc' } },
      take: 6,
    }),
    prisma.storeItem.findMany({
      where: { isAvailable: true },
      orderBy: { vpPrice: 'asc' },
      take: 6,
      select: {
        id: true,
        itemName: true,
        itemCategory: true,
        vpPrice: true,
        imageUrl: true,
      },
    }),
  ]);

  let popularItems: LandingStoreItem[] = catalogFallback;
  if (purchaseGroups.length > 0) {
    const skus = purchaseGroups.map((g) => g.itemSku);
    const purchasedItems = await prisma.storeItem.findMany({
      where: { itemSku: { in: skus }, isAvailable: true },
      select: {
        id: true,
        itemName: true,
        itemCategory: true,
        vpPrice: true,
        imageUrl: true,
        itemSku: true,
      },
    });
    const bySku = new Map(purchasedItems.map((i) => [i.itemSku, i]));
    const ranked = skus
      .map((sku) => bySku.get(sku))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map(({ id, itemName, itemCategory, vpPrice, imageUrl }) => ({
        id,
        itemName,
        itemCategory,
        vpPrice,
        imageUrl,
      }));
    if (ranked.length > 0) popularItems = ranked;
  }

  return {
    stats: {
      registeredPlayers,
      matchesPlayed,
      matchesPlayedToday,
      vpEarned: vpAgg._sum.vpEarned ?? 0,
    },
    topPlayers,
    popularItems,
  };
}

/** A player's live mission board, replacing the old hardcoded mission arrays. */
export async function getActiveMissions(userId: string) {
  return prisma.activeMission.findMany({
    where: { userId },
    orderBy: [{ isCompleted: 'asc' }, { rewardXp: 'desc' }],
  });
}

/** Most recent deathrun sessions for a player, newest first. */
export async function getMatchStats(userId: string, take = 10) {
  return prisma.matchStat.findMany({
    where: { userId },
    orderBy: { datePlayed: 'desc' },
    take,
  });
}

/** Aggregate performance summary derived from real MatchStat telemetry. */
export async function getStatsSummary(userId: string): Promise<StatsSummary> {
  const stats = await prisma.matchStat.findMany({ where: { userId } });

  if (stats.length === 0) {
    return { totalRuns: 0, bestScore: 0, bestDistance: 0, avgScore: 0, avgDistance: 0, lastPlayedAt: null };
  }

  const totalRuns = stats.length;
  const bestScore = Math.max(...stats.map((s) => s.score));
  const bestDistance = Math.max(...stats.map((s) => s.distance));
  const avgScore = Math.round(stats.reduce((sum, s) => sum + s.score, 0) / totalRuns);
  const avgDistance = Math.round(stats.reduce((sum, s) => sum + s.distance, 0) / totalRuns);
  const lastPlayedAt = stats.reduce<Date | null>(
    (latest, s) => (!latest || s.datePlayed > latest ? s.datePlayed : latest),
    null
  );

  return { totalRuns, bestScore, bestDistance, avgScore, avgDistance, lastPlayedAt };
}

/** Persists a completed deathrun as live telemetry the moment a run ends. */
export async function recordMatchStat(input: {
  userId: string;
  score: number;
  distance: number;
  livesRemaining: number;
}) {
  return prisma.matchStat.create({
    data: {
      userId: input.userId,
      score: input.score,
      distance: input.distance,
      livesRemaining: input.livesRemaining,
    },
  });
}

const DEATHRUN_REWARDS: Record<'win' | 'loss' | 'survived' | 'eliminated', { xp: number; vp: number }> = {
  win: { xp: 150, vp: 40 },
  survived: { xp: 90, vp: 20 },
  loss: { xp: 40, vp: 10 },
  eliminated: { xp: 25, vp: 5 },
};

/**
 * Persists a mode-agnostic `MatchResult` for a finished Deathrun round and
 * credits the player's running XP/VP totals on `User`. Called by the
 * client's results screen the moment the Colyseus room reports `results`.
 */
export async function recordDeathrunResult(input: {
  userId: string;
  role: 'trapper' | 'runner';
  outcome: 'win' | 'loss' | 'survived' | 'eliminated';
  score?: number;
  distance?: number;
}): Promise<{ xpEarned: number; vpEarned: number }> {
  const reward = DEATHRUN_REWARDS[input.outcome];

  await prisma.matchResult.create({
    data: {
      userId: input.userId,
      mode: 'deathrun',
      role: input.role,
      outcome: input.outcome,
      xpEarned: reward.xp,
      vpEarned: reward.vp,
    },
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      vpCurrency: { increment: reward.vp },
    },
  });

  await grantXp(input.userId, reward.xp, 'Deathrun match');
  await processMatchProgression({
    userId: input.userId,
    outcome: input.outcome,
    role: input.role,
    score: input.score,
    distance: input.distance,
  });

  return { xpEarned: reward.xp, vpEarned: reward.vp };
}

/** Bootstrap missions for the current session user (safe to call often). */
export async function bootstrapMyMissions() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) return;
  await ensurePlayerMissions(user.id);
}
