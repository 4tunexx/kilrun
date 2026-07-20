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
  scene.fog = new THREE.FogExp2(0x0a1528, 0.024);

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
 * Modern 3D action-platformer camera (Fortnite / TPS hybrid):
 * - Boom sits behind + slightly over the right shoulder
 * - Camera orientation = look yaw/pitch → **screen center is the aim ray** (crosshair)
 * - Body stays visible in the lower frame; slight downward default pitch reads platforms ahead
 * - Does NOT lookAt the mesh (that pins the reticle on the head and breaks aim)
 *
 * Pitch: up = positive (look at sky). Typical idle ≈ -0.22 (slightly down the course).
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomDistance = 6.6
) {
  const safePitch = THREE.MathUtils.clamp(pitch, -1.05, 0.72);
  /** Chest pivot — feet at target.y, avatar ~1.75–1.8 tall */
  const lookHeight = 1.26;
  const shoulder = 0.52;
  // Looking down: pull boom in a hair + lift so the body stays framed (not under the lens)
  const lookDown = Math.max(0, -safePitch);
  const dist = zoomDistance * (1 - lookDown * 0.1);
  const boomLift = 0.28 + lookDown * 1.15;

  const cosPitch = Math.cos(safePitch);
  const sinPitch = Math.sin(safePitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // Aim forward in Three space (matches server aim remap)
  _forward.set(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
  _right.set(cosYaw, 0, -sinYaw);

  _pivot.set(target.x, target.y + lookHeight, target.z);

  _desired
    .copy(_pivot)
    .addScaledVector(_forward, -dist)
    .addScaledVector(_right, shoulder);
  _desired.y += boomLift;

  // Snappy follow — position lags a touch; orientation is instant (TPS standard)
  const lerp = 1 - Math.pow(0.001, dt * 20);
  camera.position.lerp(_desired, Math.min(1, lerp));

  _euler.set(-safePitch, yaw, 0);
  camera.quaternion.setFromEuler(_euler);
}

/** @deprecated Use updateFollowCamera — kept so older call sites with a style arg still compile. */
export type FollowCameraStyle = 'overShoulder' | 'platformer';

export function updateFollowCameraStyled(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomDistance = 6.6,
  _style?: FollowCameraStyle
) {
  updateFollowCamera(camera, target, yaw, pitch, dt, zoomDistance);
}
