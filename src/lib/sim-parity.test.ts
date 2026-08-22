/**
 * Client/server physics parity.
 *
 * The authoritative server (`server/src/sim/movement.ts` via
 * `server/src/sim/platforms.ts`) and the client predictor
 * (`src/lib/platformer-sim.ts`) used to carry two hand-mirrored copies of the
 * collision/support math. They drifted, and the drift showed up as Play Test
 * feeling different from a live match:
 *
 *  - Rotated ramps: the client applied slope gradients to WORLD-space deltas
 *    while the server applied them to PAD-LOCAL offsets. On a ramp yawed 90deg
 *    the two disagreed about standing height by a full meter.
 *  - Open doors: the client skipped open doors during ledge assist, the server
 *    did not, so an open doorway could still catch a falling player.
 *
 * Both now call `shared/sim-core.ts`, so parity is structural rather than
 * maintained by hand. These tests lock the core's contract and specifically
 * pin the two behaviours that drifted, so a future edit to one caller cannot
 * silently reintroduce a split.
 */

import { describe, expect, it } from 'vitest';
import {
  clampAscendingZ,
  createCoreScratch,
  findSupportPad,
  glueToSupport,
  padBoxHeight,
  padTopZAt,
  resolveSolidPads,
  stepSim,
  tryLedgeAssistPads,
  type CorePad,
} from '@shared/sim-core';
import {
  advanceMovingPads,
  applyPadCarry,
  movingPlatformPos,
  type MovingPad,
} from '@shared/moving-platform';
import {
  LAND_STEP_CLIMB,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  TICK_DT_MS,
} from '@shared/sim-constants';
import {
  createSimScratch,
  stepPlatformer,
  type SimBody,
  type SimBounds,
  type SimInput,
  type SimPad,
} from './platformer-sim';

const DT = TICK_DT_MS / 1000;
const BOUNDS: SimBounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

function floor(over: Partial<SimPad> = {}): SimPad {
  return {
    x: 0,
    y: 0,
    z: 0,
    width: 20,
    depth: 20,
    height: 0.25,
    topOnly: true,
    kind: 'solid',
    ...over,
  };
}

function body(over: Partial<SimBody> = {}): SimBody {
  return { x: 0, y: 0, z: 0, vz: 0, isGrounded: true, energy: 100, ...over };
}

function input(over: Partial<SimInput> = {}): SimInput {
  return { moveX: 0, moveY: 0, jumpPressed: false, sprint: false, crouch: false, ...over };
}

describe('padTopZAt: slope gradients are pad-local, not world', () => {
  it('agrees with the unrotated case where local == world', () => {
    const pad: CorePad = { x: 0, y: 0, z: 2, width: 8, depth: 4, slopeGradX: 0.5 };
    expect(padTopZAt(pad, 2, 0)).toBeCloseTo(3, 6);
    expect(padTopZAt(pad, -2, 0)).toBeCloseTo(1, 6);
  });

  it('rotates the gradient with the pad (the regression that caused desync)', () => {
    // Yawed 90deg: the pad's local +x now points along world +y.
    const pad: CorePad = {
      x: 0,
      y: 0,
      z: 2,
      width: 8,
      depth: 4,
      rotYaw: Math.PI / 2,
      slopeGradX: 0.5,
    };
    // Moving along world +y climbs, because that IS the pad's local +x.
    expect(padTopZAt(pad, 0, 2)).toBeCloseTo(3, 6);
    // Moving along world +x does not change height at all.
    expect(padTopZAt(pad, 2, 0)).toBeCloseTo(2, 6);
    // The old client math would have returned 3 here and 2 above -- swapped.
    expect(padTopZAt(pad, 2, 0)).not.toBeCloseTo(3, 3);
  });

  it('findSupportPad uses the same pad-local gradient', () => {
    const pad: CorePad = {
      x: 0,
      y: 0,
      z: 2,
      width: 8,
      depth: 4,
      rotYaw: Math.PI / 2,
      slopeGradX: 0.5,
    };
    const hit = findSupportPad(0, 2, 3, [pad], PLAYER_RADIUS, 1);
    expect(hit?.topZ).toBeCloseTo(3, 6);
    expect(hit?.topZ).toBeCloseTo(padTopZAt(pad, 0, 2), 9);
  });
});

