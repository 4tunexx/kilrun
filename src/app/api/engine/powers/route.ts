import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import { loadPowerDefinitions } from '@/lib/power-definitions';
import { STATIC_FALLBACK_POWERS } from '@shared/power-definitions';
import {
  createPowerDefinition,
  deletePowerDefinition,
  updatePowerDefinition,
} from '@/lib/power-definitions-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

function staffStatus(message: string) {
  if (/staff only|not authenticated|session expired/i.test(message)) return 401;
  if (/not found/i.test(message)) return 404;
  if (/already exists|prerequisite/i.test(message)) return 409;
  return 400;
}

export async function GET(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const powers = await loadPowerDefinitions({ force: true });
    return engineJson(req, { ok: true, powers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load powers';
    if (/staff only|not authenticated|session expired/i.test(message)) {
      return engineJson(req, { ok: false, error: message }, 401);
    }
    return engineJson(req, { ok: true, powers: STATIC_FALLBACK_POWERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const body = await req.json().catch(() => null);
    const power = await createPowerDefinition(body);
    return engineJson(req, { ok: true, power });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const body = await req.json().catch(() => null);
    const power = await updatePowerDefinition(body);
    return engineJson(req, { ok: true, power });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const key = req.nextUrl.searchParams.get('key') ?? '';
    await deletePowerDefinition(key);
    return engineJson(req, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}
