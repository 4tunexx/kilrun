/**
 * Admin-editable match reward economy (SiteSettings.matchRewardsConfigJson).
 * Mirrors `src/lib/premium-config.ts` exactly: a single JSON blob on
 * SiteSettings, parsed defensively with the hardcoded numbers from
 * `src/lib/match-rewards.ts` as the default/fallback so a missing or
 * corrupt config can never crash match-result processing.
 */

export type RewardEntry = { xp: number; vp: number };

export type MatchRewardsConfig = {
  deathrun: Record<'win' | 'loss' | 'survived' | 'eliminated', RewardEntry>;
  horde: Record<'win' | 'loss' | 'survived' | 'eliminated', RewardEntry>;
  competitive: Record<'win' | 'loss', RewardEntry>;
  /** In-game (Powers/skill-tree) XP bonus formula constants — see computeInGameXp(). */
  inGameXpBaseMultiplier: number;
  killXpPerKill: number;
  killXpCap: number;
  waveXpPerWave: number;
  waveXpCap: number;
  /** Horde website-XP wave clear bonus (separate from in-game XP bonus above). */
  hordeWaveBonusPerWave: number;
  hordeWaveBonusCap: number;
};

/** Original hardcoded numbers from match-rewards.ts, losslessly re-encoded
 * as the safe default/fallback config. */
export const DEFAULT_MATCH_REWARDS_CONFIG: MatchRewardsConfig = {
  deathrun: {
    win: { xp: 150, vp: 40 },
    survived: { xp: 90, vp: 20 },
    loss: { xp: 40, vp: 10 },
    eliminated: { xp: 25, vp: 5 },
  },
  horde: {
    win: { xp: 160, vp: 45 },
    survived: { xp: 110, vp: 30 },
    loss: { xp: 45, vp: 12 },
    eliminated: { xp: 30, vp: 8 },
  },
  competitive: {
    win: { xp: 140, vp: 35 },
    loss: { xp: 50, vp: 12 },
  },
  inGameXpBaseMultiplier: 0.6,
  killXpPerKill: 6,
  killXpCap: 200,
  waveXpPerWave: 5,
  waveXpCap: 120,
  hordeWaveBonusPerWave: 4,
  hordeWaveBonusCap: 80,
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseRewardEntry(raw: unknown, fallback: RewardEntry): RewardEntry {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    xp: Math.max(0, Math.round(num(o.xp, fallback.xp))),
    vp: Math.max(0, Math.round(num(o.vp, fallback.vp))),
  };
}

export function parseMatchRewardsConfig(raw: unknown): MatchRewardsConfig {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      obj = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } else if (raw && typeof raw === 'object') {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    return { ...DEFAULT_MATCH_REWARDS_CONFIG };
  }

  const base = DEFAULT_MATCH_REWARDS_CONFIG;
  const deathrunRaw = (obj.deathrun ?? {}) as Record<string, unknown>;
  const hordeRaw = (obj.horde ?? {}) as Record<string, unknown>;
  const competitiveRaw = (obj.competitive ?? {}) as Record<string, unknown>;

  return {
    deathrun: {
      win: parseRewardEntry(deathrunRaw.win, base.deathrun.win),
      survived: parseRewardEntry(deathrunRaw.survived, base.deathrun.survived),
      loss: parseRewardEntry(deathrunRaw.loss, base.deathrun.loss),
      eliminated: parseRewardEntry(deathrunRaw.eliminated, base.deathrun.eliminated),
    },
    horde: {
      win: parseRewardEntry(hordeRaw.win, base.horde.win),
      survived: parseRewardEntry(hordeRaw.survived, base.horde.survived),
      loss: parseRewardEntry(hordeRaw.loss, base.horde.loss),
      eliminated: parseRewardEntry(hordeRaw.eliminated, base.horde.eliminated),
    },
    competitive: {
      win: parseRewardEntry(competitiveRaw.win, base.competitive.win),
      loss: parseRewardEntry(competitiveRaw.loss, base.competitive.loss),
    },
    inGameXpBaseMultiplier: Math.max(0, num(obj.inGameXpBaseMultiplier, base.inGameXpBaseMultiplier)),
    killXpPerKill: Math.max(0, num(obj.killXpPerKill, base.killXpPerKill)),
    killXpCap: Math.max(0, num(obj.killXpCap, base.killXpCap)),
    waveXpPerWave: Math.max(0, num(obj.waveXpPerWave, base.waveXpPerWave)),
    waveXpCap: Math.max(0, num(obj.waveXpCap, base.waveXpCap)),
    hordeWaveBonusPerWave: Math.max(0, num(obj.hordeWaveBonusPerWave, base.hordeWaveBonusPerWave)),
    hordeWaveBonusCap: Math.max(0, num(obj.hordeWaveBonusCap, base.hordeWaveBonusCap)),
  };
}

export function serializeMatchRewardsConfig(cfg: unknown): string {
  return JSON.stringify(parseMatchRewardsConfig(cfg));
}
