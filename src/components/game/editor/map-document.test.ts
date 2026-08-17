import { describe, expect, it } from 'vitest';
import {
  getEntityWarnings,
  sanitizePlayerBindings,
  sanitizeShopPowerUp,
  scrubDanglingReferences,
  suggestPlayerBindings,
} from './map-document';
import type { EditorEntity } from './map-document';

function stub(id: string, over: Partial<EditorEntity> = {}): EditorEntity {
  return {
    id,
    name: id,
    kind: 'prop',
    model: 'floor-square',
    layerId: 'l1',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...over,
  } as EditorEntity;
}

describe('scrubDanglingReferences', () => {
  it('clears a teleport target pointing at a removed entity', () => {
    const entities = [
      stub('teleporter', { teleport: { enabled: true, targetEntityId: 'exit', cooldownMs: 800 } }),
    ];
    const out = scrubDanglingReferences(entities, new Set(['exit']));
    expect(out[0].teleport?.targetEntityId).toBeUndefined();
  });

  it('leaves a teleport target alone when it still exists', () => {
    const entities = [
      stub('teleporter', { teleport: { enabled: true, targetEntityId: 'exit', cooldownMs: 800 } }),
      stub('exit'),
    ];
    const out = scrubDanglingReferences(entities, new Set(['someone-else']));
    expect(out[0].teleport?.targetEntityId).toBe('exit');
  });

  it('drops a deleted id from activatesEntityIds but keeps the rest', () => {
    const entities = [
      stub('button', {
        kind: 'button',
        animation: {
          availableClips: [],
          trigger: 'interact',
          radius: 1.5,
          loopActive: false,
          loopDefault: false,
          activatesEntityIds: ['trap-a', 'trap-b'],
        },
      }),
    ];
    const out = scrubDanglingReferences(entities, new Set(['trap-a']));
    expect(out[0].animation?.activatesEntityIds).toEqual(['trap-b']);
  });

  it('clears listenToEntityId pointing at a removed button', () => {
    const entities = [
      stub('trap', {
        kind: 'trap',
        animation: {
          availableClips: [],
          trigger: 'signal',
          radius: 1.5,
          loopActive: false,
          loopDefault: false,
          listenToEntityId: 'button-1',
        },
      }),
    ];
    const out = scrubDanglingReferences(entities, new Set(['button-1']));
    expect(out[0].animation?.listenToEntityId).toBeUndefined();
  });

  it('is a no-op when nothing references a removed id', () => {
    const entities = [stub('a'), stub('b')];
    const out = scrubDanglingReferences(entities, new Set(['c']));
    expect(out).toEqual(entities);
  });

  it('returns the same array reference when removedIds is empty', () => {
    const entities = [stub('a')];
    const out = scrubDanglingReferences(entities, new Set());
    expect(out).toBe(entities);
  });
});

