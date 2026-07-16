'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export interface StatsSummary {
  totalRuns: number;
  bestScore: number;
  bestDistance: number;
  avgScore: number;
  avgDistance: number;
  lastPlayedAt: Date | null;
}

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
