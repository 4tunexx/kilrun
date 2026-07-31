import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'sounds');
const MAX_BYTES = 5_000_000;

/**
 * Persist an admin-uploaded sound clip (raw bytes, already validated as
 * wav/mp3 by the caller) as a public file. Mirrors persistSiteImage's
 * storage priority (Vercel Blob -> local disk -> data: URL fallback on
 * serverless) but skips image processing — audio is stored byte-for-byte.
 */
export async function persistSoundFile(
  buffer: Buffer,
  eventKey: string,
  contentType: 'audio/wav' | 'audio/mpeg'
): Promise<string> {
  if (buffer.length > MAX_BYTES) {
    throw new Error('Sound file too large (max ~5MB)');
  }
  const ext = contentType === 'audio/wav' ? 'wav' : 'mp3';
  const id = randomBytes(6).toString('hex');
  const safeKey = eventKey.replace(/[^a-z0-9_]/gi, '');
  const filename = `${safeKey}-${id}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`sounds/${filename}`, buffer, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      });
      return blob.url;
    } catch (err) {
      console.error('[persistSoundFile] blob upload failed, falling back', err);
    }
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    // Vercel's filesystem is ephemeral — without Blob configured, a data:
    // URL is the only thing that survives a cold start.
    if (buffer.length <= 900_000) {
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
    throw new Error('Sound file too large to persist without Vercel Blob configured (max ~900KB fallback).');
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/sounds/${filename}`;
}