describe('open doors are transparent to every collision path', () => {
  // A pad's `z` is its TOP face and `height` extends downward, so a walkable
  // door sits at z 0 while a body-blocking door must have its top overhead.
  const openTread: CorePad = {
    x: 0,
    y: 0,
    z: 0,
    width: 4,
    depth: 4,
    height: 0.25,
    doorControlled: true,
    open: true,
  };
  const closedTread: CorePad = { ...openTread, open: false };
  const openBlocker: CorePad = { ...openTread, z: 2, height: 2 };
  const closedBlocker: CorePad = { ...openBlocker, open: false };

  it('provides no support while open', () => {
    expect(findSupportPad(0, 0, 0, [openTread], PLAYER_RADIUS, 0.4)).toBeNull();
    expect(findSupportPad(0, 0, 0, [closedTread], PLAYER_RADIUS, 0.4)).not.toBeNull();
  });

  it('does not catch a player during ledge assist while open', () => {
    // Just past the rim, within LEDGE_ASSIST.
    const x = 2.05;
    expect(tryLedgeAssistPads(x, 0, 0, [openTread])).toBeNull();
    expect(tryLedgeAssistPads(x, 0, 0, [closedTread])).not.toBeNull();
  });

  it('does not push the player sideways while open', () => {
    expect(resolveSolidPads({ x: 1.9, y: 0, z: 0 }, [openBlocker]).touchingWall).toBe(false);
    expect(resolveSolidPads({ x: 1.9, y: 0, z: 0 }, [closedBlocker]).touchingWall).toBe(true);
  });

  it('is transparent end-to-end through stepPlatformer', () => {
    const b = body();
    stepPlatformer(b, input(), DT, [openTread as SimPad], createSimScratch(), BOUNDS);
    expect(b.isGrounded).toBe(false);
  });
});

describe('moving platform prediction', () => {
  function movingPad(): MovingPad & SimPad {
    return {
      id: 'lift',
      x: 0,
      y: 0,
      z: 0,
      width: 6,
      depth: 6,
      height: 0.25,
      topOnly: true,
      homeX: 0,
      homeY: 0,
      homeZ: 0,
      motionAmpX: 4,
      motionPeriodMs: 4000,
      motionPhaseMs: 0,
    };
  }

  it('is a pure function of the clock, so frame rate cannot change the result', () => {
    // One big jump vs many small steps must land in the same place, which is
    // what lets a 60Hz client match a 30Hz server exactly.
    const coarse = movingPad();
    advanceMovingPads([coarse], 1234);
    const fine = movingPad();
    for (let t = 0; t <= 1234; t += 7) advanceMovingPads([fine], t);
    advanceMovingPads([fine], 1234);
    expect(fine.x).toBeCloseTo(coarse.x, 9);
  });

  it('agrees with movingPlatformPos for the same clock', () => {
    const pad = movingPad();
    advanceMovingPads([pad], 900);
    const expected = movingPlatformPos(
      { homeX: 0, homeY: 0, homeZ: 0, ampX: 4, ampY: 0, ampZ: 0, periodMs: 4000, phaseMs: 0 },
      900
    );
    expect(pad.x).toBeCloseTo(expected.x, 9);
  });

  it('ping-pongs back to home over a full period', () => {
    const pad = movingPad();
    advanceMovingPads([pad], 2000);
    expect(pad.x).toBeCloseTo(4, 6);
    advanceMovingPads([pad], 4000);
    expect(pad.x).toBeCloseTo(0, 6);
  });

  it('reports no delta for a pad with no amplitude', () => {
    const still: MovingPad = { id: 'still', x: 1, y: 2, z: 3 };
    expect(advanceMovingPads([still], 500)).toHaveLength(0);
    expect(still.x).toBe(1);
  });

  it('carries a grounded body standing on the pad', () => {
    const pad = movingPad();
    const deltas = advanceMovingPads([pad], 500);
    const b = body();
    applyPadCarry(b, 'lift', deltas);
    expect(b.x).toBeCloseTo(deltas[0].dx, 9);
  });

  it('does not carry an airborne body or one on a different pad', () => {
    const deltas = advanceMovingPads([movingPad()], 500);
    const airborne = body({ isGrounded: false });
    applyPadCarry(airborne, 'lift', deltas);
    expect(airborne.x).toBe(0);
    const elsewhere = body();
    applyPadCarry(elsewhere, 'other_pad', deltas);
    expect(elsewhere.x).toBe(0);
  });

  it('keeps a standing player on a horizontally moving pad', () => {
    const pad = movingPad();
    const scratch = createSimScratch();
    const b = body();
    // Establish support first so scratch.supportPadId is populated.
    stepPlatformer(b, input(), DT, [pad], scratch, BOUNDS);
    expect(scratch.supportPadId).toBe('lift');
    for (let t = 0; t < 1000; t += TICK_DT_MS) {
      const deltas = advanceMovingPads([pad], t);
      applyPadCarry(b, scratch.supportPadId, deltas);
      stepPlatformer(b, input(), DT, [pad], scratch, BOUNDS);
    }
    expect(b.isGrounded).toBe(true);
    // The body tracked the pad rather than sliding off the back of it.
    expect(Math.abs(b.x - pad.x)).toBeLessThan(1);
  });
});

