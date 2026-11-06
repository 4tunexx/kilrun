import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccessAdmin } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import {
  persistUploadedImageFile,
  SITE_IMAGE_KINDS,
  type SiteImageKind,
} from '@/lib/site-asset-upload';

export const runtime = 'nodejs';

/**
 * Multipart upload for admin site images. Saves under /public/uploads/site
 * (or Vercel Blob) and returns a short public URL — never store megabyte
 * data URLs in Mongo.
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
    const kind: SiteImageKind = SITE_IMAGE_KINDS.has(kindRaw as SiteImageKind)
      ? (kindRaw as SiteImageKind)
      : 'misc';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const url = await persistUploadedImageFile(file, kind);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[upload-site-image]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
