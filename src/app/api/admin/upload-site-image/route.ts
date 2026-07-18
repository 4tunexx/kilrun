import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { persistSiteImage } from '@/lib/site-asset-upload';

export const runtime = 'nodejs';

type Kind = 'mark' | 'wordmark' | 'hero' | 'bg' | 'misc';

const KINDS = new Set<Kind>(['mark', 'wordmark', 'hero', 'bg', 'misc']);

/**
 * Multipart upload for admin site images. Saves under /public/uploads/site
 * and returns a short public URL — never store megabyte data URLs in Mongo.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
    if (!steamId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { steamId } });
    if (!user || user.isBanned || !canAccessAdmin(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const kindRaw = String(form.get('kind') ?? 'misc');
    const kind: Kind = KINDS.has(kindRaw as Kind) ? (kindRaw as Kind) : 'misc';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }
    if (file.size > 2_500_000) {
      return NextResponse.json(
        { error: 'Image too large (max ~2.5MB)' },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;
    const url = await persistSiteImage(dataUrl, kind);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[upload-site-image]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
