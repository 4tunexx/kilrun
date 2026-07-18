import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'site');

/**
 * Persist an admin-uploaded image (data URL or remote URL) as a public file.
 * Returns a short `/uploads/site/...` path suitable for SiteSettings fields —
 * avoids stuffing megabyte base64 blobs into MongoDB.
 * Caller must already be staff-gated.
 */
export async function persistSiteImage(
  source: string,
  kind: 'mark' | 'wordmark' | 'hero' | 'bg' | 'misc' = 'misc'
): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return '';

  // Already a local public path — keep as-is.
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/K2.png') || trimmed.startsWith('/kilrun.png')) {
    return trimmed;
  }

  // External URL — store as-is (no download needed for hosted assets).
  if (
    (trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
    !trimmed.startsWith('data:')
  ) {
    return trimmed;
  }

  if (!trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  const comma = trimmed.indexOf(',');
  if (comma < 0) throw new Error('Invalid image data');
  const meta = trimmed.slice(0, comma);
  const base64 = trimmed.slice(comma + 1);
  const input = Buffer.from(base64, 'base64');
  if (input.length > 2_500_000) {
    throw new Error('Image too large (max ~2.5MB). Use a smaller file or a hosted URL.');
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const isWordmark = kind === 'wordmark';
  const id = randomBytes(8).toString('hex');
  const filename = `${kind}-${id}.png`;
  const abs = path.join(UPLOAD_DIR, filename);

  let pipeline = sharp(input).ensureAlpha().rotate();
  if (isWordmark) {
    // Wide banner wordmark — keep aspect, cap width.
    pipeline = pipeline.resize({ width: 1200, height: 400, fit: 'inside', withoutEnlargement: true });
  } else if (kind === 'mark') {
    pipeline = pipeline.resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true });
  } else if (kind === 'hero' || kind === 'bg') {
    pipeline = pipeline.resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true });
  }

  // Drop solid dark plates so logos composite cleanly.
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const cleaned = await stripDarkPlate(data, info.width, info.height, info.channels);
  await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(abs);

  void meta;
  return `/uploads/site/${filename}`;
}

async function stripDarkPlate(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<Buffer> {
  if (channels < 4) return data;
  const out = Buffer.from(data);
  const samples: number[][] = [];
  const probe = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    if (out[i + 3] > 200) samples.push([out[i], out[i + 1], out[i + 2]]);
  };
  const ix = Math.max(2, Math.floor(width * 0.08));
  const iy = Math.max(2, Math.floor(height * 0.08));
  probe(ix, iy);
  probe(width - 1 - ix, iy);
  probe(ix, height - 1 - iy);
  probe(width - 1 - ix, height - 1 - iy);

  if (samples.length === 0) return out;
  const bg = samples
    .reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0])
    .map((v) => Math.round(v / samples.length));
  const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  if (bgLum > 90) return out;

  for (let i = 0; i < out.length; i += channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const a = out[i + 3];
    if (a === 0) continue;
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    if (d < 28) out[i + 3] = 0;
    else if (d < 55) out[i + 3] = Math.round(a * ((d - 28) / 27));
  }
  return out;
}
