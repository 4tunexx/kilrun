import { describe, expect, it } from 'vitest';
import {
  getRewardDisplayValue,
  isPracticeRoom,
  lockFirstValidCompetitiveTeam,
} from './results-state';

describe('match results display state', () => {
  it('recognizes practice rooms and displays their explicit zero reward', () => {
    expect(isPracticeRoom('deathrun_practice')).toBe(true);
    expect(isPracticeRoom('competitive_ranked')).toBe(false);
    expect(getRewardDisplayValue(0, 'confirmed')).toBe('+0');
  });

  it('resolves missing authoritative rewards to a clear status', () => {
    expect(getRewardDisplayValue(undefined, 'pending')).toBe('Pending');
    expect(getRewardDisplayValue(undefined, 'unavailable')).toBe('Unavailable');
  });

  it('keeps the first valid team across later assignments and reconnect values', () => {
    let locked: 'team_a' | 'team_b' | null = null;
    locked = lockFirstValidCompetitiveTeam(locked, 'runner');
    expect(locked).toBeNull();
    locked = lockFirstValidCompetitiveTeam(locked, 'team_b');
    expect(locked).toBe('team_b');
    locked = lockFirstValidCompetitiveTeam(locked, 'team_a');
    locked = lockFirstValidCompetitiveTeam(locked, 'trapper');
    expect(locked).toBe('team_b');
  });

  it('keeps the first valid match winner when subsequent room updates disagree', () => {
    let winner: 'team_a' | 'team_b' | null = null;
    winner = lockFirstValidCompetitiveTeam(winner, 'team_a');
    winner = lockFirstValidCompetitiveTeam(winner, 'team_b');
    expect(winner).toBe('team_a');
  });
});
