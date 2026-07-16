import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_CLAIMED_ID_REGEX = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;
const FALLBACK_AVATAR =
  'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

const isSecureDeployment = (process.env.NEXTAUTH_URL || '').startsWith('https://');
const SESSION_COOKIE = isSecureDeployment
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

async function fetchSteamProfile(steamId: string) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.response?.players?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Handles the Steam OpenID 2.0 callback: verifies the assertion directly with
 * Steam (`check_authentication`), enriches the profile via the Steam Web API,
 * upserts the player in MongoDB through Prisma, and mints a NextAuth-compatible
 * session cookie -- all using only the Web-standard `fetch` API so this route
 * stays runtime-agnostic (no Node-only OpenID libraries).
 */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const params = req.nextUrl.searchParams;

  if (params.get('openid.mode') !== 'id_res') {
    return NextResponse.redirect(`${origin}/landing?error=steam_auth_failed`);
  }

  const verifyParams = new URLSearchParams(params);
  verifyParams.set('openid.mode', 'check_authentication');

  const verifyRes = await fetch(STEAM_OPENID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  });
  const verifyBody = await verifyRes.text();

  if (!verifyBody.includes('is_valid:true')) {
    return NextResponse.redirect(`${origin}/landing?error=steam_auth_invalid`);
  }

  const claimedId = params.get('openid.claimed_id') || '';
  const match = claimedId.match(STEAM_CLAIMED_ID_REGEX);
  if (!match) {
    return NextResponse.redirect(`${origin}/landing?error=steam_id_missing`);
  }
  const steamId = match[1];

  const profile = await fetchSteamProfile(steamId);
  const username: string = profile?.personaname ?? `Player${steamId.slice(-6)}`;
  const avatarUrl: string = profile?.avatarfull ?? FALLBACK_AVATAR;

  const existingUser = await prisma.user.findUnique({ where: { steamId } });

  const user = existingUser
    ? await prisma.user.update({
        where: { steamId },
        data: { username, avatarUrl },
      })
    : await prisma.user.create({
        data: {
          steamId,
          username,
          avatarUrl,
          vpCurrency: 0,
          xpProgress: 0,
          currentRank: 'Unranked',
          activeMissions: {
            create: [
              {
                title: 'Complete your first run',
                description: 'Finish a full Kilrun deathrun without quitting.',
                rewardXp: 250,
                targetCount: 1,
              },
              {
                title: 'Reach 500m distance',
                description: 'Survive long enough to cover 500 meters in a single run.',
                rewardXp: 500,
                targetCount: 500,
              },
              {
                title: 'Score 1,000 points',
                description: 'Rack up 1,000 points in a single run.',
                rewardXp: 400,
                targetCount: 1000,
              },
            ],
          },
        },
      });

  const sessionToken = await encode({
    token: {
      sub: user.id,
      steamId: user.steamId,
      name: user.username,
      picture: user.avatarUrl,
    },
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE,
  });

  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isSecureDeployment,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
