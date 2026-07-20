/**
 * Killrun Points (KP) — competitive Elo-style rating.
 * Ranks shown on profiles / leaderboards are derived from KP (Faceit / ESEA style).
 */

export const KP_DEFAULT = 1000;
export const KP_MIN = 0;
export const KP_MAX = 5000;

/** Rank tiers ordered low → high. Threshold = minimum KP for that rank. */
export const KP_RANK_TIERS: { name: string; minKp: number }[] = [
  { name: 'Unranked', minKp: 0 },
  { name: 'Bronze', minKp: 800 },
  { name: 'Silver', minKp: 1000 },
  { name: 'Gold', minKp: 1200 },
  { name: 'Platinum', minKp: 1400 },
  { name: 'Diamond', minKp: 1600 },
  { name: 'Immortal', minKp: 1800 },
];

export function getRankForKp(kp: number): string {
  const safe = Math.max(KP_MIN, Math.floor(kp));
  let rank = KP_RANK_TIERS[0].name;
  for (const tier of KP_RANK_TIERS) {
    if (safe >= tier.minKp) rank = tier.name;
  }
  return rank;
}

/** Progress toward the next KP rank (for UI bars). */
export function getKpRankProgress(kp: number): {
  rank: string;
  nextRank: string | null;
  kpIntoRank: number;
  kpForNext: number;
  percent: number;
} {
  const safe = Math.max(KP_MIN, Math.floor(kp));
  let idx = 0;
  for (let i = 0; i < KP_RANK_TIERS.length; i++) {
    if (safe >= KP_RANK_TIERS[i].minKp) idx = i;
  }
  const current = KP_RANK_TIERS[idx];
  const next = KP_RANK_TIERS[idx + 1] ?? null;
  if (!next) {
    return {
      rank: current.name,
      nextRank: null,
      kpIntoRank: 0,
      kpForNext: 0,
      percent: 100,
    };
  }
  const span = next.minKp - current.minKp;
  const into = safe - current.minKp;
  return {
    rank: current.name,
    nextRank: next.name,
    kpIntoRank: into,
    kpForNext: span,
    percent: span <= 0 ? 100 : Math.min(100, Math.round((into / span) * 1000) / 10),
  };
}

/**
 * Classic Elo expected score for player A vs average opponent.
 * K-factor scales how fast ratings move (Faceit-like ~25–40).
 */
export function expectedScore(playerKp: number, opponentKp: number): number {
  return 1 / (1 + Math.pow(10, (opponentKp - playerKp) / 400));
}

export function clampKp(kp: number): number {
  return Math.max(KP_MIN, Math.min(KP_MAX, Math.round(kp)));
}

/**
 * Compute KP delta for one player after a competitive match.
 * `won` = player's team won the match (best of 6 rounds).
 * `opponentAvgKp` = average KP of the opposing team.
 */
export function computeCompetitiveKpDelta(input: {
  playerKp: number;
  opponentAvgKp: number;
  won: boolean;
  /** Optional: rounds won by player's team (0–6) for slight variance */
  roundsWon?: number;
  roundsLost?: number;
  kFactor?: number;
}): number {
  const k = input.kFactor ?? 32;
  const expected = expectedScore(input.playerKp, input.opponentAvgKp);
  const score = input.won ? 1 : 0;
  let delta = k * (score - expected);

  // Slight bonus/penalty from round differential (e.g. 4–2 vs 4–0)
  if (
    typeof input.roundsWon === 'number' &&
    typeof input.roundsLost === 'number' &&
    input.roundsWon + input.roundsLost > 0
  ) {
    const margin = (input.roundsWon - input.roundsLost) / 6;
    delta += margin * 4;
  }

  return Math.round(delta);
}
