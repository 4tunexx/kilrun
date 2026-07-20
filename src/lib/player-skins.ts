import type { WeaponCombatConfig } from './weapons';
import { DEFAULT_MELEE_COMBAT } from './weapons';

export type SkinAttachSlot =
  | 'hat'
  | 'face'
  | 'torso'
  | 'pants'
  | 'boots'
  | 'gloves'
  | 'weapon'
  | 'back'
  | 'tail'
  | 'horn'
  | 'addon';

/** Built-in shapes you can sculpt without uploading a GLB. */
export type SkinPrimitive =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'capsule'
  | 'cone'
  | 'torus'
  | 'plane';

/**
 * How the surface behaves / looks:
 * - solid — hard (horn, armor plate)
 * - cloth — soft fabric
 * - cape — drapey cloth that sways
 */
export type SkinMaterialFeel = 'solid' | 'cloth' | 'cape';

/** bone = follows skeleton; body = exact character-local placement (editor = gameplay). */
export type SkinAttachMode = 'bone' | 'body';

export const SKIN_PRIMITIVES: { id: SkinPrimitive; label: string }[] = [
  { id: 'box', label: 'Box / Cube' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'cone', label: 'Cone' },
  { id: 'torus', label: 'Torus / Ring' },
  { id: 'plane', label: 'Plane / Flat' },
];

