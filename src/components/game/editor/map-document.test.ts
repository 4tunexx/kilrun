import { describe, expect, it } from 'vitest';
import { scrubDanglingReferences } from './map-document';
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
