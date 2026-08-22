import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// soundboard.ts talks to the real Web Audio API + a live /api fetch, both of
// which don't exist in the Vitest 'node' environment. Fake just enough of
// each so we can exercise the actual scheduling logic (voice-stealing +
// duration cap for cadence events like footsteps) rather than only the pure
// helpers other effects/*.test.ts files cover.

vi.mock('@/lib/audio-fx', () => ({
  getAudioContext: vi.fn(),
  getProcessedBuffer: vi.fn(),
}));
vi.mock('@/lib/engine/runtime', () => ({
  absolutizeSiteAssetUrl: (url: string) => url,
  publicSiteUrl: (path: string) => path,
}));

import { getAudioContext, getProcessedBuffer } from '@/lib/audio-fx';

const IMMEDIATE_STOP = 'immediate';

class FakeGain {
  gain = { value: 1 };
  connect() {
    return this;
  }
}

class FakeSource {
  buffer: unknown;
  loop = false;
  onended: (() => void) | null = null;
  stopCalls: Array<number | typeof IMMEDIATE_STOP> = [];
  connect() {
    return this;
  }
  start() {
    // no-op: playback itself isn't observable in this fake
  }
  stop(when?: number) {
    this.stopCalls.push(when === undefined ? IMMEDIATE_STOP : when);
  }
}

function flush(times = 4): Promise<void> {
  return Array.from({ length: times }).reduce<Promise<void>>(
    (p) => p.then(() => new Promise((r) => setTimeout(r, 0))),
    Promise.resolve()
  );
}

let sources: FakeSource[];
let fakeCtx: {
  state: string;
  destination: object;
  currentTime: number;
  createBufferSource: () => FakeSource;
  createGain: () => FakeGain;
  resume: () => Promise<void>;
};

describe('soundboard cadence one-shots (footstep/jump/land/etc.)', () => {
  beforeEach(() => {
    vi.resetModules();
    sources = [];
    fakeCtx = {
      state: 'running',
      destination: {},
      currentTime: 0,
      createBufferSource: () => {
        const s = new FakeSource();
        sources.push(s);
        return s;
      },
      createGain: () => new FakeGain(),
      resume: () => Promise.resolve(),
    };
    (getAudioContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fakeCtx);
    // Simulate exactly the reported bug: whatever's bound to these events is
    // a long, uncropped file (here: a 240s "song") instead of a short clip.
    (getProcessedBuffer as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ duration: 240 })
    );

    (globalThis as unknown as { window: object }).window = {};
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {};

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              sounds: {
                footstep: { fileUrl: 'long-song.mp3', volume: 1 },
                weapon_fire_shotgun: { fileUrl: 'shotgun.mp3', volume: 1 },
              },
            }),
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { window?: object }).window;
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('cuts off the previous footstep the instant the next one fires — no overlap', async () => {
    const { playSound } = await import('./soundboard');
    playSound('footstep');
    await flush();
    playSound('footstep');
    await flush();

    expect(sources).toHaveLength(2);
    // The first voice already had its own duration-cap stop() scheduled
    // when it started; retriggering must additionally force-stop it right
    // away instead of letting it ring until that scheduled cap.
    expect(sources[0].stopCalls).toContain(IMMEDIATE_STOP);
  });

  it('never lets an uncropped long clip ring on past a short ceiling', async () => {
    const { playSound } = await import('./soundboard');
    playSound('footstep');
    await flush();

    // buffer.duration is 240s (a whole song); playback must still be capped
    // to a plausible foley length, not the source file's real length.
    const scheduledStop = sources[0].stopCalls[0];
    expect(scheduledStop).not.toBe(IMMEDIATE_STOP);
    expect(scheduledStop as number).toBeLessThan(1);
    expect(scheduledStop as number).toBeGreaterThan(0);
  });

  it('does not voice-steal combat one-shots that legitimately overlap (multi-pellet fire)', async () => {
    const { playSound } = await import('./soundboard');
    playSound('weapon_fire_shotgun');
    await flush();
    playSound('weapon_fire_shotgun');
    await flush();

    expect(sources).toHaveLength(2);
    // Neither pellet's voice should have been force-stopped by the other.
    expect(sources[0].stopCalls).toHaveLength(0);
    expect(sources[1].stopCalls).toHaveLength(0);
  });
});
