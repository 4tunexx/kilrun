/**
 * Shared server-authored match reward application.
 * Used by the Colyseus → Next.js API route and by thin client record* fallbacks.
 * Do NOT add `'use server'` — this module is imported by route handlers.
 */

import { prisma } from '@/lib/prisma';
import {
  applyKpDelta,
  grantXp,
  processMatchProgression,
} from '@/lib/progression-actions';
import { runAsTrustedServer } from '@/lib/trusted-server';

export const DEATHRUN_REWARDS: Record<
  'win' | 'loss' | 'survived' | 'eliminated',
  { xp: number; vp: number }
> = {
  win: { xp: 150, vp: 40 },
  survived: { xp: 90, vp: 20 },
  loss: { xp: 40, vp: 10 },
  eliminated: { xp: 25, vp: 5 },
};

export const HORDE_REWARDS: Record<
  'win' | 'loss' | 'survived' | 'eliminated',
  { xp: number; vp: number }
> = {
  win: { xp: 160, vp: 45 },
  survived: { xp: 110, vp: 30 },
  loss: { xp: 45, vp: 12 },
  eliminated: { xp: 30, vp: 8 },
};

export const COMPETITIVE_REWARDS = {
  win: { xp: 140, vp: 35 },
  loss: { xp: 50, vp: 12 },
} as const;

export type MatchRewardOutcome = 'win' | 'loss' | 'survived' | 'eliminated';

export type MatchRewardMode =
  | 'deathrun'
  | 'horde'
  | 'competitive'
  | 'competitive_ranked';

export type ServerMatchPlayerInput = {
  userId: string;
  role: string;
  outcome: MatchRewardOutcome;
  score?: number;
  distance?: number;
  kills?: number;
  wavesCleared?: number;
  opponentAvgKp?: number;
  roundsWon?: number;
  roundsLost?: number;
  queue?: 'casual' | 'ranked';
};

export type ServerMatchBatchInput = {
  matchId: string;
  mode: MatchRewardMode;
  players: ServerMatchPlayerInput[];
};

export type PlayerAward = {
  userId: string;
  xpEarned: number;
  vpEarned: number;
  kpDelta: number;
  kp: number;
  rank: string;
};