describe('support selection contract', () => {
  it('prefers the highest pad at or under the feet', () => {
    const low = floor({ z: 0 });
    const high = floor({ z: 0.5, width: 4, depth: 4 });
    const hit = findSupportPad(0, 0, 0.5, [low, high], PLAYER_RADIUS, 0.9);
    expect(hit?.topZ).toBeCloseTo(0.5, 6);
  });

  it('falls back to the lowest climbable step when nothing is underfoot', () => {
    const midStep = floor({ z: 0.4, width: 4, depth: 4 });
    const tallStep = floor({ z: 0.5, width: 4, depth: 4 });
    const hit = findSupportPad(0, 0, 0, [tallStep, midStep], PLAYER_RADIUS, 0.9);
    expect(hit?.topZ).toBeCloseTo(0.4, 6);
  });

  it('ignores pads outside the snap-down window', () => {
    expect(findSupportPad(0, 0, 5, [floor()], PLAYER_RADIUS, 0.4)).toBeNull();
  });

  it('treats a missing or zero height as the 0.2 default', () => {
    expect(padBoxHeight({ x: 0, y: 0, z: 0, width: 1, depth: 1 })).toBe(0.2);
    expect(padBoxHeight({ x: 0, y: 0, z: 0, width: 1, depth: 1, height: 0 })).toBe(0.2);
    expect(padBoxHeight({ x: 0, y: 0, z: 0, width: 1, depth: 1, height: 1.5 })).toBe(1.5);
  });
});

