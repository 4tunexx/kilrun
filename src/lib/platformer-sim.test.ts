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
    expect(body.vz).toBeCloseTo(10 - 20 / 30, 5);
    expect(scratch.jumpCount).toBe(1);
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
    // Double-jump sets 8, then same-frame gravity applies (GRAVITY=20).
    expect(body.vz).toBeCloseTo(8 - 20 / 60, 5);
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

  it('stops at thin solid wall surface + capsule radius (not an inflated gap)', () => {
    const wall: SimPad = {
      x: 2,
      y: 0,
      z: 3,
      width: 0.2,
      depth: 4,
      height: 3,
      kind: 'solid',
    };
    const body = groundedBody({ x: 2.6, y: 0, z: 0 });
    const scratch = createSimScratch();
    // Walk into the wall for several frames
    for (let i = 0; i < 20; i++) {
      stepPlatformer(
        body,
        { moveX: -1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
        1 / 30,
        [floor, wall],
        scratch,
        bounds
      );
    }
    // Wall surface at x=2.1; capsule radius 0.35 → center rests at ~2.45
    expect(body.x).toBeCloseTo(2.45, 2);
    // Must be able to stand closer than the old inflated 0.35-thick pad + 0.4 radius (~2.575)
    expect(body.x).toBeLessThan(2.5);
  });

  it('respects rotYaw for OBB wall collision (parity with server platforms.ts)', () => {
    const bigFloor: SimPad = { x: 0, y: 0, z: 0, width: 20, depth: 20, kind: 'solid', height: 0.25 };
    // Same thin/wide wall as the unrotated test above, but rotated 90° — the
    // 4-unit depth now spans world X instead of the 0.2-unit width. Before
    // this fix, Play Test ignored rotYaw entirely and would have let the
    // player walk to the old (unrotated) thin-wall surface — a real map
    // built with an angled wall collided differently in Play Test than in
    // the live match, which uses server/src/sim/platforms.ts's OBB math.
    const rotatedWall: SimPad = {
      x: 2,
      y: 0,
      z: 3,
      width: 0.2,
      depth: 4,
      height: 3,
      kind: 'solid',
      rotYaw: Math.PI / 2,
    };
    const body = groundedBody({ x: 8, y: 0, z: 0 });
    const scratch = createSimScratch();
    for (let i = 0; i < 60; i++) {
      stepPlatformer(
        body,
        { moveX: -1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
        1 / 30,
        [bigFloor, rotatedWall],
        scratch,
        bounds
      );
    }
    // Rotated surface at x = wall.x + depth/2 = 4, plus capsule radius 0.35.
    expect(body.x).toBeCloseTo(4.35, 1);
    expect(body.x).toBeGreaterThan(4);
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

  it('slide (crouch while sprinting) boosts speed when enabled, no-ops when not', () => {
    const physOpts = {
      slideEnabled: true,
      slideMult: 2.2,
      slideDurationMs: 600,
      slideCooldownMs: 1000,
    };

    // Enabled: sprinting forward, then a crouch *edge* while still sprinting
    // triggers a slide burst well above plain sprint speed.
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: true },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    expect(scratch.velX).toBeCloseTo(5 * 2.2, 5);
    expect(scratch.slideMs).toBeGreaterThan(0);

    // Cooldown gates an immediate retrigger even if crouch is released/re-pressed.
    scratch.slideMs = 0;
    scratch.slideCooldownMs = 500;
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: true },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    expect(scratch.slideMs).toBe(0);

    // Disabled (default): the same crouch-while-sprinting input is plain
    // crouch-reduced speed, matching pre-existing behavior exactly.
    const plainBody = groundedBody();
    const plainScratch = createSimScratch();
    stepPlatformer(
      plainBody,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false },
      1 / 30,
      [floor],
      plainScratch,
      bounds
    );
    stepPlatformer(
      plainBody,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: true },
      1 / 30,
      [floor],
      plainScratch,
      bounds
    );
    expect(plainScratch.velX).toBeCloseTo(5 * 0.55, 5);
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
