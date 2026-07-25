/**
 * Character cosmetic asset registry — types + client helpers.
 * Runtime source of truth is DB (Asset) when available; editors also use
 * /game/skins/manifest.json so the Map / Model / Player editors see every pack model offline.
 */

export type AssetCategory =
  | 'body'
  | 'fullbody'
  | 'hat'
  | 'hair'
  | 'glasses'
  | 'glove'
  | 'backpack'
  | 'mustache'
  | 'outerwear'
  | 'pants'
  | 'shoe'
  | 'eyebrow'
  | 'other';

export type AssetRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface AssetRegistryEntry {
  id: string;
  name: string;
  displayName: string;
  category: AssetCategory;
  rarity: AssetRarity;
  price: number;
  currency: 'vp' | 'premium';
  modelPath: string;
  texturePath: string;
  previewPath?: string;
  thumbnailPath?: string;
  enabled: boolean;
  hidden: boolean;
  featured: boolean;
  shopVisible: boolean;
  equipSlot: string;
  tags: string[];
  sortOrder?: number;
}

export interface CharacterAssetManifest {
  version: number;
  generatedAt: string;
  assets: AssetRegistryEntry[];
}

export const CHARACTER_SKINS_BASE = '/game/skins';
export const CHARACTER_MANIFEST_URL = `${CHARACTER_SKINS_BASE}/manifest.json`;

/** Filename prefix → category + equip slot. */
export const ASSET_PREFIX_RULES: {
  test: RegExp;
  category: AssetCategory;
  folder: string;
  equipSlot: string;
}[] = [
  { test: /^FullBody_/i, category: 'fullbody', folder: 'fullbody', equipSlot: 'skin_fullbody' },
  { test: /^Body_/i, category: 'body', folder: 'bodies', equipSlot: 'skin_body' },
  { test: /^Hat_/i, category: 'hat', folder: 'hats', equipSlot: 'skin_hat' },
  { test: /^Hair_/i, category: 'hair', folder: 'hair', equipSlot: 'skin_hair' },
  { test: /^Glasses_/i, category: 'glasses', folder: 'glasses', equipSlot: 'skin_glasses' },
  { test: /^Glass_/i, category: 'glasses', folder: 'glasses', equipSlot: 'skin_glasses' },
  { test: /^Glove_/i, category: 'glove', folder: 'gloves', equipSlot: 'skin_gloves' },
  { test: /^Backpack_/i, category: 'backpack', folder: 'backpacks', equipSlot: 'skin_back' },
  { test: /^Mustache_/i, category: 'mustache', folder: 'mustaches', equipSlot: 'skin_mustache' },
  { test: /^Outerwear_/i, category: 'outerwear', folder: 'outerwear', equipSlot: 'skin_torso' },
  { test: /^Pants_/i, category: 'pants', folder: 'pants', equipSlot: 'skin_pants' },
  { test: /^Shoe_/i, category: 'shoe', folder: 'shoes', equipSlot: 'skin_boots' },
  { test: /^Eyebrow_/i, category: 'eyebrow', folder: 'eyebrows', equipSlot: 'skin_eyebrow' },
  { test: /^Basic_Character/i, category: 'body', folder: 'bodies', equipSlot: 'skin_body' },
];

export function classifyAssetFilename(filename: string): {
  category: AssetCategory;
  folder: string;
  equipSlot: string;
} | null {
  const base = filename.replace(/\.[^.]+$/, '');
  for (const rule of ASSET_PREFIX_RULES) {
    if (rule.test.test(base)) {
      return { category: rule.category, folder: rule.folder, equipSlot: rule.equipSlot };
    }
  }
  return null;
}

export function assetIdFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function displayNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .replace(/^(FullBody|Body|Hat|Hair|Glasses|Glass|Glove|Backpack|Mustache|Outerwear|Pants|Shoe|Eyebrow)_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || base;
}

let manifestCache: CharacterAssetManifest | null = null;
let manifestPromise: Promise<CharacterAssetManifest | null> | null = null;

export async function loadCharacterAssetManifest(
  force = false
): Promise<CharacterAssetManifest | null> {
  if (!force && manifestCache) return manifestCache;
  if (!force && manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const res = await fetch(CHARACTER_MANIFEST_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as CharacterAssetManifest;
      if (!data?.assets || !Array.isArray(data.assets)) return null;
      manifestCache = data;
      return data;
    } catch {
      return null;
    } finally {
      manifestPromise = null;
    }
  })();
  return manifestPromise;
}

export function getCachedCharacterAssets(): AssetRegistryEntry[] {
  return manifestCache?.assets ?? [];
}

export async function listCharacterAssets(opts?: {
  category?: AssetCategory | AssetCategory[];
  enabledOnly?: boolean;
}): Promise<AssetRegistryEntry[]> {
  const man = await loadCharacterAssetManifest();
  let assets = man?.assets ?? [];
  if (opts?.enabledOnly !== false) {
    assets = assets.filter((a) => a.enabled && !a.hidden);
  }
  if (opts?.category) {
    const cats = Array.isArray(opts.category) ? opts.category : [opts.category];
    assets = assets.filter((a) => cats.includes(a.category));
  }
  return assets;
}

export function characterAssetModelUrl(entry: Pick<AssetRegistryEntry, 'modelPath'>): string {
  if (entry.modelPath.startsWith('/')) return entry.modelPath;
  return `${CHARACTER_SKINS_BASE}/${entry.modelPath.replace(/^\//, '')}`;
}

/** Categories useful in Player / Model editors (bodies + premium + accessories). */
export const EDITOR_CHARACTER_CATEGORIES: AssetCategory[] = [
  'fullbody',
  'body',
  'hat',
  'hair',
  'glasses',
  'glove',
  'backpack',
  'mustache',
  'outerwear',
  'pants',
  'shoe',
];
