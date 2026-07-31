import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { loadSoundDefinitions, invalidateSoundDefinitionsCache } from '@/lib/sound-definitions';
import { persistSoundFile } from '@/lib/sound-asset-upload';
import { getSoundEventDef } from '@shared/sound-events';

export const runtime = 'nodejs';

/**
 * CRUD for the Sound Board's per-event uploaded clips (see
 * shared/sound-events.ts for the event catalog).
 *
 * GET is public/unauthenticated — the game client fetches this on match
 * load to know which events have a sound bound. Mutations require admin.
 */

export async function GET() {
  try {
    const rows = await loadSoundDefinitions();
    const sounds: Record<string, { fileUrl: string; volume: number; fileName: string }> = {};
    for (const r of rows) sounds[r.eventKey] = { fileUrl: r.fileUrl, volume: r.volume, fileName: r.fileName };
    return NextResponse.json({ ok: true, sounds });
  } catch (err) {
    console.error('[api/admin/sound-definitions GET]', err);
    return NextResponse.json({ ok: true, sounds: {} });
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
  if (!getSoundEventDef(eventKey)) {
    return NextResponse.json({ ok: false, error: 'Unknown event key' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 });
  }
  const nameLower = file.name.toLowerCase();
  const isWav = file.type === 'audio/wav' || file.type === 'audio/x-wav' || nameLower.endsWith('.wav');
  const isMp3 = file.type === 'audio/mpeg' || file.type === 'audio/mp3' || nameLower.endsWith('.mp3');
  if (!isWav && !isMp3) {
    return NextResponse.json({ ok: false, error: 'File must be .wav or .mp3' }, { status: 400 });
  }
  if (file.size > 5_000_000) {
    return NextResponse.json({ ok: false, error: 'Sound file too large (max ~5MB)' }, { status: 400 });
  }
  const volume = Math.max(0, Math.min(1, Number(form.get('volume')) || 1));

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = isWav ? 'audio/wav' : 'audio/mpeg';
  let fileUrl: string;
  try {
    fileUrl = await persistSoundFile(buffer, eventKey, contentType);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  await prisma.soundDefinition.upsert({
    where: { eventKey },
    create: { eventKey, fileUrl, fileName: file.name, volume },
    update: { fileUrl, fileName: file.name, volume },
  });
  invalidateSoundDefinitionsCache();
  return NextResponse.json({ ok: true, eventKey, fileUrl });
}

/** Update just the volume for an already-bound event. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const eventKey = String((body as Record<string, unknown> | null)?.eventKey ?? '').trim();
  if (!getSoundEventDef(eventKey)) {
    return NextResponse.json({ ok: false, error: 'Unknown event key' }, { status: 400 });
  }
  const existing = await prisma.soundDefinition.findUnique({ where: { eventKey } });
  if (!existing) return NextResponse.json({ ok: false, error: 'No sound bound to this event yet' }, { status: 404 });

  const volume = Math.max(0, Math.min(1, Number((body as Record<string, unknown>).volume) || 0));
  await prisma.soundDefinition.update({ where: { eventKey }, data: { volume } });
  invalidateSoundDefinitionsCache();
  return NextResponse.json({ ok: true });
}

/** Clear the clip bound to an event (event reverts to silent). */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const eventKey = req.nextUrl.searchParams.get('eventKey')?.trim();
  if (!eventKey) return NextResponse.json({ ok: false, error: 'eventKey is required' }, { status: 400 });

  await prisma.soundDefinition.deleteMany({ where: { eventKey } });
  invalidateSoundDefinitionsCache();
  return NextResponse.json({ ok: true });
}
