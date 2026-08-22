import { describe, expect, it } from 'vitest';
import {
  ABILITY_DEFINITIONS,
  ABILITY_KEYS,
  expectedUnspentSkillPoints,
  getGameLevelProgress,
  skillPointsForLevel,
} from '@shared/ability-progression';
import { resolveWallJumpEnabled, WALL_JUMP_HORIZ_VEL } from '@shared/sim-constants';

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

describe('legacy wall-jump maps', () => {
  it('enables parkour when old maps saved the previous false default', () => {
    expect(resolveWallJumpEnabled(undefined)).toBe(true);
    expect(resolveWallJumpEnabled({ wallJumpEnabled: true })).toBe(true);
    expect(resolveWallJumpEnabled({ wallJumpEnabled: false })).toBe(true);
  });

  it('still honors a real opt-out that also tuned wall-jump numbers', () => {
    expect(
      resolveWallJumpEnabled({
        wallJumpEnabled: false,
        wallJumpHorizVel: WALL_JUMP_HORIZ_VEL + 3,
      })
    ).toBe(false);
  });
});
