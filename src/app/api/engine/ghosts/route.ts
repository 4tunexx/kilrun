import { NextRequest } from 'next/server';
import { engineJson, engineOptions, requireEngineStaff } from '@/lib/engine/engine-api';
import { getMapWorldRecord, submitGhostRunForUser, type GhostSample } from '@/lib/ghost-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const mapId = req.nextUrl.searchParams.get('mapId')?.trim() || '';
    const wr = mapId ? await getMapWorldRecord(mapId) : null;
    return engineJson(req, { ok: true, record: wr });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load ghost';
    const status = /staff only|not authenticated|session expired/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const staff = await requireEngineStaff(req);
    const body = (await req.json()) as {
      mapId?: string;
      finishMs?: number;
      samples?: GhostSample[];
    };
    if (!body.mapId || !body.samples?.length || !body.finishMs) {
      return engineJson(req, { ok: false, error: 'Invalid ghost' }, 400);
    }
    const result = await submitGhostRunForUser(staff, {
      mapId: body.mapId,
      finishMs: body.finishMs,
      samples: body.samples,
    });
    return engineJson(req, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save ghost';
    const status = /staff only|not authenticated|Sign in/i.test(message) ? 401 : 400;
    return engineJson(req, { ok: false, error: message }, status);
  }
}
