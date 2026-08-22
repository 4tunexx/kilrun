import rcedit from 'rcedit';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.argv[2] || path.join(root, 'desktop/src-tauri/target/release/kilrun-engine.exe');
const ico = path.join(root, 'desktop/src-tauri/icons/icon.ico');

// Cargo.toml is the single source of truth for the engine version (Rust
// code reads it via `env!("CARGO_PKG_VERSION")`, and tauri.conf.json has no
// "version" of its own so it falls back to the same value) — this used to
// be a hardcoded literal here that had already drifted out of sync with
// Cargo.toml once. No `toml` dependency needed for one line: Cargo.toml's
// `version = "x.y.z"` is a stable, simple format to line-match.
const cargoToml = readFileSync(path.join(root, 'desktop/src-tauri/Cargo.toml'), 'utf8');
const versionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
if (!versionMatch) {
  throw new Error('Could not find `version = "..."` in desktop/src-tauri/Cargo.toml');
}
const version = versionMatch[1];

await rcedit(exe, {
  icon: ico,
  'version-string': {
    CompanyName: 'Kilrun',
    FileDescription: 'Kilrun Engine',
    ProductName: 'Kilrun Engine',
    LegalCopyright: 'Kilrun',
    OriginalFilename: 'kilrun-engine.exe',
  },
  'file-version': version,
  'product-version': version,
});
console.log(`Stamped icon (v${version}) onto`, exe);
