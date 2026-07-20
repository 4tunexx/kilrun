import { describe, expect, it } from 'vitest';
import {
  createSimScratch,
  stepPlatformer,
  type SimBody,
  type SimPad,
} from './platformer-sim';

const bounds = { minX: -20, maxX: 20, minY: -20, maxY: 20 };

function groundedBody(over: Partial<SimBody> = {}): SimBody {
  return {
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    isGrounded: true,
    energy: 100,
    ...over,
  };
}

const floor: SimPad = { x: 0, y: 0, z: 0, width: 6, depth: 6, kind: 'solid', height: 0.25 };

describe('stepPlatformer (Foundry feel)', () => {
  it('jumps with coyote after walking off a ledge', () => {
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    expect(body.isGrounded).toBe(true);

    body.x = 5;
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    expect(body.vz).toBeGreaterThan(5);
    expect(body.isGrounded).toBe(false);
  });

  it('double-jumps in air (Foundry jump_count === 1)', () => {
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    expect(body.vz).toBeCloseTo(10, 0);
    // Release then press again for double jump
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 60,
      [floor],
      scratch,
      bounds
    );
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false },
      1 / 60,
      [floor],
      scratch,
      bounds
    );
    expect(body.vz).toBeCloseTo(8, 0);
    expect(scratch.jumpCount).toBe(2);
  });

  it('pulls feet back onto a pad when barely past the capsule rim', () => {
    const body = groundedBody({ x: 3.5, y: 0, z: 0.05 });
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    expect(body.isGrounded).toBe(true);
    expect(Math.abs(body.x)).toBeLessThan(3.0);
  });

  it('applies constant Foundry gravity (no apex hang)', () => {
    const body = groundedBody({ z: 2, vz: 1, isGrounded: false });
    const scratch = createSimScratch();
    scratch.jumpCount = 1;
    scratch.coyoteMs = 0;
    const vzBefore = body.vz;
    stepPlatformer(
      body,
      { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 60,
      [floor],
      scratch,
      bounds
    );
    // gravity 20 * dt ≈ 0.333
    expect(vzBefore - body.vz).toBeCloseTo(20 / 60, 2);
  });

  it('sets horizontal velocity directly to wish * speed', () => {
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds
    );
    expect(scratch.velX).toBeCloseTo(5, 5);
    expect(body.x).toBeCloseTo(5 / 30, 2);
  });
});
