import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import type { EditorEntity } from '@/components/game/editor/map-document';
import {
  deleteCloudPrefabForStaff,
  getCloudPrefabEntitiesForStaff,
  listCloudPrefabsForStaff,
  publishCloudPrefabAsStaff,
} from '@/lib/game-prefab-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

function staffStatus(message: string) {
  if (/staff only|not authenticated|session expired/i.test(message)) return 401;
  if (/not found/i.test(message)) return 404;
  return 400;
}

export async function GET(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const entities = await getCloudPrefabEntitiesForStaff(id);
      return engineJson(req, { ok: true, entities });
    }
    const mode = req.nextUrl.searchParams.get('mode') || undefined;
    const prefabs = await listCloudPrefabsForStaff(mode);
    return engineJson(req, { ok: true, prefabs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list prefabs';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const body = (await req.json()) as {
      localId?: string;
      name?: string;
      mode?: string;
      entities?: EditorEntity[];
      thumbnailDataUrl?: string | null;
    };
    const prefab = await publishCloudPrefabAsStaff(staff.id, {
      localId: body.localId,
      name: body.name || 'Prefab',
      mode: body.mode,
      entities: body.entities ?? [],
      thumbnailDataUrl: body.thumbnailDataUrl,
    });
    return engineJson(req, { ok: true, prefab });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const id = req.nextUrl.searchParams.get('id') ?? '';
    if (!id) return engineJson(req, { ok: false, error: 'id is required' }, 400);
    await deleteCloudPrefabForStaff(id);
    return engineJson(req, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}
