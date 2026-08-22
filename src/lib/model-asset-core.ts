import { randomBytes, createHash } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'models');
/** Hobby session lambda body is ~4.5 MB; leave headroom for multipart headers. */
export const LIVE_MODEL_MAX_BYTES = 4_000_000;
const ALLOWED_EXT = new Set(['glb', 'gltf', 'fbx', 'obj']);
const CONTENT_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  fbx: 'application/octet-stream',
  obj: 'text/plain',
};

/**
 * Cheap structural sanity check per extension — not a full 3D-format parser
 * (no new dependency for that), just enough to catch "this isn't actually a
 * model file" before it's stored and served to every client's GLTFLoader as
 * one. Type used to be inferred purely from the filename extension / data-
 * URL header, so any binary could be uploaded and served as a `.glb`.
 */
export function looksLikeValidModelFile(buffer: Buffer, ext: string): boolean {
  if (ext === 'glb') {
    // GLB binary header: magic "glTF" (4 bytes) + version (u32) + length (u32).
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'glTF';
  }
  if (ext === 'gltf') {
    // glTF is plain JSON with a required top-level "asset" object.
    try {
      const parsed = JSON.parse(buffer.toString('utf8'));
      return Boolean(parsed && typeof parsed === 'object' && 'asset' in parsed);
    } catch {
      return false;
    }
  }
  if (ext === 'fbx') {
    if (buffer.length < 20) return false;
    // Binary FBX has a fixed magic string; ASCII FBX opens with a header comment.
    if (buffer.toString('ascii', 0, 18) === 'Kaydara FBX Binary') return true;
    return /FBX/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 256)));
  }
  if (ext === 'obj') {
    // OBJ is plain text keyed by short line prefixes (v/vn/vt/f/o/g/mtllib).
    const sample = buffer.toString('utf8', 0, Math.min(buffer.length, 8192));
    return /(^|\n)\s*(v|vt|vn|f|o|g|mtllib)\s/.test(sample);
  }
  return false;
}

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
  if (buffer.length > LIVE_MODEL_MAX_BYTES) {
    throw new Error(
      `Model file is too large (${(buffer.length / 1_000_000).toFixed(1)} MB). Live site max is about 4 MB.`
    );
  }
  const nameExt = originalFilename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const ext =
    (nameExt && ALLOWED_EXT.has(nameExt) ? nameExt : null) ??
    (hintExt && ALLOWED_EXT.has(hintExt) ? hintExt : 'glb');
  if (!looksLikeValidModelFile(buffer, ext)) {
    throw new Error(`File does not look like a valid .${ext} model.`);
  }
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const filename = `model-${hash}.${ext}`;

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
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
      if (isServerless) {
        throw new Error('Model upload to Blob failed. Check BLOB_READ_WRITE_TOKEN.');
      }
    }
  } else if (isServerless) {
    throw new Error('Model upload needs Vercel Blob (BLOB_READ_WRITE_TOKEN).');
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

/**
 * Best-effort delete of a previously persisted asset (Vercel Blob or a
 * local /uploads/** file). No-ops for `data:` URLs (nothing was stored to a
 * file) and any other external URL (not ours to delete). Never throws —
 * storage cleanup must never block the caller's own delete flow. Callers
 * are responsible for confirming the URL is actually unreferenced first
 * (content-hashed model/preview files can be shared by multiple rows).
 */
export async function deletePersistedAsset(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    if (url.includes('.blob.vercel-storage.com/')) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return;
      const { del } = await import('@vercel/blob');
      await del(url);
      return;
    }
    const localPath = url.split('?')[0];
    if (localPath.startsWith('/uploads/') && !localPath.includes('..')) {
      const abs = path.join(process.cwd(), 'public', localPath);
      await unlink(abs);
    }
  } catch (err) {
    console.error('[deletePersistedAsset] cleanup failed (non-fatal)', url, err);
  }
}

export async function persistUploadedModelFile(file: File, originalFilename?: string): Promise<string> {
  if (file.size > LIVE_MODEL_MAX_BYTES) {
    throw new Error(
      `Model file is too large (${(file.size / 1_000_000).toFixed(1)} MB). Live site max is about 4 MB.`
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return persistModelBuffer(buffer, originalFilename || file.name);
}
