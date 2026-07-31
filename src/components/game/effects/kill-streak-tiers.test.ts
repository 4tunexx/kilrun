import { describe, expect, it } from 'vitest';
import { getKillStreakTierLabel, getKillStreakEscalation } from './kill-streak-tiers';

describe('getKillStreakTierLabel', () => {
  it('labels the fixed milestones', () => {
    expect(getKillStreakTierLabel(1)).toBe('First Blood');
    expect(getKillStreakTierLabel(2)).toBe('Double Kill');
    expect(getKillStreakTierLabel(3)).toBe('Triple Kill');
    expect(getKillStreakTierLabel(5)).toBe('Multi Kill');
    expect(getKillStreakTierLabel(7)).toBe('Mega Kill');
    expect(getKillStreakTierLabel(9)).toBe('Monster Kill');
    expect(getKillStreakTierLabel(13)).toBe('Unstoppable');
  });

  it('is silent on non-milestone counts', () => {
    expect(getKillStreakTierLabel(0)).toBeNull();
    expect(getKillStreakTierLabel(4)).toBeNull();
    expect(getKillStreakTierLabel(6)).toBeNull();
    expect(getKillStreakTierLabel(8)).toBeNull();
    expect(getKillStreakTierLabel(10)).toBeNull();
    expect(getKillStreakTierLabel(11)).toBeNull();
    expect(getKillStreakTierLabel(12)).toBeNull();
  });

  it('escalates every 3 kills past 13 as Rampage', () => {
    expect(getKillStreakTierLabel(14)).toBeNull();
    expect(getKillStreakTierLabel(15)).toBeNull();
    expect(getKillStreakTierLabel(16)).toBe('Rampage');
    expect(getKillStreakTierLabel(19)).toBe('Rampage');
    expect(getKillStreakTierLabel(22)).toBe('Rampage');
    expect(getKillStreakTierLabel(25)).toBe('Rampage');
  });
});

describe('getKillStreakEscalation', () => {
  it('increases monotonically with streak', () => {
    const samples = [0, 1, 2, 3, 4, 5, 7, 9, 13, 16, 19, 22];
    let prev = -1;
    for (const s of samples) {
      const e = getKillStreakEscalation(s);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it('keeps escalating for Rampage tiers past 13', () => {
    expect(getKillStreakEscalation(13)).toBe(4);
    expect(getKillStreakEscalation(16)).toBe(5);
    expect(getKillStreakEscalation(19)).toBe(6);
  });
});
