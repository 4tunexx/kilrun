'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getLevelProgress } from '@/lib/progression';
import { getPlayerAchievements, getPlayerBadges } from '@/lib/progression-actions';
import { getMyReputationVote } from '@/lib/social-actions';
import { normalizeBannerConfig, type BannerConfig } from '@/lib/banner';
import {
  parseShowcaseStorage,
  type ShowcaseDisplayItem,
  type ShowcaseLayout,
} from '@/lib/showcase';
import { resolveShowcaseEntries } from '@/lib/showcase-actions';

async function getViewer() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  return prisma.user.findUnique({ where: { steamId } });
}

export type FriendStatus = 'self' | 'friends' | 'pending_sent' | 'pending_received' | 'none';

export type PublicProfile = {
  id: string;
  username: string;
  avatarUrl: string;
  bio: string;
  statusMessage: string;
  countryCode: string;
  role: string;
  isVip: boolean;
  isPremium: boolean;
  /** Active KP rank when Premium; otherwise peak kept for showcase. */
  currentRank: string;
  /** Highest Ranked Competitive tier ever reached (kept after Premium expires). */
  peakRank: string;
  peakRankImage?: string | null;
  /** Display rank badge image / color from admin SiteSettings.rankConfigJson. */
  rankImage?: string | null;
  rankColor?: string | null;
  kp: number;
  peakKp: number;
  level: number;
  xpProgress: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgressPercent: number;
  reputation: number;
  createdAt: Date;
  equippedBannerConfig: BannerConfig | null;
  equippedBannerImageUrl: string | null;
  equippedBannerItemName: string | null;
  equippedFrameConfig: unknown | null;
  equippedNicknameConfig: unknown | null;
  showcase: ShowcaseDisplayItem[];
  showcaseLayout: ShowcaseLayout;
  leaderboardPosition: number;
  totalPlayers: number;
  friendStatus: FriendStatus;
  incomingFriendshipId: string | null;
  myReputationVote: number;
  achievements: Awaited<ReturnType<typeof getPlayerAchievements>>;
  badges: Awaited<ReturnType<typeof getPlayerBadges>>;
  stats: {
    totalRuns: number;
    bestScore: number;
    bestDistance: number;
    avgScore: number;
    winRate: number;
  };
};

/** Full public profile aggregate: identity, rank, stats, achievements, and social context. */
export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const [viewer, target] = await Promise.all([
    getViewer(),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!target || target.isBanned) return null;

  const progress = getLevelProgress(target.xpProgress);

  const [higherRanked, totalPlayers, achievements, badges, matchStats, matchResults, repVotes] =
    await Promise.all([
      prisma.user.count({
        where: {
          NOT: { isBanned: true },
          xpProgress: { gt: target.xpProgress },
        },
      }),
      prisma.user.count({ where: { NOT: { isBanned: true } } }),
      getPlayerAchievements(userId),
      getPlayerBadges(userId),
      prisma.matchStat.findMany({ where: { userId } }),
      prisma.matchResult.findMany({ where: { userId } }),
      prisma.reputationVote.findMany({
        where: { targetId: userId },
        select: { value: true },
      }),
    ]);

  const reputation = repVotes.reduce((sum, v) => sum + v.value, 0);
  if (reputation !== (target.reputation ?? 0)) {
    await prisma.user.update({
      where: { id: userId },
      data: { reputation },
    });
  }

  const { getRankForKp, KP_DEFAULT } = await import('@/lib/kp');
  const { isPremiumActive } = await import('@/lib/premium');
  const { parseRankConfig, findRankTierDef } = await import('@/lib/rank-config');
  const { getSiteSettings } = await import('@/lib/progression-actions');
  const settings = await getSiteSettings();
  const rankCfg = parseRankConfig(
    (settings as { rankConfigJson?: string }).rankConfigJson ?? '{}'
  );
  const kp =
    typeof (target as { kp?: number }).kp === 'number'
      ? (target as { kp: number }).kp
      : KP_DEFAULT;
  const peakKp = Math.max(
    typeof (target as { peakKp?: number }).peakKp === 'number'
      ? (target as { peakKp: number }).peakKp
      : kp,
    kp
  );
  const peakRank =
    (target as { peakRank?: string }).peakRank || getRankForKp(peakKp, rankCfg.tiers);
  const peakDef = findRankTierDef(peakRank, rankCfg.tiers);
  const premium = isPremiumActive({
    isVip: target.isVip,
    premiumExpiresAt: (target as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
  });
  // Public showcase: always show highest Ranked tier reached (peak).
  const displayRank = peakRank && peakRank !== 'Unranked' ? peakRank : getRankForKp(kp, rankCfg.tiers);
  const displayDef = findRankTierDef(displayRank, rankCfg.tiers);

  const totalRuns = matchStats.length;
  const bestScore = totalRuns > 0 ? Math.max(...matchStats.map((s) => s.score)) : 0;
  const bestDistance = totalRuns > 0 ? Math.max(...matchStats.map((s) => s.distance)) : 0;
  const avgScore =
    totalRuns > 0 ? Math.round(matchStats.reduce((sum, s) => sum + s.score, 0) / totalRuns) : 0;
  const wins = matchResults.filter((r) => r.outcome === 'win' || r.outcome === 'survived').length;
  const winRate = matchResults.length > 0 ? Math.round((wins / matchResults.length) * 100) : 0;

  let friendStatus: FriendStatus = 'none';
  let incomingFriendshipId: string | null = null;
  let myReputationVote = 0;

  if (viewer && viewer.id === target.id) {
    friendStatus = 'self';
  } else if (viewer) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: viewer.id, userBId: target.id },
          { userAId: target.id, userBId: viewer.id },
        ],
      },
    });
    if (friendship) {
      if (friendship.status === 'accepted') {
        friendStatus = 'friends';
      } else if (friendship.userAId === viewer.id) {
        friendStatus = 'pending_sent';
      } else {
        friendStatus = 'pending_received';
        incomingFriendshipId = friendship.id;
      }
    }
    myReputationVote = await getMyReputationVote(target.id);
  }

  const stored = parseShowcaseStorage(target.showcaseItems);
  const showcase = await resolveShowcaseEntries(target.id, stored.entries);

  return {
    id: target.id,
    username: target.username,
    avatarUrl: target.avatarUrl,
    bio: target.bio,
    statusMessage: target.statusMessage ?? '',
    countryCode: target.countryCode ?? '',
    role: target.role,
    isVip: target.isVip,
    isPremium: premium,
    currentRank: displayRank,
    peakRank,
    peakRankImage: peakDef?.imageUrl || displayDef?.imageUrl || null,
    rankImage: displayDef?.imageUrl || peakDef?.imageUrl || null,
    rankColor: displayDef?.color || peakDef?.color || null,
    kp,
    peakKp,
    level: progress.level,
    xpProgress: target.xpProgress,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    reputation,
    createdAt: target.createdAt,
    equippedBannerConfig: target.equippedBannerConfig
      ? normalizeBannerConfig(target.equippedBannerConfig)
      : null,
    equippedBannerImageUrl: target.equippedBannerImageUrl,
    equippedBannerItemName: target.equippedBannerItemName,
    equippedFrameConfig: target.equippedFrameConfig ?? null,
    equippedNicknameConfig: target.equippedNicknameConfig ?? null,
    showcase,
    showcaseLayout: stored.layout,
    leaderboardPosition: higherRanked + 1,
    totalPlayers,
    friendStatus,
    incomingFriendshipId,
    myReputationVote,
    achievements,
    badges,
    stats: { totalRuns, bestScore, bestDistance, avgScore, winRate },
  };
}

