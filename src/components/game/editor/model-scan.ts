import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf, cloneGltfScene, cloneSkinnedScene } from '../renderer/asset-loader';
import { modelUrl } from './prototype-catalog';
import { HAMMER_SOLID_MODEL } from './map-document';

const clipCache = new Map<string, string[]>();

export function extractClipNames(gltf: GLTF): string[] {
  return (gltf.animations ?? []).map((c) => c.name || '(unnamed)');
}

/** Resolve model source: catalog name or custom URL. */
export function resolveModelSrc(model?: string, customModelUrl?: string): string | null {
  if (customModelUrl) return customModelUrl;
  if (!model || model === HAMMER_SOLID_MODEL) return null;
  return modelUrl(model);
}

export async function scanModelClips(src: string): Promise<string[]> {
  const cached = clipCache.get(src);
  if (cached) return cached;
  try {
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

export function findClip(clips: THREE.AnimationClip[], name?: string): THREE.AnimationClip | null {
  if (!name) return null;
  return clips.find((c) => c.name === name) ?? null;
}