export const SKIN_MATERIAL_FEELS: {
  id: SkinMaterialFeel;
  label: string;
  hint: string;
}[] = [
  { id: 'solid', label: 'Solid', hint: 'Hard — horn, bone, metal, armor' },
  { id: 'cloth', label: 'Cloth', hint: 'Soft fabric — wraps / flaps lightly' },
  { id: 'cape', label: 'Cape', hint: 'Drapey cloth — sways like a cape/cloak' },
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

/** Apply feel presets on top of (or instead of) manual metal/rough when picking a feel. */
export function materialForFeel(
  feel: SkinMaterialFeel,
  base?: Partial<SkinMaterial>
): SkinMaterial {
  const color = base?.color ?? DEFAULT_SKIN_MATERIAL.color;
  const pattern = base?.pattern ?? 'flat';
  const patternColor = base?.patternColor ?? DEFAULT_SKIN_MATERIAL.patternColor;
  if (feel === 'solid') {
    return {
      ...DEFAULT_SKIN_MATERIAL,
      ...base,
      color,
      pattern,
      patternColor,
      metalness: base?.metalness ?? 0.35,
      roughness: base?.roughness ?? 0.4,
      opacity: base?.opacity ?? 1,
    };
  }
  if (feel === 'cape') {
    return {
      ...DEFAULT_SKIN_MATERIAL,
      ...base,
      color,
      pattern,
      patternColor,
      metalness: 0,
      roughness: 0.92,
      opacity: base?.opacity ?? 0.96,
    };
  }
  // cloth
  return {
    ...DEFAULT_SKIN_MATERIAL,
    ...base,
    color,
    pattern,
    patternColor,
    metalness: 0,
    roughness: 0.88,
    opacity: base?.opacity ?? 1,
  };
}

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
  defaultFeel: SkinMaterialFeel;
  defaultAttachMode: SkinAttachMode;
  /** Gloves / boots can auto-mirror L/R. */
  canPairMirror?: boolean;
  /** Allow multiple instances (custom addons). */
  allowMultiple?: boolean;
}[] = [
  {
    id: 'hat',
    label: 'Hat / Head',
    hint: 'Caps, helmets, crowns',
    defaultOffset: [0, 1.62, 0],
    boneHints: ['head', 'hat', 'skull'],
    cosmeticSlot: 'skin_hat',
    defaultPrimitive: 'cylinder',
    defaultShape: { radiusTop: 0.3, radiusBottom: 0.34, height: 0.24, radialSegments: 24 },
    defaultScale: [1.05, 1.05, 1.05],
    defaultFeel: 'solid',
    defaultAttachMode: 'bone',
  },
  {
    id: 'face',
    label: 'Face',
    hint: 'Masks, glasses, visors',
    defaultOffset: [0, 1.42, 0.12],
    boneHints: ['head', 'face', 'jaw'],
    cosmeticSlot: 'skin_face',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.42, height: 0.28, depth: 0.12 },
    defaultScale: [1.15, 1.15, 1.15],
    defaultFeel: 'solid',
    defaultAttachMode: 'bone',
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
    defaultFeel: 'cloth',
    defaultAttachMode: 'body',
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
    defaultFeel: 'cloth',
    defaultAttachMode: 'body',
  },
  {
    id: 'boots',
    label: 'Boots',
    hint: 'Footwear (pair mirror L/R)',
    defaultOffset: [0.12, 0.06, 0.08],
    boneHints: ['foot', 'boot', 'ankle', 'rightfoot', 'foot_r'],
    cosmeticSlot: 'skin_boots',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.22, height: 0.14, depth: 0.38 },
    defaultScale: [1, 1, 1],
    defaultFeel: 'solid',
    defaultAttachMode: 'bone',
    canPairMirror: true,
  },
  {
    id: 'gloves',
    label: 'Gloves',
    hint: 'Hands / gauntlets (pair mirror L/R)',
    defaultOffset: [0.38, 0.95, 0.05],
    boneHints: ['hand', 'wrist', 'glove', 'righthand', 'hand_r'],
    cosmeticSlot: 'skin_gloves',
    defaultPrimitive: 'sphere',
    defaultShape: { radius: 0.12, radialSegments: 16 },
    defaultScale: [1.2, 1.2, 1.2],
    defaultFeel: 'cloth',
    defaultAttachMode: 'bone',
    canPairMirror: true,
  },
  {
    id: 'weapon',
    label: 'Weapon',
    hint: 'Sword / gun on hand — mesh + combat stats',
    defaultOffset: [0.42, 0.92, 0.18],
    boneHints: ['hand_r', 'righthand', 'hand.r', 'weapon', 'right_hand'],
    cosmeticSlot: 'skin_weapon',
    defaultPrimitive: 'box',
    defaultShape: { width: 0.06, height: 0.7, depth: 0.06 },
    defaultScale: [1, 1, 1],
    defaultFeel: 'solid',
    defaultAttachMode: 'bone',
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
    defaultFeel: 'cape',
    defaultAttachMode: 'body',
  },
  {
    id: 'tail',
    label: 'Tail',
    hint: 'Squish a cylinder/capsule on the back hips',
    defaultOffset: [0, 0.85, -0.28],
    boneHints: ['hips', 'pelvis', 'spine'],
    cosmeticSlot: 'skin_tail',
    defaultPrimitive: 'capsule',
    defaultShape: { radius: 0.08, height: 0.55, radialSegments: 16 },
    defaultScale: [1, 1, 1],
    defaultFeel: 'solid',
    defaultAttachMode: 'body',
  },
  {
    id: 'horn',
    label: 'Horn',
    hint: 'Solid horns / spikes on the head',
    defaultOffset: [0.12, 1.72, 0.02],
    boneHints: ['head', 'hat', 'skull'],
    cosmeticSlot: 'skin_horn',
    defaultPrimitive: 'cone',
    defaultShape: { radius: 0.06, height: 0.28, radialSegments: 16 },
    defaultScale: [1, 1, 1],
    defaultFeel: 'solid',
    defaultAttachMode: 'bone',
    canPairMirror: true,
  },
  {
    id: 'addon',
    label: 'Custom part',
    hint: 'Free-place anything — place once, stays in game',
    defaultOffset: [0, 1.1, 0.25],
    boneHints: ['spine', 'chest', 'hips'],
    cosmeticSlot: 'skin_addon',
    defaultPrimitive: 'cylinder',
    defaultShape: { radiusTop: 0.1, radiusBottom: 0.12, height: 0.4, radialSegments: 20 },
    defaultScale: [1, 1, 1],
    defaultFeel: 'solid',
    defaultAttachMode: 'body',
    allowMultiple: true,
  },
];

export interface SkinSculptData {
  /** Flat xyz vertex positions after blob sculpt. */
  positions: number[];
  /** Must match geometry vertex count or sculpt is ignored. */
  count: number;
}

