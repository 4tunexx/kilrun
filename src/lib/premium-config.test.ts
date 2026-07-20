import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREMIUM_CONFIG,
  canAccessRankedCompetitive,
  isFreeRankedWeekActive,
  parsePremiumConfig,
} from './premium-config';

describe('premium-config', () => {
  it('parses defaults from empty json', () => {
    const cfg = parsePremiumConfig('{}');
    expect(cfg.vpCost).toBe(DEFAULT_PREMIUM_CONFIG.vpCost);
    expect(cfg.monthlyUsd).toBe(2.99);
  });

  it('detects free ranked week with future end', () => {
    const cfg = parsePremiumConfig({
      freeRankedWeekEnabled: true,
      freeWeekEndsAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(isFreeRankedWeekActive(cfg)).toBe(true);
    expect(canAccessRankedCompetitive({ isPremium: false, config: cfg })).toBe(true);
  });

  it('blocks ranked when free week off and not premium', () => {
    const cfg = parsePremiumConfig({ freeRankedWeekEnabled: false });
    expect(canAccessRankedCompetitive({ isPremium: false, config: cfg })).toBe(false);
    expect(canAccessRankedCompetitive({ isPremium: true, config: cfg })).toBe(true);
  });
});
