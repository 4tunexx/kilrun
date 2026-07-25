/**
 * FBX loading with the same promise cache pattern as loadGltf.
 * Used for model_skins/ pack assets served from /game/skins/.
 *
 * Pack note: every Characters_7 FBX embeds material maps as `Textures.png`
 * (often with an old absolute path). We rewrite those to the shared atlas
 * at `/game/skins/Textures.png`.
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const SHARED_SKIN_ATLAS = '/game/skins/Textures.png';

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  const cleaned = url.replace(/\\/g, '/').split('?')[0]!;
  const lower = cleaned.toLowerCase();
  const file = cleaned.split('/').pop()?.toLowerCase() ?? '';

  // Shared Characters_7 atlas (Texture.png source → Textures.png in public)
  if (
    file === 'textures.png' ||
    file === 'texture.png' ||
    lower.includes('/textures/textures.png') ||
    lower.endsWith('textures.png')
  ) {
    return SHARED_SKIN_ATLAS;
  }

  if (lower.includes('/game/skins/')) return cleaned;
  return url;
});

const loader = new FBXLoader(manager);
const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();

function hasSkinned(root: THREE.Object3D): boolean {
  let hit = false;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) hit = true;
  });
  return hit;
}

export function isFbxUrl(url: string): boolean {
  return /\.fbx(\?|$)/i.test(url);
}

export function loadFbxModel(
  url: string
): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const resourcePath = url.replace(/[^/]+$/, '');
      loader.setResourcePath(resourcePath);
      loader.load(
        url,
        (group) => {
          group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          resolve({
            scene: group,
            animations: group.animations ?? [],
          });
        },
        undefined,
        (err) => {
          console.error('[fbx] load failed', url, err);
          reject(err);
        }
      );
    });
    cache.set(url, pending);
  }
  return pending;
}

/** Clone for placement — SkeletonUtils when skinned. */
export function cloneFbxScene(source: THREE.Object3D): THREE.Object3D {
  const root = hasSkinned(source) ? skeletonClone(source) : source.clone(true);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else if (obj.material) {
        obj.material = obj.material.clone();
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return root;
}

export function clearFbxCache() {
  cache.clear();
}