describe('getEntityWarnings', () => {
  it('flags a trap/hazard with damage disabled', () => {
    const e = stub('t', { kind: 'trap', hazard: { enabled: false, damage: 20, intervalMs: 500, instantKill: false } });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('Damage is disabled'))).toBe(true);
  });

  it('flags a trap/hazard with no hazard config at all', () => {
    const e = stub('t', { kind: 'hazard' });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('Damage is disabled'))).toBe(true);
  });

  it('does not flag a trap/hazard with damage enabled', () => {
    const e = stub('t', { kind: 'trap', hazard: { enabled: true, damage: 20, intervalMs: 500, instantKill: false } });
    expect(getEntityWarnings(e, [e])).toEqual([]);
  });

  it('flags a disabled jump pad', () => {
    const e = stub('j', { kind: 'jump_pad', jumpPad: { enabled: false, boost: 14 } });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('Jump pad is disabled'))).toBe(true);
  });

  it('flags a moving platform with zero offset', () => {
    const e = stub('p', { motion: { enabled: true, offset: [0, 0, 0], periodMs: 4000, phaseMs: 0 } });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('will not actually move'))).toBe(true);
  });

  it('does not flag a moving platform with a real offset', () => {
    const e = stub('p', { motion: { enabled: true, offset: [0, 0, 4], periodMs: 4000, phaseMs: 0 } });
    expect(getEntityWarnings(e, [e])).toEqual([]);
  });

  it('flags an enabled teleporter with no destination', () => {
    const e = stub('tp', { teleport: { enabled: true } });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('no destination'))).toBe(true);
  });

  it('flags a signal trigger with nothing wired to listen', () => {
    const e = stub('d', {
      kind: 'door',
      animation: {
        availableClips: [],
        trigger: 'signal',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
      },
    });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes('never activate'))).toBe(true);
  });

  it('flags a button that activates nothing and has no listeners', () => {
    const e = stub('b', {
      kind: 'button',
      animation: {
        availableClips: [],
        trigger: 'interact',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
        activatesEntityIds: [],
      },
    });
    expect(getEntityWarnings(e, [e]).some((w) => w.includes("doesn't activate anything"))).toBe(true);
  });

  it('does not flag a button that a door listens to, even with no activatesEntityIds', () => {
    const button = stub('b', {
      kind: 'button',
      animation: {
        availableClips: [],
        trigger: 'interact',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
        activatesEntityIds: [],
      },
    });
    const door = stub('d', {
      kind: 'door',
      animation: {
        availableClips: [],
        trigger: 'signal',
        radius: 1.5,
        loopActive: false,
        loopDefault: false,
        listenToEntityId: 'b',
      },
    });
    expect(getEntityWarnings(button, [button, door])).toEqual([]);
  });
});

const PACK_CLIPS = [
  'A_Poses',
  'Attack_hand_1_(left)',
  'Attack_hand_2_(right)',
  'Attack_heavy_hand_(right)',
  'Damage_body',
  'Death_1_(idle)',
  'Idle',
  'Jump idle end',
  'Jump idle middle',
  'Jump idle start',
  'Jump run end',
  'Jump run middle',
  'Jump run start',
  'Run Boost',
  'Run',
  'Walk',
  'Win',
];

describe('suggestPlayerBindings', () => {
  it('binds pack Idle/Walk/Run instead of Jump * or Death * substring hits', () => {
    const b = suggestPlayerBindings(PACK_CLIPS);
    expect(b.idle).toBe('Idle');
    expect(b.walk).toBe('Walk');
    expect(b.run).toBe('Run');
    expect(b.jump).toBe('Jump run start');
    expect(b.slide).toBeUndefined();
    expect(b.flip).toBeUndefined();
    expect(b.strafe_left).toBeUndefined();
  });

  it('does not bind back to a backflip clip', () => {
    const b = suggestPlayerBindings([...PACK_CLIPS, 'Backflip', 'Slide']);
    expect(b.flip).toBe('Backflip');
    expect(b.slide).toBe('Slide');
    expect(b.back).not.toBe('Backflip');
    expect(b.run).toBe('Run');
  });

  it('sanitizes stale Jump-run bindings stuffed into the run slot', () => {
    const b = sanitizePlayerBindings(
      { idle: 'Jump idle end', run: 'Jump run end', slide: 'Idle', flip: 'Walk' },
      PACK_CLIPS
    );
    expect(b.idle).toBe('Idle');
    expect(b.run).toBe('Run');
    expect(b.slide).toBeUndefined();
    expect(b.flip).toBeUndefined();
  });
});

describe('sanitizeShopPowerUp', () => {
  it('keeps Deathrun effects instead of coercing them to heal', () => {
    for (const effect of [
      'invisibility',
      'double_jump',
      'checkpoint',
      'slow_trapper',
    ] as const) {
      const out = sanitizeShopPowerUp({
        id: effect,
        label: effect,
        shopPrice: 100,
        effect,
        enabled: true,
        modes: ['deathrun'],
      });
      expect(out?.effect).toBe(effect);
    }
  });

  it('falls back to heal for unknown effects', () => {
    const out = sanitizeShopPowerUp({
      id: 'mystery',
      label: 'Mystery',
      shopPrice: 1,
      effect: 'mystery',
      enabled: true,
      modes: ['horde'],
    });
    expect(out?.effect).toBe('heal');
  });
});
