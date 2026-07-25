/**
 * Convert the Characters_7 pack Unity *.anim clips into a single JSON file that
 * the web client can turn into THREE.AnimationClips at runtime.
 *
 * Source: optional local ../model_skins/*.anim (gitignored Unity dump)
 * Output: public/game/skins/anim/pack-anims.json
 *
 * The .anim files store LOCAL bone TRS curves (Rigify `DEF-` bones) in Unity's
 * left-handed, Y-up space. We keep the RAW values here; the coordinate-system
 * conversion (Unity -> three.js) happens in `src/lib/unity-anim.ts` so it can be
 * tuned without re-running this script.
 *
 * Run: node scripts/convert-unity-anims.js
 *
 * See docs/ANIMATIONS_MIXAMO_AND_COMBAT.md for Mixamo / extra clips.
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../model_skins');
const OUT_FILE = path.resolve(__dirname, '../public/game/skins/anim/pack-anims.json');

/** Take the leaf bone name from a Unity transform path (`rig/root/DEF-spine` -> `DEF-spine`). */
function leafBone(p) {
  const parts = p.split('/');
  return parts[parts.length - 1] || p;
}

function parseVec(str) {
  // e.g. "{x: -0.7071068, y: 0, z: -0, w: 0.7071067}"
  const m = {};
  const re = /([xyzw]):\s*([^,}]+)/g;
  let mm;
  while ((mm = re.exec(str))) {
    m[mm[1]] = parseFloat(mm[2]);
  }
  return m;
}

/**
 * Parse one curve-list section (m_RotationCurves / m_PositionCurves / m_ScaleCurves).
 * Returns { [leafBone]: [ [time, ...values], ... ] }.
 */
function parseCurveSection(lines, startIdx, kind) {
  const out = {};
  let i = startIdx + 1;
  let keys = []; // buffered keyframes for the current curve
  let pending = null; // current keyframe being read

  const flush = (p) => {
    if (!p) return;
    if (keys.length) out[leafBone(p)] = keys;
    keys = [];
    pending = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    // A new top-level section (2-space indent `  m_Xxx:`) ends this one.
    if (/^ {2}[A-Za-z]/.test(line) && !/^ {2}- /.test(line)) {
      break;
    }
    const timeM = line.match(/^ {8}time:\s*(.+)$/);
    if (timeM) {
      pending = { time: parseFloat(timeM[1]) };
      continue;
    }
    const valM = line.match(/^ {8}value:\s*(\{.+\})\s*$/);
    if (valM && pending) {
      const v = parseVec(valM[1]);
      if (kind === 'rot') keys.push([pending.time, v.x, v.y, v.z, v.w]);
      else keys.push([pending.time, v.x, v.y, v.z]);
      pending = null;
      continue;
    }
    const pathM = line.match(/^ {4}path:\s*(.+)$/);
    if (pathM) {
      flush(pathM[1].trim());
      continue;
    }
  }
  return { out, next: i };
}

function parseAnim(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const nameM = text.match(/^ {2}m_Name:\s*(.+)$/m);
  let name = (nameM ? nameM[1].trim() : path.basename(file, '.anim')) || 'clip';
  // Unity quotes names that have trailing spaces / special chars.
  name = name.replace(/^['"]|['"]$/g, '').trim();

  const sampleM = text.match(/m_SampleRate:\s*([0-9.]+)/);
  const sampleRate = sampleM ? parseFloat(sampleM[1]) : 60;

  const stopM = text.match(/m_StopTime:\s*([0-9.eE+-]+)/);
  const loopM = text.match(/m_LoopTime:\s*([0-9]+)/);

  const clip = {
    name,
    sourceFile: path.basename(file),
    duration: stopM ? parseFloat(stopM[1]) : 0,
    loop: loopM ? loopM[1] === '1' : false,
    sampleRate,
    rotation: {},
    position: {},
    scale: {},
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {2}m_RotationCurves:/.test(line)) {
      const { out, next } = parseCurveSection(lines, i, 'rot');
      clip.rotation = out;
      i = next - 1;
    } else if (/^ {2}m_PositionCurves:/.test(line)) {
      const { out, next } = parseCurveSection(lines, i, 'pos');
      clip.position = out;
      i = next - 1;
    } else if (/^ {2}m_ScaleCurves:/.test(line)) {
      const { out, next } = parseCurveSection(lines, i, 'scl');
      clip.scale = out;
      i = next - 1;
    }
  }

  // Derive duration from keys if StopTime missing/zero.
  if (!clip.duration) {
    let max = 0;
    for (const section of [clip.rotation, clip.position, clip.scale]) {
      for (const keys of Object.values(section)) {
        const last = keys[keys.length - 1];
        if (last && last[0] > max) max = last[0];
      }
    }
    clip.duration = max;
  }

  // --- size optimizations ---
  const EPS = 1e-5;
  const round = (n) => Number(n.toFixed(6));
  const constant = (keys) => {
    if (keys.length <= 1) return true;
    const first = keys[0];
    return keys.every((k) =>
      k.every((v, idx) => idx === 0 || Math.abs(v - first[idx]) < EPS)
    );
  };
  // Rotation drives all motion: keep every bone, round values.
  for (const [bone, keys] of Object.entries(clip.rotation)) {
    clip.rotation[bone] = keys.map((k) => k.map(round));
  }
  // Position / scale: only keep bones that actually vary (others stay at bind pose).
  for (const kind of ['position', 'scale']) {
    for (const [bone, keys] of Object.entries(clip[kind])) {
      if (constant(keys)) delete clip[kind][bone];
      else clip[kind][bone] = keys.map((k) => k.map(round));
    }
  }
  return clip;
}

function main() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.toLowerCase().endsWith('.anim'))
    .sort();

  const clips = [];
  for (const f of files) {
    try {
      const clip = parseAnim(path.join(SRC_DIR, f));
      const rc = Object.keys(clip.rotation).length;
      const pc = Object.keys(clip.position).length;
      const sc = Object.keys(clip.scale).length;
      clips.push(clip);
      console.log(
        `  ${f.padEnd(30)} -> "${clip.name}" dur=${clip.duration.toFixed(2)} rot=${rc} pos=${pc} scl=${sc}`
      );
    } catch (err) {
      console.warn(`  ! failed ${f}:`, err.message);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ version: 1, space: 'unity', clips }, null, 0)
  );
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nWrote ${clips.length} clips -> ${OUT_FILE} (${kb} KB)`);
}

main();
