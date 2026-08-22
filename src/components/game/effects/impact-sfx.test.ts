import { describe, expect, it } from 'vitest';
import {
  inHorizontalRadius,
  isVoidFall,
  monsterLocomotionSfx,
  overlappingHazard,
  overlappingPadOfKind,
  pendingImpactCue,
} from './impact-sfx';

describe('pendingImpactCue', () => {
  it('plays melee miss only when the swing did not confirm a hit', () => {
    expect(
      pendingImpactCue({ fireKind: 'melee', hitConfirmed: false, metalHit: false })
    ).toBe('melee_miss');
    expect(
      pendingImpactCue({ fireKind: 'melee', hitConfirmed: true, metalHit: true })
    ).toBeNull();
  });

  it('plays hit_metal for a gunshot that hits world geometry', () => {
    expect(
      pendingImpactCue({ fireKind: 'hitscan', hitConfirmed: false, metalHit: true })
    ).toBe('hit_metal');
    expect(
      pendingImpactCue({ fireKind: 'hitscan', hitConfirmed: false, metalHit: false })
    ).toBeNull();
    expect(
      pendingImpactCue({ fireKind: 'hitscan', hitConfirmed: true, metalHit: true })
    ).toBeNull();
  });
});

describe('monsterLocomotionSfx', () => {
  it('uses wings for fly/insect hints and footsteps otherwise', () => {
    expect(monsterLocomotionSfx('Insect flyer')).toBe('monster_fly');
    expect(monsterLocomotionSfx('/game/monsters/wasp.glb')).toBe('monster_fly');
    expect(monsterLocomotionSfx('brute_001')).toBe('monster_footstep');
  });
});

describe('overlap helpers', () => {
  it('finds an active trap under the player and skips monsters', () => {
    const trap = overlappingHazard({ x: 0, y: 0, z: 0 }, [
      { id: 'mon_1', x: 0, y: 0, z: 0, width: 2, height: 2, active: true },
      { id: 'saw_1', kind: 'saw', x: 0, y: 0, z: 0, width: 2, height: 2, active: true },
    ]);
    expect(trap?.id).toBe('saw_1');
  });

  it('detects checkpoint pads and button radius', () => {
    expect(
      overlappingPadOfKind(
        { x: 1, y: 1, z: 0 },
        [{ id: 'cp', kind: 'checkpoint', x: 1, y: 1, z: 0, width: 2, depth: 2 }],
        'checkpoint'
      )
    ).toBe('cp');
    expect(inHorizontalRadius({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0, radius: 1.2 })).toBe(
      true
    );
    expect(isVoidFall(-5)).toBe(true);
    expect(isVoidFall(1)).toBe(false);
  });
});
