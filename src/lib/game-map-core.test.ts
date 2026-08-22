import { describe, expect, it } from 'vitest';
import type { MapDocument } from '@/components/game/editor/map-document';
import { stripInlineDataUrls, throwIfInlineAssetsStripped } from '@/lib/game-map-core';

describe('stripInlineDataUrls', () => {
  it('collects heavy data: fields', () => {
    const heavy = `data:model/gltf-binary;base64,${'A'.repeat(9000)}`;
    const { strippedKeys, doc } = stripInlineDataUrls({
      entities: [{ id: 'e1', customModelUrl: heavy }],
    } as unknown as MapDocument);
    expect(strippedKeys).toContain('customModelUrl');
    expect((doc.entities[0] as { customModelUrl?: string }).customModelUrl).toBeUndefined();
  });
});

describe('throwIfInlineAssetsStripped', () => {
  it('throws with field names when anything was stripped', () => {
    expect(() => throwIfInlineAssetsStripped(['customModelUrl', 'customModelUrl'])).toThrow(
      /inline files \(customModelUrl\)/
    );
  });

  it('no-ops when nothing was stripped', () => {
    expect(() => throwIfInlineAssetsStripped([])).not.toThrow();
  });
});
