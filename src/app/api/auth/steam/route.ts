import { NextRequest, NextResponse } from 'next/server';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

/**
 * Initiates the Steam OpenID 2.0 handshake. Redirects the player to Steam's
 * hosted login page; Steam will redirect back to our callback route with the
 * signed OpenID assertion once the player authenticates.
 */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const returnTo = `${origin}/api/auth/steam/callback`;

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return NextResponse.redirect(`${STEAM_OPENID_URL}?${params.toString()}`);
}
