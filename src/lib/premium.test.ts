import { describe, expect, it } from 'vitest';
import {
  PREMIUM_VP_COST,
  PREMIUM_MONTHLY_USD,
  addPremiumDays,
  formatPremiumCountdown,
  isPremiumActive,
  premiumMsRemaining,
} from './premium';
import { VIP_UNLOCK_VP_COST } from './vip';

describe('premium', () => {
  it('prices match product specs', () => {
    expect(PREMIUM_VP_COST).toBe(5000);
    expect(PREMIUM_MONTHLY_USD).toBe(2.99);
    expect(VIP_UNLOCK_VP_COST).toBe(2500);
  });

  it('treats future expiry as active', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(isPremiumActive({ isVip: false, premiumExpiresAt: future })).toBe(true);
  });

  it('treats expired membership as inactive', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(isPremiumActive({ isVip: true, premiumExpiresAt: past })).toBe(false);
  });

  it('does not treat platform VIP alone as Premium', () => {
    expect(isPremiumActive({ isVip: true, premiumExpiresAt: null })).toBe(false);
    expect(isPremiumActive({ isVip: true, premiumExpiresAt: undefined })).toBe(false);
  });

  it('stacks renewal from current expiry', () => {
    const base = new Date('2030-01-01T00:00:00.000Z');
    const next = addPremiumDays(base, 30);
    expect(next.getTime()).toBe(base.getTime() + 30 * 86400_000);
  });

  it('formats countdown', () => {
    expect(formatPremiumCountdown(0)).toBe('Expired');
    expect(formatPremiumCountdown(2 * 86400_000 + 3 * 3600_000)).toMatch(/2d/);
    expect(premiumMsRemaining(new Date(Date.now() + 60_000).toISOString())).toBeGreaterThan(0);
  });
});
