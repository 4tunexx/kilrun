'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  ensurePlayerMissions,
  grantXp,
  processMatchProgression,
} from '@/lib/progression-actions';
import { resolveShopImageUrl } from '@/lib/shop-images';

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

/** Match reward actions must only credit the signed-in player. */
async function requireSelfUserId(claimedUserId: string) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  if (user.isBanned) throw new Error('Account banned');
  if (user.id !== claimedUserId) throw new Error('Forbidden');
  return user;
}

/** Backfill StoreItem docs created before createdAt / sale fields existed. */
async function healStoreItemDefaults() {
  await prisma.$runCommandRaw({
    update: 'StoreItem',
    updates: [
      {
        q: {},
        u: [
          {
            $set: {
              createdAt: {
                $cond: [
                  { $eq: [{ $type: '$createdAt' }, 'date'] },
                  '$createdAt',
                  '$$NOW',
                ],
              },
              purchaseCount: {
                $cond: [
                  {
                    $in: [
                      { $type: '$purchaseCount' },
                      ['int', 'long', 'double'],
                    ],
                  },
                  { $toInt: '$purchaseCount' },
                  0,
                ],
              },
              fireSalePercent: {
                $cond: [
                  {
                    $in: [
                      { $type: '$fireSalePercent' },
                      ['int', 'long', 'double'],
                    ],
                  },
                  { $toInt: '$fireSalePercent' },
                  0,
                ],
              },
            },
          },
        ],
        multi: true,
      },
    ],
  });
}

/** Live item-shop catalog, replacing the old hardcoded `shopItems` array. */
export async function getStoreItems() {
  try {
    const items = await prisma.storeItem.findMany({
      where: { isAvailable: true },
      orderBy: { vpPrice: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      imageUrl: resolveShopImageUrl(item.imageUrl),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('createdAt') ||
      message.includes('purchaseCount') ||
      message.includes('fireSalePercent')
    ) {
      await healStoreItemDefaults();
      const items = await prisma.storeItem.findMany({
        where: { isAvailable: true },
        orderBy: { vpPrice: 'asc' },
      });
      return items.map((item) => ({
        ...item,
        imageUrl: resolveShopImageUrl(item.imageUrl),
      }));
    }
    throw error;
  }
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
  cosmeticSlot: string | null;
  bannerConfig: unknown;
  cosmeticConfig: unknown;
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
    // Mongo: `isBanned: false` skips docs where the field was never set.
    prisma.user.count({ where: { NOT: { isBanned: true } } }),
    prisma.matchResult.count(),
    prisma.matchResult.count({ where: { playedAt: { gte: startOfToday } } }),
    prisma.matchResult.aggregate({ _sum: { vpEarned: true } }),
    prisma.user.findMany({
      where: { NOT: { isBanned: true } },
      orderBy: [
        { xpProgress: 'desc' },
        { vpCurrency: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 10,
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
      orderBy: [{ purchaseCount: 'desc' }, { vpPrice: 'asc' }],
      take: 6,
      select: {
        id: true,
        itemName: true,
        itemCategory: true,
        vpPrice: true,
        imageUrl: true,
        cosmeticSlot: true,
        bannerConfig: true,
        cosmeticConfig: true,
      },
    }),
  ]);

  const toLandingItem = (item: {
    id: string;
    itemName: string;
    itemCategory: string;
    vpPrice: number;
    imageUrl: string | null;
    cosmeticSlot: string | null;
    bannerConfig: unknown;
    cosmeticConfig: unknown;
  }): LandingStoreItem => ({
    id: item.id,
    itemName: item.itemName,
    itemCategory: item.itemCategory,
    vpPrice: item.vpPrice,
    imageUrl: resolveShopImageUrl(item.imageUrl),
    cosmeticSlot: item.cosmeticSlot,
    bannerConfig: item.bannerConfig ?? null,
    cosmeticConfig: item.cosmeticConfig ?? null,
  });

  let popularItems: LandingStoreItem[] = catalogFallback.map(toLandingItem);
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
        cosmeticSlot: true,
        bannerConfig: true,
        cosmeticConfig: true,
      },
    });
    const bySku = new Map(purchasedItems.map((i) => [i.itemSku, i]));
    const ranked = skus
      .map((sku) => bySku.get(sku))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map(toLandingItem);
    if (ranked.length > 0) popularItems = ranked;
  }

  return {
    stats: {
      registeredPlayers,
      matchesPlayed,
      matchesPlayedToday,
      vpEarned: vpAgg._sum.vpEarned ?? 0,
    },
    topPlayers: topPlayers.map((p) => ({
      ...p,
      username: p.username || 'Player',
      avatarUrl: p.avatarUrl || '',
      xpProgress: p.xpProgress ?? 0,
      currentRank: p.currentRank || 'Unranked',
    })),
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
  await requireSelfUserId(input.userId);
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
  await requireSelfUserId(input.userId);
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
    mode: 'deathrun',
    outcome: input.outcome,
    role: input.role,
    score: input.score,
    distance: input.distance,
  });

  return { xpEarned: reward.xp, vpEarned: reward.vp };
}

