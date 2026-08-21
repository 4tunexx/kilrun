import { NextRequest } from 'next/server';
import {
  engineJson,
  engineOptions,
  requireEngineStaff,
} from '@/lib/engine/engine-api';
import { loadSoundDefinitions } from '@/lib/sound-definitions';
import {
  deleteSoundDefinition,
  patchSoundDefinition,
  uploadSoundDefinition,
} from '@/lib/sound-definitions-write';
import { getCustomMoveSoundEvents } from '@/lib/custom-move-sound-events-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

function staffStatus(message: string) {
  if (/staff only|not authenticated|session expired/i.test(message)) return 401;
  if (/not found|no sound bound/i.test(message)) return 404;
  return 400;
}

export async function GET(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const rows = await loadSoundDefinitions({ force: true });
    const sounds: Record<string, (typeof rows)[number]> = {};
    for (const r of rows) sounds[r.eventKey] = r;
    const customMoveEvents = await getCustomMoveSoundEvents().catch(() => []);
    return engineJson(req, { ok: true, sounds, customMoveEvents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sounds';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const form = await req.formData();
    const eventKey = String(form.get('eventKey') ?? '').trim();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return engineJson(req, { ok: false, error: 'Missing file' }, 400);
    }
    const result = await uploadSoundDefinition({
      eventKey,
      file,
      volume: Number(form.get('volume')) || 1,
    });
    return engineJson(req, { ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const eventKey = String(body?.eventKey ?? '').trim();
    await patchSoundDefinition(eventKey, body ?? {});
    return engineJson(req, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireEngineStaff(req);
    const eventKey = req.nextUrl.searchParams.get('eventKey') ?? '';
    await deleteSoundDefinition(eventKey);
    return engineJson(req, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return engineJson(req, { ok: false, error: message }, staffStatus(message));
  }
}
