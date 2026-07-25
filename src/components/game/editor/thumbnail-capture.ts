import * as THREE from 'three';
import { loadAnimatedPrefab } from './model-scan';

export interface ThumbnailCaptureOptions {
  /** Output square size in pixels. Default 512. */
  size?: number;
  /** Extra empty margin around the model, 0–0.4. Default 0.14. */
  padding?: number;
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
