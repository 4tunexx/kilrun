/**
 * Turn the converted Characters_7 pack animation JSON (produced by
 * `scripts/convert-unity-anims.js`) into THREE.AnimationClips that bind to the
 * pack skeleton (Rigify `DEF-` bones) loaded via FBXLoader.
 *
 * Conversion knobs are intentional — use `/anim-test` to dial them in.
 */
import * as THREE from 'three';

export interface PackClipData {
  name: string;
  duration: number;
  loop: boolean;
  sampleRate: number;
  rotation: Record<string, number[][]>;
  position: Record<string, number[][]>;
  scale: Record<string, number[][]>;
}

export interface PackAnimsFile {
  version: number;
  space: string;
  clips: PackClipData[];
}

export const PACK_ANIMS_URL = '/game/skins/anim/pack-anims.json';

/** Preset Unity(LH) -> three(RH) basis conversions. */
export type ConvMode =
  | 'raw'
  | 'flipX'
  | 'flipY'
  | 'flipZ'
  | 'flipX_negW'
  | 'flipZ_negW'
  | 'custom';

export const CONV_MODES: ConvMode[] = [
  'raw',
  'flipX',
  'flipY',
  'flipZ',
  'flipX_negW',
  'flipZ_negW',
  'custom',
];

/**
 * Fine-grained conversion knobs used by `/anim-test` (and when mode === 'custom').
 * Defaults match 'raw'.
 */
export interface CustomConv {
  /** Negate position X / Y / Z after reading Unity keys. */
  posNegX: boolean;
  posNegY: boolean;
  posNegZ: boolean;
  /** Negate quaternion X / Y / Z / W components. */
  quatNegX: boolean;
  quatNegY: boolean;
  quatNegZ: boolean;
  quatNegW: boolean;
  /** Swap quat.y <-> quat.z (common LH/RH mixup). */
  quatSwapYZ: boolean;
  /** Invert quaternion (conjugate) — reverses rotation sense. */
  quatConjugate: boolean;
}

export const DEFAULT_CUSTOM_CONV: CustomConv = {
  posNegX: false,
  posNegY: false,
  posNegZ: false,
  quatNegX: false,
  quatNegY: false,
  quatNegZ: false,
  quatNegW: false,
  quatSwapYZ: false,
  quatConjugate: false,
};

/** Production default — verified against A_Poses vs FBX bind on every bone.
 *  Shoulders/upper-arms/fingers need flipX (~146° off with raw); legs/spine
 *  are essentially identical under raw and flipX, so flipX is safe globally. */
export const DEFAULT_CONV_MODE: ConvMode = 'flipX';

function convQuatPreset(
  mode: ConvMode,
  x: number,
  y: number,
  z: number,
  w: number
): [number, number, number, number] {
  switch (mode) {
    case 'flipX':
      return [x, -y, -z, w];
    case 'flipZ':
      return [-x, -y, z, w];
    case 'flipY':
      return [-x, y, -z, w];
    case 'flipX_negW':
      return [-x, y, z, -w];
    case 'flipZ_negW':
      return [x, y, -z, -w];
    case 'raw':
    case 'custom':
    default:
      return [x, y, z, w];
  }
}

function convPosPreset(mode: ConvMode, x: number, y: number, z: number): [number, number, number] {
  switch (mode) {
    case 'flipX':
    case 'flipX_negW':
      return [-x, y, z];
    case 'flipZ':
    case 'flipZ_negW':
      return [x, y, -z];
    case 'flipY':
      return [x, -y, z];
    case 'raw':
    case 'custom':
    default:
      return [x, y, z];
  }
}

function applyCustomQuat(c: CustomConv, x: number, y: number, z: number, w: number): [number, number, number, number] {
  let qx = c.quatNegX ? -x : x;
  let qy = c.quatNegY ? -y : y;
  let qz = c.quatNegZ ? -z : z;
  const qw = c.quatNegW ? -w : w;
  if (c.quatSwapYZ) {
    const t = qy;
    qy = qz;
    qz = t;
  }
  if (c.quatConjugate) {
    qx = -qx;
    qy = -qy;
    qz = -qz;
  }
  return [qx, qy, qz, qw];
}

function applyCustomPos(c: CustomConv, x: number, y: number, z: number): [number, number, number] {
  return [c.posNegX ? -x : x, c.posNegY ? -y : y, c.posNegZ ? -z : z];
}

/**
 * Per-bone rebase pair. Lets us express the Unity key as a DELTA from a
 * reference pose and re-apply it on top of the FBX bind pose:
 *   q_final = bind * inverse(ref) * q_anim
 * This cancels any constant offset between Unity's rest rotation and the
 * rest rotation FBXLoader produced for the same bone.
 */
export interface RebasePair {
  bind: THREE.Quaternion;
  ref: THREE.Quaternion;
}

export interface BuildOptions {
  mode?: ConvMode;
  custom?: CustomConv;
  /** Resolve a pack bone name to a real bone name on the target skeleton. */
  resolveBone?: (name: string) => string | null;
  /** Multiply position tracks (FBXLoader scenes are often in cm). */
  posScale?: number;
  /** Drop all position tracks (keep bind-pose translation). */
  skipPosition?: boolean;
  /** Drop all scale tracks. */
  skipScale?: boolean;
  /** Drop all rotation tracks (debug). */
  skipRotation?: boolean;
  /** Only include bones whose names match (substring, case-insensitive). Empty = all. */
  boneFilter?: string;
  /** Drop the armature `rig` / `root` tracks (they can double-rotate the body). */
  skipRootBones?: boolean;
  /** Rebase rotations onto the FBX bind pose (see RebasePair). */
  rebase?: (packBone: string) => RebasePair | null;
}

