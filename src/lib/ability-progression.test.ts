import { describe, expect, it } from 'vitest';
import {
  ABILITY_DEFINITIONS,
  ABILITY_KEYS,
  expectedUnspentSkillPoints,
  getGameLevelProgress,
  skillPointsForLevel,
} from '@shared/ability-progression';
import { resolveWallJumpEnabled } from '@shared/sim-constants';

describe('in-game skill points', () => {
  it('grants one unspent point per level after 1', () => {
    expect(skillPointsForLevel(1)).toBe(0);
    expect(skillPointsForLevel(2)).toBe(1);
    expect(skillPointsForLevel(5)).toBe(4);
  });

  it('subtracts spent points so a leveled account with empty powers is owed the pool', () => {
    expect(expectedUnspentSkillPoints(2, {})).toBe(1);
    expect(expectedUnspentSkillPoints(1, {})).toBe(0);
  });

  it('subtracts the cost of purchased power levels from the unspent pool', () => {
    const key = ABILITY_KEYS[0];
    expect(key).toBeTruthy();
    const cost = ABILITY_DEFINITIONS[key].costForLevel(0);
    expect(expectedUnspentSkillPoints(5, { [key]: 1 })).toBe(Math.max(0, 4 - cost));
  });

  it('reaches level 2 well under a typical match win of in-game XP', () => {
    const toLevel2 = getGameLevelProgress(70);
    expect(toLevel2.level).toBeGreaterThanOrEqual(2);
  });
});

describe('wall-jump toggle', () => {
  it('defaults to enabled when a map never set the field at all', () => {
    expect(resolveWallJumpEnabled(undefined)).toBe(true);
    expect(resolveWallJumpEnabled({})).toBe(true);
  });

  it('honors an explicit opt-out even when nothing else was tuned', () => {
    // This is the normal way an author turns wall-jump off: uncheck the
    // toggle, don't touch the horiz/vert/slide sliders. Must stay off.
    expect(resolveWallJumpEnabled({ wallJumpEnabled: false })).toBe(false);
  });

  it('honors an explicit opt-in', () => {
    expect(resolveWallJumpEnabled({ wallJumpEnabled: true })).toBe(true);
  });
});
