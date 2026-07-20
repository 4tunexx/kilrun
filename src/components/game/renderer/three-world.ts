import * as THREE from 'three';
import type { TpsCameraSettings } from '../tps/tps-view-settings';
import { DEFAULT_TPS_VIEW } from '../tps/tps-view-settings';

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

  const camera = new THREE.PerspectiveCamera(75, 1, 0.15, 220);
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
const _lookAt = new THREE.Vector3();

export type FollowCameraOpts = Partial<TpsCameraSettings> & {
  /** Override boom length without full settings object. */
  zoomDistance?: number;
};

/**
 * TPS boom camera: orbits a fixed head pivot. Mouse pitch/yaw rotate the boom.
 * Pass `FollowCameraOpts` (from 3rd View tool) to tune boom / FOV / shoulder live.
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomOrOpts: number | FollowCameraOpts = 5.2
) {
  const defaults = DEFAULT_TPS_VIEW.camera;
  const opts: FollowCameraOpts =
    typeof zoomOrOpts === 'number' ? { zoomDistance: zoomOrOpts } : zoomOrOpts ?? {};

  const boomDistance = opts.boomDistance ?? opts.zoomDistance ?? defaults.boomDistance;
  const lookHeight = opts.lookHeight ?? defaults.lookHeight;
  const shoulder = opts.shoulder ?? defaults.shoulder;
  const pitchMin = opts.pitchMin ?? defaults.pitchMin;
  const pitchMax = opts.pitchMax ?? defaults.pitchMax;
  const followSharpness = opts.followSharpness ?? defaults.followSharpness;
  const fov = opts.fov ?? defaults.fov;

  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  const safePitch = THREE.MathUtils.clamp(pitch, pitchMin, pitchMax);
  const dist = boomDistance;

  const cosPitch = Math.cos(safePitch);
  const sinPitch = Math.sin(safePitch);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  _forward.set(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
  if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, 1);
  else _forward.normalize();

  // Screen-right when looking along `_forward` (keeps A/D correct with lookAt).
  _right.set(-cosYaw, 0, sinYaw);

  _pivot.set(target.x, target.y + lookHeight, target.z);
  _desired
    .copy(_pivot)
    .addScaledVector(_forward, -dist)
    .addScaledVector(_right, shoulder);

  if (camera.position.distanceToSquared(_desired) > 400) {
    camera.position.copy(_desired);
  } else {
    const lerp = 1 - Math.pow(0.001, dt * followSharpness);
    camera.position.lerp(_desired, Math.min(1, lerp));
  }

  _lookAt.copy(camera.position).add(_forward);
  camera.up.set(0, 1, 0);
  camera.lookAt(_lookAt);
}

/** @deprecated Use updateFollowCamera — kept so older call sites with a style arg still compile. */
export type FollowCameraStyle = 'overShoulder' | 'platformer';

export function updateFollowCameraStyled(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomDistance = 5.2,
  _style?: FollowCameraStyle
) {
  updateFollowCamera(camera, target, yaw, pitch, dt, zoomDistance);
}