const _qAnim = new THREE.Quaternion();
const _qRefInv = new THREE.Quaternion();
const _qOut = new THREE.Quaternion();

function buildTrack(
  bone: string,
  prop: 'quaternion' | 'position' | 'scale',
  keys: number[][],
  mode: ConvMode,
  custom: CustomConv,
  posScale: number,
  rebase?: RebasePair | null
): THREE.KeyframeTrack | null {
  if (!keys.length) return null;
  const times = new Float32Array(keys.length);
  if (prop === 'quaternion') {
    const values = new Float32Array(keys.length * 4);
    keys.forEach((k, i) => {
      times[i] = k[0]!;
      let [x, y, z, w] = convQuatPreset(mode === 'custom' ? 'raw' : mode, k[1]!, k[2]!, k[3]!, k[4]!);
      if (mode === 'custom') [x, y, z, w] = applyCustomQuat(custom, x, y, z, w);
      if (rebase) {
        _qAnim.set(x, y, z, w);
        _qRefInv.copy(rebase.ref).invert();
        _qOut.copy(rebase.bind).multiply(_qRefInv).multiply(_qAnim);
        x = _qOut.x;
        y = _qOut.y;
        z = _qOut.z;
        w = _qOut.w;
      }
      values[i * 4] = x;
      values[i * 4 + 1] = y;
      values[i * 4 + 2] = z;
      values[i * 4 + 3] = w;
    });
    return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, Array.from(times), Array.from(values));
  }
  const values = new Float32Array(keys.length * 3);
  keys.forEach((k, i) => {
    times[i] = k[0]!;
    let [x, y, z] = convPosPreset(mode === 'custom' ? 'raw' : mode, k[1]!, k[2]!, k[3]!);
    if (mode === 'custom') [x, y, z] = applyCustomPos(custom, x, y, z);
    if (prop === 'position') {
      x *= posScale;
      y *= posScale;
      z *= posScale;
    }
    values[i * 3] = x;
    values[i * 3 + 1] = y;
    values[i * 3 + 2] = z;
  });
  return new THREE.VectorKeyframeTrack(`${bone}.${prop}`, Array.from(times), Array.from(values));
}

export function buildPackClip(data: PackClipData, opts: BuildOptions = {}): THREE.AnimationClip {
  const mode = opts.mode ?? DEFAULT_CONV_MODE;
  const custom = opts.custom ?? DEFAULT_CUSTOM_CONV;
  const posScale = opts.posScale ?? 1;
  const resolve = opts.resolveBone ?? ((n: string) => n);
  const filter = opts.boneFilter?.trim().toLowerCase() || '';
  const tracks: THREE.KeyframeTrack[] = [];

  const add = (section: Record<string, number[][]>, prop: 'quaternion' | 'position' | 'scale') => {
    for (const [packBone, keys] of Object.entries(section)) {
      if (filter && !packBone.toLowerCase().includes(filter)) continue;
      if (opts.skipRootBones && /^(rig|root)$/i.test(packBone)) continue;
      const bone = resolve(packBone);
      if (!bone) continue;
      const rebase = prop === 'quaternion' && opts.rebase ? opts.rebase(packBone) : null;
      const t = buildTrack(bone, prop, keys, mode, custom, posScale, rebase);
      if (t) tracks.push(t);
    }
  };
  if (!opts.skipRotation) add(data.rotation, 'quaternion');
  if (!opts.skipPosition) add(data.position, 'position');
  if (!opts.skipScale) add(data.scale, 'scale');

  return new THREE.AnimationClip(data.name, data.duration || -1, tracks);
}

export function buildPackClips(file: PackAnimsFile, opts: BuildOptions = {}): THREE.AnimationClip[] {
  return file.clips.map((c) => buildPackClip(c, opts));
}

let cache: Promise<PackAnimsFile> | null = null;
export function loadPackAnimsFile(url: string = PACK_ANIMS_URL): Promise<PackAnimsFile> {
  if (!cache) {
    cache = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`pack-anims fetch ${r.status}`);
      return r.json() as Promise<PackAnimsFile>;
    });
  }
  return cache;
}

/** Build a bone-name resolver from the actual bones under a loaded root. */
export function makeBoneResolver(root: THREE.Object3D): (name: string) => string | null {
  const names = new Set<string>();
  root.traverse((o) => {
    if (o.name) names.add(o.name);
  });
  const lower = new Map<string, string>();
  for (const n of names) lower.set(n.toLowerCase(), n);
  return (packBone: string) => {
    if (names.has(packBone)) return packBone;
    const l = packBone.toLowerCase();
    if (lower.has(l)) return lower.get(l)!;
    const noDots = l.replace(/\./g, '');
    if (lower.has(noDots)) return lower.get(noDots)!;
    const underscored = l.replace(/\./g, '_');
    if (lower.has(underscored)) return lower.get(underscored)!;
    return null;
  };
}

/** Snapshot every Bone's local TRS (for "copy correct bones"). */
export function snapshotBoneLocals(root: THREE.Object3D): Record<
  string,
  { pos: [number, number, number]; quat: [number, number, number, number]; scale: [number, number, number] }
> {
  const out: Record<
    string,
    { pos: [number, number, number]; quat: [number, number, number, number]; scale: [number, number, number] }
  > = {};
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone && o.type !== 'Bone') return;
    if (!o.name) return;
    out[o.name] = {
      pos: [o.position.x, o.position.y, o.position.z],
      quat: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w],
      scale: [o.scale.x, o.scale.y, o.scale.z],
    };
  });
  return out;
}
