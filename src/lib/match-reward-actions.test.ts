import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyServerMatchBatch } = vi.hoisted(() => ({
  applyServerMatchBatch: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/progression-actions', () => ({ ensurePlayerMissions: vi.fn() }));
vi.mock('@/lib/daily-missions', () => ({ missionPeriodKey: vi.fn() }));
vi.mock('@/lib/shop-images', () => ({ resolveShopImageUrl: vi.fn() }));
vi.mock('@/lib/roles', () => ({ canAccessAdmin: vi.fn() }));
vi.mock('@/lib/vip', () => ({ withActiveVip: vi.fn() }));
vi.mock('@/lib/match-rewards', () => ({ applyServerMatchBatch }));

import {
  recordCompetitiveResult,
  recordDeathrunResult,
  recordHordeResult,
} from './actions';

describe('legacy match reward actions', () => {
  beforeEach(() => {
    applyServerMatchBatch.mockClear();
  });

  it.each([
    ['Deathrun', recordDeathrunResult, { userId: 'player', role: 'runner', outcome: 'win', score: 100 }],
    ['Horde', recordHordeResult, { userId: 'player', outcome: 'win', wavesCleared: 10, kills: 20 }],
    [
      'Competitive',
      recordCompetitiveResult,
      {
        userId: 'player',
        team: 'team_a',
        outcome: 'win',
        opponentAvgKp: 0,
        queue: 'ranked',
      },
    ],
  ])('rejects client-authored %s rewards without applying a match batch', async (_mode, action, input) => {
    await expect(action(input as never)).rejects.toThrow(
      'Match rewards can only be recorded by the trusted game server'
    );
    expect(applyServerMatchBatch).not.toHaveBeenCalled();
  });
});
