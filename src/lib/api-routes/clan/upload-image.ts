import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { persistClanImage } from '@/lib/clan-asset-upload';

export const runtime = 'nodejs';

type Kind = 'icon' | 'banner';
const KINDS = new Set<Kind>(['icon', 'banner']);

/**
 * Multipart upload for clan pictures. Only the clan owner/officers may
 * upload — saves under /public/uploads/clans and returns a short public URL.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
    if (!steamId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { steamId } });
    if (!user || user.isBanned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const membership = await prisma.clanMember.findUnique({ where: { userId: user.id } });
    if (!membership || !['owner', 'officer'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only the clan owner or officers can update clan images' },
        { status: 403 }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    const kindRaw = String(form.get('kind') ?? 'icon');
    const kind: Kind = KINDS.has(kindRaw as Kind) ? (kindRaw as Kind) : 'icon';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }
    if (file.size > 2_500_000) {
      return NextResponse.json({ error: 'Image too large (max ~2.5MB)' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`;
    const url = await persistClanImage(dataUrl, kind);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('[upload-clan-image]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