const HORDE_REWARDS: Record<'win' | 'loss' | 'survived' | 'eliminated', { xp: number; vp: number }> = {
  win: { xp: 160, vp: 45 },
  survived: { xp: 110, vp: 30 },
  loss: { xp: 45, vp: 12 },
  eliminated: { xp: 30, vp: 8 },
};

/** Persist a finished Horde match + missions / achievements. */
export async function recordHordeResult(input: {
  userId: string;
  outcome: 'win' | 'loss' | 'survived' | 'eliminated';
  wavesCleared?: number;
  kills?: number;
  score?: number;
}): Promise<{ xpEarned: number; vpEarned: number }> {
  await requireSelfUserId(input.userId);
  const reward = HORDE_REWARDS[input.outcome];
  const bonusXp = Math.min(80, (input.wavesCleared ?? 0) * 4);

  await prisma.matchResult.create({
    data: {
      userId: input.userId,
      mode: 'horde',
      role: 'survivor',
      outcome: input.outcome,
      xpEarned: reward.xp + bonusXp,
      vpEarned: reward.vp,
      stats: {
        wavesCleared: input.wavesCleared ?? 0,
        kills: input.kills ?? 0,
      },
    },
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(input.userId, reward.xp + bonusXp, 'Horde match');
  await processMatchProgression({
    userId: input.userId,
    mode: 'horde',
    outcome: input.outcome,
    role: 'survivor',
    score: input.score,
    wavesCleared: input.wavesCleared,
    kills: input.kills,
  });

  return { xpEarned: reward.xp + bonusXp, vpEarned: reward.vp };
}

const COMPETITIVE_REWARDS = {
  win: { xp: 140, vp: 35 },
  loss: { xp: 50, vp: 12 },
} as const;

/**
 * Persist a Competitive 4v4 result.
 * - ranked (Premium): Elo KP applied
 * - casual: XP/VP + missions only — no KP / rank change
 */
export async function recordCompetitiveResult(input: {
  userId: string;
  team: 'team_a' | 'team_b';
  outcome: 'win' | 'loss';
  opponentAvgKp: number;
  roundsWon?: number;
  roundsLost?: number;
  kills?: number;
  /** Default ranked for backward compat; casual skips KP. */
  queue?: 'casual' | 'ranked';
}): Promise<{ xpEarned: number; vpEarned: number; kpDelta: number; kp: number; rank: string }> {
  await requireSelfUserId(input.userId);
  const { applyKpDelta } = await import('@/lib/progression-actions');
  const { computeCompetitiveKpDelta, KP_DEFAULT, getRankForKp } = await import('@/lib/kp');
  const { isPremiumActive } = await import('@/lib/premium');

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error('User not found');

  // Ranked KP when Premium OR free Ranked week is active.
  const { parsePremiumConfig, isFreeRankedWeekActive } = await import('@/lib/premium-config');
  const { getSiteSettings } = await import('@/lib/progression-actions');
  const settings = await getSiteSettings();
  const premiumCfg = parsePremiumConfig(
    (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
  );
  const freeWeek = isFreeRankedWeekActive(premiumCfg);
  const premium = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt: (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
  });
  const requested = input.queue ?? 'ranked';
  const queue = requested === 'ranked' && (premium || freeWeek) ? 'ranked' : 'casual';

  const playerKp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;

  const kpDelta =
    queue === 'ranked'
      ? computeCompetitiveKpDelta({
          playerKp,
          opponentAvgKp: input.opponentAvgKp,
          won: input.outcome === 'win',
          roundsWon: input.roundsWon,
          roundsLost: input.roundsLost,
        })
      : 0;

  const reward = COMPETITIVE_REWARDS[input.outcome];
  const modeTag = queue === 'ranked' ? 'competitive_ranked' : 'competitive';

  await prisma.matchResult.create({
    data: {
      userId: input.userId,
      mode: modeTag,
      role: input.team,
      outcome: input.outcome,
      xpEarned: reward.xp,
      vpEarned: reward.vp,
      kpDelta,
      stats: {
        queue,
        roundsWon: input.roundsWon ?? 0,
        roundsLost: input.roundsLost ?? 0,
        kills: input.kills ?? 0,
        opponentAvgKp: input.opponentAvgKp,
      },
    },
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(
    input.userId,
    reward.xp,
    queue === 'ranked' ? 'Competitive Ranked' : 'Competitive Casual'
  );

  let nextKp = playerKp;
  let rank = user.currentRank || getRankForKp(playerKp);
  if (queue === 'ranked' && kpDelta) {
    const kpResult = await applyKpDelta(input.userId, kpDelta, 'Competitive Ranked');
    nextKp = kpResult?.kp ?? playerKp + kpDelta;
    rank = kpResult?.rank ?? getRankForKp(nextKp);
  }

  await processMatchProgression({
    userId: input.userId,
    mode: 'competitive',
    outcome: input.outcome,
    role: input.team,
  });

  return {
    xpEarned: reward.xp,
    vpEarned: reward.vp,
    kpDelta,
    kp: nextKp,
    rank,
  };
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

export type RankedStatsSummary = {
  kp: number;
  peakKp: number;
  currentRank: string;
  peakRank: string;
  rankImage?: string | null;
  rankColor?: string | null;
  peakRankImage?: string | null;
  peakRankColor?: string | null;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  rankedWins: number;
  rankedLosses: number;
  casualWins: number;
  casualLosses: number;
  matchesPlayed: number;
};

/** Own-profile Ranked panel — KP / peak / competitive win-loss. */
export async function getMyRankedStats(userId: string): Promise<RankedStatsSummary> {
  const { isPremiumActive } = await import('@/lib/premium');
  const { KP_DEFAULT, getRankForKp } = await import('@/lib/kp');
  const { parseRankConfig, findRankTierDef } = await import('@/lib/rank-config');
  const { getSiteSettings } = await import('@/lib/progression-actions');

  const empty = {
    kp: KP_DEFAULT,
    peakKp: KP_DEFAULT,
    currentRank: 'Unranked',
    peakRank: 'Unranked',
    rankImage: null as string | null,
    rankColor: null as string | null,
    peakRankImage: null as string | null,
    peakRankColor: null as string | null,
    isPremium: false,
    premiumExpiresAt: null as string | null,
    rankedWins: 0,
    rankedLosses: 0,
    casualWins: 0,
    casualLosses: 0,
    matchesPlayed: 0,
  };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return empty;

  const settings = await getSiteSettings();
  const rankCfg = parseRankConfig(
    (settings as { rankConfigJson?: string }).rankConfigJson ?? '{}'
  );

  const premiumExpiresAt =
    (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt ?? null;
  const isPremium = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt,
  });
  const kp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;
  const peakKp = Math.max(
    typeof (user as { peakKp?: number }).peakKp === 'number'
      ? (user as { peakKp: number }).peakKp
      : kp,
    kp
  );
  const currentRank = getRankForKp(kp, rankCfg.tiers);
  const peakRank =
    (user as { peakRank?: string }).peakRank || getRankForKp(peakKp, rankCfg.tiers);
  const curDef = findRankTierDef(currentRank, rankCfg.tiers);
  const peakDef = findRankTierDef(peakRank, rankCfg.tiers);

  const results = await prisma.matchResult.findMany({
    where: {
      userId,
      mode: { in: ['competitive', 'competitive_ranked'] },
    },
    select: { mode: true, outcome: true },
  });

  let rankedWins = 0;
  let rankedLosses = 0;
  let casualWins = 0;
  let casualLosses = 0;
  for (const r of results) {
    const ranked = r.mode === 'competitive_ranked';
    if (r.outcome === 'win') {
      if (ranked) rankedWins += 1;
      else casualWins += 1;
    } else if (r.outcome === 'loss') {
      if (ranked) rankedLosses += 1;
      else casualLosses += 1;
    }
  }

  return {
    kp,
    peakKp,
    currentRank,
    peakRank,
    rankImage: curDef?.imageUrl || null,
    rankColor: curDef?.color || null,
    peakRankImage: peakDef?.imageUrl || null,
    peakRankColor: peakDef?.color || null,
    isPremium,
    premiumExpiresAt: premiumExpiresAt
      ? new Date(premiumExpiresAt).toISOString()
      : null,
    rankedWins,
    rankedLosses,
    casualWins,
    casualLosses,
    matchesPlayed: results.length,
  };
}
