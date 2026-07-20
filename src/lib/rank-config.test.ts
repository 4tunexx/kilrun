import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANK_CONFIG,
  getRankForKpWithTiers,
  parseRankConfig,
} from './rank-config';
import { getRankForKp } from './kp';

describe('rank-config', () => {
  it('parses default tiers', () => {
    const cfg = parseRankConfig('{}');
    expect(cfg.tiers.length).toBeGreaterThan(3);
    expect(cfg.matchmakingWaitSec).toBe(DEFAULT_RANK_CONFIG.matchmakingWaitSec);
  });

  it('resolves custom minKp thresholds', () => {
    const cfg = parseRankConfig({
      tiers: [
        { name: 'Rookie', minKp: 0, imageUrl: '' },
        { name: 'Pro', minKp: 1500, imageUrl: '/pro.png' },
      ],
    });
    expect(getRankForKpWithTiers(1499, cfg.tiers)).toBe('Rookie');
    expect(getRankForKpWithTiers(1500, cfg.tiers)).toBe('Pro');
    expect(getRankForKp(1600, cfg.tiers)).toBe('Pro');
  });
});
