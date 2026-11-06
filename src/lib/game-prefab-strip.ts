import type { EditorEntity } from '@/components/game/editor/map-document';

const INLINE_MODEL_URL_LIMIT = 8000;

function hasOversizedInlineModelUrl(entity: EditorEntity): boolean {
  if (
    entity.customModelUrl?.startsWith('data:') &&
    entity.customModelUrl.length > INLINE_MODEL_URL_LIMIT
  ) {
    return true;
  }
  return Boolean(
    entity.playerSkins?.some(
      (skin) =>
        skin.customModelUrl?.startsWith('data:') &&
        skin.customModelUrl.length > INLINE_MODEL_URL_LIMIT
    )
  );
}

/** Reject inline assets before cloud publish rather than silently dropping them. */
export function assertNoOversizedInlineModels(entities: EditorEntity[]): void {
  if (entities.some(hasOversizedInlineModelUrl)) {
    throw new Error(
      'Prefab contains an oversized inline model asset. Upload the model and use its /game/... URL before publishing.'
    );
  }
}

/** Drop inline data:-URL meshes so a cloud prefab JSON stays under the write cap. */
export function stripHeavyEntity(e: EditorEntity): EditorEntity {
  const copy = { ...e };
  if (copy.customModelUrl?.startsWith('data:') && copy.customModelUrl.length > INLINE_MODEL_URL_LIMIT) {
    delete copy.customModelUrl;
  }
  if (Array.isArray(copy.playerSkins)) {
    copy.playerSkins = copy.playerSkins.map((s) => {
      const skin = { ...s };
      if (skin.customModelUrl?.startsWith('data:') && skin.customModelUrl.length > INLINE_MODEL_URL_LIMIT) {
        delete skin.customModelUrl;
      }
      return skin;
    });
  }
  return copy;
}
