/**
 * Per-mode stats aggregated from MatchResult (Deathrun / Horde / Competitive / Ranked).
 */

export type ModeStatsKey = 'deathrun' | 'horde' | 'competitive' | 'competitive_ranked';

export type ModeStatsSummary = {
  mode: ModeStatsKey;
  matches: number;
  wins: number;
  losses: number;
  survived: number;
  eliminated: number;
  kills: number;
  deaths: number;
  /** kills / max(deaths, 1) rounded to 2 decimals */
  kd: number;
  /** Mode-specific extras */
  bestScore: number;
  bestDistance: number;
  wavesCleared: number;
  roundsWon: number;
  roundsLost: number;
};

export type MatchHistoryRow = {
  id: string;
  mode: string;
  role: string;
  outcome: string;
  xpEarned: number;
  vpEarned: number;
  kpDelta: number;
  kills: number;
  deaths: number;
  playedAt: string;
  detail: string;
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function kdRatio(kills: number, deaths: number): number {
  if (deaths <= 0) return Math.round(kills * 100) / 100;
  return Math.round((kills / deaths) * 100) / 100;
}

export function emptyModeStats(mode: ModeStatsKey): ModeStatsSummary {
  return {
    mode,
    matches: 0,
    wins: 0,
    losses: 0,
    survived: 0,
    eliminated: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    bestScore: 0,
    bestDistance: 0,
    wavesCleared: 0,
    roundsWon: 0,
    roundsLost: 0,
  };
}

type ResultRow = {
  id: string;
  mode: string;
  role: string | null;
  outcome: string;
  xpEarned: number;
  vpEarned: number;
  kpDelta: number;
  playedAt: Date;
  stats: unknown;
};

export function aggregateModeStats(
  rows: ResultRow[],
  mode: ModeStatsKey
): ModeStatsSummary {
  const out = emptyModeStats(mode);
  const filtered = rows.filter((r) => {
    if (mode === 'competitive') {
      return r.mode === 'competitive' || r.mode === 'competitive_ranked';
    }
    return r.mode === mode;
  });

  for (const r of filtered) {
    out.matches += 1;
    if (r.outcome === 'win') out.wins += 1;
    else if (r.outcome === 'survived') out.survived += 1;
    else if (r.outcome === 'eliminated') out.eliminated += 1;
    else if (r.outcome === 'loss') out.losses += 1;

    const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<
      string,
      unknown
    >;
    out.kills += num(s.kills);
    out.deaths += num(s.deaths);
    out.bestScore = Math.max(out.bestScore, num(s.score), num(s.roundsWon));
    out.bestDistance = Math.max(out.bestDistance, num(s.distance));
    out.wavesCleared += num(s.wavesCleared);
    out.roundsWon += num(s.roundsWon);
    out.roundsLost += num(s.roundsLost);
  }

  out.kd = kdRatio(out.kills, out.deaths);
  return out;
}

export function toHistoryRows(rows: ResultRow[], take = 20): MatchHistoryRow[] {
  return rows.slice(0, take).map((r) => {
    const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<
      string,
      unknown
    >;
    const kills = num(s.kills);
    const deaths = num(s.deaths);
    let detail = '';
    if (r.mode === 'deathrun') {
      detail = `${num(s.score)} score · ${num(s.distance)}m`;
    } else if (r.mode === 'horde') {
      detail = `${num(s.wavesCleared)} waves · ${kills} kills`;
    } else {
      detail = `${num(s.roundsWon)}-${num(s.roundsLost)} · ${kills}K/${deaths}D`;
    }
    return {
      id: r.id,
      mode: r.mode,
      role: r.role ?? 'player',
      outcome: r.outcome,
      xpEarned: r.xpEarned,
      vpEarned: r.vpEarned,
      kpDelta: r.kpDelta ?? 0,
      kills,
      deaths,
      playedAt: r.playedAt.toISOString(),
      detail,
    };
  });
}

/** Sum kills from MatchResult.stats JSON for a list of modes. */
export function sumKillsFromResults(
  rows: Array<{ stats: unknown; mode?: string }>,
  modes?: string[]
): number {
  let total = 0;
  for (const r of rows) {
    if (modes && r.mode && !modes.includes(r.mode)) continue;
    const s = r.stats as { kills?: number } | null;
    if (typeof s?.kills === 'number') total += s.kills;
  }
  return total;
}

export function sumDeathsFromResults(
  rows: Array<{ stats: unknown; mode?: string }>,
  modes?: string[]
): number {
  let total = 0;
  for (const r of rows) {
    if (modes && r.mode && !modes.includes(r.mode)) continue;
    const s = r.stats as { deaths?: number } | null;
    if (typeof s?.deaths === 'number') total += s.deaths;
  }
  return total;
}
