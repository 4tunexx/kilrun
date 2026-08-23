import { describe, expect, it } from 'vitest';
import { createEmptyMap } from './map-document';
import { isUsefulUndoSnapshot } from './editor-history';

describe('isUsefulUndoSnapshot', () => {
  it('rejects a snapshot of the live document (gizmo hover / click no-op)', () => {
    const live = createEmptyMap('Map 1');
    expect(isUsefulUndoSnapshot(structuredClone(live), live)).toBe(false);
  });

  it('keeps a real prior state so one undo moves the map', () => {
    const prior = createEmptyMap('Map 1');
    const live = { ...createEmptyMap('Map 1'), gridSize: 2 };
    expect(isUsefulUndoSnapshot(prior, live)).toBe(true);
  });
});
