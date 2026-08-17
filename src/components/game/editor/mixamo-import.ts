/**
 * Mixamo clip importer — turns an uploaded Mixamo FBX/GLB animation clip into
 * a PlayerAuthoredClip on the current avatar's rig.
 *
 * This is a name-based track retarget (rename each track's bone target from
 * the Mixamo name to the matching rig bone), not a full bind-pose /
 * bone-roll correction. For clips built on a similar humanoid hierarchy this
 * gives a usable result immediately; anything that looks twisted or stiff
 * after preview still benefits from the Blender/Cascadeur retarget path
 * documented in docs/ANIMATIONS_MIXAMO_AND_COMBAT.md — this importer covers
 * the "get it in and try it" step, not a guaranteed pixel-perfect retarget.
 */
import * as THREE from 'three';
import type { PlayerAuthoredClip, PlayerAuthoredTrack } from './map-document';

/**
 * Standard Mixamo rig bone name → Kilrun pack Rigify DEF-* bone name.
 * Keys are lowercased, "mixamorig" prefix stripped, ':' / '_' / ' ' removed —
 * see normalizeBoneKey(). Covers the default Mixamo "Without Skin" hierarchy.
 * Third finger segments (e.g. LeftHandThumb3) intentionally have no entry —
 * the pack rig only has two segments per finger (DEF-thumb.02.L etc.), and
 * mapping two source bones onto the same target track would silently
 * overwrite one — better to drop the extra segment than corrupt the track.
 */
const MIXAMO_TO_DEF: Record<string, string> = {
  hips: 'DEF-spine',
  spine: 'DEF-spine.001',
  spine1: 'DEF-spine.002',
  spine2: 'DEF-spine.003',
  neck: 'DEF-spine.004',
  head: 'DEF-spine.006',

  leftshoulder: 'DEF-shoulder.L',
  leftarm: 'DEF-upper_arm.L',
  leftupperarm: 'DEF-upper_arm.L',
  leftforearm: 'DEF-forearm.L',
  leftlowerarm: 'DEF-forearm.L',
  lefthand: 'DEF-hand.L',
  rightshoulder: 'DEF-shoulder.R',
  rightarm: 'DEF-upper_arm.R',
  rightupperarm: 'DEF-upper_arm.R',
  rightforearm: 'DEF-forearm.R',
  rightlowerarm: 'DEF-forearm.R',
  righthand: 'DEF-hand.R',

  leftupleg: 'DEF-thigh.L',
  leftupperleg: 'DEF-thigh.L',
  leftthigh: 'DEF-thigh.L',
  leftleg: 'DEF-shin.L',
  leftcalf: 'DEF-shin.L',
  leftlowerleg: 'DEF-shin.L',
  leftfoot: 'DEF-foot.L',
  lefttoebase: 'DEF-toe.L',
  rightupleg: 'DEF-thigh.R',
  rightupperleg: 'DEF-thigh.R',
  rightthigh: 'DEF-thigh.R',
  rightleg: 'DEF-shin.R',
  rightcalf: 'DEF-shin.R',
  rightlowerleg: 'DEF-shin.R',
  rightfoot: 'DEF-foot.R',
  righttoebase: 'DEF-toe.R',

  lefthandthumb1: 'DEF-thumb.01.L',
  lefthandthumb2: 'DEF-thumb.02.L',
  lefthandindex1: 'DEF-f_index.01.L',
  lefthandindex2: 'DEF-f_index.02.L',
  lefthandmiddle1: 'DEF-f_middle.01.L',
  lefthandmiddle2: 'DEF-f_middle.02.L',
  lefthandring1: 'DEF-f_ring.01.L',
  lefthandring2: 'DEF-f_ring.02.L',
  lefthandpinky1: 'DEF-f_pinky.01.L',
  lefthandpinky2: 'DEF-f_pinky.02.L',

  righthandthumb1: 'DEF-thumb.01.R',
  righthandthumb2: 'DEF-thumb.02.R',
  righthandindex1: 'DEF-f_index.01.R',
  righthandindex2: 'DEF-f_index.02.R',
  righthandmiddle1: 'DEF-f_middle.01.R',
  righthandmiddle2: 'DEF-f_middle.02.R',
  righthandring1: 'DEF-f_ring.01.R',
  righthandring2: 'DEF-f_ring.02.R',
  righthandpinky1: 'DEF-f_pinky.01.R',
  righthandpinky2: 'DEF-f_pinky.02.R',
};

