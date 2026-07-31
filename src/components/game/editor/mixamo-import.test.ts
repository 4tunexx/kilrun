import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { guessTargetBone, listClipBones, retargetClip, splitTrackName } from './mixamo-import';

const PACK_BONES = [
  'DEF-spine',
  'DEF-spine.001',
  'DEF-spine.002',
  'DEF-spine.003',
  'DEF-spine.004',
  'DEF-spine.006',
  'DEF-shoulder.L',
  'DEF-upper_arm.L',
  'DEF-forearm.L',
  'DEF-hand.L',
  'DEF-shoulder.R',
  'DEF-upper_arm.R',
  'DEF-forearm.R',
  'DEF-hand.R',
  'DEF-thigh.L',
  'DEF-shin.L',
  'DEF-foot.L',
  'DEF-toe.L',
  'DEF-thigh.R',
  'DEF-shin.R',
  'DEF-foot.R',
  'DEF-toe.R',
];

describe('splitTrackName', () => {
  it('splits known property suffixes', () => {
    expect(splitTrackName('mixamorig:LeftArm.quaternion')).toEqual({
      boneName: 'mixamorig:LeftArm',
      property: 'quaternion',
    });
    expect(splitTrackName('DEF-hand.L.position')).toEqual({
      boneName: 'DEF-hand.L',
      property: 'position',
    });
  });

  it('returns null for an unrecognized property', () => {
    expect(splitTrackName('mixamorig:LeftArm.morphTargetInfluences')).toBeNull();
  });
});

describe('guessTargetBone', () => {
  it('maps standard Mixamo bone names via the static table', () => {
    expect(guessTargetBone('mixamorig:LeftArm', PACK_BONES)).toBe('DEF-upper_arm.L');
    expect(guessTargetBone('mixamorig:RightUpLeg', PACK_BONES)).toBe('DEF-thigh.R');
    expect(guessTargetBone('mixamorig:Hips', PACK_BONES)).toBe('DEF-spine');
  });

  it('tolerates a stripped mixamorig prefix or numbered variant', () => {
    expect(guessTargetBone('LeftArm', PACK_BONES)).toBe('DEF-upper_arm.L');
    expect(guessTargetBone('mixamorig1:LeftArm', PACK_BONES)).toBe('DEF-upper_arm.L');
  });

  it('falls back to an exact normalized match against the live rig for non-Mixamo sources', () => {
    expect(guessTargetBone('DEF-hand.L', PACK_BONES)).toBe('DEF-hand.L');
  });

  it('returns null when nothing matches (dropped 3rd finger segment, unknown bone)', () => {
    expect(guessTargetBone('mixamorig:LeftHandThumb3', PACK_BONES)).toBeNull();
    expect(guessTargetBone('mixamorig:Ponytail1', PACK_BONES)).toBeNull();
  });
});

describe('listClipBones', () => {
  it('lists each distinct source bone once with its guessed target', () => {
    const clip = new THREE.AnimationClip('walk', 1, [
      new THREE.QuaternionKeyframeTrack('mixamorig:LeftArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('mixamorig:LeftArm.position', [0, 1], [0, 0, 0, 0, 0, 0]),
      new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const bones = listClipBones(clip, PACK_BONES);
    expect(bones).toEqual([
      { sourceBone: 'mixamorig:LeftArm', guess: 'DEF-upper_arm.L' },
      { sourceBone: 'mixamorig:Hips', guess: 'DEF-spine' },
    ]);
  });
});

describe('retargetClip', () => {
  it('renames tracks per the bone map and drops unmapped bones', () => {
    const clip = new THREE.AnimationClip('walk', 1.5, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:LeftArm.quaternion',
        [0, 1.5],
        [0, 0, 0, 1, 0.25, 0, 0, 0.75]
      ),
      new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0, 1.5], [0, 1, 0, 0, 1.25, 0]),
      new THREE.QuaternionKeyframeTrack(
        'mixamorig:Ponytail1.quaternion',
        [0, 1.5],
        [0, 0, 0, 1, 0, 0, 0, 1]
      ),
    ]);
    const boneMap: Record<string, string> = {
      'mixamorig:LeftArm': 'DEF-upper_arm.L',
      'mixamorig:Hips': 'DEF-spine',
      // 'mixamorig:Ponytail1' intentionally omitted — no target bone.
    };
    const { authored, usedTracks, droppedTracks } = retargetClip(clip, boneMap, 'my_walk');
    expect(authored.name).toBe('my_walk');
    expect(authored.duration).toBe(1.5);
    expect(usedTracks).toBe(2);
    expect(droppedTracks).toBe(1);
    const byBone = Object.fromEntries(authored.tracks.map((t) => [`${t.boneName}.${t.property}`, t]));
    expect(byBone['DEF-upper_arm.L.quaternion'].values).toEqual([0, 0, 0, 1, 0.25, 0, 0, 0.75]);
    expect(byBone['DEF-spine.position'].values).toEqual([0, 1, 0, 0, 1.25, 0]);
    expect(Object.keys(byBone)).toHaveLength(2);
  });

  it('falls back to the clip name when no name is given', () => {
    const clip = new THREE.AnimationClip('Idle_Combat', 1, [
      new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const { authored } = retargetClip(clip, { 'mixamorig:Hips': 'DEF-spine' }, '   ');
    expect(authored.name).toBe('Idle_Combat');
  });
});