function clampNonNegInt(value: number | undefined, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function statsMatchId(stats: unknown): string | null {
  if (!stats || typeof stats !== 'object') return null;
  const id = (stats as { matchId?: unknown }).matchId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Find an existing MatchResult for this user + matchId (idempotency). */
export async function findMatchResultByMatchId(userId: string, matchId: string) {
  if (!matchId) return null;
  const recent = await prisma.matchResult.findMany({
    where: { userId },
    orderBy: { playedAt: 'desc' },
    take: 40,
  });
  return recent.find((r) => statsMatchId(r.stats) === matchId) ?? null;
}

async function awardFromExisting(
  userId: string,
  existing: {
    xpEarned: number;
    vpEarned: number;
    kpDelta: number;
  }
): Promise<PlayerAward> {
  const { KP_DEFAULT, getRankForKp } = await import('@/lib/kp');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const kp =
    typeof (user as { kp?: number } | null)?.kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;
  const rank = user?.currentRank || getRankForKp(kp);
  return {
    userId,
    xpEarned: existing.xpEarned,
    vpEarned: existing.vpEarned,
    kpDelta: existing.kpDelta ?? 0,
    kp,
    rank,
  };
}

async function applyDeathrunPlayer(
  matchId: string,
  player: ServerMatchPlayerInput
): Promise<PlayerAward> {
  const existing = await findMatchResultByMatchId(player.userId, matchId);
  if (existing) return awardFromExisting(player.userId, existing);

  const outcome = player.outcome;
  const reward = DEATHRUN_REWARDS[outcome] ?? DEATHRUN_REWARDS.loss;
  const score = clampNonNegInt(player.score, 1_000_000);
  const distance = clampNonNegInt(player.distance, 100_000);
  const role =
    player.role === 'trapper' || player.role === 'runner' ? player.role : 'runner';

  await prisma.matchResult.create({
    data: {
      userId: player.userId,
      mode: 'deathrun',
      role,
      outcome,
      xpEarned: reward.xp,
      vpEarned: reward.vp,
      stats: { matchId, score, distance },
    },
  });

  await prisma.matchStat.create({
    data: {
      userId: player.userId,
      score,
      distance,
      livesRemaining: 0,
    },
  });

  await prisma.user.update({
    where: { id: player.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(player.userId, reward.xp, 'Deathrun match');
  await processMatchProgression({
    userId: player.userId,
    mode: 'deathrun',
    outcome,
    role,
    score,
    distance,
  });

  const { KP_DEFAULT, getRankForKp } = await import('@/lib/kp');
  const user = await prisma.user.findUnique({ where: { id: player.userId } });
  const kp =
    typeof (user as { kp?: number } | null)?.kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;

  return {
    userId: player.userId,
    xpEarned: reward.xp,
    vpEarned: reward.vp,
    kpDelta: 0,
    kp,
    rank: user?.currentRank || getRankForKp(kp),
  };
}

async function applyHordePlayer(
  matchId: string,
  player: ServerMatchPlayerInput
): Promise<PlayerAward> {
  const existing = await findMatchResultByMatchId(player.userId, matchId);
  if (existing) return awardFromExisting(player.userId, existing);

  const outcome = player.outcome;
  const reward = HORDE_REWARDS[outcome] ?? HORDE_REWARDS.loss;
  const wavesCleared = clampNonNegInt(player.wavesCleared, 50);
  const kills = clampNonNegInt(player.kills, 500);
  const bonusXp = Math.min(80, wavesCleared * 4);
  const xpEarned = reward.xp + bonusXp;

  await prisma.matchResult.create({
    data: {
      userId: player.userId,
      mode: 'horde',
      role: 'survivor',
      outcome,
      xpEarned,
      vpEarned: reward.vp,
      stats: { matchId, wavesCleared, kills },
    },
  });

  await prisma.matchStat.create({
    data: {
      userId: player.userId,
      score: wavesCleared,
      distance: 0,
      livesRemaining: 0,
    },
  });

  await prisma.user.update({
    where: { id: player.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(player.userId, xpEarned, 'Horde match');
  await processMatchProgression({
    userId: player.userId,
    mode: 'horde',
    outcome,
    role: 'survivor',
    score: wavesCleared,
    wavesCleared,
    kills,
  });

  const { KP_DEFAULT, getRankForKp } = await import('@/lib/kp');
  const user = await prisma.user.findUnique({ where: { id: player.userId } });
  const kp =
    typeof (user as { kp?: number } | null)?.kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;

  return {
    userId: player.userId,
    xpEarned,
    vpEarned: reward.vp,
    kpDelta: 0,
    kp,
    rank: user?.currentRank || getRankForKp(kp),
  };
}

async function applyCompetitivePlayer(
  matchId: string,
  player: ServerMatchPlayerInput,
  mode: MatchRewardMode
): Promise<PlayerAward> {
  const existing = await findMatchResultByMatchId(player.userId, matchId);
  if (existing) return awardFromExisting(player.userId, existing);

  const { computeCompetitiveKpDelta, KP_DEFAULT, getRankForKp } = await import(
    '@/lib/kp'
  );
  const { isPremiumActive } = await import('@/lib/premium');
  const { parsePremiumConfig, isFreeRankedWeekActive } = await import(
    '@/lib/premium-config'
  );
  const { getSiteSettings } = await import('@/lib/progression-actions');

  const user = await prisma.user.findUnique({ where: { id: player.userId } });
  if (!user) {
    return {
      userId: player.userId,
      xpEarned: 0,
      vpEarned: 0,
      kpDelta: 0,
      kp: KP_DEFAULT,
      rank: 'Unranked',
    };
  }

  const settings = await getSiteSettings();
  const premiumCfg = parsePremiumConfig(
    (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
  );
  const freeWeek = isFreeRankedWeekActive(premiumCfg);
  const premium = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt: (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt,
  });

  const requested =
    player.queue ??
    (mode === 'competitive_ranked' ? 'ranked' : 'casual');
  const queue =
    requested === 'ranked' && (premium || freeWeek) ? 'ranked' : 'casual';

  const playerKp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;

  const outcome: 'win' | 'loss' = player.outcome === 'win' ? 'win' : 'loss';
  const kpDelta =
    queue === 'ranked'
      ? computeCompetitiveKpDelta({
          playerKp,
          opponentAvgKp: player.opponentAvgKp ?? KP_DEFAULT,
          won: outcome === 'win',
          roundsWon: player.roundsWon,
          roundsLost: player.roundsLost,
        })
      : 0;

  const reward = COMPETITIVE_REWARDS[outcome];
  const modeTag = queue === 'ranked' ? 'competitive_ranked' : 'competitive';
  const team =
    player.role === 'team_b' || player.role === 'team_a' ? player.role : 'team_a';
  const kills = clampNonNegInt(player.kills, 100);
  const roundsWon = clampNonNegInt(player.roundsWon, 50);
  const roundsLost = clampNonNegInt(player.roundsLost, 50);

  await prisma.matchResult.create({
    data: {
      userId: player.userId,
      mode: modeTag,
      role: team,
      outcome,
      xpEarned: reward.xp,
      vpEarned: reward.vp,
      kpDelta,
      stats: {
        matchId,
        queue,
        roundsWon,
        roundsLost,
        kills,
        opponentAvgKp: player.opponentAvgKp ?? KP_DEFAULT,
      },
    },
  });

  await prisma.matchStat.create({
    data: {
      userId: player.userId,
      score: roundsWon,
      distance: 0,
      livesRemaining: 0,
    },
  });

  await prisma.user.update({
    where: { id: player.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(
    player.userId,
    reward.xp,
    queue === 'ranked' ? 'Competitive Ranked' : 'Competitive Casual'
  );

  let nextKp = playerKp;
  let rank = user.currentRank || getRankForKp(playerKp);
  if (queue === 'ranked' && kpDelta) {
    const kpResult = await applyKpDelta(player.userId, kpDelta, 'Competitive Ranked');
    nextKp = kpResult?.kp ?? playerKp + kpDelta;
    rank = kpResult?.rank ?? getRankForKp(nextKp);
  }

  await processMatchProgression({
    userId: player.userId,
    mode: 'competitive',
    outcome,
    role: team,
  });

  return {
    userId: player.userId,
    xpEarned: reward.xp,
    vpEarned: reward.vp,
    kpDelta,
    kp: nextKp,
    rank,
  };
}

/**
 * Apply rewards for a finished match batch under a trusted server context
 * (Colyseus admin secret). Idempotent per userId + matchId.
 */
export async function applyServerMatchBatch(
  input: ServerMatchBatchInput
): Promise<{ players: PlayerAward[] }> {
  const matchId = typeof input.matchId === 'string' ? input.matchId.trim() : '';
  if (!matchId) {
    throw new Error('matchId is required');
  }

  return runAsTrustedServer(async () => {
    const awards: PlayerAward[] = [];
    for (const player of input.players) {
      if (!player?.userId || typeof player.userId !== 'string') continue;
      // Skip ephemeral Colyseus session ids (real users are Mongo ObjectIds).
      if (!/^[a-f\d]{24}$/i.test(player.userId)) continue;

      try {
        if (input.mode === 'deathrun') {
          awards.push(await applyDeathrunPlayer(matchId, player));
        } else if (input.mode === 'horde') {
          awards.push(await applyHordePlayer(matchId, player));
        } else {
          awards.push(await applyCompetitivePlayer(matchId, player, input.mode));
        }
      } catch (err) {
        console.error(
          `[match-rewards] failed for user ${player.userId} match ${matchId}:`,
          err
        );
      }
    }
    return { players: awards };
  });
}

/** Derive per-player outcome the same way results screens do. */
export function derivePlayerOutcome(input: {
  mode: MatchRewardMode;
  winnerRole: string;
  role: string;
  isAlive: boolean;
  hasFinished?: boolean;
}): MatchRewardOutcome {
  if (input.mode === 'horde') {
    const survived = input.winnerRole === 'survivor';
    if (survived) return input.isAlive ? 'win' : 'survived';
    return input.isAlive ? 'loss' : 'eliminated';
  }
  if (input.mode === 'competitive' || input.mode === 'competitive_ranked') {
    return input.winnerRole === input.role ? 'win' : 'loss';
  }
  // deathrun
  const isVictory = input.winnerRole === input.role;
  if (isVictory) return 'win';
  if (!input.isAlive) return 'eliminated';
  return 'loss';
}
