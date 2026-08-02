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

/** Strip oversized inline data-URLs so cloud publish stays under the size cap.
 * Prefer `/game/...` asset paths or uploaded URLs instead of embedding GLBs.
 *
 * This walks the ENTIRE document tree rather than special-casing specific
 * fields (customModelUrl / playerSkins[].textureUrl, etc). The previous
 * version only stripped those two spots, silently leaving every other
 * data-URL-bearing field untouched — entity.textureUrl, spinHazard model/
 * texture, monsterSpawn.modelUrl, weaponDef custom model/texture, shop item/
 * skin textures, environment sky textures. Any of those can independently
 * hold a multi-MB inline data URL and blow the size cap with no way for the
 * strip step to help, since it never looked at them. A generic walk means
 * newly-added fields are covered automatically instead of needing this
 * function updated every time the schema grows. */
function stripInlineDataUrls(doc: MapDocument): { doc: MapDocument; strippedKeys: string[] } {
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
        // Some of these fields (e.g. MapShopSkin.textureUrl) are required —
        // deleting them entirely would break rendering worse than leaving an
        // oversized value in place. Report which field names got stripped so
        // the size-cap error (below) can point staff at the actual cause
        // instead of always blaming "GLBs".
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
  const { doc: cleaned, strippedKeys } = stripInlineDataUrls(input.document);
  const documentJson = JSON.stringify(cleaned);
  if (documentJson.length > 4_500_000) {
    const hint = strippedKeys.length
      ? ` Large inline data (${strippedKeys.join(', ')}) was already stripped from optional fields and it's still too big — some of those may be on required fields (e.g. shop skin textures) that couldn't be removed.`
      : '';
    throw new Error(
      `Map is too large to publish. Move custom GLBs/textures to /public/game/... URLs (not inline data URLs), then retry.${hint}`
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

  const existing = input.localId
    ? await prisma.gameMap.findFirst({
        where: { localId: input.localId, mode },
      })
    : null;

  // IMPORTANT: `setActive: false` means "don't explicitly activate this save" —
  // it must NEVER deactivate a map that is already the live Active map for its
  // mode. Only `setActive: true` may change active status (and it deactivates
  // any previous Active map for the mode above). A routine editor "Save"
  // passes `setActive: false` and previously stomped `isActive` back to false
  // even for the currently-Active map, silently un-publishing it from live
  // matches on every save — that was the regression. Preserve existing
  // isActive unless the caller explicitly asked to activate.
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

  // The "deactivate every other map for this mode" step and the upsert of
  // this row must be atomic — two staff publishing/activating for the same
  // mode at the same time could otherwise interleave and leave the mode with
  // zero or two active maps (getActiveCloudMapDocument only ever returns one,
  // so a match could silently get no map, or the wrong one). $transaction
  // runs both statements against the same session so they can't interleave
  // with another concurrent call's statements.
  const row = input.setActive
    ? await prisma.$transaction(async (tx) => {
        await tx.gameMap.updateMany({
          where: { mode, isActive: true },
          data: { isActive: false },
        });
        return existing
          ? tx.gameMap.update({ where: { id: existing.id }, data: { ...data, isActive: true } })
          : tx.gameMap.create({ data: { ...data, isActive: true } });
      })
    : existing
      ? await prisma.gameMap.update({
          where: { id: existing.id },
          data: { ...data, isActive: resolvedIsActive },
        })
      : await prisma.gameMap.create({ data: { ...data, isActive: false } });

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
    } catch (err) {
      // A corrupt row used to disappear from the list with zero trace —
      // the admin panel would then tell staff "No cloud maps for this mode
      // yet", actively misleading them into thinking nothing was ever
      // published when in fact a row exists but failed to parse.
      console.warn(`[listCloudMapDocuments] corrupt documentJson for map ${row.id}`, err);
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
  } catch (err) {
    console.warn(`[getCloudMapDocument] corrupt documentJson for map ${mapId}`, err);
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
