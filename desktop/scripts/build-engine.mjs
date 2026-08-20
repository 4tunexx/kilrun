/**
 * Production Engine installer build.
 * Reads NEXT_PUBLIC_SITE_URL / KILRUN_PLATFORM_URL from the environment
 * (same values the web platform already uses) and passes them to Cargo.
 * Does not invent hosts. Localhost URLs are not baked into shareable installers.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function stripSlash(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function isLocalHost(url) {
  return /localhost|127\.0\.0\.1/i.test(url);
}

const configuredPlatform = stripSlash(
  process.env.KILRUN_PLATFORM_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
);
const platformUrl =
  configuredPlatform && !isLocalHost(configuredPlatform)
    ? configuredPlatform
    : 'https://kilrun.vercel.app';

const gameServerUrl = stripSlash(process.env.NEXT_PUBLIC_GAME_SERVER_URL || '');
const shareGameServerUrl = gameServerUrl && !isLocalHost(gameServerUrl) ? gameServerUrl : '';

const capPath = path.join(root, 'desktop/src-tauri/capabilities/default.json');
const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
const urls = new Set(cap.remote?.urls ?? []);
urls.add('http://localhost:3000/*');
urls.add('http://127.0.0.1:3000/*');
urls.add('https://fonts.googleapis.com/*');
urls.add('https://fonts.gstatic.com/*');
try {
  const parsed = new URL(platformUrl);
  urls.add(`${parsed.origin}/*`);
} catch {
  /* ignore invalid */
}
cap.remote = { urls: [...urls] };
fs.writeFileSync(capPath, `${JSON.stringify(cap, null, 2)}\n`);

const tauriDir = path.join(root, 'desktop/src-tauri');
const env = {
  ...process.env,
  KILRUN_PLATFORM_URL: platformUrl,
  NEXT_PUBLIC_SITE_URL: platformUrl,
  NEXT_PUBLIC_GAME_SERVER_URL: shareGameServerUrl,
};
const cargoBin = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
if (cargoBin && !String(env.Path || env.PATH || '').includes('.cargo')) {
  env.Path = `${cargoBin};${env.Path || env.PATH || ''}`;
}

function run(command, cwd = root) {
  const result = spawnSync(command, {
    cwd,
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status) process.exit(result.status);
  return result;
}

run('node desktop/scripts/make-engine-icon.mjs');

const vcvars =
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat';
const buildCmd = fs.existsSync(vcvars)
  ? `"${vcvars}" && npx tauri build --config tauri.conf.json --no-bundle --no-sign`
  : 'npx tauri build --config tauri.conf.json --no-bundle --no-sign';
run(buildCmd, tauriDir);

const exe = path.join(tauriDir, 'target/release/kilrun-engine.exe');
run(`node desktop/scripts/stamp-exe-icon.mjs "${exe}"`);

const bundleCmd = fs.existsSync(vcvars)
  ? `"${vcvars}" && npx tauri bundle --config tauri.conf.json --bundles nsis --no-sign`
  : 'npx tauri bundle --config tauri.conf.json --bundles nsis --no-sign';
run(bundleCmd, tauriDir);

const nsisDir = path.join(tauriDir, 'target/release/bundle/nsis');
const setupSrc = fs
  .readdirSync(nsisDir)
  .filter((name) => name.toLowerCase().endsWith('-setup.exe'))
  .map((name) => path.join(nsisDir, name))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!setupSrc) {
  console.error('NSIS installer was not produced in', nsisDir);
  process.exit(1);
}

const distDir = path.join(root, 'desktop/dist');
fs.mkdirSync(distDir, { recursive: true });
const distSetup = path.join(distDir, 'Kilrun Engine Setup.exe');
fs.copyFileSync(setupSrc, distSetup);
fs.copyFileSync(exe, path.join(distDir, 'Kilrun Engine.exe'));

const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop');
if (fs.existsSync(desktopDir)) {
  fs.copyFileSync(setupSrc, path.join(desktopDir, 'Kilrun Engine Setup.exe'));
  fs.copyFileSync(exe, path.join(desktopDir, 'Kilrun Engine.exe'));
  fs.copyFileSync(exe, path.join(desktopDir, 'KilrunEngine.exe'));
}

console.log('Kilrun Engine installer ready:');
console.log(' ', setupSrc);
console.log(' ', distSetup);
if (fs.existsSync(desktopDir)) {
  console.log(' ', path.join(desktopDir, 'Kilrun Engine Setup.exe'));
  console.log(' ', path.join(desktopDir, 'Kilrun Engine.exe'));
}
console.log('Platform:', platformUrl);
