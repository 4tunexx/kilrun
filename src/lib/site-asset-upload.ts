import { randomBytes } from 'crypto';
import { mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'site');

/**
 * Persist an admin-uploaded image (data URL or remote URL) as a public file.
 * Returns a short `/uploads/site/...` path suitable for SiteSettings fields.
 * Caller must already be staff-gated.
 */
export async function persistSiteImage(
  source: string,
  kind: 'mark' | 'wordmark' | 'hero' | 'bg' | 'misc' = 'misc'
): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return '';

  // Already a local public path — keep as-is.
  if (
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('/K2.png') ||
    trimmed.startsWith('/kilrun.png')
  ) {
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
  const base64 = trimmed.slice(comma + 1);
  const input = Buffer.from(base64, 'base64');
  if (input.length > 2_500_000) {
    throw new Error('Image too large (max ~2.5MB). Use a smaller file or a hosted URL.');
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const id = randomBytes(8).toString('hex');
  const filename = `${kind}-${id}.png`;
  const abs = path.join(UPLOAD_DIR, filename);

  let pipeline = sharp(input).ensureAlpha().rotate();
  if (kind === 'wordmark') {
    pipeline = pipeline.resize({
      width: 1200,
      height: 400,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else if (kind === 'mark') {
    pipeline = pipeline.resize({
      width: 256,
      height: 256,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else if (kind === 'hero' || kind === 'bg') {
    pipeline = pipeline.resize({
      width: 1920,
      height: 1080,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  // Flood-fill from edges only — never punch holes inside the logo artwork.
  const cleaned =
    kind === 'mark' || kind === 'wordmark'
      ? floodClearEdgePlate(data, info.width, info.height, info.channels)
      : data;

  await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(abs);

  return `/uploads/site/${filename}`;
}

/**
 * Remove a solid plate by flood-filling from the image edges only.
 * Interior logo pixels (even if similar color) are left untouched — this
 * prevents the pink/navy "ghost overlap" the old chroma-key caused.
 */
function floodClearEdgePlate(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Buffer {
  if (channels < 4 || width < 4 || height < 4) return data;

  const out = Buffer.from(data);
  const samples: number[][] = [];
  const probe = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    if (out[i + 3] > 200) samples.push([out[i], out[i + 1], out[i + 2]]);
  };
  const ix = Math.max(1, Math.floor(width * 0.04));
  const iy = Math.max(1, Math.floor(height * 0.04));
  probe(ix, iy);
  probe(width - 1 - ix, iy);
  probe(ix, height - 1 - iy);
  probe(width - 1 - ix, height - 1 - iy);

  if (samples.length < 2) return out;

  const bg = samples
    .reduce((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0])
    .map((v) => Math.round(v / samples.length));

  const matchesBg = (i: number) => {
    const a = out[i + 3];
    if (a < 8) return true;
    const dr = out[i] - bg[0];
    const dg = out[i + 1] - bg[1];
    const db = out[i + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < 36;
  };

  // If corners aren't a coherent plate, leave the image alone.
  const cornerMatch = [
    [ix, iy],
    [width - 1 - ix, iy],
    [ix, height - 1 - iy],
    [width - 1 - ix, height - 1 - iy],
  ].filter(([x, y]) => matchesBg((y * width + x) * channels)).length;
  if (cornerMatch < 3) return out;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (!matchesBg(i)) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const idx = stack.pop()!;
    const i = idx * channels;
    out[i + 3] = 0;
    const x = idx % width;
    const y = (idx / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return out;
}
