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
 * Renders a single, clean PNG icon straight from a skin's real GLB/FBX model
 * — same geometry/materials the "3D Preview" panel shows — on a fully
 * transparent background, framed and lit like a shop/inventory icon.
 *
 * This replaces the old approach of using a raw shared texture atlas (e.g.
 * `Body_003.png`) as the thumbnail, which looked flat/wrong compared to the
 * actual model.
 *
 * Must run in the browser (needs WebGL); safe to call from a client
 * component such as the admin Asset Browser.
 */
export async function captureModelThumbnail(
  modelPath: string,
  options: ThumbnailCaptureOptions = {}
): Promise<string> {
  const size = options.size ?? 512;
  const padding = options.padding ?? 0.14;

  const scene = new THREE.Scene();
  // Intentionally no scene.background — renderer alpha shows through.

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Soft studio 3-point lighting so parts read clearly as flat icons.
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.3, 3.1, 2.6);
  const fill = new THREE.DirectionalLight(0xffffff, 0.85);
  fill.position.set(-2.6, 1.2, -1.6);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(-1, 2.6, -3.2);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x394150, 0.95);
  scene.add(key, fill, rim, hemi);

  try {
    const { root } = await loadAnimatedPrefab(modelPath);
    scene.add(root);
    // Draw the bind pose (no mixer.update) so weapons/parts don't render
    // mid-swing from whatever the first animation frame happens to be.

    // Ensure diffuse/base-color maps read as sRGB regardless of loader
    // defaults (FBX in particular doesn't always set this itself).
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

    await waitForTextures(root);

    const box = new THREE.Box3().setFromObject(root);
    const sizeVec = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(sizeVec.length() * 0.5, 0.05);

    camera.aspect = 1;
    camera.updateProjectionMatrix();

    // 3/4 angle, matching the framing used by the live 3D preview panel.
    const dir = new THREE.Vector3(0.85, 0.62, 1).normalize();
    const fitDistance = radius / Math.sin((camera.fov * Math.PI) / 360);
    const distance = fitDistance * (1 + padding);
    camera.position.copy(center).add(dir.multiplyScalar(distance));
    camera.lookAt(center);

    // A couple of warm-up frames — first render after textures resolve is
    // sometimes still the upload frame on slower GPUs/software renderers.
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.render(scene, camera);

    return renderer.domElement.toDataURL('image/png');
  } finally {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.Mesh).geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material;
      if (mat) {
        (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
  }
}
