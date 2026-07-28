import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf, cloneGltfScene, cloneSkinnedScene } from '../renderer/asset-loader';
import { isFbxUrl, loadFbxModel, cloneFbxScene } from '../renderer/asset-loader-fbx';
import { packBodyTintHex } from '@/lib/pack-body-colors';
import { modelUrl } from './prototype-catalog';
import { HAMMER_SOLID_MODEL } from './map-document';

const clipCache = new Map<string, string[]>();

export function extractClipNames(gltf: GLTF): string[] {
  return (gltf.animations ?? []).map((c) => c.name || '(unnamed)');
}

/** Resolve model source: catalog name, character pack URL, or custom URL. */
export function resolveModelSrc(model?: string, customModelUrl?: string): string | null {
  if (customModelUrl) return customModelUrl;
  if (!model || model === HAMMER_SOLID_MODEL) return null;
  if (model.startsWith('/game/')) return model;
  if (model.startsWith('charasset:')) return null;
  return modelUrl(model);
}

export async function scanModelClips(src: string): Promise<string[]> {
  const cached = clipCache.get(src);
  if (cached) return cached;
  try {
    if (isFbxUrl(src)) {
      const fbx = await loadFbxModel(src);
      const names = (fbx.animations ?? []).map((c) => c.name || '(unnamed)');
      clipCache.set(src, names);
      return names;
    }
    const gltf = await loadGltf(src);
    const names = extractClipNames(gltf);
    clipCache.set(src, names);
    return names;
  } catch {
    clipCache.set(src, []);
    return [];
  }
}

export async function loadAnimatedPrefab(
  src: string
): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[]; clipNames: string[] }> {
  if (isFbxUrl(src)) {
    const fbx = await loadFbxModel(src);
    const root = cloneFbxScene(fbx.scene);
    applyPackBodyTintIfNeeded(root, src);
    const clips = fbx.animations ?? [];
    const clipNames = clips.map((c) => c.name || '(unnamed)');
    clipCache.set(src, clipNames);
    return { root, clips, clipNames };
  }

  const gltf = await loadGltf(src);
  const hasSkinned = (() => {
    let hit = false;
    gltf.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) hit = true;
    });
    return hit;
  })();
  const root = hasSkinned ? cloneSkinnedScene(gltf.scene) : cloneGltfScene(gltf);
  const clips = gltf.animations ?? [];
  const clipNames = clips.map((c) => c.name || '(unnamed)');
  clipCache.set(src, clipNames);
  return { root, clips, clipNames };
}

/** Body_Blue/Red/… share Textures.png — multiply material so each color reads uniquely. */
function applyPackBodyTintIfNeeded(root: THREE.Object3D, src: string) {
  const tint = packBodyTintHex(src) ?? packBodyTintHex(src.split('/').pop() || '');
  if (tint == null) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat && 'color' in mat && (mat as THREE.MeshStandardMaterial).color) {
        (mat as THREE.MeshStandardMaterial).color.setHex(tint);
        (mat as THREE.MeshStandardMaterial).needsUpdate = true;
      }
    }
  });
}

export function findClip(clips: THREE.AnimationClip[], name?: string): THREE.AnimationClip | null {
  if (!name) return null;
  return clips.find((c) => c.name === name) ?? null;
}
