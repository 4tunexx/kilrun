/**
 * Scan optional local model_skins/ → copy FBX+PNG into public/game/skins/ → write manifest.json
 * Optionally upsert Prisma Asset rows when DATABASE_URL is set.
 *
 * Usage: npm run db:seed-assets
 *
 * model_skins/ is gitignored (Unity source dump). Runtime ships public/game/skins/ only.
 * Keep a local copy of model_skins if you need to re-import FBX/PNG from the pack.
 *
 * IMPORTANT: Every FBX in this pack references a shared atlas named `Textures.png`
 * (source file is `model_skins/Texture.png`). We copy it into each category folder
 * so FBXLoader relative paths resolve.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assetIdFromFilename,
  classifyAssetFilename,
  displayNameFromFilename,
  type AssetRegistryEntry,
  type CharacterAssetManifest,
} from '../src/lib/asset-registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'model_skins');
const DEST = path.join(ROOT, 'public', 'game', 'skins');

/** Shared UV atlas (pack names it Texture.png; FBX embeds Textures.png). */
const SHARED_ATLAS_SRC = 'Texture.png';
const SHARED_ATLAS_DEST = 'Textures.png';

/**
 * Pack layout: 6 colors × 3 mesh variants = Body_001..018.png
 * Blue_001→001, Blue_002→002, Blue_003→003,
 * Brown_001→004 … Yellow_003→018
 */
const BODY_COLOR_ORDER = ['blue', 'brown', 'orange', 'red', 'white', 'yellow'] as const;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src: string, dest: string) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function installSharedAtlas(folders: string[]) {
  const src = path.join(SOURCE, SHARED_ATLAS_SRC);
  if (!fs.existsSync(src)) {
    console.warn(`Missing ${SHARED_ATLAS_SRC} — FBX materials will be untextured / pink.`);
    return;
  }
  copyFile(src, path.join(DEST, SHARED_ATLAS_DEST));
  copyFile(src, path.join(DEST, SHARED_ATLAS_SRC));
  for (const folder of folders) {
    copyFile(src, path.join(DEST, folder, SHARED_ATLAS_DEST));
    copyFile(src, path.join(DEST, folder, SHARED_ATLAS_SRC));
  }
  console.log(`Installed shared atlas → Textures.png in ${folders.length + 1} locations`);
}

