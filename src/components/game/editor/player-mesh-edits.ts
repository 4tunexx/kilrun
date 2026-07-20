/**
 * Apply / collect player mesh edits, helper bones, and authored animation clips
 * from the Player Model studio.
 */
import * as THREE from 'three';
import type {
  PlayerAuthoredClip,
  PlayerExtraBone,
  PlayerMeshEdits,
} from './map-document';

export function listBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

export function listMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) meshes.push(m);
  });
  return meshes;
}

export function applyPlayerMeshEdits(root: THREE.Object3D, edits?: PlayerMeshEdits | null) {
  if (!edits) return;
  if (edits.meshColors) {
    for (const [name, hex] of Object.entries(edits.meshColors)) {
      const obj = root.getObjectByName(name);
      if (!obj) continue;
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const apply = (mat: THREE.Material) => {
          const std = mat as THREE.MeshStandardMaterial;
          if ('color' in std && std.color) std.color.set(hex);
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
        else if (mesh.material) apply(mesh.material);
      });
    }
  }
  if (edits.meshScales) {
    for (const [name, scale] of Object.entries(edits.meshScales)) {
      const obj = root.getObjectByName(name);
      if (obj) obj.scale.set(scale[0], scale[1], scale[2]);
    }
  }
  if (edits.boneScales) {
    for (const [name, scale] of Object.entries(edits.boneScales)) {
      const bone = root.getObjectByName(name);
      if (bone) bone.scale.set(scale[0], scale[1], scale[2]);
    }
  }
}

export function applyExtraBones(root: THREE.Object3D, extras?: PlayerExtraBone[] | null) {
  if (!extras?.length) return;
  for (const extra of extras) {
    if (root.getObjectByName(extra.name)) continue;
    const parent =
      root.getObjectByName(extra.parentName) ??
      listBones(root)[0] ??
      root;
    const bone = new THREE.Bone();
    bone.name = extra.name;
    bone.position.set(...extra.position);
    bone.userData.kilrunExtraBone = true;
    parent.add(bone);
  }
}

export function removeExtraBone(root: THREE.Object3D, name: string) {
  const bone = root.getObjectByName(name);
  if (!bone || !bone.userData?.kilrunExtraBone) return;
  // Reparent children to the bone's parent before removing.
  const parent = bone.parent;
  if (parent) {
    [...bone.children].forEach((child) => parent.add(child));
  }
  bone.removeFromParent();
}

export function authoredClipsToThree(clips: PlayerAuthoredClip[] | null | undefined): THREE.AnimationClip[] {
  if (!clips?.length) return [];
  return clips.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of clip.tracks) {
      const path = `${t.boneName}.${t.property}`;
      if (t.property === 'quaternion') {
        tracks.push(new THREE.QuaternionKeyframeTrack(path, t.times, t.values));
      } else if (t.property === 'scale') {
        tracks.push(new THREE.VectorKeyframeTrack(path, t.times, t.values));
      } else {
        tracks.push(new THREE.VectorKeyframeTrack(path, t.times, t.values));
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
}

export function captureBoneKeyframe(
  bone: THREE.Object3D,
  time: number
): Array<{ property: 'quaternion' | 'position' | 'scale'; time: number; values: number[] }> {
  return [
    {
      property: 'position',
      time,
      values: [bone.position.x, bone.position.y, bone.position.z],
    },
    {
      property: 'quaternion',
      time,
      values: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
    },
    {
      property: 'scale',
      time,
      values: [bone.scale.x, bone.scale.y, bone.scale.z],
    },
  ];
}

export function bakeTimelineToClip(
  name: string,
  boneName: string,
  keyframes: Array<{ time: number; position: number[]; quaternion: number[]; scale: number[] }>
): PlayerAuthoredClip {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const times = sorted.map((k) => k.time);
  const duration = Math.max(0.1, times[times.length - 1] ?? 0.1);
  return {
    name,
    duration,
    tracks: [
      {
        boneName,
        property: 'position',
        times: [...times],
        values: sorted.flatMap((k) => k.position),
      },
      {
        boneName,
        property: 'quaternion',
        times: [...times],
        values: sorted.flatMap((k) => k.quaternion),
      },
      {
        boneName,
        property: 'scale',
        times: [...times],
        values: sorted.flatMap((k) => k.scale),
      },
    ],
  };
}
