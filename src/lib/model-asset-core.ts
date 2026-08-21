import { randomBytes, createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'models');
const MAX_BYTES = 50_000_000;
const ALLOWED_EXT = new Set(['glb', 'gltf', 'fbx', 'obj']);
const CONTENT_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  fbx: 'application/octet-stream',
  obj: 'text/plain',
};

export function bufferFromModelDataUrl(dataUrl: string): { buffer: Buffer; hintExt: string | null } {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL');
  }
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const buffer = Buffer.from(base64, 'base64');
  const hintExt = header.includes('model/gltf+json') ? 'gltf' : header.includes('model/gltf') ? 'glb' : null;
  return { buffer, hintExt };
}

export async function persistModelBuffer(
  buffer: Buffer,
  originalFilename?: string,
  hintExt?: string | null
): Promise<string> {
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `Model file is too large (${(buffer.length / 1_000_000).toFixed(1)} MB). Maximum is 50 MB.`
    );
  }
  const nameExt = originalFilename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const ext =
    (nameExt && ALLOWED_EXT.has(nameExt) ? nameExt : null) ??
    (hintExt && ALLOWED_EXT.has(hintExt) ? hintExt : 'glb');
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const filename = `model-${hash}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`models/${filename}`, buffer, {
        access: 'public',
        contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
        addRandomSuffix: false,
      });
      return blob.url;
    } catch (err) {
      console.error('[persistModelBuffer] Vercel Blob upload failed, falling back to disk', err);
    }
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  const bust = randomBytes(4).toString('hex');
  return `/uploads/models/${filename}?v=${bust}`;
}

/** Persist a GLB/GLTF/FBX/OBJ from a data URL or pass through an already-public URL. */
export async function persistModelFromDataUrl(
  dataUrl: string,
  originalFilename?: string
): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const { buffer, hintExt } = bufferFromModelDataUrl(dataUrl);
  return persistModelBuffer(buffer, originalFilename, hintExt);
}
