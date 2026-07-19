import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const PLATFORM_BASE = '/game/platforms';
export const CHARACTER_BASE = '/game/character';

const manager = new THREE.LoadingManager();
manager.setURLModifier((url) => {
  // Always rewrite Kenney colormap, no matter how Three resolved the relative path
  const lower = url.replace(/\\/g, '/').toLowerCase();
  if (lower.includes('colormap.png')) {
    return '/game/prototype/textures/colormap.png';
  }
  if (url.includes('prototypebits_texture')) {
    return `${PLATFORM_BASE}/prototypebits_texture.png`;
  }
  if (url.includes('mannequin_texture')) {
    return `${CHARACTER_BASE}/mannequin_texture.png`;
  }
  if (lower.includes('/textures/') && /\.(png|jpg|jpeg|webp)$/.test(lower)) {
    const file = url.split(/[/\\]/).pop()!;
    return `/game/prototype/textures/${file}`;
  }
  if (/variation-[abc]\.png/i.test(url)) {
    const file = url.split(/[/\\]/).pop()!.toLowerCase();
    return `/game/prototype/textures/${file}`;
  }
  return url;
});

const loader = new GLTFLoader(manager);
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, (err) => {
        console.error('[gltf] load failed', url, err);
        reject(err);
      });
    });
    cache.set(url, pending);
  }
  return pending;
}

export function cloneGltfScene(gltf: GLTF): THREE.Group {
  const root = gltf.scene.clone(true);
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

/** Skinned characters MUST use SkeletonUtils.clone or animations stay T-pose. */
export function cloneSkinnedScene(source: THREE.Object3D): THREE.Object3D {
  const root = skeletonClone(source);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return root;
}

export async function loadPlatformPrefab(name: string): Promise<THREE.Group> {
  const gltf = await loadGltf(`${PLATFORM_BASE}/${name}.gltf`);
  return cloneGltfScene(gltf);
}

export async function loadCharacterPrefab(): Promise<{
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}> {
  const [body, movement, general] = await Promise.all([
    loadGltf(`${CHARACTER_BASE}/Mannequin_Medium.glb`),
    loadGltf(`${CHARACTER_BASE}/anims/Rig_Medium_MovementBasic.glb`).catch(() => null),
    loadGltf(`${CHARACTER_BASE}/anims/Rig_Medium_General.glb`).catch(() => null),
  ]);
  // SkeletonUtils.clone — plain Object3D.clone breaks skins → permanent T-pose
  const scene = cloneSkinnedScene(body.scene);
  const animations = [
    ...(body.animations ?? []),
    ...(movement?.animations ?? []),
    ...(general?.animations ?? []),
  ];
  return { scene, animations };
}

/** Fit height, plant feet on y=0, and center XZ so the avatar isn't beside the camera. */
export function normalizeCharacter(root: THREE.Object3D, targetHeight = 1.75): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const height = Math.max(size.y, 0.001);
  const scale = targetHeight / height;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  root.position.x -= center2.x;
  root.position.z -= center2.z;
  root.position.y -= box2.min.y;
  return scale;
}
