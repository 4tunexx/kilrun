import { describe, expect, it } from 'vitest';
import {
  clampKp,
  computeCompetitiveKpDelta,
  expectedScore,
  getKpRankProgress,
  getRankForKp,
  KP_DEFAULT,
} from './kp';

describe('KP ranking', () => {
  it('maps KP thresholds to Faceit-style ranks', () => {
    expect(getRankForKp(0)).toBe('Unranked');
    expect(getRankForKp(799)).toBe('Unranked');
    expect(getRankForKp(800)).toBe('Bronze');
    expect(getRankForKp(1000)).toBe('Silver');
    expect(getRankForKp(KP_DEFAULT)).toBe('Silver');
    expect(getRankForKp(1200)).toBe('Gold');
    expect(getRankForKp(1400)).toBe('Platinum');
    expect(getRankForKp(1600)).toBe('Diamond');
    expect(getRankForKp(1800)).toBe('Immortal');
    expect(getRankForKp(5000)).toBe('Immortal');
  });

  it('reports progress toward the next rank', () => {
    const mid = getKpRankProgress(1100);
    expect(mid.rank).toBe('Silver');
    expect(mid.nextRank).toBe('Gold');
    expect(mid.kpForNext).toBe(200);
    expect(mid.kpIntoRank).toBe(100);
    expect(mid.percent).toBe(50);

    const top = getKpRankProgress(2000);
    expect(top.rank).toBe('Immortal');
    expect(top.nextRank).toBeNull();
    expect(top.percent).toBe(100);
  });

  it('uses Elo expected score between 0 and 1', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.5);
    expect(expectedScore(800, 1200)).toBeLessThan(0.5);
  });

  it('gains KP on win and loses KP on loss', () => {
    const win = computeCompetitiveKpDelta({
      playerKp: 1000,
      opponentAvgKp: 1000,
      won: true,
      roundsWon: 4,
      roundsLost: 2,
    });
    const loss = computeCompetitiveKpDelta({
      playerKp: 1000,
      opponentAvgKp: 1000,
      won: false,
      roundsWon: 1,
      roundsLost: 4,
    });
    expect(win).toBeGreaterThan(0);
    expect(loss).toBeLessThan(0);
  });

  it('clamps KP into valid bounds', () => {
    expect(clampKp(-50)).toBe(0);
    expect(clampKp(99999)).toBe(5000);
    expect(clampKp(1234.6)).toBe(1235);
  });
});
