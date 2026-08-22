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
  getSiteSettings,
} from '@/lib/progression-actions';
import { runAsTrustedServer } from '@/lib/trusted-server';
import { grantGameXpToUser } from '@/lib/game-progression-core';
import {
  DEFAULT_MATCH_REWARDS_CONFIG,
  parseMatchRewardsConfig,
  type MatchRewardsConfig,
} from '@/lib/match-rewards-config';

/**
 * Admin-tunable reward economy (SiteSettings.matchRewardsConfigJson), cached
 * briefly so per-match award processing doesn't hit Mongo twice for the same
 * settings row. ALWAYS falls back to the hardcoded `DEFAULT_MATCH_REWARDS_CONFIG`
 * on any error — a missing/corrupt config must never crash match-result
 * processing (players still need their XP/VP/KP awarded).
 */
let rewardsConfigCache: { at: number; cfg: MatchRewardsConfig } | null = null;
const REWARDS_CONFIG_CACHE_TTL_MS = 15_000;

async function getActiveMatchRewardsConfig(): Promise<MatchRewardsConfig> {
  const now = Date.now();
  if (rewardsConfigCache && now - rewardsConfigCache.at < REWARDS_CONFIG_CACHE_TTL_MS) {
    return rewardsConfigCache.cfg;
  }
  try {
    const settings = await getSiteSettings();
    const cfg = parseMatchRewardsConfig(
      (settings as { matchRewardsConfigJson?: string }).matchRewardsConfigJson ?? '{}'
    );
    rewardsConfigCache = { at: now, cfg };
    return cfg;
  } catch (err) {
    console.error('[match-rewards] config load failed, using hardcoded defaults:', err);
    return DEFAULT_MATCH_REWARDS_CONFIG;
  }
}

/**
 * IN-GAME XP (separate from website `xpEarned`/`xpProgress`) — kills matter
 * more here since it's a combat power-progression system, not the website
 * leveling curve.
 */
function computeInGameXp(
  base: { xp: number; kills?: number; wavesCleared?: number },
  cfg: MatchRewardsConfig
): number {
  const killBonus = Math.min(cfg.killXpCap, (base.kills ?? 0) * cfg.killXpPerKill);
  const waveBonus = Math.min(cfg.waveXpCap, (base.wavesCleared ?? 0) * cfg.waveXpPerWave);
  return Math.round(base.xp * cfg.inGameXpBaseMultiplier + killBonus + waveBonus);
}

/** Hardcoded fallback tables — kept exported for backward compat; the live
 * numbers actually used at runtime come from `getActiveMatchRewardsConfig()`
 * (DB-backed, admin-tunable via the Game Balance panel), falling back to
 * these exact same values whenever the DB is unreachable or unseeded. */
export const DEATHRUN_REWARDS = DEFAULT_MATCH_REWARDS_CONFIG.deathrun;
export const HORDE_REWARDS = DEFAULT_MATCH_REWARDS_CONFIG.horde;
export const COMPETITIVE_REWARDS = DEFAULT_MATCH_REWARDS_CONFIG.competitive;

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
  deaths?: number;
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

type MatchRewardStats = {
  matchId?: string;
  kills?: number;
  wavesCleared?: number;
  gameXpAwarded?: boolean;
  gameXp?: number;
  [key: string]: unknown;
};

function readMatchStats(stats: unknown): MatchRewardStats {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return {};
  return { ...(stats as MatchRewardStats) };
}

async function markGameXpAwarded(resultId: string, stats: MatchRewardStats, amount: number) {
  await prisma.matchResult.update({
    where: { id: resultId },
    data: { stats: { ...stats, gameXpAwarded: true, gameXp: amount } },
  });
}

