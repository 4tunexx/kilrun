'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getLevelProgress, getRankForLevel } from '@/lib/progression';
import { getPlayerAchievements, getPlayerBadges } from '@/lib/progression-actions';
import { getMyReputationVote } from '@/lib/social-actions';
import { normalizeBannerConfig, type BannerConfig } from '@/lib/banner';
import { parseShowcaseEntries, type ShowcaseDisplayItem } from '@/lib/showcase';
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
  countryCode: string;
  role: string;
  isVip: boolean;
  currentRank: string;
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
  showcase: ShowcaseDisplayItem[];
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

  const [higherRanked, totalPlayers, achievements, badges, matchStats, matchResults] =
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
    ]);

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

  const showcase = await resolveShowcaseEntries(target.id, parseShowcaseEntries(target.showcaseItems));

  return {
    id: target.id,
    username: target.username,
    avatarUrl: target.avatarUrl,
    bio: target.bio,
    countryCode: target.countryCode ?? '',
    role: target.role,
    isVip: target.isVip,
    currentRank: target.currentRank || getRankForLevel(progress.level),
    level: progress.level,
    xpProgress: target.xpProgress,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    reputation: target.reputation,
    createdAt: target.createdAt,
    equippedBannerConfig: target.equippedBannerConfig
      ? normalizeBannerConfig(target.equippedBannerConfig)
      : null,
    equippedBannerImageUrl: target.equippedBannerImageUrl,
    equippedBannerItemName: target.equippedBannerItemName,
    showcase,
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
  const showcase = await resolveShowcaseEntries(
    target.id,
    parseShowcaseEntries(target.showcaseItems)
  );
  return {
    id: target.id,
    username: target.username,
    avatarUrl: target.avatarUrl,
    role: target.role,
    isVip: target.isVip,
    currentRank: target.currentRank || getRankForLevel(progress.level),
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    reputation: target.reputation,
    equippedBannerConfig: target.equippedBannerConfig
      ? normalizeBannerConfig(target.equippedBannerConfig)
      : null,
    equippedBannerImageUrl: target.equippedBannerImageUrl,
    showcase,
  };
}
