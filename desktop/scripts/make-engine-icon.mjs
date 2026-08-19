/**
 * Build Windows icons from public/K2.png.
 * K2 is already a transparent red K. Never run `tauri icon` — it paints the
 * transparent plate black, which is why Explorer showed a black square.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const k2 = path.join(root, 'public/K2.png');
const outDir = path.join(root, 'desktop/src-tauri/icons');
const tmpDir = path.join(outDir, '_layers');

const sharp = (await import('sharp')).default;

if (!fs.existsSync(k2)) {
  console.error('Missing public/K2.png');
  process.exit(1);
}

const { data, info } = await sharp(k2).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let minX = info.width;
let minY = info.height;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const a = data[(y * info.width + x) * info.channels + 3];
    if (a < 16) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}

const pad = 2;
const left = Math.max(0, minX - pad);
const top = Math.max(0, minY - pad);
const width = Math.min(info.width - left, maxX - minX + pad * 2 + 1);
const height = Math.min(info.height - top, maxY - minY + pad * 2 + 1);

const cropped = await sharp(k2).extract({ left, top, width, height }).png().toBuffer();

const MASTER = 1024;
const INNER = 980;
const mark = await sharp(cropped)
  .resize(INNER, INNER, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const master = await sharp({
  create: {
    width: MASTER,
    height: MASTER,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: mark, top: (MASTER - INNER) / 2, left: (MASTER - INNER) / 2 }])
  .png()
  .toBuffer();

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'source-1024.png'), master);

async function writePng(size, file) {
  await sharp(master)
    .resize(size, size, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(file);
}

const layer16 = path.join(tmpDir, '16.png');
const layer24 = path.join(tmpDir, '24.png');
const layer32 = path.join(tmpDir, '32.png');
const layer48 = path.join(tmpDir, '48.png');
const layer64 = path.join(tmpDir, '64.png');
const layer128 = path.join(tmpDir, '128.png');
const layer256 = path.join(tmpDir, '256.png');
const layer512 = path.join(tmpDir, '512.png');

await writePng(16, layer16);
await writePng(24, layer24);
await writePng(32, layer32);
await writePng(48, layer48);
await writePng(64, layer64);
await writePng(128, layer128);
await writePng(256, layer256);
await writePng(512, layer512);

fs.copyFileSync(layer32, path.join(outDir, '32x32.png'));
fs.copyFileSync(layer64, path.join(outDir, '64x64.png'));
fs.copyFileSync(layer128, path.join(outDir, '128x128.png'));
fs.copyFileSync(layer256, path.join(outDir, '128x128@2x.png'));
fs.copyFileSync(layer512, path.join(outDir, 'icon.png'));

const ico = await pngToIco([layer32, layer16, layer24, layer48, layer64, layer256]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log('Wrote transparent Kilrun Engine icons to', outDir);
