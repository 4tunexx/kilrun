/**
 * FBX loading with the same promise cache pattern as loadGltf.
 * Used for model_skins/ pack assets served from /game/skins/.
 *
 * Pack note: FBX exports from different source packs often embed the same
 * generic internal texture reference name ("Textures.png", sometimes with a
 * stale absolute path from whoever authored it). For the actual shared
 * Characters_7 pack that's correct — they really do share one atlas at
 * `/game/skins/Textures.png`. But several standalone packs (fullbody
 * costume/novelty skins in particular) reuse that same generic export name
 * while shipping their OWN dedicated same-named PNG right next to the FBX
 * (e.g. `FullBody_Demon_001.fbx` + `FullBody_Demon_001.png`). Blindly
 * redirecting every "texturesname.png" reference to the shared atlas was
 * silently breaking every one of those — they rendered with the wrong
 * pack's colors (often reading as flat black) instead of their own texture.
 *
 * Fix: before assuming "shared atlas", check whether the FBX being loaded
 * has its own sibling PNG (same directory, same basename) and prefer that.
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const SHARED_SKIN_ATLAS = '/game/skins/Textures.png';

function isGenericTexturesReference(url: string): boolean {
  const cleaned = url.replace(/\\/g, '/').split('?')[0]!;
  const lower = cleaned.toLowerCase();
  const file = cleaned.split('/').pop()?.toLowerCase() ?? '';
  return (
    file === 'textures.png' ||
    file === 'texture.png' ||
    lower.includes('/textures/textures.png') ||
    lower.endsWith('textures.png')
  );
}

/** Cache: does <fbxUrl-minus-extension>.png actually exist? Checked once per URL. */
const siblingPngCache = new Map<string, Promise<boolean>>();

function siblingPngPath(fbxUrl: string): string {
  return fbxUrl.replace(/\.fbx(\?.*)?$/i, '.png');
}

async function hasSiblingPng(fbxUrl: string): Promise<boolean> {
  let pending = siblingPngCache.get(fbxUrl);
  if (!pending) {
    pending = fetch(siblingPngPath(fbxUrl), { method: 'HEAD' })
      .then((res) => res.ok)
      .catch(() => false);
    siblingPngCache.set(fbxUrl, pending);
  }
  return pending;
}

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
    pending = (async () => {
      // Resolve texture redirect for THIS load only — a fresh manager per
      // FBX (not one shared, mutable, global modifier) so concurrent loads
      // of different models can never race on which one's sibling-PNG
      // check is "current".
      const preferSibling = await hasSiblingPng(url);
      const sibling = siblingPngPath(url);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((texUrl) => {
        const cleaned = texUrl.replace(/\\/g, '/').split('?')[0]!;
        if (isGenericTexturesReference(texUrl)) {
          return preferSibling ? sibling : SHARED_SKIN_ATLAS;
        }
        if (cleaned.toLowerCase().includes('/game/skins/')) return cleaned;
        return texUrl;
      });
      const loader = new FBXLoader(manager);
      const resourcePath = url.replace(/[^/]+$/, '');
      loader.setResourcePath(resourcePath);

      return new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
        (resolve, reject) => {
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
        }
      );
    })();
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