function bodyFallbackThumb(base: string): string {
  const m = base.match(/^Body_([A-Za-z]+)_(\d+)$/i);
  if (m) {
    const key = m[1]!.toLowerCase();
    const variant = Math.max(1, Math.min(3, parseInt(m[2]!, 10) || 1));
    const colorIndex = BODY_COLOR_ORDER.indexOf(key as (typeof BODY_COLOR_ORDER)[number]);
    if (colorIndex >= 0) {
      const sheetNum = colorIndex * 3 + variant; // 1..18
      return `bodies/Body_${String(sheetNum).padStart(3, '0')}.png`;
    }
  }
  if (/^Basic_Character/i.test(base)) return `bodies/Body_001.png`;
  return SHARED_ATLAS_DEST;
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source folder: ${SOURCE}`);
    process.exit(1);
  }

  ensureDir(DEST);
  const files = fs.readdirSync(SOURCE);
  const fbxFiles = files.filter((f) => f.toLowerCase().endsWith('.fbx'));
  const pngSet = new Set(files.filter((f) => f.toLowerCase().endsWith('.png')));

  const folders = new Set<string>();
  const assets: AssetRegistryEntry[] = [];
  let copied = 0;
  let skipped = 0;

  for (const fbx of fbxFiles) {
    const classified = classifyAssetFilename(fbx);
    if (!classified) {
      skipped += 1;
      continue;
    }
    folders.add(classified.folder);
    const id = assetIdFromFilename(fbx);
    const base = fbx.replace(/\.fbx$/i, '');
    const matchingPng = pngSet.has(`${base}.png`) ? `${base}.png` : '';

    const modelRel = `${classified.folder}/${fbx}`;
    // Matching PNG is a 128px shop/admin icon — never the mesh UV atlas.
    // Characters_7 FBXs all sample Textures.png in their folder.
    const thumbRel = matchingPng
      ? `${classified.folder}/${matchingPng}`
      : classified.category === 'body'
        ? bodyFallbackThumb(base)
        : `${classified.folder}/${SHARED_ATLAS_DEST}`;
    const textureRel = `${classified.folder}/${SHARED_ATLAS_DEST}`;

    copyFile(path.join(SOURCE, fbx), path.join(DEST, modelRel));
    copied += 1;
    if (matchingPng) {
      copyFile(path.join(SOURCE, matchingPng), path.join(DEST, `${classified.folder}/${matchingPng}`));
    }

    assets.push({
      id,
      name: base,
      displayName: displayNameFromFilename(fbx),
      category: classified.category,
      rarity: classified.category === 'fullbody' ? 'rare' : 'common',
      price: classified.category === 'fullbody' ? 500 : 0,
      currency: 'vp',
      modelPath: `/game/skins/${modelRel}`,
      texturePath: `/game/skins/${textureRel}`,
      previewPath: `/game/skins/${thumbRel}`,
      thumbnailPath: `/game/skins/${thumbRel}`,
      enabled: true,
      hidden: false,
      featured: classified.category === 'fullbody',
      shopVisible: false,
      equipSlot: classified.equipSlot,
      tags: [classified.category, classified.folder],
      sortOrder: assets.length,
    });
  }

  for (const png of files.filter((f) => /^Body_\d+\.png$/i.test(f))) {
    copyFile(path.join(SOURCE, png), path.join(DEST, 'bodies', png));
  }

  installSharedAtlas(Array.from(folders));

  const manifest: CharacterAssetManifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    assets,
  };
  fs.writeFileSync(path.join(DEST, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(
    `Seeded ${assets.length} assets (${copied} FBX copied, ${skipped} skipped). Manifest → public/game/skins/manifest.json`
  );

  void upsertPrisma(assets).catch((err) => {
    console.warn('Prisma Asset upsert skipped/failed:', err instanceof Error ? err.message : err);
  });
}

async function upsertPrisma(assets: AssetRegistryEntry[]) {
  if (!process.env.DATABASE_URL && !process.env.MONGODB_URI) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config({ path: path.join(ROOT, '.env') });
      dotenv.config({ path: path.join(ROOT, '.env.local') });
    } catch {
      /* optional */
    }
  }
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL — skipped Prisma Asset upsert (manifest-only).');
    return;
  }

  const { PrismaClient } = await import('../src/generated/prisma/index.js');
  const prisma = new PrismaClient();
  try {
    let n = 0;
    for (const a of assets) {
      await prisma.asset.upsert({
        where: { assetId: a.id },
        create: {
          assetId: a.id,
          name: a.name,
          displayName: a.displayName,
          category: a.category,
          rarity: a.rarity,
          price: a.price,
          currency: a.currency,
          modelPath: a.modelPath,
          texturePath: a.texturePath,
          previewUrl: a.previewPath,
          thumbnailUrl: a.thumbnailPath,
          enabled: a.enabled,
          hidden: a.hidden,
          featured: a.featured,
          shopVisible: a.shopVisible,
          equipSlot: a.equipSlot,
          tags: a.tags,
          sortOrder: a.sortOrder ?? 0,
        },
        update: {
          name: a.name,
          displayName: a.displayName,
          category: a.category,
          modelPath: a.modelPath,
          texturePath: a.texturePath,
          previewUrl: a.previewPath,
          thumbnailUrl: a.thumbnailPath,
          equipSlot: a.equipSlot,
          tags: a.tags,
        },
      });
      n += 1;
    }
    console.log(`Upserted ${n} Asset rows in MongoDB.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
