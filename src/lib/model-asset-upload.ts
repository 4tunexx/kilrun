'use server';

import { randomBytes, createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'models');

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Staff only');
  }
  return user;
}

/**
 * Upload a GLB/GLTF model file (supplied as a base64 data URL) to durable
 * storage and return a public URL.
 *
 * Storage priority:
 *  1. Vercel Blob (when BLOB_READ_WRITE_TOKEN is set) — survives re-deploys
 *  2. Local /public/uploads/models/ — works for dev; ephemeral on serverless
 *
 * The returned URL is safe to store in a map entity's `customModelUrl` field
 * instead of embedding the raw data URL, which prevents maps from exceeding
 * the 4.5 MB cloud-sync cap and allows cross-device access.
 */
export async function uploadModelGlb(dataUrl: string): Promise<string> {
  await requireStaff();

  if (!dataUrl.startsWith('data:')) {
    // Already a public URL — nothing to upload.
    return dataUrl;
  }

  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid data URL');
  const base64 = dataUrl.slice(comma + 1);
  const buffer = Buffer.from(base64, 'base64');

  const MAX_BYTES = 50_000_000; // 50 MB hard cap
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `Model file is too large (${(buffer.length / 1_000_000).toFixed(1)} MB). Maximum is 50 MB.`
    );
  }

  // Stable filename from content hash so re-uploads of the same file are deduplicated.
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const ext = dataUrl.startsWith('data:model/gltf+json') ? 'gltf' : 'glb';
  const filename = `model-${hash}.${ext}`;

  // 1. Try Vercel Blob first (durable across deployments).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(`models/${filename}`, buffer, {
        access: 'public',
        contentType: ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary',
        addRandomSuffix: false,
      });
      return blob.url;
    } catch (err) {
      console.error('[uploadModelGlb] Vercel Blob upload failed, falling back to disk', err);
    }
  }

  // 2. Fall back to local public/uploads/models/.
  // NOTE: On Vercel serverless this path is ephemeral and will not survive a
  // cold start. Configure BLOB_READ_WRITE_TOKEN for production use.
  await mkdir(UPLOAD_DIR, { recursive: true });
  const abs = path.join(UPLOAD_DIR, filename);
  await writeFile(abs, buffer);
  // Append a random suffix to bust any stale CDN cache for the same filename.
  const bust = randomBytes(4).toString('hex');
  return `/uploads/models/${filename}?v=${bust}`;
}
