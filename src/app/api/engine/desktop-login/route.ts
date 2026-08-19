import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { signEngineStaffToken } from '@/lib/engine/staff-token';
import { parseEngineLoopbackUrl } from '@/lib/engine/protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOPBACK_COOKIE = 'kilrun_engine_loopback';

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function page(title: string, inner: string, status = 200) {
  return html(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #0d121a; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { max-width: 420px; padding: 32px; border: 1px solid #1e293b; background: #111827; border-radius: 16px; }
    p { color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body><main>${inner}</main></body>
</html>`,
    status
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readLoopback(req: NextRequest): string | null {
  return (
    parseEngineLoopbackUrl(req.nextUrl.searchParams.get('loopback')) ||
    parseEngineLoopbackUrl(req.cookies.get(LOOPBACK_COOKIE)?.value)
  );
}

/**
 * Steam login for Kilrun Engine.exe. After staff auth, hands a session token
 * back to the Windows app via localhost loopback (reliable) and kilrun-engine://.
 */
export async function GET(req: NextRequest) {
  const loopback = readLoopback(req);
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) {
    const redirect = Response.redirect(
      `${req.nextUrl.origin}/api/auth/steam?next=/api/engine/desktop-login`
    );
    if (loopback) {
      redirect.headers.append(
        'Set-Cookie',
        `${LOOPBACK_COOKIE}=${encodeURIComponent(loopback)}; Path=/; Max-Age=600; SameSite=Lax; HttpOnly${
          req.nextUrl.protocol === 'https:' ? '; Secure' : ''
        }`
      );
    }
    return redirect;
  }

  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    return page(
      'Staff only',
      `<h1>Staff only</h1><p>Kilrun Engine can only push maps to the live game when you are signed in as admin or moderator.</p>`,
      403
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return page(
      'Engine login failed',
      `<h1>Server misconfigured</h1><p>AUTH_SECRET is missing.</p>`,
      500
    );
  }

  const token = signEngineStaffToken({
    userId: user.id,
    steamId: user.steamId,
    secret,
  });
  const protocolHref = `kilrun-engine://auth?token=${encodeURIComponent(token)}`;
  const loopbackHref = loopback
    ? `${loopback}?token=${encodeURIComponent(token)}`
    : null;
  const primaryHref = loopbackHref || protocolHref;

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Return to Kilrun Engine</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #0d121a; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { max-width: 460px; padding: 32px; border: 1px solid #1e293b; background: #111827; border-radius: 16px; }
    a { display: inline-block; margin-top: 16px; padding: 10px 16px; background: #e23d4a; color: #fff; font-weight: 700; text-decoration: none; border-radius: 8px; }
    p { color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Connected as ${escapeHtml(user.username)}</h1>
    <p>Sending this staff session back to Kilrun Engine. Keep the Engine window open.</p>
    <a id="open" href="${escapeHtml(primaryHref)}">Return to Kilrun Engine</a>
    ${
      loopbackHref
        ? `<p style="margin-top:18px"><a href="${escapeHtml(protocolHref)}" style="background:#1e293b">Protocol backup</a></p>`
        : ''
    }
  </main>
  <script>
    location.replace(${JSON.stringify(primaryHref)});
  </script>
</body>
</html>`);
}
