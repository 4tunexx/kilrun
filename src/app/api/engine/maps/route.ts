import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import {
  listCloudMapDocumentsForStaff,
  publishCloudMapAsStaff,
  setActiveCloudMapForStaff,
} from '@/lib/game-map-core';
import type { MapDocument } from '@/components/game/editor/map-document';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const mode = req.nextUrl.searchParams.get('mode') || 'deathrun';
    const maps = await listCloudMapDocumentsForStaff(mode);
    return engineJson(req, { ok: true, maps });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list maps';
    const status =
      /staff only|not authenticated|session expired/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const body = (await req.json()) as {
      id?: string;
      localId?: string;
      name?: string;
      mode?: string;
      document?: MapDocument;
      thumbnailDataUrl?: string | null;
      setActive?: boolean;
    };
    const mode = body.mode || 'deathrun';

    if (body.document) {
      const map = await publishCloudMapAsStaff(staff, {
        localId: body.localId,
        name: body.name || body.document.name || 'Untitled map',
        mode,
        document: body.document,
        thumbnailDataUrl: body.thumbnailDataUrl,
        setActive: body.setActive,
      });
      return engineJson(req, { ok: true, map });
    }

    if (body.id && body.setActive) {
      await setActiveCloudMapForStaff(body.id, mode);
      return engineJson(req, { ok: true });
    }

    return engineJson(req, { ok: false, error: 'Map document required' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    const status =
      message === 'Staff only' || message === 'Not authenticated' || message.startsWith('Engine session')
        ? 401
        : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
