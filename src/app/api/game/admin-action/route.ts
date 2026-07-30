import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminRole, isStaff } from '@/lib/roles';

export const runtime = 'nodejs';

/**
 * Colyseus POSTs here for in-game admin actions that need to persist beyond
 * the current match (right now: ban). Kick/mute are purely in-room and never
 * hit this route. Mirrors match-result/chat-flag's shared-secret auth —
 * the acting admin was already verified server-side by the Colyseus room
 * (adminSessions / claims.isAdmin) before this call is made, so this route
 * trusts the secret rather than requiring a website session (there isn't
 * one in this context).
 */

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Body = {
  secret?: string;
  action?: 'ban';
  actorUserId?: string;
  actorUsername?: string;
  targetUserId?: string;
  mode?: string;
  detail?: string;
};

export async function POST(req: NextRequest) {
  const expected = process.env.GAME_SERVER_ADMIN_SECRET || '';
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'GAME_SERVER_ADMIN_SECRET is not configured' },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const headerSecret = req.headers.get('x-admin-secret') || '';
  const bodySecret = typeof body.secret === 'string' ? body.secret : '';
  const provided = headerSecret || bodySecret;
  if (!provided || !secretsEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (body.action !== 'ban') {
    return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  }

  const actorUserId = typeof body.actorUserId === 'string' ? body.actorUserId : '';
  const actorUsername =
    typeof body.actorUsername === 'string' && body.actorUsername.trim()
      ? body.actorUsername.slice(0, 60)
      : 'Admin';
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
  if (!actorUserId || !targetUserId) {
    return NextResponse.json(
      { ok: false, error: 'actorUserId and targetUserId are required' },
      { status: 400 }
    );
  }

  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  if (!actor || !isAdminRole(actor.role)) {
    // Belt-and-suspenders: the Colyseus room already checked adminSessions
    // before calling this route, but never trust a client-supplied id alone.
    return NextResponse.json({ ok: false, error: 'Actor is not an admin' }, { status: 403 });
  }
  if (actorUserId === targetUserId) {
    return NextResponse.json({ ok: false, error: 'Cannot ban yourself' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    return NextResponse.json({ ok: false, error: 'Target user not found' }, { status: 404 });
  }
  // Only full admins may ban staff; the actor is already confirmed admin above.
  if (isStaff(target.role) && !isAdminRole(actor.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { isBanned: true } });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUsername,
      action: 'ban',
      targetUserId: target.id,
      targetUsername: target.username,
      detail: body.mode ? `in-game (${body.mode})${body.detail ? `: ${body.detail}` : ''}` : 'in-game',
    },
  });

  return NextResponse.json({ ok: true });
}
