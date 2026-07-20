/**
 * Admin-editable Kilrun Premium config (SiteSettings.premiumConfigJson).
 * Defaults match product: 5000 VP / 30 days or $2.99/mo; optional free Ranked week.
 */

export type PremiumOffer = {
  id: string;
  label: string;
  /** VP cost; 0 = free grant of durationDays */
  vpCost: number;
  /** Optional USD display (card path) */
  usd: number | null;
  durationDays: number;
  enabled: boolean;
};

export type PremiumConfig = {
  vpCost: number;
  monthlyUsd: number;
  durationDays: number;
  /** When true (and freeWeekEndsAt in future), Ranked is open to everyone. */
  freeRankedWeekEnabled: boolean;
  freeWeekEndsAt: string | null;
  offers: PremiumOffer[];
};

export const DEFAULT_PREMIUM_CONFIG: PremiumConfig = {
  vpCost: 5000,
  monthlyUsd: 2.99,
  durationDays: 30,
  freeRankedWeekEnabled: false,
  freeWeekEndsAt: null,
  offers: [
    {
      id: 'month_vp',
      label: '1 Month (VP)',
      vpCost: 5000,
      usd: null,
      durationDays: 30,
      enabled: true,
    },
    {
      id: 'month_card',
      label: '1 Month (Card)',
      vpCost: 0,
      usd: 2.99,
      durationDays: 30,
      enabled: true,
    },
  ],
};

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseOffer(raw: unknown, index: number): PremiumOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `offer_${index}`;
  const label =
    typeof o.label === 'string' && o.label.trim() ? o.label.trim() : `Offer ${index + 1}`;
  return {
    id,
    label,
    vpCost: Math.max(0, Math.floor(num(o.vpCost, 0))),
    usd: o.usd == null || o.usd === '' ? null : Math.max(0, num(o.usd, 0)),
    durationDays: Math.max(1, Math.floor(num(o.durationDays, 30))),
    enabled: o.enabled !== false,
  };
}

export function parsePremiumConfig(raw: unknown): PremiumConfig {
  let obj: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      obj = JSON.parse(raw || '{}') as Record<string, unknown>;
    } else if (raw && typeof raw === 'object') {
      obj = raw as Record<string, unknown>;
    }
  } catch {
    return { ...DEFAULT_PREMIUM_CONFIG, offers: [...DEFAULT_PREMIUM_CONFIG.offers] };
  }

  const base = DEFAULT_PREMIUM_CONFIG;
  const offersRaw = Array.isArray(obj.offers) ? obj.offers : null;
  const offers = offersRaw
    ? (offersRaw.map(parseOffer).filter(Boolean) as PremiumOffer[])
    : [...base.offers];

  return {
    vpCost: Math.max(0, Math.floor(num(obj.vpCost, base.vpCost))),
    monthlyUsd: Math.max(0, num(obj.monthlyUsd, base.monthlyUsd)),
    durationDays: Math.max(1, Math.floor(num(obj.durationDays, base.durationDays))),
    freeRankedWeekEnabled: obj.freeRankedWeekEnabled === true,
    freeWeekEndsAt:
      typeof obj.freeWeekEndsAt === 'string' && obj.freeWeekEndsAt.trim()
        ? obj.freeWeekEndsAt
        : null,
    offers: offers.length > 0 ? offers : [...base.offers],
  };
}

export function serializePremiumConfig(cfg: PremiumConfig): string {
  return JSON.stringify(parsePremiumConfig(cfg));
}

/** Free Ranked week is active when enabled and end date is in the future (or no end = open until disabled). */
export function isFreeRankedWeekActive(cfg: PremiumConfig, now = Date.now()): boolean {
  if (!cfg.freeRankedWeekEnabled) return false;
  if (!cfg.freeWeekEndsAt) return true;
  const ends = new Date(cfg.freeWeekEndsAt).getTime();
  if (Number.isNaN(ends)) return true;
  return ends > now;
}

export function canAccessRankedCompetitive(input: {
  isPremium: boolean;
  config: PremiumConfig;
}): boolean {
  return input.isPremium || isFreeRankedWeekActive(input.config);
}
