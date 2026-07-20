/**
 * Body / gear skin slots for the Model Editor → shop → in-game equip pipeline.
 * Attachments can be catalog meshes, uploaded GLBs, or built-in primitives
 * with materials / textures sculpted in the Model Editor.
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

/** Built-in shapes you can sculpt without uploading a GLB. */
export type SkinPrimitive =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'capsule'
  | 'cone'
  | 'torus'
  | 'plane';

export const SKIN_PRIMITIVES: { id: SkinPrimitive; label: string }[] = [
  { id: 'box', label: 'Box / Cube' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'cone', label: 'Cone' },
  { id: 'torus', label: 'Torus / Ring' },
  { id: 'plane', label: 'Plane / Flat' },
];

export interface SkinShapeParams {
  /** Box / plane */
  width?: number;
  height?: number;
  depth?: number;
  /** Sphere / cylinder / cone / capsule / torus */
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  /** Torus tube radius */
  tube?: number;
  /** Detail */
  radialSegments?: number;
  heightSegments?: number;
  tubularSegments?: number;
}

export interface SkinMaterial {
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** flat | stripes | checker | gradient — procedural when no textureUrl */
  pattern?: 'flat' | 'stripes' | 'checker' | 'gradient';
  patternColor?: string;
}

export const DEFAULT_SKIN_MATERIAL: SkinMaterial = {
  color: '#c4a574',
  metalness: 0.15,
  roughness: 0.65,
  opacity: 1,
  emissive: '#000000',
  emissiveIntensity: 0,
  pattern: 'flat',
  patternColor: '#8b6914',
};

export const SKIN_ATTACH_SLOTS: {
  id: SkinAttachSlot;
  label: string;
  hint: string;
  /** Default local offset on a ~1.75–1.8m mannequin (feet at y=0). */
  defaultOffset: [number, number, number];
  /** Preferred bone name substrings (case-insensitive). */
  boneHints: string[];
  cosmeticSlot: string;
  /** Sensible starter primitive for this slot. */
  defaultPrimitive: SkinPrimitive;
  defaultShape: SkinShapeParams;
  defaultScale: [number, number, number];
}[] = [
  {
    id: 'hat',
    label: 'Hat / Head',
    hint: 'Caps, helmets, crowns',
    defaultOffset: [0, 1.62, 0],
    boneHints: ['head', 'hat', 'skull'],
    cosmeticSlot: 'skin_hat',
    defaultPrimitive: 'cylinder',
    defaultShape: { radiusTop: 0.28, radiusBottom: 0.32, height: 0.22, radialSegments: 24 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'face',
    label: 'Face',
    hint: 'Masks, glasses, visors',
    defaultOffset: [0, 1.42, 0.12],
    boneHints: ['head', 'face', 'jaw'],
    cosmeticSlot: 'skin_face',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.35, height: 0.18, depth: 0.08 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'torso',
    label: 'Torso / Shirt',
    hint: 'Jackets, armor, shirts',
    defaultOffset: [0, 1.05, 0],
    boneHints: ['spine', 'chest', 'torso', 'body'],
    cosmeticSlot: 'skin_torso',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.55, height: 0.55, depth: 0.28 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'pants',
    label: 'Pants',
    hint: 'Legs / lower outfit',
    defaultOffset: [0, 0.72, 0],
    boneHints: ['hips', 'pelvis', 'leg'],
    cosmeticSlot: 'skin_pants',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.42, height: 0.55, depth: 0.24 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'boots',
    label: 'Boots',
    hint: 'Footwear',
    defaultOffset: [0, 0.06, 0.05],
    boneHints: ['foot', 'boot', 'ankle'],
    cosmeticSlot: 'skin_boots',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.28, height: 0.14, depth: 0.4 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'gloves',
    label: 'Gloves',
    hint: 'Hands / gauntlets',
    defaultOffset: [0.38, 0.95, 0.05],
    boneHints: ['hand', 'wrist', 'glove'],
    cosmeticSlot: 'skin_gloves',
    defaultPrimitive: 'sphere',
    defaultShape: { radius: 0.1, radialSegments: 16 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'weapon',
    label: 'Weapon',
    hint: 'Sword, gun, tool in hand',
    defaultOffset: [0.42, 0.92, 0.18],
    boneHints: ['hand_r', 'righthand', 'hand.r', 'weapon', 'right_hand'],
    cosmeticSlot: 'skin_weapon',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.06, height: 0.7, depth: 0.06 },
    defaultScale: [1, 1, 1],
  },
  {
    id: 'back',
    label: 'Back / Cape',
    hint: 'Backpacks, wings, capes',
    defaultOffset: [0, 1.15, -0.22],
    boneHints: ['spine', 'back', 'chest'],
    cosmeticSlot: 'skin_back',
    defaultPrimitive: 'plane',
    defaultShape: { width: 0.5, height: 0.7 },
    defaultScale: [1, 1, 1],
  },
];

export interface SkinAttachment {
  slot: SkinAttachSlot;
  /** Catalog prototype id (optional if primitive / custom). */
  model?: string;
  customModelUrl?: string;
  /** Built-in sculptable shape — preferred over catalog when set. */
  primitive?: SkinPrimitive;
  shape?: SkinShapeParams;
  material?: SkinMaterial;
  /** Uploaded or generated texture (data URL / path). */
  textureUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  bone?: string;
  /** @deprecated use material.color */
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
  /** Shop / inventory card — should be the skin part itself, not full avatar. */
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
    primitive: meta.defaultPrimitive,
    shape: { ...meta.defaultShape },
    material: { ...DEFAULT_SKIN_MATERIAL },
    position: [...meta.defaultOffset] as [number, number, number],
    rotation: [0, 0, 0],
    scale: [...meta.defaultScale] as [number, number, number],
    model: undefined,
    customModelUrl: undefined,
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
    version: 2,
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

/** True when attachment is a sculptable primitive (no external mesh required). */
export function isPrimitiveSkin(att: SkinAttachment): boolean {
  return Boolean(att.primitive) && !att.customModelUrl && !att.model;
}
