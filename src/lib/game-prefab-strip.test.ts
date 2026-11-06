import { describe, expect, it } from 'vitest';
import { assertNoOversizedInlineModels, stripHeavyEntity } from '@/lib/game-prefab-strip';
import type { EditorEntity } from '@/components/game/editor/map-document';

describe('stripHeavyEntity', () => {
  it('rejects oversized inline model URLs before publish instead of silently losing them', () => {
    const heavy = `data:model/gltf-binary;base64,${'A'.repeat(9000)}`;
    const light = 'data:model/gltf-binary;base64,abc';
    const entity = {
      id: 'e1',
      customModelUrl: heavy,
      playerSkins: [{ id: 's1', customModelUrl: heavy }, { id: 's2', customModelUrl: light }],
    } as unknown as EditorEntity;
    expect(() => assertNoOversizedInlineModels([entity])).toThrow(
      'Upload the model and use its /game/... URL before publishing'
    );
    const out = stripHeavyEntity(entity);
    expect(out.customModelUrl).toBeUndefined();
    expect(out.playerSkins?.[0]?.customModelUrl).toBeUndefined();
    expect(out.playerSkins?.[1]?.customModelUrl).toBe(light);
  });

  it('allows small inline models and external model URLs', () => {
    expect(() =>
      assertNoOversizedInlineModels([
        {
          id: 'e1',
          customModelUrl: 'data:model/gltf-binary;base64,abc',
        } as unknown as EditorEntity,
        { id: 'e2', customModelUrl: '/game/models/prop.glb' } as unknown as EditorEntity,
      ])
    ).not.toThrow();
  });
});
