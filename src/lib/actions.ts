'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  ensurePlayerMissions,
} from '@/lib/progression-actions';
import { missionPeriodKey } from '@/lib/daily-missions';
import { resolveShopImageUrl } from '@/lib/shop-images';
import { canAccessAdmin } from '@/lib/roles';

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

/** Read helpers: self or staff. */
async function requireSelfOrStaffUserId(claimedUserId: string) {
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  if (user.isBanned) throw new Error('Account banned');
  if (user.id === claimedUserId) return user;
  if (canAccessAdmin(user.role)) return user;
  throw new Error('Forbidden');
}

const MATCH_RATE_LIMIT_MS = 15_000;

async function assertMatchRateLimit(userId: string, mode: string) {
  const recent = await prisma.matchResult.findFirst({
    where: {
      userId,
      mode,
      playedAt: { gte: new Date(Date.now() - MATCH_RATE_LIMIT_MS) },
    },
    orderBy: { playedAt: 'desc' },
  });
  if (recent) throw new Error('Too many requests');
}

function clampNonNegInt(value: number | undefined, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
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
  const viewer = await requireSelfOrStaffUserId(userId);
  // Reset today's daily board for self; staff viewing another player skips mutation.
  if (viewer.id === userId) {
    await ensurePlayerMissions(userId);
  }
  const rows = await prisma.activeMission.findMany({
    where: { userId },
    orderBy: [{ isCompleted: 'asc' }, { rewardXp: 'desc' }],
  });
  const today = missionPeriodKey();
  return rows.filter((m) => {
    const daily =
      m.category === 'daily' || m.templateKey.startsWith('daily_');
    if (!daily) return true;
    return !m.periodKey || m.periodKey === today;
  });
}

/** Most recent deathrun sessions for a player, newest first. */
export async function getMatchStats(userId: string, take = 10) {
  await requireSelfOrStaffUserId(userId);
  return prisma.matchStat.findMany({
    where: { userId },
    orderBy: { datePlayed: 'desc' },
    take,
  });
}

/** Aggregate performance summary derived from real MatchStat telemetry. */
export async function getStatsSummary(userId: string): Promise<StatsSummary> {
  await requireSelfOrStaffUserId(userId);
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
  const score = clampNonNegInt(input.score, 1_000_000);
  const distance = clampNonNegInt(input.distance, 100_000);
  const livesRemaining = clampNonNegInt(input.livesRemaining, 99);
  return prisma.matchStat.create({
    data: {
      userId: input.userId,
      score,
      distance,
      livesRemaining,
    },
  });
}

/**
 * Client/dev fallback: persist a Deathrun result when Colyseus could not reach
 * the web API. Prefer server-authored awards via `/api/game/match-result`.
 */
export async function recordDeathrunResult(input: {
  userId: string;
  role: 'trapper' | 'runner';
  outcome: 'win' | 'loss' | 'survived' | 'eliminated';
  score?: number;
  distance?: number;
  /** When set, skips duplicate if this match was already recorded. */
  matchId?: string;
}): Promise<{ xpEarned: number; vpEarned: number }> {
  await requireSelfUserId(input.userId);
  const {
    applyServerMatchBatch,
    findMatchResultByMatchId,
  } = await import('@/lib/match-rewards');

  const matchId =
    typeof input.matchId === 'string' && input.matchId.trim()
      ? input.matchId.trim()
      : `client-deathrun-${input.userId}-${Date.now()}`;

  if (input.matchId) {
    const existing = await findMatchResultByMatchId(input.userId, matchId);
    if (existing) {
      return { xpEarned: existing.xpEarned, vpEarned: existing.vpEarned };
    }
  } else {
    await assertMatchRateLimit(input.userId, 'deathrun');
  }

  const batch = await applyServerMatchBatch({
    matchId,
    mode: 'deathrun',
    players: [
      {
        userId: input.userId,
        role: input.role,
        outcome: input.outcome,
        score: input.score,
        distance: input.distance,
      },
    ],
  });
  const award = batch.players[0];
  return {
    xpEarned: award?.xpEarned ?? 0,
    vpEarned: award?.vpEarned ?? 0,
  };
}

