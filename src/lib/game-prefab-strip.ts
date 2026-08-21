import type { EditorEntity } from '@/components/game/editor/map-document';

/** Drop inline data:-URL meshes so a cloud prefab JSON stays under the write cap. */
export function stripHeavyEntity(e: EditorEntity): EditorEntity {
  const copy = { ...e };
  if (copy.customModelUrl?.startsWith('data:') && copy.customModelUrl.length > 8000) {
    delete copy.customModelUrl;
  }
  if (Array.isArray(copy.playerSkins)) {
    copy.playerSkins = copy.playerSkins.map((s) => {
      const skin = { ...s };
      if (skin.customModelUrl?.startsWith('data:') && skin.customModelUrl.length > 8000) {
        delete skin.customModelUrl;
      }
      return skin;
    });
  }
  return copy;
}
