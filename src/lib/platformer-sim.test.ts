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

const floor: SimPad = { x: 0, y: 0, z: 0, width: 6, depth: 6, kind: 'solid', height: 0.25, topOnly: true };

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
    const body = groundedBody({ x: 3.08, y: 0, z: 0.05 });
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
    expect(Math.abs(body.x)).toBeLessThan(3.4);
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

  it('auto-steps onto a short solid slab without jumping (curb-height, <= LAND_STEP_CLIMB)', () => {
    // Regression: a plain Solid prop short enough to count as a step (a
    // slab, a low crate) must be walkable straight onto, not blocked like a
    // wall requiring a jump. Only pads explicitly flagged topOnly used to
    // get this treatment — any other solid, no matter how short, blocked
    // sideways at every height and forced a jump.
    const slab: SimPad = { x: 2, y: 0, z: 0.4, width: 2, depth: 2, height: 0.4, kind: 'solid' };
    const body = groundedBody({ x: 0, y: 0, z: 0 });
    const scratch = createSimScratch();
    // Stop once atop the slab (x~2), well before walking off its far edge
    // (~3.35) — this test is about the step-up, not edge-of-map falling.
    for (let i = 0; i < 15; i++) {
      stepPlatformer(
        body,
        { moveX: 1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
        1 / 30,
        [floor, slab],
        scratch,
        bounds
      );
    }
    // Walked up onto the slab's top, not stopped at its side face.
    expect(body.x).toBeGreaterThan(1.2);
    expect(body.isGrounded).toBe(true);
    expect(body.z).toBeCloseTo(0.4, 1);
  });

  it('still blocks a solid taller than LAND_STEP_CLIMB — must be jumped, not walked up', () => {
    const tallBlock: SimPad = { x: 2, y: 0, z: 1.2, width: 2, depth: 2, height: 1.2, kind: 'solid' };
    const body = groundedBody({ x: 0, y: 0, z: 0 });
    const scratch = createSimScratch();
    for (let i = 0; i < 40; i++) {
      stepPlatformer(
        body,
        { moveX: 1, moveY: 0, jumpPressed: false, sprint: false, crouch: false },
        1 / 30,
        [floor, tallBlock],
        scratch,
        bounds
      );
    }
    // Stopped at the block's side face (x=1, plus capsule radius), still on the ground floor.
    expect(body.x).toBeLessThan(1.4);
    expect(body.z).toBeCloseTo(0, 1);
  });

  it('respects rotYaw for OBB wall collision (parity with server platforms.ts)', () => {
    const bigFloor: SimPad = { x: 0, y: 0, z: 0, width: 20, depth: 20, kind: 'solid', height: 0.25, topOnly: true };
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

    // Enabled: sprinting forward, then a slide-key *edge* while still
    // sprinting triggers a slide burst well above plain sprint speed.
    const body = groundedBody();
    const scratch = createSimScratch();
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false, slidePressed: false },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false, slidePressed: true },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    expect(scratch.velX).toBeCloseTo(5 * 2.2, 5);
    expect(scratch.slideMs).toBeGreaterThan(0);

    // Cooldown gates an immediate retrigger even if the slide key is released/re-pressed.
    scratch.slideMs = 0;
    scratch.slideCooldownMs = 500;
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false, slidePressed: false },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    stepPlatformer(
      body,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false, slidePressed: true },
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
      bounds,
      { slideEnabled: false }
    );
    stepPlatformer(
      plainBody,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: true },
      1 / 30,
      [floor],
      plainScratch,
      bounds,
      { slideEnabled: false }
    );
    expect(plainScratch.velX).toBeCloseTo(5 * 0.55, 5);
    // Crouch while sprinting also triggers slide
    const crouchSlideBody = groundedBody();
    const crouchSlideScratch = createSimScratch();
    stepPlatformer(
      crouchSlideBody,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: false },
      1 / 30,
      [floor],
      crouchSlideScratch,
      bounds,
      physOpts
    );
    stepPlatformer(
      crouchSlideBody,
      { moveX: 1, moveY: 0, jumpPressed: false, sprint: true, crouch: true },
      1 / 30,
      [floor],
      crouchSlideScratch,
      bounds,
      physOpts
    );
    expect(crouchSlideScratch.velX).toBeCloseTo(5 * 2.2, 5);
    expect(crouchSlideScratch.slideMs).toBeGreaterThan(0);
  });

  it('keeps slide going while the key is held and cancels on jump', () => {
    const physOpts = {
      slideEnabled: true,
      slideMult: 2.2,
      slideDurationMs: 400,
      slideCooldownMs: 1000,
    };
    const body = groundedBody();
    const scratch = createSimScratch();
    const sprintFwd = {
      moveX: 1,
      moveY: 0,
      jumpPressed: false,
      sprint: true,
      crouch: false,
      slidePressed: false,
    };
    stepPlatformer(body, sprintFwd, 1 / 30, [floor], scratch, bounds, physOpts);
    stepPlatformer(
      body,
      { ...sprintFwd, slidePressed: true },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    expect(scratch.slideMs).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) {
      stepPlatformer(
        body,
        { ...sprintFwd, slidePressed: true },
        1 / 30,
        [floor],
        scratch,
        bounds,
        physOpts
      );
    }
    expect(scratch.slideMs).toBeGreaterThan(0);

    stepPlatformer(
      body,
      { ...sprintFwd, slidePressed: true, jumpPressed: true },
      1 / 30,
      [floor],
      scratch,
      bounds,
      physOpts
    );
    expect(scratch.slideMs).toBe(0);
    expect(body.vz).toBeGreaterThan(0);
  });

  it('jumps when jump key (Space) is pressed', () => {
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
    expect(body.vz).toBeGreaterThan(0);
    expect(body.isGrounded).toBe(false);
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
