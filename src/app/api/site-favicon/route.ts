import { NextResponse } from 'next/server';
import { getSiteSettings } from '@/lib/progression-actions';
import { resolveMarkLogo } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serves the admin mark logo as the site favicon (supports data URLs + remote). */
export async function GET() {
  try {
    const settings = await getSiteSettings();
    const url = resolveMarkLogo(settings.logoUrl);

    if (url.startsWith('data:image/')) {
      const comma = url.indexOf(',');
      const meta = url.slice(5, comma);
      const mime = meta.split(';')[0] || 'image/png';
      const buf = Buffer.from(url.slice(comma + 1), 'base64');
      return new NextResponse(buf, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) throw new Error('upstream favicon failed');
      const buf = Buffer.from(await res.arrayBuffer());
      return new NextResponse(buf, {
        headers: {
          'Content-Type': res.headers.get('content-type') || 'image/png',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    // Local public path — redirect so Next serves the static file.
    return NextResponse.redirect(new URL(url, process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  } catch {
    return NextResponse.redirect(
      new URL('/K2.png', process.env.NEXTAUTH_URL || 'http://localhost:3000')
    );
  }
}
