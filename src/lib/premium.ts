/**
 * Kilrun Premium — monthly membership for Ranked Competitive (KP / Elo).
 * Platform VIP (crown / cosmetics) is a separate permanent unlock — see vip.ts.
 * Live prices/offers come from SiteSettings via premium-config.ts.
 */

import {
  DEFAULT_PREMIUM_CONFIG,
  canAccessRankedCompetitive,
  isFreeRankedWeekActive,
  type PremiumConfig,
} from '@/lib/premium-config';

/** Fallback constants — prefer getPremiumConfig() / admin SiteSettings. */
export const PREMIUM_VP_COST = DEFAULT_PREMIUM_CONFIG.vpCost;
export const PREMIUM_MONTHLY_USD = DEFAULT_PREMIUM_CONFIG.monthlyUsd;
export const PREMIUM_DURATION_DAYS = DEFAULT_PREMIUM_CONFIG.durationDays;

export type CompetitiveQueue = 'casual' | 'ranked';

/** True when Premium subscription is currently active (expiry in the future). */
export function isPremiumActive(input: {
  isVip?: boolean | null;
  premiumExpiresAt?: Date | string | null;
}): boolean {
  const expires = input.premiumExpiresAt
    ? new Date(input.premiumExpiresAt)
    : null;
  if (expires && !Number.isNaN(expires.getTime()) && expires.getTime() > Date.now()) {
    return true;
  }
  // `isVip` is platform VIP only — it does not grant Premium / Ranked.
  void input.isVip;
  return false;
}

export function premiumMsRemaining(premiumExpiresAt?: Date | string | null): number {
  if (!premiumExpiresAt) return 0;
  const ends = new Date(premiumExpiresAt).getTime();
  if (Number.isNaN(ends)) return 0;
  return Math.max(0, ends - Date.now());
}

export function formatPremiumCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function addPremiumDays(from: Date, days = PREMIUM_DURATION_DAYS): Date {
  const base = from.getTime() > Date.now() ? from : new Date();
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export { canAccessRankedCompetitive, isFreeRankedWeekActive };
export type { PremiumConfig };
