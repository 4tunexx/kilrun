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
    const live = { ...prior, gridSize: 2 };
    expect(isUsefulUndoSnapshot(prior, live)).toBe(true);
  });

  it('treats an environment-normalized clone of the same map as a no-op', () => {
    const live = createEmptyMap('Map 1');
    const settled = { ...live, environment: { ...live.environment } };
    expect(isUsefulUndoSnapshot(live, settled)).toBe(false);
  });
});
