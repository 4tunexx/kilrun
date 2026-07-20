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

describe('stepPlatformer', () => {
  it('jumps with coyote after walking off a ledge', () => {
    const body = groundedBody();
    const scratch = createSimScratch();
    // Stand on floor
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false }, 1 / 30, [floor], scratch, bounds);
    expect(body.isGrounded).toBe(true);

    // Walk off to the right (no floor under new x)
    body.x = 5;
    stepPlatformer(body, { moveX: 1, moveY: 0, jumpPressed: false, sprint: false, crouch: false }, 1 / 30, [floor], scratch, bounds);
    // Still in coyote — press jump
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false }, 1 / 30, [floor], scratch, bounds);
    expect(body.vz).toBeGreaterThan(5);
    expect(body.isGrounded).toBe(false);
  });

  it('buffers a jump pressed slightly before landing', () => {
    const body = groundedBody({ z: 0.85, vz: -6, isGrounded: false });
    const scratch = createSimScratch();
    // Tap jump once in air just above the pad (outside snap range)
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false }, 1 / 60, [floor], scratch, bounds);
    expect(body.isGrounded).toBe(false);
    expect(scratch.jumpBufferMs).toBeGreaterThan(0);
    // Release jump input but keep buffer; fall onto pad
    for (let i = 0; i < 20; i++) {
      stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false }, 1 / 60, [floor], scratch, bounds);
      if (body.vz > 4) break;
    }
    expect(body.vz).toBeGreaterThan(4);
  });

  it('pulls feet back onto a pad when barely past the capsule rim', () => {
    // Capsule allows stand until halfW+radius (=3.4); place just beyond that
    const body = groundedBody({ x: 3.5, y: 0, z: 0.05 });
    const scratch = createSimScratch();
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false }, 1 / 30, [floor], scratch, bounds);
    expect(body.isGrounded).toBe(true);
    expect(Math.abs(body.x)).toBeLessThan(3.0);
  });

  it('softens gravity near jump apex', () => {
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false }, 1 / 30, [floor], scratch, bounds);
    // Advance until near apex
    for (let i = 0; i < 40; i++) {
      stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false }, 1 / 60, [floor], scratch, bounds);
      if (body.vz > 0 && body.vz < 2) break;
    }
    const vzBefore = body.vz;
    const zBefore = body.z;
    stepPlatformer(body, { moveX: 0, moveY: 0, jumpPressed: true, sprint: false, crouch: false }, 1 / 60, [floor], scratch, bounds);
    // With apex hang, vertical loss should be gentler than full gravity*dt (~0.53)
    const dv = vzBefore - body.vz;
    expect(dv).toBeLessThan(0.45);
    expect(body.z).toBeGreaterThanOrEqual(zBefore - 0.05);
  });
});
