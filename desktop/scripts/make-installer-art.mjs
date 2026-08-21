/**
 * NSIS Modern UI bitmaps matching Engine splash (dark plate, red K, wordmark).
 * 24-bit BMP — NSIS rejects 32-bit / PNG headers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const k2 = path.join(root, 'public/K2.png');
const bg = path.join(root, 'public/uploads/site/bg3.png');
const wordmark = path.join(root, 'public/uploads/site/wordmark-f0ed874d3b8a105f.png');
const outDir = path.join(root, 'desktop/src-tauri/icons');

const sharp = (await import('sharp')).default;

function writeBmp24(file, width, height, rgba) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const pixels = stride * height;
  const buf = Buffer.alloc(54 + pixels);
  buf.writeUInt16LE(0x4d42, 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixels, 34);
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    let o = 54 + y * stride;
    for (let x = 0; x < width; x += 1) {
      const i = (srcY * width + x) * 4;
      buf[o++] = rgba[i + 2];
      buf[o++] = rgba[i + 1];
      buf[o++] = rgba[i];
    }
  }
  fs.writeFileSync(file, buf);
}

async function toBmp(file, width, height, pipeline) {
  const { data } = await pipeline
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  writeBmp24(file, width, height, data);
}

function overlaySvg(width, height, body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`
  );
}

async function composePlate(width, height, extras) {
  const plate = await sharp(bg)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer();
  const wash = overlaySvg(
    width,
    height,
    `<rect width="100%" height="100%" fill="#080b12" fill-opacity="0.78"/>
     <defs>
       <radialGradient id="glow" cx="50%" cy="30%" r="62%">
         <stop offset="0%" stop-color="#e23d4a" stop-opacity="0.42"/>
         <stop offset="100%" stop-color="#e23d4a" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="100%" height="100%" fill="url(#glow)"/>
     <rect width="100%" height="100%" fill="url(#glow)" transform="translate(0, ${Math.round(height * 0.35)})"/>`
  );
  return sharp(plate).composite([{ input: wash, top: 0, left: 0 }, ...extras]);
}

async function makeSidebar() {
  const W = 164;
  const H = 314;
  const kSize = 96;
  const k = await sharp(k2)
    .resize(kSize, kSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const mark = await sharp(wordmark)
    .resize(138, 40, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const caption = overlaySvg(
    W,
    22,
    `<text x="82" y="15" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="4.4" fill="#f3c4c8">ENGINE</text>`
  );
  const pipeline = await composePlate(W, H, [
    { input: k, top: 46, left: Math.round((W - kSize) / 2) },
    { input: mark, top: 168, left: 13 },
    { input: caption, top: 248, left: 0 },
  ]);
  await toBmp(path.join(outDir, 'installer-sidebar.bmp'), W, H, pipeline);
}

async function makeHeader() {
  const W = 150;
  const H = 57;
  const kSize = 40;
  const k = await sharp(k2)
    .resize(kSize, kSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const mark = await sharp(wordmark)
    .resize(96, 28, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const pipeline = await composePlate(W, H, [
    { input: k, top: Math.round((H - kSize) / 2), left: 8 },
    { input: mark, top: 14, left: 50 },
  ]);
  await toBmp(path.join(outDir, 'installer-header.bmp'), W, H, pipeline);
}

if (!fs.existsSync(k2) || !fs.existsSync(bg) || !fs.existsSync(wordmark)) {
  console.error('Missing Engine brand images for installer art');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
await makeSidebar();
await makeHeader();
console.log('Wrote NSIS installer bitmaps to', outDir);
