/**
 * Copy effects/*.mp3 → public/game/sounds/ with kebab filenames.
 * Skips Godot *.import sidecars. Runtime ships public/game/sounds/ only.
 *
 * Usage: npm run db:seed-sounds
 *
 * effects/ is gitignored (Godot source dump). Keep a local copy to re-import.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packFilenameToBundled } from '../shared/default-sound-pack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'effects');
const DEST = path.join(ROOT, 'public', 'game', 'sounds');

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source folder: ${SOURCE}`);
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });
  const files = fs.readdirSync(SOURCE).filter((f) => f.toLowerCase().endsWith('.mp3'));
  let copied = 0;
  const seen = new Set<string>();
  for (const file of files) {
    const destName = packFilenameToBundled(file);
    if (seen.has(destName)) {
      console.warn(`Duplicate bundled name ${destName} (from ${file}) — last copy wins`);
    }
    seen.add(destName);
    fs.copyFileSync(path.join(SOURCE, file), path.join(DEST, destName));
    copied += 1;
  }
  console.log(`Copied ${copied} mp3(s) → public/game/sounds/`);
}

main();
