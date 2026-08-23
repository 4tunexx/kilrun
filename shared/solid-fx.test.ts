import { describe, expect, it } from 'vitest';
import {
  applySolidFxToPads,
  createSolidFxRuntime,
  defaultSolidFx,
  ensureSolidFx,
  evaluateSolidFx,
  type SolidFxConfig,
  type SolidFxPad,
} from './solid-fx';

function appear(over: Partial<SolidFxConfig> = {}): SolidFxConfig {
  return ensureSolidFx({
    enabled: true,
    mode: 'appear',
    trigger: 'proximity',
    style: 'unveil',
    radius: 2,
    delayMs: 0,
    durationMs: 1000,
    restoreMs: 0,
    collideAt: 0.5,
    ...over,
  });
}

describe('ensureSolidFx', () => {
  it('fills defaults', () => {
    const fx = ensureSolidFx();
    expect(fx.enabled).toBe(false);
    expect(fx.mode).toBe('appear');
    expect(fx.trigger).toBe('proximity');
    expect(fx.style).toBe('unveil');
    expect(fx.radius).toBe(2);
    expect(fx.durationMs).toBe(700);
    expect(fx.collideAt).toBe(0.5);
  });

  it('clamps collideAt and ignores junk fields', () => {
    const fx = ensureSolidFx({ collideAt: 4, durationMs: -10, trigger: 'nope' as never });
    expect(fx.collideAt).toBe(1);
    expect(fx.durationMs).toBe(1);
    expect(fx.trigger).toBe('proximity');
  });
});

describe('evaluateSolidFx', () => {
  it('starts hidden for appear, shown for disappear', () => {
    const a = createSolidFxRuntime();
    const d = createSolidFxRuntime();
    expect(evaluateSolidFx(appear(), { distance: 10, standingOn: false, nowMs: 0 }, a).progress).toBe(0);
    expect(
      evaluateSolidFx(appear({ mode: 'disappear' }), { distance: 10, standingOn: false, nowMs: 0 }, d)
        .progress
    ).toBe(1);
  });

  it('proximity 2m appear: far stays hidden, near unveils and enables collision at collideAt', () => {
    const fx = appear({ collideAt: 0.5, durationMs: 1000 });
    const state = createSolidFxRuntime();
    const far = evaluateSolidFx(fx, { distance: 3, standingOn: false, nowMs: 0 }, state);
    expect(far.progress).toBe(0);
    expect(far.passThrough).toBe(true);

    const start = evaluateSolidFx(fx, { distance: 1.5, standingOn: false, nowMs: 10 }, state);
    expect(start.passThrough).toBe(true);

    const mid = evaluateSolidFx(fx, { distance: 1.5, standingOn: false, nowMs: 10 + 500 }, state);
    expect(mid.progress).toBeCloseTo(0.5, 2);
    expect(mid.passThrough).toBe(false);

    const end = evaluateSolidFx(fx, { distance: 1.5, standingOn: false, nowMs: 10 + 1000 }, state);
    expect(end.progress).toBe(1);
    expect(end.passThrough).toBe(false);
  });

  it('step disappear waits delay, then drops collision at collideAt', () => {
    const fx = appear({
      mode: 'disappear',
      trigger: 'step',
      delayMs: 200,
      durationMs: 400,
      collideAt: 0.5,
    });
    const state = createSolidFxRuntime();
    const idle = evaluateSolidFx(fx, { distance: 0, standingOn: true, nowMs: 0 }, state);
    expect(idle.progress).toBe(1);
    expect(idle.passThrough).toBe(false);
    expect(state.phase).toBe('delay');

    const stillSolid = evaluateSolidFx(fx, { distance: 0, standingOn: true, nowMs: 150 }, state);
    expect(stillSolid.progress).toBe(1);
    expect(stillSolid.passThrough).toBe(false);

    evaluateSolidFx(fx, { distance: 0, standingOn: true, nowMs: 200 }, state);
    const mid = evaluateSolidFx(fx, { distance: 0, standingOn: true, nowMs: 400 }, state);
    expect(mid.progress).toBeCloseTo(0.5, 2);
    expect(mid.passThrough).toBe(false);

    const gone = evaluateSolidFx(fx, { distance: 0, standingOn: true, nowMs: 600 }, state);
    expect(gone.progress).toBe(0);
    expect(gone.passThrough).toBe(true);
  });

  it('restoreMs plays back to idle so the FX can retrigger', () => {
    const fx = appear({ durationMs: 100, restoreMs: 50 });
    const state = createSolidFxRuntime();
    evaluateSolidFx(fx, { distance: 0, standingOn: false, nowMs: 0 }, state);
    evaluateSolidFx(fx, { distance: 0, standingOn: false, nowMs: 100 }, state);
    expect(state.phase).toBe('hold');
    evaluateSolidFx(fx, { distance: 0, standingOn: false, nowMs: 150 }, state);
    expect(state.phase).toBe('restore');
    const done = evaluateSolidFx(fx, { distance: 10, standingOn: false, nowMs: 250 }, state);
    expect(state.phase).toBe('idle');
    expect(done.progress).toBe(0);
  });
});

describe('applySolidFxToPads', () => {
  it('hides every pad of an appear entity until the player walks in range', () => {
    const pads: SolidFxPad[] = [
      { id: 'p1', entityId: 'box', x: 0, y: 0, z: 0 },
      { id: 'p2', entityId: 'box', x: 1, y: 0, z: 0 },
    ];
    const configs = new Map([['box', appear({ radius: 2, durationMs: 10 })]]);
    const runtimes = new Map();
    applySolidFxToPads(pads, configs, runtimes, [{ x: 20, y: 0, z: 0, supportPadId: null }], 0);
    expect(pads.every((p) => p.fxHidden)).toBe(true);

    applySolidFxToPads(pads, configs, runtimes, [{ x: 0.2, y: 0, z: 0, supportPadId: null }], 0);
    applySolidFxToPads(pads, configs, runtimes, [{ x: 0.2, y: 0, z: 0, supportPadId: null }], 20);
    expect(pads.every((p) => p.fxHidden)).toBe(false);
  });
});

describe('defaultSolidFx', () => {
  it('is disabled so existing maps keep solid collision', () => {
    expect(defaultSolidFx().enabled).toBe(false);
  });
});
