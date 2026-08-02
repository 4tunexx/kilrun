import { randomBytes } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'clans');

/**
 * Persist a clan owner/officer-uploaded image (data URL) as a public file.
 * Returns a short `/uploads/clans/...` path suitable for Clan.imageUrl / bannerUrl.
 * Caller must already verify the uploader has permission on the clan.
 */
export async function persistClanImage(
  source: string,
  kind: 'icon' | 'banner' = 'icon'
): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return '';

  // Already a local public path — keep as-is.
  if (trimmed.startsWith('/uploads/')) return trimmed;

  // External URL — store as-is.
  if (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  if (!trimmed.startsWith('data:image/')) return trimmed;

  const comma = trimmed.indexOf(',');
  if (comma < 0) throw new Error('Invalid image data');
  const base64 = trimmed.slice(comma + 1);
  const input = Buffer.from(base64, 'base64');
  if (input.length > 2_500_000) {
    throw new Error('Image too large (max ~2.5MB). Use a smaller file.');
  }

  const id = randomBytes(8).toString('hex');
  const filename = `${kind}-${id}.png`;
  const abs = path.join(UPLOAD_DIR, filename);

  let pipeline = sharp(input).ensureAlpha().rotate();
  pipeline =
    kind === 'banner'
      ? pipeline.resize({ width: 1200, height: 300, fit: 'cover' })
      : pipeline.resize({ width: 256, height: 256, fit: 'cover' });

  const pngBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();

  // Prefer Vercel Blob when configured — durable across cold starts.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`clans/${filename}`, pngBuffer, {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: false,
      });
      return blob.url;
    } catch (err) {
      console.error('[persistClanImage] blob upload failed, falling back', err);
    }
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless && pngBuffer.length <= 400_000) {
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await sharp(pngBuffer).png({ compressionLevel: 9 }).toFile(abs);

  return `/uploads/clans/${filename}`;
}
