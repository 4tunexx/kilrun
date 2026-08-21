import { describe, expect, it } from 'vitest';
import { stripHeavyEntity } from '@/lib/game-prefab-strip';
import type { EditorEntity } from '@/components/game/editor/map-document';

describe('stripHeavyEntity', () => {
  it('drops oversized data: model URLs on the entity and its skins', () => {
    const heavy = `data:model/gltf-binary;base64,${'A'.repeat(9000)}`;
    const light = 'data:model/gltf-binary;base64,abc';
    const entity = {
      id: 'e1',
      customModelUrl: heavy,
      playerSkins: [{ id: 's1', customModelUrl: heavy }, { id: 's2', customModelUrl: light }],
    } as unknown as EditorEntity;
    const out = stripHeavyEntity(entity);
    expect(out.customModelUrl).toBeUndefined();
    expect(out.playerSkins?.[0]?.customModelUrl).toBeUndefined();
    expect(out.playerSkins?.[1]?.customModelUrl).toBe(light);
  });
});
