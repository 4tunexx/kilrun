import { prisma } from '@/lib/prisma';
import { persistSiteImage } from '@/lib/site-asset-upload';
import { deletePersistedAsset, persistModelFromDataUrl } from '@/lib/model-asset-core';

export type PrefabLibraryRow = {
  id: string;
  name: string;
  category: string;
  modelUrl: string;
  previewUrl: string | null;
  createdAt: string;
};

function toRow(row: {
  id: string;
  name: string;
  category: string;
  modelUrl: string;
  previewUrl: string | null;
  createdAt: Date;
}): PrefabLibraryRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    modelUrl: row.modelUrl,
    previewUrl: row.previewUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPrefabModelsForStaff(): Promise<PrefabLibraryRow[]> {
  const rows = await prisma.mapPrefabModel.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toRow);
}

export async function listPrefabModelCategoriesForStaff(): Promise<string[]> {
  const rows = await prisma.mapPrefabModel.findMany({
    select: { category: true },
    distinct: ['category'],
  });
  return rows.map((r) => r.category).sort();
}

export async function uploadPrefabModelAsStaff(
  staffId: string,
  input: {
    name: string;
    category: string;
    modelDataUrl: string;
    originalFilename?: string;
    previewDataUrl?: string;
  }
): Promise<PrefabLibraryRow> {
  const name = input.name.trim().slice(0, 80);
  const category = input.category.trim().slice(0, 40) || 'uncategorized';
  if (!name) throw new Error('Name is required');
  if (!input.modelDataUrl.startsWith('data:')) throw new Error('No model file provided');

  const modelUrl = await persistModelFromDataUrl(input.modelDataUrl, input.originalFilename);
  const previewUrl = input.previewDataUrl
    ? await persistSiteImage(input.previewDataUrl, 'misc')
    : null;

  const created = await prisma.mapPrefabModel.create({
    data: { name, category, modelUrl, previewUrl, createdById: staffId },
  });
  try {
    const { writeAuditLog } = await import('@/lib/audit');
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: { username: true },
    });
    await writeAuditLog({
      actorId: staffId,
      actorUsername: staff?.username ?? 'staff',
      action: 'upload_prefab_model',
      detail: `${created.name} (${created.category})`,
    });
  } catch (err) {
    console.error('[prefab-library] audit log failed (upload)', err);
  }
  return toRow(created);
}

/**
 * Content-hashed model/preview files can be shared by other rows (dedup) or
 * copied inline into a map/cloud-prefab's entity JSON when a prefab is
 * placed — placing one doesn't keep a live foreign key back to this row, it
 * copies the URL. So the underlying file is only safe to delete once no
 * other MapPrefabModel row, GameMap document, or GamePrefab stamp still
 * mentions the URL; otherwise deleting it would 404 a live map's model.
 */
async function isAssetUrlStillReferenced(url: string, excludePrefabId: string): Promise<boolean> {
  const [otherPrefab, mapUsing, cloudPrefabUsing] = await Promise.all([
    prisma.mapPrefabModel.findFirst({
      where: {
        id: { not: excludePrefabId },
        OR: [{ modelUrl: url }, { previewUrl: url }],
      },
      select: { id: true },
    }),
    prisma.gameMap.findFirst({
      where: { documentJson: { contains: url } },
      select: { id: true },
    }),
    prisma.gamePrefab.findFirst({
      where: { entitiesJson: { contains: url } },
      select: { id: true },
    }),
  ]);
  return Boolean(otherPrefab || mapUsing || cloudPrefabUsing);
}

export async function deletePrefabModelAsStaff(id: string, staffId: string): Promise<{ ok: true }> {
  const existing = await prisma.mapPrefabModel.findUnique({ where: { id } });
  if (!existing) throw new Error('Prefab not found');
  await prisma.mapPrefabModel.delete({ where: { id } });

  for (const url of new Set([existing.modelUrl, existing.previewUrl].filter(Boolean) as string[])) {
    if (!(await isAssetUrlStillReferenced(url, id))) {
      await deletePersistedAsset(url);
    }
  }

  try {
    const { writeAuditLog } = await import('@/lib/audit');
    const staff = await prisma.user.findUnique({
      where: { id: staffId },
      select: { username: true },
    });
    await writeAuditLog({
      actorId: staffId,
      actorUsername: staff?.username ?? 'staff',
      action: 'delete_prefab_model',
      detail: existing.name,
    });
  } catch (err) {
    console.error('[prefab-library] audit log failed (delete)', err);
  }
  return { ok: true as const };
}