/** Client/dev fallback for Horde — prefer server-authored match-result API. */
export async function recordHordeResult(input: {
  userId: string;
  outcome: 'win' | 'loss' | 'survived' | 'eliminated';
  wavesCleared?: number;
  kills?: number;
  score?: number;
  matchId?: string;
}): Promise<{ xpEarned: number; vpEarned: number }> {
  await requireSelfUserId(input.userId);
  const {
    applyServerMatchBatch,
    findMatchResultByMatchId,
  } = await import('@/lib/match-rewards');

  const matchId =
    typeof input.matchId === 'string' && input.matchId.trim()
      ? input.matchId.trim()
      : `client-horde-${input.userId}-${Date.now()}`;

  if (input.matchId) {
    const existing = await findMatchResultByMatchId(input.userId, matchId);
    if (existing) {
      return { xpEarned: existing.xpEarned, vpEarned: existing.vpEarned };
    }
  } else {
    await assertMatchRateLimit(input.userId, 'horde');
  }

  const batch = await applyServerMatchBatch({
    matchId,
    mode: 'horde',
    players: [
      {
        userId: input.userId,
        role: 'survivor',
        outcome: input.outcome,
        wavesCleared: input.wavesCleared,
        kills: input.kills,
        score: input.score,
      },
    ],
  });
  const award = batch.players[0];
  return {
    xpEarned: award?.xpEarned ?? 0,
    vpEarned: award?.vpEarned ?? 0,
  };
}

/**
 * Client/dev fallback for Competitive.
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
  matchId?: string;
}): Promise<{ xpEarned: number; vpEarned: number; kpDelta: number; kp: number; rank: string }> {
  await requireSelfUserId(input.userId);
  const {
    applyServerMatchBatch,
    findMatchResultByMatchId,
  } = await import('@/lib/match-rewards');
  const { KP_DEFAULT, getRankForKp } = await import('@/lib/kp');

  const queue = input.queue ?? 'ranked';
  const modeTag = queue === 'ranked' ? 'competitive_ranked' : 'competitive';
  const matchId =
    typeof input.matchId === 'string' && input.matchId.trim()
      ? input.matchId.trim()
      : `client-competitive-${input.userId}-${Date.now()}`;

  if (input.matchId) {
    const existing = await findMatchResultByMatchId(input.userId, matchId);
    if (existing) {
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      const kp =
        typeof (user as { kp?: number } | null)?.kp === 'number'
          ? (user as { kp: number }).kp
          : KP_DEFAULT;
      return {
        xpEarned: existing.xpEarned,
        vpEarned: existing.vpEarned,
        kpDelta: existing.kpDelta ?? 0,
        kp,
        rank: user?.currentRank || getRankForKp(kp),
      };
    }
  } else {
    await assertMatchRateLimit(input.userId, modeTag);
  }

  const batch = await applyServerMatchBatch({
    matchId,
    mode: modeTag,
    players: [
      {
        userId: input.userId,
        role: input.team,
        outcome: input.outcome,
        opponentAvgKp: input.opponentAvgKp,
        roundsWon: input.roundsWon,
        roundsLost: input.roundsLost,
        kills: input.kills,
        queue,
      },
    ],
  });
  const award = batch.players[0];
  return {
    xpEarned: award?.xpEarned ?? 0,
    vpEarned: award?.vpEarned ?? 0,
    kpDelta: award?.kpDelta ?? 0,
    kp: award?.kp ?? KP_DEFAULT,
    rank: award?.rank ?? getRankForKp(KP_DEFAULT),
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
  await requireSelfOrStaffUserId(userId);
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

/**
 * Mint a short-lived Colyseus join token for the signed-in player.
 * Privilege claims (admin / premium / ranked / kp) come from the DB — not the client.
 * Returns null when no join secret is configured (local/dev without secrets).
 */
export async function mintMyGameJoinToken(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) throw new Error('Not authenticated');
  if (user.isBanned) throw new Error('Account banned');

  const { mintGameJoinToken } = await import('@/lib/game-join-token');
  const { isPremiumActive, canAccessRankedCompetitive } = await import(
    '@/lib/premium'
  );
  const { parsePremiumConfig } = await import('@/lib/premium-config');
  const { getSiteSettings } = await import('@/lib/progression-actions');
  const { KP_DEFAULT } = await import('@/lib/kp');

  const settings = await getSiteSettings();
  const premiumCfg = parsePremiumConfig(
    (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
  );
  const isPremium = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt: (user as { premiumExpiresAt?: Date | null })
      .premiumExpiresAt,
  });
  const rankedAccess = canAccessRankedCompetitive({
    isPremium,
    config: premiumCfg,
  });
  const kp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;

  try {
    return mintGameJoinToken({
      userId: user.id,
      username: user.username || 'Player',
      avatarUrl: user.avatarUrl || '',
      isAdmin: user.role === 'admin',
      isPremium,
      rankedAccess,
      kp,
    });
  } catch {
    // No GAME_JOIN_TOKEN_SECRET / GAME_SERVER_ADMIN_SECRET / AUTH_SECRET — local/dev.
    return null;
  }
}
