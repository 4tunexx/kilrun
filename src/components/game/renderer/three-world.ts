import * as THREE from 'three';

export interface ThreeWorld {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  clock: THREE.Clock;
  destroy: () => void;
  setSize: (w: number, h: number) => void;
  render: () => void;
}

/** Dark cavern base — ThreeMap layers the glowing void + platforms on top. */
export function createThreeWorld(host: HTMLElement): ThreeWorld {
  // Clear any leftover canvases from StrictMode remounts (prevents “2 worlds”)
  while (host.firstChild) host.removeChild(host.firstChild);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081018);
  scene.fog = new THREE.FogExp2(0x0a1528, 0.026);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.15, 220);
  camera.position.set(0, 6, -12);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'none';

  const hemi = new THREE.HemisphereLight(0x88aacc, 0x152030, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xc8d8ee, 0.85);
  sun.position.set(-10, 24, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x446688, 0.22));

  const clock = new THREE.Clock();

  const setSize = (w: number, h: number) => {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  setSize(host.clientWidth, host.clientHeight);
  const onResize = () => setSize(host.clientWidth, host.clientHeight);
  window.addEventListener('resize', onResize);

  return {
    renderer,
    scene,
    camera,
    clock,
    setSize,
    render: () => renderer.render(scene, camera),
    destroy: () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
      while (host.firstChild) host.removeChild(host.firstChild);
    },
  };
}

const _pivot = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Fortnite-style over-shoulder 3rd person:
 * - Pivot at chest/shoulder, camera offset to the right
 * - Camera orientation follows yaw/pitch so screen-center (crosshair) aims into the world
 * - Does NOT lookAt the player mesh (that pinned the reticle on the head)
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomDistance = 5.8
) {
  const safePitch = THREE.MathUtils.clamp(pitch, -1.05, 0.85);
  const dist = zoomDistance;
  /** Chest / shoulder pivot — visual avatar is ~1.8 tall, feet at target.y */
  const lookHeight = 1.32;
  const shoulder = 0.58;

  const cosPitch = Math.cos(safePitch);
  const sinPitch = Math.sin(safePitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // Aim forward in Three space (matches server aim: x=cos(yaw)*cos(pitch), y=sin(yaw)*cos(pitch), z=sin(pitch))
  _forward.set(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
  _right.set(cosYaw, 0, -sinYaw);

  _pivot.set(target.x, target.y + lookHeight, target.z);

  _desired
    .copy(_pivot)
    .addScaledVector(_forward, -dist)
    .addScaledVector(_right, shoulder);
  // Slight lift so the shoulder doesn't clip the lens at neutral pitch
  _desired.y += 0.12;

  const lerp = 1 - Math.pow(0.001, dt * 18);
  camera.position.lerp(_desired, Math.min(1, lerp));

  // Orient by aim angles — screen center = aim ray (crosshair is not stuck on the head)
  _euler.set(-safePitch, yaw, 0);
  camera.quaternion.setFromEuler(_euler);
}
