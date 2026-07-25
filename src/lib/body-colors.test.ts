import { describe, expect, it } from 'vitest';
import {
  assignCompetitiveColor,
  assignDeathrunColors,
  assignHordeColors,
  BODY_COLOR_BLUE,
  BODY_COLOR_RED,
  RUNNER_BODY_COLOR_INDICES,
} from './body-colors';

describe('body-colors', () => {
  it('Deathrun: trapper is always red; runners unique non-red', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const map = assignDeathrunColors(ids, 'a');
    expect(map.get('a')).toBe(BODY_COLOR_RED);
    const runnerColors = ids.slice(1).map((id) => map.get(id)!);
    expect(new Set(runnerColors).size).toBe(7);
    expect(runnerColors.every((c) => c !== BODY_COLOR_RED)).toBe(true);
    expect(runnerColors.every((c) => RUNNER_BODY_COLOR_INDICES.includes(c))).toBe(true);
  });

  it('solo uses Blue everywhere', () => {
    expect(assignDeathrunColors(['only'], null).get('only')).toBe(BODY_COLOR_BLUE);
    expect(assignHordeColors(['only']).get('only')).toBe(BODY_COLOR_BLUE);
  });

  it('Horde: unique until palette wraps', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const map = assignHordeColors(ids);
    expect(new Set(map.values()).size).toBe(8);
  });

  it('Competitive: team colors', () => {
    expect(assignCompetitiveColor('team_a')).toBe(BODY_COLOR_RED);
    expect(assignCompetitiveColor('team_b')).toBe(BODY_COLOR_BLUE);
  });
});
