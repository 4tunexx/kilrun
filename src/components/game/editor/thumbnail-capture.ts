import * as THREE from 'three';
import { loadAnimatedPrefab } from './model-scan';

export interface ThumbnailCaptureOptions {
  /** Output square size in pixels. Default 512. */
  size?: number;
  /** Extra empty margin around the model, 0–0.4. Default 0.14. */
  padding?: number;
}

type MapKey = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap' | 'aoMap' | 'alphaMap';
const MAP_KEYS: MapKey[] = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'];

function collectTextures(root: THREE.Object3D): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      for (const key of MAP_KEYS) {
        const tex = std[key];
        if (tex) found.add(tex);
      }
    }
  });
  return Array.from(found);
}

function isTextureReady(tex: THREE.Texture): boolean {
  const img = tex.image as HTMLImageElement | ImageBitmap | { width?: number; height?: number } | undefined;
  if (!img) return false;
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return img.complete && img.naturalWidth > 0;
  }
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return true;
  return Boolean(img.width && img.height);
}

/**
 * FBX/GLTF loaders resolve as soon as parsing finishes, but the actual
 * texture *images* they kicked off can still be decoding in the background.
 * A single render right after load can land before that finishes and comes
 * out flat black — this waits (up to a timeout) until every texture on the
 * model has real pixel data before we let the caller render.
 */
async function waitForTextures(root: THREE.Object3D, timeoutMs = 4000): Promise<void> {
  const textures = collectTextures(root);
  if (textures.length === 0) return;
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (textures.every(isTextureReady)) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Reusable capture session — creates ONE WebGL context/scene and reuses it
 * for many models in a row (swap the model, re-render, dispose only that
 * model's geometry/materials). Creating a fresh WebGLRenderer per item is
 * the single biggest cost when batch-regenerating hundreds of thumbnails,
 * so batch callers should use this instead of calling
 * `captureModelThumbnail` in a loop.
 */
export interface ThumbnailCaptureSession {
  capture(modelPath: string, options?: ThumbnailCaptureOptions): Promise<string>;
  dispose(): void;
}

export function createThumbnailCaptureSession(): ThumbnailCaptureSession {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.3, 3.1, 2.6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.85);
  fill.position.set(-2.6, 1.2, -1.6);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(-1, 2.6, -3.2);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x394150, 0.95);
  scene.add(key, fill, rim, hemi);

  function disposeModel(root: THREE.Object3D) {
    scene.remove(root);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
    });
  }

  async function capture(modelPath: string, options: ThumbnailCaptureOptions = {}): Promise<string> {
    const size = options.size ?? 512;
    const padding = options.padding ?? 0.14;
    renderer.setSize(size, size, false);

    const { root } = await loadAnimatedPrefab(modelPath);
    scene.add(root);
    try {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (!mat) return;
        for (const m of Array.isArray(mat) ? mat : [mat]) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
          if (std.emissiveMap) std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        }
      });

      // Cheap after the first hit on any given URL/atlas — loadAnimatedPrefab
      // and the underlying texture cache mean repeat/shared textures (e.g.
      // the shared pack atlas) resolve instantly on later calls.
      await waitForTextures(root);

      const box = new THREE.Box3().setFromObject(root);
      const sizeVec = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(sizeVec.length() * 0.5, 0.05);

      camera.aspect = 1;
      camera.updateProjectionMatrix();
      const dir = new THREE.Vector3(0.85, 0.62, 1).normalize();
      const fitDistance = radius / Math.sin((camera.fov * Math.PI) / 360);
      const distance = fitDistance * (1 + padding);
      camera.position.copy(center).add(dir.multiplyScalar(distance));
      camera.lookAt(center);

      renderer.render(scene, camera);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      disposeModel(root);
    }
  }

  return {
    capture,
    dispose() {
      renderer.dispose();
    },
  };
}

/**
 * Renders a single, clean PNG icon straight from a skin's real GLB/FBX model
 * — same geometry/materials the "3D Preview" panel shows — on a fully
 * transparent background, framed and lit like a shop/inventory icon.
 *
 * This replaces the old approach of using a raw shared texture atlas (e.g.
 * `Body_003.png`) as the thumbnail, which looked flat/wrong compared to the
 * actual model.
 *
 * For a single one-off capture. Batch callers (regenerating many skins in a
 * row) should use `createThumbnailCaptureSession` instead — it reuses one
 * WebGL context across every item rather than paying GPU context setup cost
 * per model, which is the main thing that makes large batches slow.
 *
 * Must run in the browser (needs WebGL); safe to call from a client
 * component such as the admin Asset Browser.
 */
export async function captureModelThumbnail(
  modelPath: string,
  options: ThumbnailCaptureOptions = {}
): Promise<string> {
  const session = createThumbnailCaptureSession();
  try {
    return await session.capture(modelPath, options);
  } finally {
    session.dispose();
  }
}
