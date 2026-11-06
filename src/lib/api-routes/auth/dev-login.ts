import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { withPrismaRetry } from '@/lib/prisma';

/**
 * DEV-ONLY session mint that skips the real Steam OpenID handshake in
 * src/app/api/auth/steam/callback/route.ts. Exists so a local session can be
 * created for browser-driven testing (e.g. Map Editor Play Test) without a
 * real Steam account. Hard-gated to non-production: returns 404 whenever
 * NODE_ENV === 'production', so this can never become a real auth bypass in
 * a deployed build even if the route ships by accident.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const steamId = req.nextUrl.searchParams.get('steamId') || 'dev-tester-0001';
  const isSecureDeployment = req.nextUrl.protocol === 'https:';
  const SESSION_COOKIE = isSecureDeployment ? '__Secure-authjs.session-token' : 'authjs.session-token';

  const user = await withPrismaRetry(async (db) => {
    const existing = await db.user.findUnique({ where: { steamId } });
    if (existing) return existing;
    return db.user.create({
      data: {
        steamId,
        username: 'DevTester',
        avatarUrl:
          'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        vpCurrency: 0,
        xpProgress: 0,
        kp: 1000,
        currentRank: 'Unranked',
        role: 'admin',
        isVip: false,
        isBanned: false,
        isMuted: false,
      },
    });
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

  const redirectTo = req.nextUrl.searchParams.get('redirectTo') || '/';
  const response = NextResponse.redirect(`${origin}${redirectTo}`);
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: isSecureDeployment,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
