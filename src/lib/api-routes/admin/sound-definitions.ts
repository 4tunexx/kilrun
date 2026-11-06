import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { engineJson, engineOptions } from '@/lib/engine/engine-api';
import { loadSoundDefinitions } from '@/lib/sound-definitions';
import { deleteSoundDefinition, patchSoundDefinition, uploadSoundDefinition } from '@/lib/sound-definitions-write';

export const runtime = 'nodejs';

/**
 * CRUD for the Sound Board's per-event uploaded clips (see
 * shared/sound-events.ts for the event catalog).
 *
 * GET is public/unauthenticated — the game client fetches this on match
 * load to know which events have a sound bound. Mutations require admin.
 */

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const rows = await loadSoundDefinitions();
    const sounds: Record<string, (typeof rows)[number]> = {};
    for (const r of rows) sounds[r.eventKey] = r;
    return engineJson(req, { ok: true, sounds });
  } catch (err) {
    console.error('[api/admin/sound-definitions GET]', err);
    return engineJson(req, { ok: true, sounds: {} });
  }
}

async function requireAdmin() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) return null;
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) return null;
  return user;
}

/** Upload (or replace) the clip bound to one event. multipart/form-data:
 * eventKey, file (.wav/.mp3), volume (optional, 0-1). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const form = await req.formData();
  const eventKey = String(form.get('eventKey') ?? '').trim();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 });
  }
  try {
    const result = await uploadSoundDefinition({
      eventKey,
      file,
      volume: Number(form.get('volume')) || 1,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Update volume and/or crop/EQ/noise-gate fields for an already-bound event.
 * Only keys present in the JSON body are touched — `null` clears a filter,
 * an absent key leaves it unchanged. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    await patchSoundDefinition(String(body?.eventKey ?? ''), body ?? {});
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    const status = /no sound bound/i.test(message) ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/** Clear the clip bound to an event (event reverts to silent). */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  try {
    await deleteSoundDefinition(req.nextUrl.searchParams.get('eventKey') ?? '');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
