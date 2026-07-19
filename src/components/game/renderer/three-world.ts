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

  const camera = new THREE.PerspectiveCamera(48, 1, 0.15, 220);
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

/**
 * Free orbit 3rd-person: mouse moves yaw/pitch, character stays in lower-center.
 */
export function updateFollowCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  yaw: number,
  pitch: number,
  dt: number,
  zoomDistance = 9.2
) {
  const safePitch = THREE.MathUtils.clamp(pitch, -0.35, 0.55);
  const dist = zoomDistance;
  const height = 2.85 + Math.sin(safePitch) * 2.4;

  const behindX = -Math.sin(yaw) * dist * Math.cos(safePitch * 0.65);
  const behindZ = -Math.cos(yaw) * dist * Math.cos(safePitch * 0.65);

  const desired = new THREE.Vector3(
    target.x + behindX,
    target.y + height,
    target.z + behindZ
  );

  const lerp = 1 - Math.pow(0.001, dt);
  camera.position.lerp(desired, Math.min(1, lerp * 14));

  const lookAhead = 1.4;
  const lookAt = new THREE.Vector3(
    target.x + Math.sin(yaw) * lookAhead,
    target.y + 1.05,
    target.z + Math.cos(yaw) * lookAhead
  );
  camera.lookAt(lookAt);
}