/** Lightweight payload for the hover-card mini profile (fast, minimal joins). */
export async function getPublicProfileSummary(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.isBanned) return null;
  const progress = getLevelProgress(target.xpProgress);
  const stored = parseShowcaseStorage(target.showcaseItems);
  const [showcase, repVotes] = await Promise.all([
    resolveShowcaseEntries(target.id, stored.entries),
    prisma.reputationVote.findMany({
      where: { targetId: userId },
      select: { value: true },
    }),
  ]);
  const reputation = repVotes.reduce((sum, v) => sum + v.value, 0);
  const { getRankForKp, KP_DEFAULT } = await import('@/lib/kp');
  const { isPremiumActive } = await import('@/lib/premium');
  const { parseRankConfig, findRankTierDef } = await import('@/lib/rank-config');
  const { getSiteSettings } = await import('@/lib/progression-actions');
  const settings = await getSiteSettings();
  const rankCfg = parseRankConfig(
    (settings as { rankConfigJson?: string }).rankConfigJson ?? '{}'
  );
  const kp =
    typeof (target as { kp?: number }).kp === 'number'
      ? (target as { kp: number }).kp
      : KP_DEFAULT;
  const peakKp = Math.max(
    typeof (target as { peakKp?: number }).peakKp === 'number'
      ? (target as { peakKp: number }).peakKp
      : kp,
    kp
  );
  const peakRank =
    (target as { peakRank?: string }).peakRank || getRankForKp(peakKp, rankCfg.tiers);
  const displayRank =
    peakRank && peakRank !== 'Unranked' ? peakRank : getRankForKp(kp, rankCfg.tiers);
  const rankDef = findRankTierDef(displayRank, rankCfg.tiers);
  return {
    id: target.id,
    username: target.username,
    avatarUrl: target.avatarUrl,
    statusMessage: target.statusMessage ?? '',
    role: target.role,
    isVip: target.isVip,
    isPremium: isPremiumActive({
      isVip: target.isVip,
      premiumExpiresAt: (target as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
    }),
    currentRank: displayRank,
    peakRank,
    rankImage: rankDef?.imageUrl || null,
    rankColor: rankDef?.color || null,
    kp,
    peakKp,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    reputation,
    equippedBannerConfig: target.equippedBannerConfig
      ? normalizeBannerConfig(target.equippedBannerConfig)
      : null,
    equippedBannerImageUrl: target.equippedBannerImageUrl,
    equippedFrameConfig: target.equippedFrameConfig ?? null,
    equippedNicknameConfig: target.equippedNicknameConfig ?? null,
    showcase,
    showcaseLayout: stored.layout,
  };
}