export type SkinSculptBrush = 'add' | 'remove' | 'smooth';

export interface SkinAttachment {
  /** Unique instance id (required for multiple addons). Defaults to slot. */
  id?: string;
  slot: SkinAttachSlot;
  /** Catalog prototype id (optional if primitive / custom). */
  model?: string;
  customModelUrl?: string;
  /** Built-in sculptable shape — preferred over catalog when set. */
  primitive?: SkinPrimitive;
  shape?: SkinShapeParams;
  material?: SkinMaterial;
  /** solid / cloth / cape — drives look + light sway. */
  feel?: SkinMaterialFeel;
  /** bone follows skeleton; body = exact editor character-local coords in game. */
  attachMode?: SkinAttachMode;
  /** For gloves/boots/horn — also spawn mirrored L/R copy. */
  pairMirror?: boolean;
  /**
   * Weapon combat (only for slot === 'weapon').
   * Visual mesh stays on the hand; this drives range/damage/anim style.
   */
  weapon?: WeaponCombatConfig;
  /** Uploaded or generated texture (data URL / path). */
  textureUrl?: string;
  /** ZBrush-style blob sculpt vertex dump (primitives). */
  sculpt?: SkinSculptData;
  /** Character-local position (feet at y=0). Same in editor & gameplay. */
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

export function attachmentKey(att: Pick<SkinAttachment, 'id' | 'slot'>): string {
  return att.id || att.slot;
}

export function defaultAttachment(slot: SkinAttachSlot, id?: string): SkinAttachment {
  const meta = skinSlotMeta(slot);
  const feel = meta.defaultFeel;
  const base: SkinAttachment = {
    id: id || (meta.allowMultiple ? `${slot}_${Math.random().toString(36).slice(2, 8)}` : slot),
    slot,
    primitive: meta.defaultPrimitive,
    shape: { ...meta.defaultShape },
    material: materialForFeel(feel),
    feel,
    attachMode: meta.defaultAttachMode,
    pairMirror: Boolean(meta.canPairMirror),
    position: [...meta.defaultOffset] as [number, number, number],
    rotation: slot === 'tail' ? [55, 0, 0] : slot === 'weapon' ? [0, 0, -25] : [0, 0, 0],
    scale: [...meta.defaultScale] as [number, number, number],
    model: undefined,
    customModelUrl: undefined,
  };
  if (slot === 'weapon') {
    base.weapon = { ...DEFAULT_MELEE_COMBAT };
  }
  return base;
}

/** Mirror of an attachment across character X (for L/R pairs). */
export function mirrorAttachmentX(att: SkinAttachment): SkinAttachment {
  return {
    ...att,
    id: `${attachmentKey(att)}_mirror`,
    position: [-att.position[0], att.position[1], att.position[2]],
    rotation: [att.rotation[0], -att.rotation[1], -att.rotation[2]],
    scale: [att.scale[0], att.scale[1], att.scale[2]],
    pairMirror: false,
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
    version: 3,
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
  // Full preset from Model Editor publish
  if (o.kind === 'player_skin') {
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
  // Inventory equip sometimes stores { attachments, primarySlot } without kind
  if (Array.isArray(o.attachments) && o.attachments.length) {
    const attachments = o.attachments as SkinAttachment[];
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
  return null;
}

/**
 * Flatten User.equippedSkins map (cosmeticSlot → cosmeticConfig) into
 * SkinAttachment[] for ThreeCharacter / play preview.
 */
export function flattenEquippedSkinsMap(
  equipped: Record<string, unknown> | null | undefined
): SkinAttachment[] {
  if (!equipped || typeof equipped !== 'object') return [];
  const byKey = new Map<string, SkinAttachment>();
  for (const [slotKey, cfg] of Object.entries(equipped)) {
    if (!isSkinCosmeticSlot(slotKey)) continue;
    const preset = parseSkinConfig(cfg);
    if (!preset?.attachments?.length) continue;
    for (const att of preset.attachments) {
      byKey.set(attachmentKey(att), att);
    }
  }
  return Array.from(byKey.values());
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
