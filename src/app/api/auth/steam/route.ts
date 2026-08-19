import { NextRequest, NextResponse } from 'next/server';
import { KILRUN_AUTH_NEXT_COOKIE, parseSteamAuthNext } from '@/lib/steam-auth-next';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

/**
 * Initiates the Steam OpenID 2.0 handshake. Redirects the player to Steam's
 * hosted login page; Steam will redirect back to our callback route with the
 * signed OpenID assertion once the player authenticates.
 */
export async function GET(req: NextRequest) {
  // Always trust the actual incoming request's origin (Vercel correctly
  // forwards the real public host/protocol) rather than `NEXTAUTH_URL`,
  // which is easy to leave stale (e.g. still `localhost` after deploying) --
  // that mismatch sends Steam's redirect to a domain that doesn't exist for
  // the visiting user, which is exactly what "login gives broken" looks like.
  const origin = req.nextUrl.origin;
  const returnTo = `${origin}/api/auth/steam/callback`;
  const next = parseSteamAuthNext(req.nextUrl.searchParams.get('next'));

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  const response = NextResponse.redirect(`${STEAM_OPENID_URL}?${params.toString()}`);
  if (next) {
    response.cookies.set(KILRUN_AUTH_NEXT_COOKIE, next, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
      secure: req.nextUrl.protocol === 'https:',
    });
  }
  return response;
}
