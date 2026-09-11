import { describe, expect, it } from 'vitest';
import { effectiveWeaponCone, isHitByShot } from './hitscan';

describe('isHitByShot', () => {
  it('hits a target on the aim ray in 2D', () => {
    expect(isHitByShot(0, 0, 0, 4, 0, 8, 0.18)).toBe(true);
  });

  it('misses a target off to the side', () => {
    expect(isHitByShot(0, 0, 0, 0, 4, 8, 0.05)).toBe(false);
  });

  it('hits a 3D capsule standing in front of the shooter', () => {
    expect(
      isHitByShot(0, 0, 0, 5, 0, 12, 0.18, {
        shooterZ: 0,
        aimPitch: 0,
        targetZ: 0,
      })
    ).toBe(true);
  });

  it('tightens cone while aiming down sights', () => {
    expect(effectiveWeaponCone({ coneRadians: 0.2, aimHeld: false })).toBeCloseTo(0.2, 5);
    expect(effectiveWeaponCone({ coneRadians: 0.2, aimHeld: true })).toBeCloseTo(0.17, 5);
  });

  it('misses a 3D target behind the shooter', () => {
    expect(
      isHitByShot(0, 0, 0, -5, 0, 12, 0.18, {
        shooterZ: 0,
        aimPitch: 0,
        targetZ: 0,
      })
    ).toBe(false);
  });
});
