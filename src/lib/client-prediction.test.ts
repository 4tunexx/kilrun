import { describe, expect, it } from 'vitest';
import {
  filterCombatPredictTargets,
  predictCombatHit,
  reconcilePredictedBody,
} from './client-prediction';
import type { SimBody } from './platformer-sim';

function body(over: Partial<SimBody> = {}): SimBody {
  return {
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    isGrounded: true,
    ...over,
  } as SimBody;
}

describe('reconcilePredictedBody', () => {
  it('soft-pulls a small error instead of teleporting', () => {
    const predicted = body({ x: 0 });
    reconcilePredictedBody(predicted, { x: 0.2, y: 0, z: 0 });
    expect(predicted.x).toBeGreaterThan(0);
    expect(predicted.x).toBeLessThan(0.2);
  });

  it('hard-snaps a large desync', () => {
    const predicted = body({ x: 0 });
    reconcilePredictedBody(predicted, { x: 8, y: 0, z: 0 });
    expect(predicted.x).toBe(8);
  });
});

describe('predictCombatHit', () => {
  it('picks the enemy on the aim ray', () => {
    const hit = predictCombatHit({
      shooterX: 0,
      shooterY: 0,
      shooterZ: 0,
      aimAngle: 0,
      aimPitch: 0,
      range: 12,
      excludeId: 'me',
      shooterRole: 'team_a',
      targets: [
        { id: 'ally', kind: 'player', x: 4, y: 0, z: 0, role: 'team_a' },
        { id: 'foe', kind: 'player', x: 5, y: 0, z: 0, role: 'team_b' },
      ],
    });
    expect(hit?.id).toBe('foe');
  });

  it('does not predict a Horde player-on-player hit', () => {
    const hit = predictCombatHit({
      shooterX: 0,
      shooterY: 0,
      shooterZ: 0,
      aimAngle: 0,
      aimPitch: 0,
      range: 12,
      mode: 'horde',
      shooterRole: 'survivor',
      targets: [{ id: 'mate', kind: 'player', x: 4, y: 0, z: 0, role: 'survivor' }],
    });
    expect(hit).toBeNull();
  });

  it('only predicts Deathrun trapper → runner and Horde monsters', () => {
    const people = [
      { id: 'r', kind: 'player' as const, x: 4, y: 0, z: 0, role: 'runner' },
      { id: 't', kind: 'player' as const, x: 4, y: 0, z: 0, role: 'trapper' },
    ];
    const mix = [
      ...people,
      { id: 'mon_1', kind: 'monster' as const, x: 3, y: 0, z: 0 },
    ];
    expect(
      filterCombatPredictTargets({ mode: 'deathrun', shooterRole: 'runner', targets: people })
    ).toEqual([]);
    expect(
      filterCombatPredictTargets({ mode: 'deathrun', shooterRole: 'trapper', targets: people }).map(
        (t) => t.id
      )
    ).toEqual(['r']);
    expect(
      filterCombatPredictTargets({ mode: 'horde', shooterRole: 'survivor', targets: mix }).map(
        (t) => t.id
      )
    ).toEqual(['mon_1']);
  });

  it('does not flag teammates unless friendly fire is on', () => {
    const hit = predictCombatHit({
      shooterX: 0,
      shooterY: 0,
      shooterZ: 0,
      aimAngle: 0,
      aimPitch: 0,
      range: 12,
      shooterRole: 'team_a',
      targets: [{ id: 'ally', kind: 'player', x: 4, y: 0, z: 0, role: 'team_a' }],
    });
    expect(hit).toBeNull();
  });
});