describe('solid push-out contract', () => {
  // Top face at z 3 with 3 of thickness, so the body spans z 0..3 and actually
  // overlaps a player standing at z 0.
  const wall: CorePad = { x: 4, y: 0, z: 3, width: 2, depth: 8, height: 3 };

  it('pushes out along the shallowest axis and reports the normal', () => {
    const out = resolveSolidPads({ x: 3.4, y: 0, z: 0 }, [wall]);
    expect(out.touchingWall).toBe(true);
    expect(out.x).toBeCloseTo(4 - 1 - PLAYER_RADIUS, 6);
    expect(out.wallNormalX).toBeCloseTo(-1, 6);
    expect(out.wallNormalY).toBeCloseTo(0, 6);
  });

  it('never blocks sideways against a topOnly pad', () => {
    const tread: CorePad = { ...wall, topOnly: true };
    expect(resolveSolidPads({ x: 3.4, y: 0, z: 0 }, [tread]).touchingWall).toBe(false);
  });

  it('steps a grounded player up onto a curb instead of blocking', () => {
    const curb: CorePad = { x: 4, y: 0, z: 0.4, width: 2, depth: 8, height: 0.4 };
    const stepped = resolveSolidPads({ x: 3.4, y: 0, z: 0 }, [curb], PLAYER_RADIUS, PLAYER_HEIGHT, true);
    expect(stepped.touchingWall).toBe(false);
    expect(stepped.z).toBeCloseTo(0.4, 6);
    // Airborne contact still blocks -- only grounded contact auto-steps.
    const airborne = resolveSolidPads({ x: 3.4, y: 0, z: 0 }, [curb], PLAYER_RADIUS, PLAYER_HEIGHT, false);
    expect(airborne.touchingWall).toBe(true);
  });

  it('blocks anything taller than the climb threshold even when grounded', () => {
    const tall: CorePad = { x: 4, y: 0, z: 2, width: 2, depth: 8, height: LAND_STEP_CLIMB + 0.5 };
    const out = resolveSolidPads({ x: 3.4, y: 0, z: 0 }, [tall], PLAYER_RADIUS, PLAYER_HEIGHT, true);
    expect(out.touchingWall).toBe(true);
  });

  it('rotates push-out into the pad frame for a yawed wall', () => {
    const yawed: CorePad = { x: 0, y: 4, z: 3, width: 2, depth: 8, height: 3, rotYaw: Math.PI / 2 };
    // Yawed 90deg, so this wall's thin axis now runs along world x.
    const out = resolveSolidPads({ x: 0, y: 3.4, z: 0 }, [yawed]);
    expect(out.touchingWall).toBe(true);
    expect(out.y).toBeCloseTo(4 - 1 - PLAYER_RADIUS, 6);
    expect(out.wallNormalY).toBeCloseTo(-1, 6);
    expect(out.wallNormalX).toBeCloseTo(0, 6);
  });
});

describe('clampAscendingZ: Fly power stops at a ceiling instead of clipping through it', () => {
  const ceiling: CorePad = { x: 0, y: 0, z: 5, width: 6, depth: 6, height: 0.5 }; // spans z 4.5..5

  it('lets a body rise freely when nothing is overhead', () => {
    expect(clampAscendingZ(0, 0, 0, 3, [])).toBeCloseTo(3, 6);
  });

  it('clamps a rise that would poke the head through the ceiling', () => {
    // PLAYER_HEIGHT means the head reaches the ceiling well before feet-z
    // would numerically equal the ceiling's z.
    const result = clampAscendingZ(0, 0, 0, 10, [ceiling]);
    expect(result).toBeLessThan(10);
    expect(result + PLAYER_HEIGHT).toBeLessThanOrEqual(4.5 + 1e-6);
  });

  it('ignores a ceiling with no horizontal overlap', () => {
    const farCeiling: CorePad = { ...ceiling, x: 50, y: 50 };
    expect(clampAscendingZ(0, 0, 0, 10, [farCeiling])).toBeCloseTo(10, 6);
  });

  it('is a no-op while descending (only guards ascent)', () => {
    expect(clampAscendingZ(0, 0, 10, 0, [ceiling])).toBeCloseTo(0, 6);
  });

  it('end-to-end: flying straight up under a low ceiling stops below it, never above', () => {
    // Bottom face at 3.5 — comfortably more headroom than PLAYER_HEIGHT
    // above the z=0 start, so this is a real ceiling to fly into rather
    // than a degenerate case where standing height already pokes through it.
    const lowCeiling: CorePad = { x: 0, y: 0, z: 4, width: 6, depth: 6, height: 0.5 };
    const clientBody = body({ z: 0 });
    const serverBody = body({ z: 0 });
    const clientScratch = createSimScratch();
    const serverScratch = createCoreScratch();
    const opts = { nowMs: 1_700_000_000_000, flyActive: true };
    const pads = [lowCeiling];
    for (let i = 0; i < 200; i += 1) {
      stepPlatformer(clientBody, input({ jumpPressed: true }), DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, input({ jumpPressed: true }), DT, pads, serverScratch, BOUNDS, opts);
    }
    expect(clientBody.z).toBeCloseTo(serverBody.z, 9);
    // Without the fix this reaches z ~= 200 * 1.4 * DT ~= 9.3, well above
    // the ceiling; with it, the head is held at/under the ceiling's
    // underside (3.5) for the whole climb.
    expect(clientBody.z + PLAYER_HEIGHT).toBeLessThanOrEqual(3.5 + 1e-6);
    expect(clientBody.z).toBeGreaterThan(1); // it did actually rise, just not through the ceiling
  });
});

