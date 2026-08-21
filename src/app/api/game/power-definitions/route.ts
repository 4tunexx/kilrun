import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { engineJson, engineOptions } from '@/lib/engine/engine-api';
import { loadPowerDefinitions } from '@/lib/power-definitions';
import {
  createPowerDefinition,
  deletePowerDefinition,
  updatePowerDefinition,
} from '@/lib/power-definitions-write';
import { STATIC_FALLBACK_POWERS } from '@shared/power-definitions';

export const runtime = 'nodejs';

/**
 * CRUD for data-driven Power definitions (see shared/power-definitions.ts).
 *
 * GET is intentionally public/unauthenticated — power balance numbers are
 * game config, not sensitive user data, and the Colyseus game server fetches
 * this same endpoint (server-to-server, no session) to hydrate its copy of
 * the definitions. Mutations require admin.
 */

export function OPTIONS(req: NextRequest) {
  return engineOptions(req);
}

export async function GET(req: NextRequest) {
  try {
    const powers = await loadPowerDefinitions();
    return engineJson(req, { ok: true, powers });
  } catch (err) {
    console.error('[api/game/power-definitions GET]', err);
    return engineJson(req, { ok: true, powers: STATIC_FALLBACK_POWERS });
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

function mutationStatus(message: string) {
  if (/already exists|prerequisite/i.test(message)) return 409;
  if (/not found/i.test(message)) return 404;
  return 400;
}

/** Create a new custom power. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  try {
    const power = await createPowerDefinition(await req.json().catch(() => null));
    return NextResponse.json({ ok: true, power });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ ok: false, error: message }, { status: mutationStatus(message) });
  }
}

/** Update an existing power (core or custom). */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  try {
    const power = await updatePowerDefinition(await req.json().catch(() => null));
    return NextResponse.json({ ok: true, power });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ ok: false, error: message }, { status: mutationStatus(message) });
  }
}

/** Delete a custom power. isCore rows are never deletable. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  try {
    await deletePowerDefinition(req.nextUrl.searchParams.get('key') ?? '');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ ok: false, error: message }, { status: mutationStatus(message) });
  }
}
