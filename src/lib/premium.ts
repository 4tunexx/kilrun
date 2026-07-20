/**
 * Kilrun Premium — monthly membership for Ranked Competitive (KP / Elo).
 * VIP cosmetics stay tied to Premium while the subscription is active.
 */

export const PREMIUM_VP_COST = 5000;
export const PREMIUM_MONTHLY_USD = 2.99;
export const PREMIUM_DURATION_DAYS = 30;

/** @deprecated Prefer PREMIUM_VP_COST — kept for older VIP dialog callers. */
export const VIP_UNLOCK_VP_COST = PREMIUM_VP_COST;

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
  // Legacy permanent VIP (no expiry set) still counts as Premium.
  if (input.isVip && !expires) return true;
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
