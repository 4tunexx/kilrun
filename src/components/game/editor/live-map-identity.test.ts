import { describe, expect, it } from 'vitest';
import {
  isEditorMapTheLiveCloudMap,
  liveCloudMismatchMessage,
  type CloudActiveMapMeta,
} from './live-map-identity';

const cloud: CloudActiveMapMeta = {
  id: 'mongo-1',
  localId: 'map_local_a',
  name: 'Old Cavern',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('isEditorMapTheLiveCloudMap', () => {
  it('matches by browser localId', () => {
    expect(isEditorMapTheLiveCloudMap('map_local_a', cloud)).toBe(true);
  });

  it('matches by Mongo id (maps published without a localId)', () => {
    expect(isEditorMapTheLiveCloudMap('mongo-1', cloud)).toBe(true);
  });

  it('is false for a different editor draft', () => {
    expect(isEditorMapTheLiveCloudMap('map_local_new', cloud)).toBe(false);
  });

  it('is false when nothing is Active in cloud yet', () => {
    expect(isEditorMapTheLiveCloudMap('map_local_a', null)).toBe(false);
  });
});

describe('liveCloudMismatchMessage', () => {
  it('names both maps so staff know why live play looks old', () => {
    expect(liveCloudMismatchMessage('New Arena', cloud)).toContain('Old Cavern');
    expect(liveCloudMismatchMessage('New Arena', cloud)).toContain('New Arena');
  });
});
