'use server';

/**
 * Cloud prefab library — staff-shared stamps for the map editor.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import type { EditorEntity } from '@/components/game/editor/map-document';
import { persistSiteImage } from '@/lib/site-asset-upload';

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Staff only');
  }
  return user;
}

export type CloudPrefabRow = {
  id: string;
  localId: string | null;
  name: string;
  mode: string;
  updatedAt: string;
  entityCount: number;
  thumbnailUrl?: string | null;
};

function stripHeavyEntity(e: EditorEntity): EditorEntity {
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

export async function listCloudPrefabs(mode?: string): Promise<CloudPrefabRow[]> {
  await requireStaff();
  const rows = await prisma.gamePrefab.findMany({
    where: mode ? { OR: [{ mode: '' }, { mode }] } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 80,
  });
  return rows.map((r) => {
    let entityCount = 0;
    try {
      entityCount = (JSON.parse(r.entitiesJson) as unknown[]).length;
    } catch {
      entityCount = 0;
    }
    return {
      id: r.id,
      localId: r.localId,
      name: r.name,
      mode: r.mode,
      updatedAt: r.updatedAt.toISOString(),
      entityCount,
      thumbnailUrl: r.thumbnailUrl,
    };
  });
}

export async function getCloudPrefabEntities(prefabId: string): Promise<EditorEntity[]> {
  await requireStaff();
  const row = await prisma.gamePrefab.findUnique({ where: { id: prefabId } });
  if (!row) throw new Error('Prefab not found');
  try {
    return JSON.parse(row.entitiesJson) as EditorEntity[];
  } catch {
    throw new Error('Corrupt prefab');
  }
}

export async function publishCloudPrefab(input: {
  localId?: string;
  name: string;
  mode?: string;
  entities: EditorEntity[];
  /** Optional WebGL/data-URL thumb — persisted to CDN/blob when possible. */
  thumbnailDataUrl?: string | null;
}): Promise<CloudPrefabRow> {
  const staff = await requireStaff();
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
    createdById: staff.id,
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
  };

  const existing = input.localId
    ? await prisma.gamePrefab.findFirst({ where: { localId: input.localId } })
    : null;

  const row = existing
    ? await prisma.gamePrefab.update({ where: { id: existing.id }, data })
    : await prisma.gamePrefab.create({ data });

  return {
    id: row.id,
    localId: row.localId,
    name: row.name,
    mode: row.mode,
    updatedAt: row.updatedAt.toISOString(),
    entityCount: cleaned.length,
    thumbnailUrl: row.thumbnailUrl,
  };
}

export async function deleteCloudPrefab(prefabId: string): Promise<{ ok: true }> {
  await requireStaff();
  await prisma.gamePrefab.delete({ where: { id: prefabId } });
  return { ok: true };
}
