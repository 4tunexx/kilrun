/**
 * Local library of Model Editor skin presets (map editor → shop pipeline).
 */
import type { PlayerSkinPreset, SkinAttachSlot, SkinAttachment } from '@/lib/player-skins';
import { defaultAttachment, skinConfigToJson } from '@/lib/player-skins';

const STORAGE_KEY = 'kilrun.model-skins.v1';

function genId() {
  return `skin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSkinPresets(): PlayerSkinPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayerSkinPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSkinPreset(preset: PlayerSkinPreset): PlayerSkinPreset {
  const all = listSkinPresets();
  const next = {
    ...preset,
    updatedAt: new Date().toISOString(),
  };
  const idx = all.findIndex((p) => p.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return next;
}

export function deleteSkinPreset(id: string) {
  const all = listSkinPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function createSkinPreset(input: {
  name: string;
  baseModelKey: string;
  primarySlot: SkinAttachSlot;
  attachments?: SkinAttachment[];
}): PlayerSkinPreset {
  const now = new Date().toISOString();
  const attachments =
    input.attachments?.length ? input.attachments : [defaultAttachment(input.primarySlot)];
  return saveSkinPreset({
    id: genId(),
    name: input.name,
    baseModelKey: input.baseModelKey,
    primarySlot: input.primarySlot,
    attachments,
    createdAt: now,
    updatedAt: now,
    listedForShop: true,
  });
}

export function skinPresetShopPayload(preset: PlayerSkinPreset) {
  const slotMeta = preset.primarySlot;
  return {
    itemName: preset.name,
    itemCategory: 'Skins',
    itemSku: preset.shopSku || `skin_${preset.id}`,
    vpPrice: preset.shopPrice ?? 250,
    imageUrl: preset.thumbnail,
    cosmeticSlot: `skin_${slotMeta}`,
    cosmeticConfig: skinConfigToJson(preset),
  };
}
