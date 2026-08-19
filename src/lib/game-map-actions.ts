'use server';

/**
 * Cloud-published match maps — active map per mode for all clients.
 * Local editor drafts remain in browser localStorage.
 */
import { unstable_noStore as noStore } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { normalizeKilrunMode, type KilrunMode } from '@/lib/game-modes';
import type { MapDocument } from '@/components/game/editor/map-document';
import {
  listCloudMapDocumentsForStaff,
  publishCloudMapAsStaff,
  setActiveCloudMapForStaff,
  type CloudMapDocumentRow,
  type CloudMapListItem,
} from '@/lib/game-map-core';

export type { CloudMapDocumentRow, CloudMapListItem };

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

export async function publishCloudMap(input: {
  localId?: string;
  name: string;
  mode: string;
  document: MapDocument;
  thumbnailDataUrl?: string | null;
  setActive?: boolean;
}): Promise<CloudMapListItem> {
  const staff = await requireStaff();
  return publishCloudMapAsStaff(staff, input);
}

export async function setActiveCloudMap(mapId: string, mode: string): Promise<{ ok: true }> {
  await requireStaff();
  return setActiveCloudMapForStaff(mapId, mode);
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

/**
 * Staff: pull full map documents for editor hydrate across devices.
 * Caps at 40 newest maps for the mode to keep payloads reasonable.
 */
export async function listCloudMapDocuments(
  mode: string
): Promise<CloudMapDocumentRow[]> {
  await requireStaff();
  return listCloudMapDocumentsForStaff(mode);
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
  } catch (err) {
    console.warn(`[getCloudMapDocument] corrupt documentJson for map ${mapId}`, err);
    return null;
  }
}

/** Public: active cloud map document for a mode (used by match clients). */
export async function getActiveCloudMapDocument(
  mode: string
): Promise<{
  id: string;
  localId: string | null;
  name: string;
  document: MapDocument;
  thumbnailUrl: string | null;
  updatedAt: string;
} | null> {
  noStore();
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
      localId: row.localId,
      name: row.name,
      document,
      thumbnailUrl: row.thumbnailUrl,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    // This is the LIVE map served to match clients — a corrupt row here
    // means the mode silently has no active map for every player, with
    // nothing surfaced anywhere. Log loudly so it's actually discoverable.
    console.error(
      `[getActiveCloudMapDocument] corrupt documentJson for active map ${row.id} (mode=${normalized}) — matches for this mode have no map right now`,
      err
    );
    return null;
  }
}

export async function deleteCloudMap(mapId: string, force = false): Promise<{ ok: true }> {
  await requireStaff();
  const map = await prisma.gameMap.findUnique({ where: { id: mapId } });
  if (map?.isActive && !force) {
    throw new Error(
      `"${map.name}" is the live Active map for ${map.mode} — matches would have no map until another is activated. Pass force to delete anyway.`
    );
  }
  await prisma.gameMap.delete({ where: { id: mapId } });
  return { ok: true };
}

/**
 * Remove every cloud copy of a map (same local id, mongo id, or name in this
 * mode). Needed because a map can exist as several GameMap rows — e.g. the
 * Observation Deck seed script inserts with no localId, then the editor
 * publishes another row with a localId. Deleting only one left the other
 * for hydrateCloudMapsIntoLocal to restore on the next mode-open.
 */
export async function deleteCloudMapsMatching(input: {
  mode: string;
  localId: string;
  name: string;
}): Promise<{ deleted: number; names: string[] }> {
  await requireStaff();
  const mode = normalizeKilrunMode(input.mode);
  const localId = input.localId.trim();
  const name = input.name.trim();
  const or: Array<{ localId: string } | { id: string } | { name: string }> = [];
  if (localId) or.push({ localId });
  if (/^[a-f0-9]{24}$/i.test(localId)) or.push({ id: localId });
  if (name) or.push({ name });
  if (!or.length) return { deleted: 0, names: [] };

  const rows = await prisma.gameMap.findMany({ where: { mode, OR: or } });
  if (!rows.length) return { deleted: 0, names: [] };

  await prisma.gameMap.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  return { deleted: rows.length, names: [...new Set(rows.map((r) => r.name))] };
}

/**
 * Duplicate a cloud map into a new editable cloud row (co-edit precursor).
 * Returns the new map id; client can hydrate locally via listCloudMapDocuments.
 */
export async function forkCloudMap(
  mapId: string,
  newName?: string
): Promise<CloudMapListItem> {
  const staff = await requireStaff();
  const src = await prisma.gameMap.findUnique({ where: { id: mapId } });
  if (!src) throw new Error('Map not found');
  const localId = `fork_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const name = (newName?.trim() || `${src.name} (fork)`).slice(0, 120);

  // Keep the embedded MapDocument.name in sync with the row's `name` column —
  // otherwise anything reading `document.name` out of the JSON blob (as
  // opposed to the row field) after a fork shows the original map's name
  // forever, even though the row itself was renamed.
  let documentJson = src.documentJson;
  try {
    const parsed = JSON.parse(src.documentJson) as MapDocument & { name?: string };
    parsed.name = name;
    documentJson = JSON.stringify(parsed);
  } catch {
    /* if the source doc is already corrupt, fall back to copying it as-is */
  }

  const row = await prisma.gameMap.create({
    data: {
      name,
      mode: src.mode,
      documentJson,
      thumbnailUrl: src.thumbnailUrl,
      isActive: false,
      createdById: staff.id,
      localId,
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
