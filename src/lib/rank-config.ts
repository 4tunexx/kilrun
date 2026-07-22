/**
 * Admin-editable competitive rank tiers (SiteSettings.rankConfigJson).
 * Defaults match src/lib/kp.ts hardcoded tiers.
 */

export type RankTierDef = {
  name: string;
  minKp: number;
  /** Optional badge / icon URL shown next to rank name. */
  imageUrl: string;
  color?: string;
};

export type RankConfig = {
  tiers: RankTierDef[];
  /**
   * Seconds to wait for same-rank teammates in Ranked before opening the lobby
   * to all ranks.
   */
  matchmakingWaitSec: number;
  /** Minimum players before we keep a same-rank lobby (else open sooner). */
  minSameRankPlayers: number;
  /** Opaque season id (bumped when an admin ends a season). */
  seasonId: string;
  seasonName: string;
  seasonStartsAt: string | null;
  seasonEndsAt: string | null;
  /** KP value applied to all players when a season ends. */
  seasonKpResetTo: number;
};

export const DEFAULT_RANK_TIERS: RankTierDef[] = [
  { name: 'Unranked', minKp: 0, imageUrl: '', color: '#94a3b8' },
  { name: 'Bronze', minKp: 800, imageUrl: '', color: '#cd7f32' },
  { name: 'Silver', minKp: 1000, imageUrl: '', color: '#c0c0c0' },
  { name: 'Gold', minKp: 1200, imageUrl: '', color: '#f5c542' },
  { name: 'Platinum', minKp: 1400, imageUrl: '', color: '#7dd3fc' },
  { name: 'Diamond', minKp: 1600, imageUrl: '', color: '#a78bfa' },
  { name: 'Immortal', minKp: 1800, imageUrl: '', color: '#f97316' },
];

const KP_RESET_DEFAULT = 1000;

export const DEFAULT_RANK_CONFIG: RankConfig = {
  tiers: DEFAULT_RANK_TIERS,
  matchmakingWaitSec: 12,
  minSameRankPlayers: 4,
  seasonId: 's1',
  seasonName: 'Season 1',
  seasonStartsAt: null,
  seasonEndsAt: null,
  seasonKpResetTo: KP_RESET_DEFAULT,
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseTier(raw: unknown): RankTierDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_RANK_TIERS.map((t) => ({ ...t }));
  }
  const tiers: RankTierDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name =
      typeof o.name === 'string' && o.name.trim() ? o.name.trim() : null;
    if (!name) continue;
    tiers.push({
      name,
      minKp: Math.max(0, Math.floor(num(o.minKp, 0))),
      imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl.trim() : '',
      color: typeof o.color === 'string' ? o.color : undefined,
    });
  }
  if (tiers.length === 0) return DEFAULT_RANK_TIERS.map((t) => ({ ...t }));
  return tiers.sort((a, b) => a.minKp - b.minKp);
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function parseRankConfig(raw: unknown): RankConfig {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      obj = JSON.parse(raw || '{}') as Record<string, unknown>;
    } else if (raw && typeof raw === 'object') {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    return {
      ...DEFAULT_RANK_CONFIG,
      tiers: DEFAULT_RANK_TIERS.map((t) => ({ ...t })),
    };
  }
  return {
    tiers: parseTier(obj.tiers),
    matchmakingWaitSec: Math.max(
      3,
      Math.floor(num(obj.matchmakingWaitSec, DEFAULT_RANK_CONFIG.matchmakingWaitSec))
    ),
    minSameRankPlayers: Math.max(
      2,
      Math.floor(num(obj.minSameRankPlayers, DEFAULT_RANK_CONFIG.minSameRankPlayers))
    ),
    seasonId:
      typeof obj.seasonId === 'string' && obj.seasonId.trim()
        ? obj.seasonId.trim()
        : DEFAULT_RANK_CONFIG.seasonId,
    seasonName:
      typeof obj.seasonName === 'string' && obj.seasonName.trim()
        ? obj.seasonName.trim()
        : DEFAULT_RANK_CONFIG.seasonName,
    seasonStartsAt: strOrNull(obj.seasonStartsAt),
    seasonEndsAt: strOrNull(obj.seasonEndsAt),
    seasonKpResetTo: Math.max(
      0,
      Math.floor(num(obj.seasonKpResetTo, DEFAULT_RANK_CONFIG.seasonKpResetTo))
    ),
  };
}

export function serializeRankConfig(cfg: RankConfig): string {
  return JSON.stringify(parseRankConfig(cfg));
}

export function getRankForKpWithTiers(kp: number, tiers: RankTierDef[]): string {
  const safe = Math.max(0, Math.floor(kp));
  let rank = tiers[0]?.name ?? 'Unranked';
  for (const tier of tiers) {
    if (safe >= tier.minKp) rank = tier.name;
  }
  return rank;
}

export function findRankTierDef(
  name: string,
  tiers: RankTierDef[] = DEFAULT_RANK_TIERS
): RankTierDef | undefined {
  return tiers.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

/** Open lobby key used when same-rank matchmaking times out. */
export const RANK_MM_OPEN_KEY = 'open';