async function grantInGameXpForMatch(
  resultId: string,
  userId: string,
  amount: number,
  stats: MatchRewardStats
): Promise<void> {
  if (stats.gameXpAwarded) return;
  try {
    if (amount > 0) await grantGameXpToUser(userId, amount);
    await markGameXpAwarded(resultId, stats, amount);
  } catch (err) {
    console.error('[match-rewards] in-game XP grant failed', userId, err);
  }
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
    id: string;
    xpEarned: number;
    vpEarned: number;
    kpDelta: number;
    stats: unknown;
  }
): Promise<PlayerAward> {
  const stats = readMatchStats(existing.stats);
  if (!stats.gameXpAwarded) {
    const cfg = await getActiveMatchRewardsConfig();
    const amount = computeInGameXp(
      { xp: existing.xpEarned, kills: stats.kills, wavesCleared: stats.wavesCleared },
      cfg
    );
    await grantInGameXpForMatch(existing.id, userId, amount, stats);
  }
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

  const cfg = await getActiveMatchRewardsConfig();
  const outcome = player.outcome;
  const reward = cfg.deathrun[outcome] ?? cfg.deathrun.loss;
  const score = clampNonNegInt(player.score, 1_000_000);
  const distance = clampNonNegInt(player.distance, 100_000);
  const kills = clampNonNegInt(player.kills, 100);
  const deaths = clampNonNegInt(player.deaths, 100);
  const role =
    player.role === 'trapper' || player.role === 'runner' ? player.role : 'runner';

  const row = await prisma.matchResult.create({
    data: {
      userId: player.userId,
      mode: 'deathrun',
      role,
      outcome,
      xpEarned: reward.xp,
      vpEarned: reward.vp,
      stats: { matchId, score, distance, kills, deaths, gameXpAwarded: false },
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
  await grantInGameXpForMatch(
    row.id,
    player.userId,
    computeInGameXp({ xp: reward.xp, kills }, cfg),
    readMatchStats(row.stats)
  );
  await processMatchProgression({
    userId: player.userId,
    mode: 'deathrun',
    outcome,
    role,
    score,
    distance,
    kills,
    deaths,
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

  const cfg = await getActiveMatchRewardsConfig();
  const outcome = player.outcome;
  const reward = cfg.horde[outcome] ?? cfg.horde.loss;
  const wavesCleared = clampNonNegInt(player.wavesCleared, 50);
  const kills = clampNonNegInt(player.kills, 500);
  const deaths = clampNonNegInt(player.deaths, 50);
  const bonusXp = Math.min(cfg.hordeWaveBonusCap, wavesCleared * cfg.hordeWaveBonusPerWave);
  const xpEarned = reward.xp + bonusXp;

  const row = await prisma.matchResult.create({
    data: {
      userId: player.userId,
      mode: 'horde',
      role: 'survivor',
      outcome,
      xpEarned,
      vpEarned: reward.vp,
      stats: { matchId, wavesCleared, kills, deaths, gameXpAwarded: false },
    },
  });

  // MatchStat is Deathrun-only telemetry — Horde uses MatchResult.stats.

  await prisma.user.update({
    where: { id: player.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(player.userId, xpEarned, 'Horde match');
  await grantInGameXpForMatch(
    row.id,
    player.userId,
    computeInGameXp({ xp: xpEarned, kills, wavesCleared }, cfg),
    readMatchStats(row.stats)
  );
  await processMatchProgression({
    userId: player.userId,
    mode: 'horde',
    outcome,
    role: 'survivor',
    score: wavesCleared,
    wavesCleared,
    kills,
    deaths,
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

  const cfg = await getActiveMatchRewardsConfig();
  const reward = cfg.competitive[outcome];
  const modeTag = queue === 'ranked' ? 'competitive_ranked' : 'competitive';
  const team =
    player.role === 'team_b' || player.role === 'team_a' ? player.role : 'team_a';
  const kills = clampNonNegInt(player.kills, 100);
  const deaths = clampNonNegInt(player.deaths, 100);
  const roundsWon = clampNonNegInt(player.roundsWon, 50);
  const roundsLost = clampNonNegInt(player.roundsLost, 50);

  const row = await prisma.matchResult.create({
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
        deaths,
        opponentAvgKp: player.opponentAvgKp ?? KP_DEFAULT,
        gameXpAwarded: false,
      },
    },
  });

  // MatchStat is Deathrun-only telemetry — Competitive uses MatchResult.stats.

  await prisma.user.update({
    where: { id: player.userId },
    data: { vpCurrency: { increment: reward.vp } },
  });

  await grantXp(
    player.userId,
    reward.xp,
    queue === 'ranked' ? 'Competitive Ranked' : 'Competitive Casual'
  );
  await grantInGameXpForMatch(
    row.id,
    player.userId,
    computeInGameXp({ xp: reward.xp, kills }, cfg),
    readMatchStats(row.stats)
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
    kills,
    deaths,
    queue,
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
