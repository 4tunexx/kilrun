import { NextRequest, NextResponse } from 'next/server';
import {
  ENGINE_INVITE_COOKIE,
  inviteCookieMaxAge,
  verifyEngineInvite,
  engineInviteSecret,
} from '@/lib/engine/engine-invite';
import { findActiveStoredInvite } from '@/lib/engine/engine-invite-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeMapId(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(raw)) return null;
  return raw;
}

export async function GET(req: NextRequest) {
  const invite = req.nextUrl.searchParams.get('invite') || '';
  const map = safeMapId(req.nextUrl.searchParams.get('map'));
  const stored = await findActiveStoredInvite(invite);
  const payload = stored
    ? verifyEngineInvite(invite, engineInviteSecret())
    : null;
  const dest = new URL('/engine', req.nextUrl.origin);
  if (map) dest.searchParams.set('map', map);

  if (!payload) {
    dest.searchParams.set('invite', 'invalid');
    return NextResponse.redirect(dest);
  }

  dest.searchParams.delete('invite');
  const res = NextResponse.redirect(dest);
  res.cookies.set(ENGINE_INVITE_COOKIE, invite, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: inviteCookieMaxAge(payload.exp),
    secure: req.nextUrl.protocol === 'https:',
  });
  return res;
}
