/**
 * FBX loading with the same promise cache pattern as loadGltf.
 * Used for model_skins/ pack assets served from /game/skins/.
 *
 * Pack note: FBX exports from different source packs often embed the same
 * generic internal texture reference name ("Textures.png", sometimes with a
 * stale absolute path from whoever authored it). Blindly redirecting every
 * one of those to a single global shared atlas breaks anything that isn't
 * actually part of that pack. There are THREE candidate texture sources
 * behind that same generic reference:
 *
 *  1. A per-folder shared atlas (`<category>/Textures.png`) — the REAL,
 *     full-size (1024×1024, verified) UV-mapped diffuse for every asset in
 *     that category. This is almost always the correct source.
 *  2. A same-basename sibling PNG next to the FBX (e.g. `Hat_001.fbx` +
 *     `Hat_001.png`). Every asset in every category (fullbody/hair/gloves/
 *     outerwear/eyebrows/shoes/hats/pants/glasses/backpacks/bodies —
 *     verified across all of them) has one of these, but they are uniformly
 *     128×128 shop/admin PREVIEW ICONS, not UV atlases — see the identical
 *     warning in `src/lib/asset-registry.ts`'s `isPackPreviewIconUrl()`.
 *     Applying one as `material.map` smears a tiny icon across the mesh's
 *     real UVs and reads as flat black/grey. Only used as a last-resort
 *     fallback below the folder atlas, never preferred over it.
 *  3. The true global Characters_7 atlas (`/game/skins/Textures.png`), for
 *     assets from that pack that have neither of the above.
 *
 * Resolution checks 1 → 2 → 3 in order (existence-checked up front, not
 * guessed), plus a reactive fallback: if whatever we picked still 404s at
 * runtime, swap to the global atlas rather than rendering untextured/black.
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

const urlExistsCache = new Map<string, Promise<boolean>>();

function urlExists(url: string): Promise<boolean> {
  let pending = urlExistsCache.get(url);
  if (!pending) {
    pending = fetch(url, { method: 'HEAD' })
      .then((res) => res.ok)
      .catch(() => false);
    urlExistsCache.set(url, pending);
  }
  return pending;
}

function siblingPngPath(fbxUrl: string): string {
  return fbxUrl.replace(/\.fbx(\?.*)?$/i, '.png');
}

function folderAtlasPath(fbxUrl: string): string {
  return fbxUrl.replace(/[^/]+$/, '') + 'Textures.png';
}

/** Which of the 3 sources to use for a given FBX's generic texture refs — checked once per URL. */
type TextureSource = { kind: 'sibling' | 'folder' | 'global'; path: string };
const textureSourceCache = new Map<string, Promise<TextureSource>>();

async function resolveTextureSource(fbxUrl: string): Promise<TextureSource> {
  let pending = textureSourceCache.get(fbxUrl);
  if (!pending) {
    pending = (async () => {
      const sibling = siblingPngPath(fbxUrl);
      const folder = folderAtlasPath(fbxUrl);
      const [siblingOk, folderOk] = await Promise.all([urlExists(sibling), urlExists(folder)]);
      // Folder atlas first: the sibling PNG is confirmed to always be a
      // 128px preview icon (see header comment), never the real UV atlas.
      if (folderOk) return { kind: 'folder' as const, path: folder };
      if (siblingOk) return { kind: 'sibling' as const, path: sibling };
      return { kind: 'global' as const, path: SHARED_SKIN_ATLAS };
    })();
    textureSourceCache.set(fbxUrl, pending);
  }
  return pending;
}

/** Reusable texture for the true global Characters_7 atlas — lazily created
 * so a runtime 404 fallback can swap to it without another network round trip. */
let _sharedAtlasTexture: THREE.Texture | null = null;
function getSharedAtlasTexture(): THREE.Texture {
  if (!_sharedAtlasTexture) {
    _sharedAtlasTexture = new THREE.TextureLoader().load(SHARED_SKIN_ATLAS);
    _sharedAtlasTexture.colorSpace = THREE.SRGBColorSpace;
    _sharedAtlasTexture.wrapS = _sharedAtlasTexture.wrapT = THREE.RepeatWrapping;
  }
  return _sharedAtlasTexture;
}

/** Ensure all textures have correct color space (fixes black/washed-out skins). */
function fixTextureColorSpaces(group: THREE.Object3D) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      const MAP_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const;
      for (const slot of MAP_SLOTS) {
        const tex = std[slot] as THREE.Texture | null | undefined;
        if (tex && tex.colorSpace !== THREE.SRGBColorSpace) {
          tex.colorSpace = THREE.SRGBColorSpace;
        }
      }
    }
  });
}

/** Safety net: if the texture we picked (sibling or folder atlas) still
 * fails to actually load at runtime for any reason, swap to the global
 * atlas rather than leaving the material untextured/black. */
function installTextureFallback(group: THREE.Object3D, chosenPath: string) {
  if (chosenPath === SHARED_SKIN_ATLAS) return;
  const MAP_SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const;
  let fallbackCount = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      for (const slot of MAP_SLOTS) {
        const tex = std[slot] as THREE.Texture | null | undefined;
        if (!tex || !tex.image) continue;
        const img = tex.image as HTMLImageElement | undefined;
        const swapToShared = () => {
          try {
            (std as unknown as Record<string, THREE.Texture>)[slot] = getSharedAtlasTexture();
            std.needsUpdate = true;
            fallbackCount++;
            console.warn(`[fbx-fallback] swapped ${slot} to global atlas (failed: ${chosenPath})`);
          } catch {
            /* ignore */
          }
        };
        if (img && typeof img.complete === 'boolean' && img.complete) {
          if (!img.naturalWidth || img.naturalWidth === 0) {
            console.warn(`[fbx-fallback] detected 404 in ${slot} (chosen: ${chosenPath})`);
            swapToShared();
          }
        } else if (img && typeof img.addEventListener === 'function') {
          img.addEventListener('error', swapToShared, { once: true });
        }
      }
    }
  });
  if (fallbackCount > 0) console.log(`[fbx-fallback] total swaps: ${fallbackCount}`);
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
      // of different models can never race on which one's resolved source
      // is "current".
      const source = await resolveTextureSource(url);
      // Basename of the FBX itself (no extension) — used below to catch
      // "self-referencing" embedded texture names (e.g. an FBX literally named
      // Body_Blue_001.fbx whose embedded material points at "Body_Blue_001.png").
      // That's a distinct case from the generic "Textures.png" reference this
      // file was originally written to redirect: it isn't caught by
      // isGenericTexturesReference() at all, so when no sibling PNG of that
      // exact name exists (source.kind !== 'sibling'), the raw self-named
      // reference was passed straight through to FBXLoader, 404'd, and left
      // the mesh with a broken/blank map (flat single-color body in prod).
      const fbxBase = url
        .replace(/\\/g, '/')
        .split('/')
        .pop()!
        .replace(/\.fbx(\?.*)?$/i, '')
        .toLowerCase();
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((texUrl) => {
        const cleaned = texUrl.replace(/\\/g, '/').split('?')[0]!;
        const texBase = (cleaned.split('/').pop() ?? '')
          .replace(/\.(png|jpe?g|tga|bmp)$/i, '')
          .toLowerCase();
        const isSelfReference = texBase !== '' && texBase === fbxBase;
        if (isGenericTexturesReference(texUrl) || (isSelfReference && source.kind !== 'sibling')) {
          return source.path;
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
              fixTextureColorSpaces(group);
              installTextureFallback(group, source.path);
              console.log(`[fbx] loaded ${url} (texture source: ${source.kind} → ${source.path})`);
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