describe('ground glue contract', () => {
  it('absorbs a fresh landing in one step, capped by the climb limit', () => {
    const b = { z: 0, vz: -8 };
    glueToSupport(b, 0.5, DT, true);
    expect(b.z).toBeCloseTo(0.5, 6);
    expect(b.vz).toBe(0);
  });

  it('rate-limits vertical correction while already grounded', () => {
    const b = { z: 0, vz: 0 };
    glueToSupport(b, 5, DT, false);
    // Must not teleport to the target in a single grounded tick.
    expect(b.z).toBeGreaterThan(0);
    expect(b.z).toBeLessThan(1);
  });

  it('snaps exactly when the remaining delta is negligible', () => {
    const b = { z: 0.9995, vz: 0 };
    glueToSupport(b, 1, DT, false);
    expect(b.z).toBe(1);
  });
});

describe('stepPlatformer scripted sequences stay well-defined', () => {
  /** Runs a fixed input script and returns the finite-ness/sanity of the result. */
  function run(pads: SimPad[], script: SimInput[], start = body()) {
    const scratch = createSimScratch();
    const b = start;
    for (const step of script) {
      stepPlatformer(b, step, DT, pads, scratch, BOUNDS);
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
      expect(Number.isFinite(b.z)).toBe(true);
      expect(Number.isFinite(b.vz)).toBe(true);
    }
    return { b, scratch };
  }

  it('runs forward on flat ground without leaving the floor', () => {
    const script = Array.from({ length: 60 }, () => input({ moveX: 1 }));
    const { b } = run([floor()], script);
    expect(b.isGrounded).toBe(true);
    expect(b.x).toBeGreaterThan(1);
    expect(b.z).toBeCloseTo(0, 6);
  });

  it('jumps, rises, then lands back on the floor', () => {
    const script: SimInput[] = [
      input({ jumpPressed: true }),
      ...Array.from({ length: 3 }, () => input({ jumpPressed: true })),
      ...Array.from({ length: 60 }, () => input()),
    ];
    const { b } = run([floor()], script);
    expect(b.isGrounded).toBe(true);
    expect(b.z).toBeCloseTo(0, 6);
  });

  it('launches off a jump pad well above a normal jump', () => {
    // The pad must be the highest surface underfoot, otherwise findSupportPad
    // resolves to the plain floor first and the launch never triggers.
    const pads: SimPad[] = [
      floor({ z: -0.5 }),
      floor({ kind: 'jumpPad', width: 4, depth: 4, boost: 20 }),
    ];
    const scratch = createSimScratch();
    const b = body();
    let peak = 0;
    for (let i = 0; i < 40; i += 1) {
      stepPlatformer(b, input(), DT, pads, scratch, BOUNDS);
      peak = Math.max(peak, b.z);
    }
    expect(peak).toBeGreaterThan(2);
  });

  it('climbs a rotated ramp to the height the shared core reports', () => {
    const ramp: SimPad = {
      x: 0,
      y: 0,
      z: 0,
      width: 20,
      depth: 20,
      height: 0.25,
      topOnly: true,
      rotYaw: Math.PI / 2,
      slopeGradX: 0.25,
    };
    const scratch = createSimScratch();
    const b = body();
    // Walk along world +y, which is the ramp's local +x, so height must rise.
    for (let i = 0; i < 60; i += 1) {
      stepPlatformer(b, input({ moveY: 1 }), DT, [ramp], scratch, BOUNDS);
    }
    expect(b.y).toBeGreaterThan(1);
    expect(b.isGrounded).toBe(true);
    expect(b.z).toBeCloseTo(padTopZAt(ramp, b.x, b.y), 2);
  });

  it('falls when it walks off the edge of a small pad', () => {
    const pad = floor({ width: 2, depth: 2 });
    const script = Array.from({ length: 40 }, () => input({ moveX: 1 }));
    const { b } = run([pad], script);
    expect(b.isGrounded).toBe(false);
    expect(b.z).toBeLessThan(0);
  });

  it('drains energy while sprinting and regenerates when idle', () => {
    const scratch = createSimScratch();
    const b = body();
    for (let i = 0; i < 60; i += 1) {
      stepPlatformer(b, input({ moveX: 1, sprint: true }), DT, [floor()], scratch, BOUNDS);
    }
    const drained = b.energy;
    expect(drained).toBeLessThan(100);
    for (let i = 0; i < 60; i += 1) {
      stepPlatformer(b, input(), DT, [floor()], scratch, BOUNDS);
    }
    expect(b.energy).toBeGreaterThan(drained);
  });

  it('records fall damage after a long drop', () => {
    const scratch = createSimScratch();
    const b = body({ z: 40, isGrounded: false });
    let damage = 0;
    for (let i = 0; i < 200; i += 1) {
      stepPlatformer(b, input(), DT, [floor()], scratch, BOUNDS);
      damage = Math.max(damage, scratch.fallDamageThisTick);
      if (b.isGrounded) break;
    }
    expect(b.isGrounded).toBe(true);
    expect(damage).toBeGreaterThan(0);
  });

  it('honours world bounds', () => {
    const tight: SimBounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const scratch = createSimScratch();
    const b = body();
    for (let i = 0; i < 60; i += 1) {
      stepPlatformer(b, input({ moveX: 1, moveY: 1 }), DT, [floor()], scratch, tight);
    }
    expect(b.x).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 1e-9);
    expect(b.y).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 1e-9);
  });

  it('slides faster than it walks', () => {
    const walkScratch = createSimScratch();
    const walker = body();
    for (let i = 0; i < 10; i += 1) {
      stepPlatformer(walker, input({ moveX: 1, sprint: true }), DT, [floor()], walkScratch, BOUNDS);
    }
    const sliderScratch = createSimScratch();
    const slider = body();
    stepPlatformer(
      slider,
      input({ moveX: 1, sprint: true, slidePressed: true }),
      DT,
      [floor()],
      sliderScratch,
      BOUNDS
    );
    for (let i = 0; i < 9; i += 1) {
      stepPlatformer(
        slider,
        input({ moveX: 1, sprint: true, slidePressed: true }),
        DT,
        [floor()],
        sliderScratch,
        BOUNDS
      );
    }
    expect(slider.x).toBeGreaterThan(walker.x);
  });
});

