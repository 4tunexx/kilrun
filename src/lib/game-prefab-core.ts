/**
 * Cloud prefab library writes — no cookie auth. Callers (website actions /
 * Engine staff routes) authenticate first, then pass staff.id.
 */
import { prisma } from '@/lib/prisma';
import type { EditorEntity } from '@/components/game/editor/map-document';
import { persistSiteImage } from '@/lib/site-asset-upload';
import { stripHeavyEntity } from '@/lib/game-prefab-strip';

export { stripHeavyEntity } from '@/lib/game-prefab-strip';

export type CloudPrefabRow = {
  id: string;
  localId: string | null;
  name: string;
  mode: string;
  updatedAt: string;
  entityCount: number;
  thumbnailUrl?: string | null;
};

function toRow(
  r: {
    id: string;
    localId: string | null;
    name: string;
    mode: string;
    updatedAt: Date;
    entitiesJson: string;
    thumbnailUrl: string | null;
  },
  entityCount?: number
): CloudPrefabRow {
  let count = entityCount;
  if (count == null) {
    try {
      count = (JSON.parse(r.entitiesJson) as unknown[]).length;
    } catch {
      count = 0;
    }
  }
  return {
    id: r.id,
    localId: r.localId,
    name: r.name,
    mode: r.mode,
    updatedAt: r.updatedAt.toISOString(),
    entityCount: count,
    thumbnailUrl: r.thumbnailUrl,
  };
}

export async function listCloudPrefabsForStaff(mode?: string): Promise<CloudPrefabRow[]> {
  const rows = await prisma.gamePrefab.findMany({
    where: mode ? { OR: [{ mode: '' }, { mode }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 80,
  });
  return rows.map((r) => toRow(r));
}

export async function getCloudPrefabEntitiesForStaff(prefabId: string): Promise<EditorEntity[]> {
  const row = await prisma.gamePrefab.findUnique({ where: { id: prefabId } });
  if (!row) throw new Error('Prefab not found');
  try {
    return JSON.parse(row.entitiesJson) as EditorEntity[];
  } catch {
    throw new Error('Corrupt prefab');
  }
}

export async function publishCloudPrefabAsStaff(
  staffId: string,
  input: {
    localId?: string;
    name: string;
    mode?: string;
    entities: EditorEntity[];
    thumbnailDataUrl?: string | null;
  }
): Promise<CloudPrefabRow> {
  if (!input.entities?.length) throw new Error('Select entities first');
  const cleaned = input.entities.map(stripHeavyEntity);
  const entitiesJson = JSON.stringify(cleaned);
  if (entitiesJson.length > 1_500_000) {
    throw new Error('Prefab too large — use /game/... model URLs instead of inline data.');
  }

  let thumbnailUrl: string | null | undefined = undefined;
  if (input.thumbnailDataUrl) {
    try {
      thumbnailUrl = await persistSiteImage(input.thumbnailDataUrl, 'misc');
    } catch (err) {
      console.warn('[publishCloudPrefab] thumb persist failed', err);
      thumbnailUrl = null;
    }
  }

  const mode = (input.mode || '').trim();
  const data = {
    name: input.name.trim() || 'Prefab',
    mode,
    entitiesJson,
    localId: input.localId ?? null,
    createdById: staffId,
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
  };

  const existing = input.localId
    ? await prisma.gamePrefab.findFirst({ where: { localId: input.localId } })
    : null;

  const row = existing
    ? await prisma.gamePrefab.update({ where: { id: existing.id }, data })
    : await prisma.gamePrefab.create({ data });

  return toRow(row, cleaned.length);
}

export async function deleteCloudPrefabForStaff(prefabId: string): Promise<{ ok: true }> {
  await prisma.gamePrefab.delete({ where: { id: prefabId } });
  return { ok: true };
}
