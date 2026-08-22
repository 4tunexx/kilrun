import { describe, expect, it } from 'vitest';
import { validateMapForPublish } from './map-validate';
import type { EditorEntity, MapDocument } from './map-document';
import { MAP_PUBLISH_MAX_BYTES } from '@/lib/map-publish-limits';

// The client-side publish validator used to only sum embedded data: URL
// bytes (customModelUrl/textureUrl) and only in the Deathrun path — a map
// could have a huge entity count (no embedded assets at all) and pass this
// check, then get rejected by the server's real cap on the FULL serialized
// document with a much less actionable error. This also never ran for
// Horde/Competitive maps at all.

function baseDoc(entities: EditorEntity[] = []): MapDocument {
  return {
    version: 1,
    name: 'Test',
    entities,
    layers: [{ id: 'l1', name: 'Default', visible: true, locked: false }],
    gridSize: 1,
  } as MapDocument;
}

function padEntity(bytes: number): EditorEntity {
  return {
    id: `pad-${Math.random()}`,
    name: 'pad',
    kind: 'prop',
    model: 'floor-square',
    layerId: 'l1',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    // A field with no special meaning to the validator, just bulk to grow
    // the serialized document past the cap without any embedded data: URL.
    notes: 'x'.repeat(bytes),
  } as unknown as EditorEntity;
}

describe('validateMapForPublish: total publish size (all modes)', () => {
  it('does not flag a small map', () => {
    const issues = validateMapForPublish(baseDoc([padEntity(100)]));
    expect(issues.some((i) => /publish limit/.test(i.message))).toBe(false);
  });

  it('flags a map whose FULL serialized size exceeds the cap even with zero embedded assets', () => {
    // No customModelUrl/textureUrl anywhere — the old Deathrun-only
    // embedded-bytes check would have seen 0 bytes and said nothing.
    const doc = baseDoc([padEntity(MAP_PUBLISH_MAX_BYTES + 50_000)]);
    const issues = validateMapForPublish(doc);
    const hit = issues.find((i) => /publish limit/.test(i.message) && i.level === 'error');
    expect(hit).toBeTruthy();
  });

  it('warns (not errors) when close to but under the cap', () => {
    const targetBytes = Math.floor(MAP_PUBLISH_MAX_BYTES * 0.9);
    const doc = baseDoc([padEntity(targetBytes)]);
    const issues = validateMapForPublish(doc);
    const warn = issues.find((i) => /publish limit/.test(i.message) && i.level === 'warn');
    const error = issues.find((i) => /publish limit/.test(i.message) && i.level === 'error');
    expect(warn).toBeTruthy();
    expect(error).toBeFalsy();
  });

  it('applies to Horde maps too, not just Deathrun', () => {
    const doc = baseDoc([padEntity(MAP_PUBLISH_MAX_BYTES + 50_000)]);
    doc.gameMode = 'horde';
    const issues = validateMapForPublish(doc);
    expect(issues.some((i) => /publish limit/.test(i.message) && i.level === 'error')).toBe(true);
  });

  it('applies to Competitive maps too', () => {
    const doc = baseDoc([padEntity(MAP_PUBLISH_MAX_BYTES + 50_000)]);
    doc.gameMode = 'competitive';
    const issues = validateMapForPublish(doc);
    expect(issues.some((i) => /publish limit/.test(i.message) && i.level === 'error')).toBe(true);
  });
});