/**
 * Lockstep: the client adapter (`stepPlatformer`) and the shared core
 * (`stepSim`, which `applyMovement` also calls) must agree tick-for-tick.
 * Remaining adapter-only divergences (not exercised here): fly power, trapper
 * walk speed, ability multipliers, custom-move unlock gating, void Z.
 */
describe('client adapter vs shared core lockstep', () => {
  const NOW = 1_700_000_000_000;

  function cloneBody(b: SimBody): SimBody {
    return { x: b.x, y: b.y, z: b.z, vz: b.vz, isGrounded: b.isGrounded, energy: b.energy };
  }

  function assertMatch(a: SimBody, b: SimBody, tick: number) {
    expect(a.x, `x tick ${tick}`).toBeCloseTo(b.x, 9);
    expect(a.y, `y tick ${tick}`).toBeCloseTo(b.y, 9);
    expect(a.z, `z tick ${tick}`).toBeCloseTo(b.z, 9);
    expect(a.vz, `vz tick ${tick}`).toBeCloseTo(b.vz, 9);
    expect(a.isGrounded, `grounded tick ${tick}`).toBe(b.isGrounded);
    expect(a.energy, `energy tick ${tick}`).toBeCloseTo(b.energy, 9);
  }

  function runBoth(pads: SimPad[], script: SimInput[], start = body()) {
    const clientBody = cloneBody(start);
    const serverBody = cloneBody(start);
    const clientScratch = createSimScratch();
    const serverScratch = createCoreScratch();
    const opts = { nowMs: NOW };
    for (let i = 0; i < script.length; i += 1) {
      stepPlatformer(clientBody, script[i], DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, script[i], DT, pads, serverScratch, BOUNDS, opts);
      assertMatch(clientBody, serverBody, i);
    }
    return { clientBody, serverBody, clientScratch, serverScratch };
  }

  it('run', () => {
    const script = Array.from({ length: 60 }, () => input({ moveX: 1 }));
    const { clientBody } = runBoth([floor()], script);
    expect(clientBody.isGrounded).toBe(true);
    expect(clientBody.x).toBeGreaterThan(1);
  });

  it('jump then land', () => {
    const script: SimInput[] = [
      input({ jumpPressed: true }),
      ...Array.from({ length: 80 }, () => input()),
    ];
    const { clientBody } = runBoth([floor()], script);
    expect(clientBody.isGrounded).toBe(true);
    expect(clientBody.z).toBeCloseTo(0, 5);
  });

  it('double-jump', () => {
    const script: SimInput[] = [
      input({ jumpPressed: true }),
      input(),
      input({ jumpPressed: true }),
      ...Array.from({ length: 8 }, () => input()),
    ];
    const { clientBody, serverBody } = runBoth([floor()], script);
    // Still airborne after the second press — both adapters agree.
    expect(clientBody.isGrounded).toBe(false);
    expect(serverBody.isGrounded).toBe(false);
    expect(clientBody.z).toBeGreaterThan(0.2);
  });

  it('wall-jump', () => {
    const wall: SimPad = { x: 3, y: 0, z: 3, width: 0.4, depth: 8, height: 3, kind: 'solid' };
    const clientBody = body();
    const serverBody = body();
    const clientScratch = createSimScratch();
    const serverScratch = createCoreScratch();
    const opts = { nowMs: NOW, wallJumpEnabled: true };
    const pads = [floor({ width: 40, depth: 20 }), wall];
    for (let i = 0; i < 40; i += 1) {
      const step = input({ moveX: 1 });
      stepPlatformer(clientBody, step, DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, step, DT, pads, serverScratch, BOUNDS, opts);
      assertMatch(clientBody, serverBody, i);
    }
    for (let i = 0; i < 8; i += 1) {
      const step = input({ jumpPressed: i === 0, moveX: 1 });
      stepPlatformer(clientBody, step, DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, step, DT, pads, serverScratch, BOUNDS, opts);
      assertMatch(clientBody, serverBody, 40 + i);
    }
  });

  it('wall-jump costs energy instead of being free (the alternating-walls exploit)', () => {
    const wall: SimPad = { x: 3, y: 0, z: 3, width: 0.4, depth: 8, height: 3, kind: 'solid' };
    const clientBody = body();
    const serverBody = body();
    const clientScratch = createSimScratch();
    const serverScratch = createCoreScratch();
    const opts = { nowMs: NOW, wallJumpEnabled: true };
    const pads = [floor({ width: 40, depth: 20 }), wall];
    for (let i = 0; i < 40; i += 1) {
      const step = input({ moveX: 1 });
      stepPlatformer(clientBody, step, DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, step, DT, pads, serverScratch, BOUNDS, opts);
    }
    // Set energy right at the wall, immediately before the jump tick, so the
    // approach walk's own passive regen (energy regens whenever not
    // sprinting) can't muddy what this test is isolating.
    clientBody.energy = 5;
    serverBody.energy = 5;
    stepPlatformer(clientBody, input({ jumpPressed: true, moveX: 1 }), DT, pads, clientScratch, BOUNDS, opts);
    stepSim(serverBody, input({ jumpPressed: true, moveX: 1 }), DT, pads, serverScratch, BOUNDS, opts);
    assertMatch(clientBody, serverBody, 999);
    expect(clientBody.vz).toBeGreaterThan(0); // the jump did fire
    // Billed the same JUMP_ENERGY_COST double-jump already uses — this is
    // the actual bug: wall-jump used to leave energy completely untouched,
    // which is what let alternating between two walls climb forever for free.
    expect(clientBody.energy).toBeLessThan(5);
  });

  it('a wall-jump attempt with insufficient energy is denied outright (no partial/free jump)', () => {
    const wall: SimPad = { x: 3, y: 0, z: 3, width: 0.4, depth: 8, height: 3, kind: 'solid' };
    const clientBody = body();
    const serverBody = body();
    const clientScratch = createSimScratch();
    const serverScratch = createCoreScratch();
    const opts = { nowMs: NOW, wallJumpEnabled: true };
    const pads = [floor({ width: 40, depth: 20 }), wall];
    for (let i = 0; i < 40; i += 1) {
      const step = input({ moveX: 1 });
      stepPlatformer(clientBody, step, DT, pads, clientScratch, BOUNDS, opts);
      stepSim(serverBody, step, DT, pads, serverScratch, BOUNDS, opts);
    }
    // Zero energy right at the wall — one tick's worth of passive regen
    // (~0.6 at ENERGY_REGEN_RATE=18/s, 30Hz) still lands well under the 0.8
    // floor (JUMP_ENERGY_COST * 0.2) that double-jump already enforces, so
    // this isolates the gate itself rather than exact regen timing.
    clientBody.energy = 0;
    serverBody.energy = 0;
    stepPlatformer(clientBody, input({ jumpPressed: true, moveX: 1 }), DT, pads, clientScratch, BOUNDS, opts);
    stepSim(serverBody, input({ jumpPressed: true, moveX: 1 }), DT, pads, serverScratch, BOUNDS, opts);
    assertMatch(clientBody, serverBody, 999);
    // No wall-jump boost fired: vz stays at a plain-falling value, not the
    // wall-jump's WALL_JUMP_VERT_VEL launch.
    expect(clientBody.vz).toBeLessThan(1);
  });

  it('slide', () => {
    const script: SimInput[] = Array.from({ length: 20 }, (_, i) =>
      input({ moveX: 1, sprint: true, slidePressed: i === 0 })
    );
    runBoth([floor()], script);
  });

  it('flip', () => {
    const script: SimInput[] = [
      input({ flipPressed: true, cameraYaw: 0 }),
      ...Array.from({ length: 30 }, () => input({ cameraYaw: 0 })),
    ];
    runBoth([floor()], script);
  });

  it('ledge assist', () => {
    const pad = floor({ width: 2, depth: 2 });
    const start = body({ x: 1.08, y: 0, z: 0.05 });
    const script = Array.from({ length: 5 }, () => input());
    const { clientBody } = runBoth([pad], script, start);
    expect(clientBody.isGrounded).toBe(true);
  });

  it('jump pad', () => {
    const pads: SimPad[] = [
      floor({ z: -0.5 }),
      floor({ kind: 'jumpPad', width: 4, depth: 4, boost: 20 }),
    ];
    const script = Array.from({ length: 40 }, () => input());
    const { clientBody } = runBoth(pads, script);
    expect(clientBody.z).toBeGreaterThan(1);
  });

  it('fall damage', () => {
    const start = body({ z: 40, isGrounded: false });
    const script = Array.from({ length: 200 }, () => input());
    const { clientScratch, serverScratch } = runBoth([floor()], script, start);
    expect(clientScratch.fallDamageThisTick).toBeCloseTo(serverScratch.fallDamageThisTick, 9);
  });
});
