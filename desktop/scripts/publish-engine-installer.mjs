/**
 * Optional: upload Setup.exe to kilrun-assets using BLOB_READ_WRITE_TOKEN
 * already in the process env (Vercel production). Does not write git files.
 *
 * Preferred: Upload in the Vercel Blob UI, then set KILRUN_ENGINE_DOWNLOAD_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();

if (!token.startsWith('vercel_blob_') || token.length < 40) {
  console.error(`No BLOB_READ_WRITE_TOKEN in this process.

Do not put it in .env.local. Either:

A) Vercel → Storage → kilrun-assets → Upload
   file: Desktop\\Kilrun Engine Setup.exe
   path: engine/Kilrun-Engine-Setup.exe
   then Project Settings → Environment Variables:
   KILRUN_ENGINE_DOWNLOAD_URL = <the public Blob URL>
   Production + Preview, then Redeploy.

B) npx vercel env run -e production -- npm run engine:publish-installer
`);
  process.exit(1);
}

const setup = path.join(root, 'public/downloads/Kilrun-Engine-Setup.exe');
if (!fs.existsSync(setup)) {
  console.error('Missing', setup, '— run npm run engine:build first.');
  process.exit(1);
}

const body = fs.readFileSync(setup);
console.log('Uploading Kilrun-Engine-Setup.exe', `${(body.length / 1_000_000).toFixed(1)} MB`);

delete process.env.VERCEL_OIDC_TOKEN;

const blob = await put('engine/Kilrun-Engine-Setup.exe', body, {
  access: 'public',
  token,
  contentType: 'application/octet-stream',
  addRandomSuffix: false,
  allowOverwrite: true,
});

console.log('Blob URL:', blob.url);
console.log('Set this in Vercel env (Production + Preview), then Redeploy:');
console.log(`KILRUN_ENGINE_DOWNLOAD_URL=${blob.url}`);
