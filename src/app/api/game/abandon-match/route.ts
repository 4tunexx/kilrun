import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSiteSecretValue } from '@/lib/site-secrets';

export const runtime = 'nodejs';

/**
 * Colyseus POSTs here when a player deliberately abandons a Competitive
 * match (@abandonMatch chat command / pause-menu button). Mirrors
 * admin-action's shared-secret auth — there is no website session in this
 * context, only the game server's trusted secret.
 *
 * Escalating cooldown: 10m → 30m → 2h → 5h → 1d. Resets to the first tier
 * once 24h has passed with no further abandon.
 */
const COOLDOWN_TIERS_MS = [
  10 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  5 * 60 * 60_000,
  24 * 60 * 60_000,
];
const CLEAN_RESET_MS = 24 * 60 * 60_000;

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Body = {
  secret?: string;
  userId?: string;
};

export async function POST(req: NextRequest) {
  const expected = (await getSiteSecretValue('GAME_SERVER_ADMIN_SECRET')) || '';
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

  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
  }

  const existing = await prisma.matchAbandonPenalty.findUnique({ where: { userId } });
  const now = Date.now();
  const cleanSlate =
    !existing?.lastAbandonAt || now - existing.lastAbandonAt.getTime() > CLEAN_RESET_MS;
  const level = cleanSlate ? 0 : Math.min(existing?.level ?? 0, COOLDOWN_TIERS_MS.length - 1);
  const durationMs = COOLDOWN_TIERS_MS[level];
  const cooldownUntil = new Date(now + durationMs);
  const nextLevel = Math.min(level + 1, COOLDOWN_TIERS_MS.length - 1);

  await prisma.matchAbandonPenalty.upsert({
    where: { userId },
    create: { userId, level: nextLevel, cooldownUntil, lastAbandonAt: new Date(now) },
    update: { level: nextLevel, cooldownUntil, lastAbandonAt: new Date(now) },
  });

  return NextResponse.json({ ok: true, cooldownUntil: cooldownUntil.toISOString() });
}

/** Staff/game-server read of a player's current abandon cooldown (no auth needed beyond secret — read-only). */
export async function GET(req: NextRequest) {
  const expected = (await getSiteSecretValue('GAME_SERVER_ADMIN_SECRET')) || '';
  const provided = req.headers.get('x-admin-secret') || '';
  if (!expected || !provided || !secretsEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = req.nextUrl.searchParams.get('userId') || '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId is required' }, { status: 400 });
  }
  const record = await prisma.matchAbandonPenalty.findUnique({ where: { userId } });
  const active = !!record?.cooldownUntil && record.cooldownUntil.getTime() > Date.now();
  return NextResponse.json({
    ok: true,
    active,
    cooldownUntil: active ? record!.cooldownUntil!.toISOString() : null,
  });
}
