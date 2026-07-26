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

let currentLoadFbxDir: string | null = null;
const fbxDirStack: string[] = [];

function pushFbxDir(url: string) {
  const dir = url.replace(/\\/g, '/').replace(/[^/]+$/, '');
  if (currentLoadFbxDir) fbxDirStack.push(currentLoadFbxDir);
  currentLoadFbxDir = dir;
}

function popFbxDir() {
  currentLoadFbxDir = fbxDirStack.pop() ?? null;
}

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  const cleaned = url.replace(/\\/g, '/').split('?')[0]!;
  const lower = cleaned.toLowerCase();
  const file = cleaned.split('/').pop()?.toLowerCase() ?? '';

  const isGenericTex =
    file === 'textures.png' ||
    file === 'texture.png' ||
    lower.includes('/textures/textures.png') ||
    lower.endsWith('textures.png');

  if (isGenericTex) {
    if (currentLoadFbxDir && currentLoadFbxDir.startsWith('/game/skins/')) {
      return currentLoadFbxDir + file.charAt(0).toUpperCase() + file.slice(1);
    }
    return SHARED_SKIN_ATLAS;
  }

  if (lower.includes('/game/skins/')) return cleaned;
  return url;
});

const loader = new FBXLoader(manager);
const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();

/** Reusable texture for the shared Characters_7 pack atlas — lazily created so
 *  404'ing sibling Textures.png can fall back to it without bouncing through
 *  the URL modifier again. */
let _sharedAtlasTexture: THREE.Texture | null = null;
function getSharedAtlasTexture() {
  if (!_sharedAtlasTexture) {
    _sharedAtlasTexture = new THREE.TextureLoader().load(SHARED_SKIN_ATLAS);
    _sharedAtlasTexture.colorSpace = THREE.SRGBColorSpace;
    _sharedAtlasTexture.wrapS = _sharedAtlasTexture.wrapT = THREE.RepeatWrapping;
  }
  return _sharedAtlasTexture;
}

/** Walk all materials on a group and install 404 fallbacks so any sibling
 *  Textures.png that failed to load swaps to the shared pack atlas. */
function installTextureFallback(group: THREE.Object3D, fbxDir: string) {
  const applyToMat = (mat: THREE.Material | THREE.Material[] | undefined) => {
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std || typeof std !== 'object') continue;
      (['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const).forEach(
        (slot) => {
          const tex = std[slot] as THREE.Texture | null | undefined;
          if (!tex || !tex.image) return;
          const src =
            typeof tex.image === 'string'
              ? tex.image
              : (tex.image as HTMLImageElement)?.src ?? (tex as any).source?.data?.src ?? '';
          const texPath = String(src).replace(/\\/g, '/').split('?')[0] ?? '';
          const fromFbxDir = texPath.startsWith(fbxDir) && /textures?\.png$/i.test(texPath);
          if (!fromFbxDir) return;
          const img = tex.image as HTMLImageElement | undefined;
          const swapToShared = () => {
            try {
              const fallback = getSharedAtlasTexture();
              (std as any)[slot] = fallback;
              std.needsUpdate = true;
            } catch {
              /* ignore */
            }
          };
          // Image already errored (complete with 0 width) → swap now.
          if (img && typeof img.complete === 'boolean' && img.complete) {
            if (!img.naturalWidth || img.naturalWidth === 0) swapToShared();
          } else if (img && typeof img.addEventListener === 'function') {
            img.addEventListener('error', swapToShared, { once: true });
          }
        }
      );
    }
  };
  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) applyToMat((obj as THREE.Mesh).material);
  });
}

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
      pushFbxDir(url);
      const fbxDir = resourcePath;
      loader.load(
        url,
        (group) => {
          popFbxDir();
          group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          // If URL modifier redirected texture to a sibling Textures.png and
          // that file 404s on the server, swap in the shared atlas instead.
          if (fbxDir.startsWith('/game/skins/')) installTextureFallback(group, fbxDir);
          resolve({
            scene: group,
            animations: group.animations ?? [],
          });
        },
        undefined,
        (err) => {
          popFbxDir();
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
