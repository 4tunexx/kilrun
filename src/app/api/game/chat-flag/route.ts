import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * Colyseus POSTs here when a player types @admin/@mod in in-match chat.
 * Notifies every admin account so it shows up on the website bell icon.
 * Mirrors match-result/route.ts's shared-secret auth pattern.
 */

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Body = {
  secret?: string;
  mode?: string;
  roomId?: string;
  username?: string;
  userId?: string;
  text?: string;
  mention?: 'admin' | 'mod';
};

const MAX_TEXT_CHARS = 240;

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

  const mode = typeof body.mode === 'string' ? body.mode.slice(0, 40) : 'unknown';
  const roomId = typeof body.roomId === 'string' ? body.roomId.slice(0, 80) : '';
  const username =
    typeof body.username === 'string' && body.username.trim()
      ? body.username.slice(0, 60)
      : 'Player';
  const text =
    typeof body.text === 'string' && body.text.trim()
      ? body.text.slice(0, MAX_TEXT_CHARS)
      : '';
  const mention = body.mention === 'mod' ? 'mod' : 'admin';

  if (!text) {
    return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
  }

  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true },
  });
  if (admins.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const title = `🚩 @${mention} mention — ${mode}`;
  const bodyText = roomId
    ? `${username}: ${text} (room ${roomId})`
    : `${username}: ${text}`;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title,
      body: bodyText,
      type: 'chat_flag',
    })),
  });

  return NextResponse.json({ ok: true, notified: admins.length });
}
