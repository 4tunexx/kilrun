/**
 * Shared GameMap publish/list used by website server actions and the
 * Kilrun Engine HTTP API. Not a `'use server'` file — callers must
 * authenticate first.
 */
import { prisma } from '@/lib/prisma';
import { persistSiteImage } from '@/lib/site-asset-upload';
import { normalizeKilrunMode, type KilrunMode } from '@/lib/game-modes';
import { MAP_PUBLISH_MAX_BYTES } from '@/lib/map-publish-limits';
import type { MapDocument } from '@/components/game/editor/map-document';

export type CloudMapListItem = {
  id: string;
  localId: string | null;
  name: string;
  mode: KilrunMode;
  thumbnailUrl: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type CloudMapDocumentRow = CloudMapListItem & {
  document: MapDocument;
};

export function stripInlineDataUrls(doc: MapDocument): { doc: MapDocument; strippedKeys: string[] } {
  const clone = JSON.parse(JSON.stringify(doc)) as MapDocument;
  const isStrippableDataUrl = (v: unknown): v is string =>
    typeof v === 'string' && v.startsWith('data:') && v.length > 8_000;
  const strippedKeys = new Set<string>();

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const key of Object.keys(node as Record<string, unknown>)) {
      const rec = node as Record<string, unknown>;
      const value = rec[key];
      if (isStrippableDataUrl(value)) {
        strippedKeys.add(key);
        delete rec[key];
      } else if (value && typeof value === 'object') {
        walk(value);
      }
    }
  };

  walk(clone);
  return { doc: clone, strippedKeys: [...strippedKeys] };
}

export function throwIfInlineAssetsStripped(strippedKeys: string[]): void {
  if (!strippedKeys.length) return;
  const unique = [...new Set(strippedKeys)];
  throw new Error(
    `Map still has inline files (${unique.join(', ')}). Upload those GLBs/textures to the live site (Build → Link live game), then publish.`
  );
}

export async function publishCloudMapAsStaff(
  staff: { id: string },
  input: {
    localId?: string;
    name: string;
    mode: string;
    document: MapDocument;
    thumbnailDataUrl?: string | null;
    setActive?: boolean;
  }
): Promise<CloudMapListItem> {
  const mode = normalizeKilrunMode(input.mode);
  const { doc: cleaned, strippedKeys } = stripInlineDataUrls(input.document);
  throwIfInlineAssetsStripped(strippedKeys);
  const documentJson = JSON.stringify(cleaned);
  if (documentJson.length > MAP_PUBLISH_MAX_BYTES) {
    throw new Error(
      'Map is too large to publish. Upload custom GLBs/textures to the live site (not inline data URLs), then retry.'
    );
  }

  let thumbnailUrl: string | null | undefined = undefined;
  if (input.thumbnailDataUrl) {
    try {
      thumbnailUrl = await persistSiteImage(input.thumbnailDataUrl, 'misc');
    } catch (err) {
      console.warn('[publishCloudMap] thumb persist failed', err);
      thumbnailUrl = null;
    }
  }

  // The existing-row lookup and the write must happen in the SAME
  // transaction, for every path — not only when setActive is true. Two
  // concurrent publishes for the same (localId, mode) — a real "Set as
  // MAIN" plus a stray draft-sync autosave, say — used to each read
  // `existing.isActive` outside any transaction and could commit out of
  // order, so the draft-sync's stale, non-transactional write could land
  // last and silently flip a just-published MAIN map back to inactive.
  const row = await prisma.$transaction(async (tx) => {
    const existing = input.localId
      ? await tx.gameMap.findFirst({ where: { localId: input.localId, mode } })
      : null;
    const resolvedIsActive = input.setActive === true ? true : Boolean(existing?.isActive);
    const data = {
      name: input.name.trim() || 'Untitled map',
      mode,
      documentJson,
      ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
      isActive: resolvedIsActive,
      createdById: staff.id,
      localId: input.localId ?? existing?.localId ?? null,
    };
    if (input.setActive) {
      await tx.gameMap.updateMany({
        where: { mode, isActive: true },
        data: { isActive: false },
      });
    }
    return existing
      ? tx.gameMap.update({ where: { id: existing.id }, data })
      : tx.gameMap.create({ data });
  });

  return {
    id: row.id,
    localId: row.localId,
    name: row.name,
    mode: normalizeKilrunMode(row.mode),
    thumbnailUrl: row.thumbnailUrl,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setActiveCloudMapForStaff(mapId: string, mode: string): Promise<{ ok: true }> {
  const normalized = normalizeKilrunMode(mode);
  const map = await prisma.gameMap.findUnique({ where: { id: mapId } });
  if (!map || normalizeKilrunMode(map.mode) !== normalized) {
    throw new Error('Map not found for this mode');
  }
  await prisma.$transaction([
    prisma.gameMap.updateMany({
      where: { mode: normalized, isActive: true },
      data: { isActive: false },
    }),
    prisma.gameMap.update({
      where: { id: mapId },
      data: { isActive: true },
    }),
  ]);
  return { ok: true };
}

export async function listCloudMapDocumentsForStaff(mode: string): Promise<CloudMapDocumentRow[]> {
  const normalized = normalizeKilrunMode(mode);
  const rows = await prisma.gameMap.findMany({
    where: { mode: normalized },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    take: 40,
  });
  const out: CloudMapDocumentRow[] = [];
  for (const row of rows) {
    try {
      const document = JSON.parse(row.documentJson) as MapDocument;
      out.push({
        id: row.id,
        localId: row.localId,
        name: row.name,
        mode: normalizeKilrunMode(row.mode),
        thumbnailUrl: row.thumbnailUrl,
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
        document,
      });
    } catch (err) {
      console.warn(`[listCloudMapDocuments] corrupt documentJson for map ${row.id}`, err);
    }
  }
  return out;
}
