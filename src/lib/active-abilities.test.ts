import { describe, expect, it } from 'vitest';
import { activateAbility, type AbilityHost } from '@shared/active-abilities';
import type { CorePad } from '@shared/sim-core';

function host(overrides: Partial<AbilityHost> = {}): AbilityHost {
  return {
    isAlive: true,
    hasFinished: false,
    energy: 100,
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    aimAngle: 0, // aiming down +X
    isInvisible: false,
    ability: {
      visibilityEndsAt: 0,
      flyEndsAt: 0,
      hookEndsAt: 0,
      berserkEndsAt: 0,
      bulletEndsAt: 0,
      thunderEndsAt: 0,
      backflipEndsAt: 0,
      visibilityCooldownEndsAt: 0,
      flyCooldownEndsAt: 0,
      hookCooldownEndsAt: 0,
      berserkCooldownEndsAt: 0,
      bulletCooldownEndsAt: 0,
      thunderCooldownEndsAt: 0,
      backflipCooldownEndsAt: 0,
    },
    ...overrides,
  };
}

// A tall wall spanning y=[-5,5], centered at x=4 with a 1m thickness — sits
// squarely between the host (x=0) and where an unobstructed hook pull
// (rangeBaseMeters=8 at level 1) would land (x=8).
function wallAt(x: number): CorePad {
  return { x, y: 0, z: 1, width: 1, depth: 10, height: 3 };
}

describe('Hook / backflip teleport wall-clip guard', () => {
  it('stops the hook pull at a wall instead of teleporting through it', () => {
    const h = host();
    const activated = activateAbility(h, 'hook', 1000, { hook: 1 }, [wallAt(4)]);
    expect(activated).toBe(true);
    // Must land before the wall's near face (x=3.5), never past x=4.
    expect(h.x).toBeLessThan(3.5);
    expect(h.x).toBeGreaterThan(0);
  });

  it('pulls the full distance when nothing is in the way', () => {
    const h = host();
    const activated = activateAbility(h, 'hook', 1000, { hook: 1 }, []);
    expect(activated).toBe(true);
    // rangeBaseMeters (8) + rangePerLevelMeters (1.5) at level 1, unobstructed.
    expect(h.x).toBeCloseTo(9.5, 0);
  });

  it('still activates (fails closed to "no movement", not "ability denied") when no pads are supplied', () => {
    const h = host();
    const activated = activateAbility(h, 'hook', 1000, { hook: 1 });
    expect(activated).toBe(true);
    expect(h.x).toBeGreaterThan(0);
  });
});
