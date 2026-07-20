/**
 * Body / gear skin slots for the Model Editor → shop → in-game equip pipeline.
 * Attachments are offsets relative to character sockets (or named bones when present).
 */

export type SkinAttachSlot =
  | 'hat'
  | 'face'
  | 'torso'
  | 'pants'
  | 'boots'
  | 'gloves'
  | 'weapon'
  | 'back';

export const SKIN_ATTACH_SLOTS: {
  id: SkinAttachSlot;
  label: string;
  hint: string;
  /** Default local offset on a ~1.75–1.8m mannequin (feet at y=0). */
  defaultOffset: [number, number, number];
  /** Preferred bone name substrings (case-insensitive). */
  boneHints: string[];
  cosmeticSlot: string;
}[] = [
  {
    id: 'hat',
    label: 'Hat / Head',
    hint: 'Caps, helmets, crowns',
    defaultOffset: [0, 1.62, 0],
    boneHints: ['head', 'hat', 'skull'],
    cosmeticSlot: 'skin_hat',
  },
  {
    id: 'face',
    label: 'Face',
    hint: 'Masks, glasses, visors',
    defaultOffset: [0, 1.42, 0.12],
    boneHints: ['head', 'face', 'jaw'],
    cosmeticSlot: 'skin_face',
  },
  {
    id: 'torso',
    label: 'Torso / Shirt',
    hint: 'Jackets, armor, shirts',
    defaultOffset: [0, 1.05, 0],
    boneHints: ['spine', 'chest', 'torso', 'body'],
    cosmeticSlot: 'skin_torso',
  },
  {
    id: 'pants',
    label: 'Pants',
    hint: 'Legs / lower outfit',
    defaultOffset: [0, 0.72, 0],
    boneHints: ['hips', 'pelvis', 'leg'],
    cosmeticSlot: 'skin_pants',
  },
  {
    id: 'boots',
    label: 'Boots',
    hint: 'Footwear',
    defaultOffset: [0, 0.06, 0.05],
    boneHints: ['foot', 'boot', 'ankle'],
    cosmeticSlot: 'skin_boots',
  },
  {
    id: 'gloves',
    label: 'Gloves',
    hint: 'Hands / gauntlets',
    defaultOffset: [0.38, 0.95, 0.05],
    boneHints: ['hand', 'wrist', 'glove'],
    cosmeticSlot: 'skin_gloves',
  },
  {
    id: 'weapon',
    label: 'Weapon',
    hint: 'Sword, gun, tool in hand',
    defaultOffset: [0.42, 0.92, 0.18],
    boneHints: ['hand_r', 'righthand', 'hand.r', 'weapon', 'right_hand'],
    cosmeticSlot: 'skin_weapon',
  },
  {
    id: 'back',
    label: 'Back / Cape',
    hint: 'Backpacks, wings, capes',
    defaultOffset: [0, 1.15, -0.22],
    boneHints: ['spine', 'back', 'chest'],
    cosmeticSlot: 'skin_back',
  },
];

export interface SkinAttachment {
  slot: SkinAttachSlot;
  model?: string;
  customModelUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  bone?: string;
  color?: string;
}

export interface PlayerSkinPreset {
  id: string;
  name: string;
  /** Player base model key this skin was authored against. */
  baseModelKey: string;
  /** Primary shop slot (usually the first attachment's slot). */
  primarySlot: SkinAttachSlot;
  attachments: SkinAttachment[];
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  shopSku?: string;
  shopPrice?: number;
  /** When true, listed for admin shop publishing. */
  listedForShop?: boolean;
}

export function skinSlotMeta(slot: SkinAttachSlot) {
  return SKIN_ATTACH_SLOTS.find((s) => s.id === slot)!;
}

export function defaultAttachment(slot: SkinAttachSlot): SkinAttachment {
  const meta = skinSlotMeta(slot);
  return {
    slot,
    position: [...meta.defaultOffset] as [number, number, number],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

export function isSkinCosmeticSlot(slot: string | null | undefined): boolean {
  if (!slot) return false;
  return slot === 'skin' || slot.startsWith('skin_');
}

export function skinSlotFromCosmetic(slot: string): SkinAttachSlot | null {
  const hit = SKIN_ATTACH_SLOTS.find((s) => s.cosmeticSlot === slot);
  return hit?.id ?? null;
}

/** Serialize for StoreItem.cosmeticConfig / InventoryItem.cosmeticConfig. */
export function skinConfigToJson(preset: PlayerSkinPreset): Record<string, unknown> {
  return {
    kind: 'player_skin',
    version: 1,
    id: preset.id,
    name: preset.name,
    baseModelKey: preset.baseModelKey,
    primarySlot: preset.primarySlot,
    attachments: preset.attachments,
    thumbnail: preset.thumbnail,
  };
}

export function parseSkinConfig(raw: unknown): PlayerSkinPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'player_skin') return null;
  const attachments = Array.isArray(o.attachments) ? (o.attachments as SkinAttachment[]) : [];
  if (!attachments.length) return null;
  const primarySlot = (o.primarySlot as SkinAttachSlot) || attachments[0]?.slot || 'hat';
  return {
    id: String(o.id || 'skin'),
    name: String(o.name || 'Skin'),
    baseModelKey: String(o.baseModelKey || 'default-mannequin'),
    primarySlot,
    attachments,
    thumbnail: typeof o.thumbnail === 'string' ? o.thumbnail : undefined,
    createdAt: String(o.createdAt || new Date().toISOString()),
    updatedAt: String(o.updatedAt || new Date().toISOString()),
  };
}

export function baseModelKeyFromEntity(entity: {
  model?: string;
  customModelUrl?: string;
} | null | undefined): string {
  if (entity?.customModelUrl) return `custom:${entity.customModelUrl.slice(0, 48)}`;
  if (entity?.model) return entity.model;
  return 'default-mannequin';
}
