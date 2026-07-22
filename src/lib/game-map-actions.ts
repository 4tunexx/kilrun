'use server';

/**
 * Cloud-published match maps — active map per mode for all clients.
 * Local editor drafts remain in browser localStorage.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { persistSiteImage } from '@/lib/site-asset-upload';
import { normalizeKilrunMode, type KilrunMode } from '@/lib/game-modes';
import type { MapDocument } from '@/components/game/editor/map-document';

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

export type CloudMapListItem = {
  id: string;
  localId: string | null;
  name: string;
  mode: KilrunMode;
  thumbnailUrl: string | null;
  isActive: boolean;
  updatedAt: string;
};

/** Publish (or update) a map document to Mongo and optionally mark it Active for the mode. */
export async function publishCloudMap(input: {
  localId?: string;
  name: string;
  mode: string;
  document: MapDocument;
  thumbnailDataUrl?: string | null;
  setActive?: boolean;
}): Promise<CloudMapListItem> {
  const staff = await requireStaff();
  const mode = normalizeKilrunMode(input.mode);
  const documentJson = JSON.stringify(input.document);
  if (documentJson.length > 4_500_000) {
    throw new Error('Map is too large to publish to cloud. Reduce custom GLB/data URLs first.');
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

  const existing = input.localId
    ? await prisma.gameMap.findFirst({
        where: { localId: input.localId, mode },
      })
    : null;

  if (input.setActive) {
    await prisma.gameMap.updateMany({
      where: { mode, isActive: true },
      data: { isActive: false },
    });
  }

  const data = {
    name: input.name.trim() || 'Untitled map',
    mode,
    documentJson,
    ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
    isActive: Boolean(input.setActive) || Boolean(existing?.isActive && input.setActive !== false),
    createdById: staff.id,
    localId: input.localId ?? existing?.localId ?? null,
  };

  const row = existing
    ? await prisma.gameMap.update({
        where: { id: existing.id },
        data: {
          ...data,
          isActive: input.setActive === undefined ? existing.isActive : Boolean(input.setActive),
        },
      })
    : await prisma.gameMap.create({
        data: {
          ...data,
          isActive: Boolean(input.setActive),
        },
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

export async function setActiveCloudMap(mapId: string, mode: string): Promise<{ ok: true }> {
  await requireStaff();
  const normalized = normalizeKilrunMode(mode);
  const map = await prisma.gameMap.findUnique({ where: { id: mapId } });
  if (!map || normalizeKilrunMode(map.mode) !== normalized) {
    throw new Error('Map not found for this mode');
  }
  await prisma.gameMap.updateMany({
    where: { mode: normalized, isActive: true },
    data: { isActive: false },
  });
  await prisma.gameMap.update({
    where: { id: mapId },
    data: { isActive: true },
  });
  return { ok: true };
}

export async function listCloudMaps(mode?: string): Promise<CloudMapListItem[]> {
  await requireStaff();
  const where = mode ? { mode: normalizeKilrunMode(mode) } : {};
  const rows = await prisma.gameMap.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    take: 80,
  });
  return rows.map((row) => ({
    id: row.id,
    localId: row.localId,
    name: row.name,
    mode: normalizeKilrunMode(row.mode),
    thumbnailUrl: row.thumbnailUrl,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export type CloudMapDocumentRow = CloudMapListItem & {
  document: MapDocument;
};

/**
 * Staff: pull full map documents for editor hydrate across devices.
 * Caps at 40 newest maps for the mode to keep payloads reasonable.
 */
export async function listCloudMapDocuments(
  mode: string
): Promise<CloudMapDocumentRow[]> {
  await requireStaff();
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
    } catch {
      /* skip corrupt rows */
    }
  }
  return out;
}

/** Staff: load one cloud map document by Mongo id. */
export async function getCloudMapDocument(
  mapId: string
): Promise<CloudMapDocumentRow | null> {
  await requireStaff();
  const row = await prisma.gameMap.findUnique({ where: { id: mapId } });
  if (!row) return null;
  try {
    return {
      id: row.id,
      localId: row.localId,
      name: row.name,
      mode: normalizeKilrunMode(row.mode),
      thumbnailUrl: row.thumbnailUrl,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
      document: JSON.parse(row.documentJson) as MapDocument,
    };
  } catch {
    return null;
  }
}

/** Public: active cloud map document for a mode (used by match clients). */
export async function getActiveCloudMapDocument(
  mode: string
): Promise<{ id: string; name: string; document: MapDocument; thumbnailUrl: string | null } | null> {
  const normalized = normalizeKilrunMode(mode);
  const row = await prisma.gameMap.findFirst({
    where: { mode: normalized, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row) return null;
  try {
    const document = JSON.parse(row.documentJson) as MapDocument;
    return {
      id: row.id,
      name: row.name,
      document,
      thumbnailUrl: row.thumbnailUrl,
    };
  } catch {
    return null;
  }
}

export async function deleteCloudMap(mapId: string): Promise<{ ok: true }> {
  await requireStaff();
  await prisma.gameMap.delete({ where: { id: mapId } });
  return { ok: true };
}