const KNOWN_PROPERTIES = ['quaternion', 'position', 'scale'] as const;
type TrackProperty = (typeof KNOWN_PROPERTIES)[number];

/** Strip a trailing THREE.js track property suffix; null if none matched. */
export function splitTrackName(
  name: string
): { boneName: string; property: TrackProperty } | null {
  for (const prop of KNOWN_PROPERTIES) {
    const suffix = `.${prop}`;
    if (name.endsWith(suffix)) {
      return { boneName: name.slice(0, -suffix.length), property: prop };
    }
  }
  return null;
}

/** "mixamorig:LeftArm" / "mixamorig1_LeftArm" / "LeftArm" → "leftarm". */
function normalizeBoneKey(name: string): string {
  return name
    .replace(/^mixamorig\d*[:_ ]?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Best-guess target bone for a source (Mixamo) bone name, given the actual
 * target rig's bone list — prefers the static Mixamo→DEF table, falls back
 * to a normalized exact-name match against the live rig (covers non-Mixamo
 * sources that already share bone names) and then a substring match.
 */
export function guessTargetBone(sourceBoneName: string, targetBoneNames: string[]): string | null {
  const key = normalizeBoneKey(sourceBoneName);
  const mapped = MIXAMO_TO_DEF[key];
  if (mapped && targetBoneNames.includes(mapped)) return mapped;

  const normalizedTargets = targetBoneNames.map((t) => ({ t, key: normalizeBoneKey(t) }));
  const exact = normalizedTargets.find((n) => n.key === key);
  if (exact) return exact.t;

  // Substring fallback is last-resort and must be unique + long enough so
  // "arm" does not steal "forearm" / "upperarm".
  if (key.length < 6) return null;
  const partials = normalizedTargets.filter(
    (n) => n.key.length >= 6 && (n.key.includes(key) || key.includes(n.key))
  );
  return partials.length === 1 ? partials[0].t : null;
}

export interface ClipBoneUsage {
  sourceBone: string;
  guess: string | null;
}

/** Every distinct bone referenced by a clip's tracks, in first-seen order. */
export function listClipBones(clip: THREE.AnimationClip, targetBoneNames: string[]): ClipBoneUsage[] {
  const seen = new Set<string>();
  const out: ClipBoneUsage[] = [];
  for (const track of clip.tracks) {
    const parsed = splitTrackName(track.name);
    if (!parsed || seen.has(parsed.boneName)) continue;
    seen.add(parsed.boneName);
    out.push({ sourceBone: parsed.boneName, guess: guessTargetBone(parsed.boneName, targetBoneNames) });
  }
  return out;
}

/**
 * Rename each track's bone target per boneMap (source bone name → target
 * bone name, or omit/empty to drop that bone's tracks entirely) and package
 * as a PlayerAuthoredClip ready to store in playerAuthoredClips.
 */
export function retargetClip(
  clip: THREE.AnimationClip,
  boneMap: Record<string, string>,
  name: string
): { authored: PlayerAuthoredClip; usedTracks: number; droppedTracks: number } {
  const byBoneProp = new Map<string, PlayerAuthoredTrack>();
  let dropped = 0;
  for (const track of clip.tracks) {
    const parsed = splitTrackName(track.name);
    if (!parsed) {
      dropped++;
      continue;
    }
    const targetBone = boneMap[parsed.boneName];
    if (!targetBone) {
      dropped++;
      continue;
    }
    const key = `${targetBone}.${parsed.property}`;
    // Last-wins if two source bones somehow map to the same target+property
    // (e.g. dropped 3rd finger segments funneled onto the 2nd) — matches
    // how a real duplicate keyframe track would behave in three.js anyway.
    byBoneProp.set(key, {
      boneName: targetBone,
      property: parsed.property,
      times: Array.from(track.times),
      values: Array.from(track.values),
    });
  }
  return {
    authored: {
      name: name.trim() || clip.name || 'mixamo_clip',
      duration: clip.duration,
      tracks: Array.from(byBoneProp.values()),
    },
    usedTracks: byBoneProp.size,
    droppedTracks: dropped,
  };
}
