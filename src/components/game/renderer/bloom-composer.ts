import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type BloomComposer = {
  setSize: (w: number, h: number) => void;
  render: () => void;
  dispose: () => void;
};

const darkMesh = new THREE.MeshBasicMaterial({ color: 0x000000 });
const darkLine = new THREE.LineBasicMaterial({ color: 0x000000 });
const darkSprite = new THREE.SpriteMaterial({ color: 0x000000 });

type BloomTweak = {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  toneMapped: boolean;
};

/**
 * Bloom only meshes marked `userData.bloom` (Glow & Emissive).
 * Halo strength comes from `userData.bloomStrength` (0–1), not from surface brightness,
 * so Brightness and Glow Intensity can be authored separately.
 */
export function createBloomComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
): BloomComposer {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const w = Math.max(1, size.x);
  const h = Math.max(1, size.y);

  const saved = new Map<string, THREE.Material | THREE.Material[]>();
  const tweaks: BloomTweak[] = [];
  const bloomTint = new THREE.Color();

  const darken = (obj: THREE.Object3D) => {
    const strength = Number(obj.userData?.bloomStrength);
    const bloomOn = obj.userData?.bloom === true && Number.isFinite(strength) && strength > 0.01;
    const mesh = obj as THREE.Mesh;
    const line = obj as THREE.Line;
    const sprite = obj as THREE.Sprite;

    if (bloomOn && mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || !('emissive' in m)) continue;
        const mat = m as THREE.MeshStandardMaterial;
        tweaks.push({
          mat,
          color: mat.color.clone(),
          emissive: mat.emissive.clone(),
          emissiveIntensity: mat.emissiveIntensity,
          toneMapped: mat.toneMapped,
        });
        const hex = typeof obj.userData.bloomColor === 'string' ? obj.userData.bloomColor : '#00f0ff';
        bloomTint.set(hex);
        mat.color.setRGB(0, 0, 0);
        mat.emissive.copy(bloomTint);
        // Linear with the Glow Intensity slider — no threshold cliff around 1.0.
        mat.emissiveIntensity = 0.08 + strength * 0.72;
        mat.toneMapped = false;
      }
      return;
    }

    if (mesh.isMesh) {
      saved.set(obj.uuid, mesh.material);
      mesh.material = darkMesh;
    } else if (line.isLine) {
      saved.set(obj.uuid, line.material as THREE.Material);
      line.material = darkLine;
    } else if (sprite.isSprite) {
      saved.set(obj.uuid, sprite.material);
      sprite.material = darkSprite;
    }
  };

  const restore = (obj: THREE.Object3D) => {
    const mat = saved.get(obj.uuid);
    if (!mat) return;
    (obj as THREE.Mesh).material = mat;
    saved.delete(obj.uuid);
  };

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.18, 0.12);
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(baseTexture, vUv);
          vec4 bloom = texture2D(bloomTexture, vUv);
          gl_FragColor = vec4(base.rgb + bloom.rgb * 0.5, base.a);
        }
      `,
    }),
    'baseTexture'
  );

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(mixPass);
  finalComposer.addPass(new OutputPass());

  return {
    setSize(nw, nh) {
      const width = Math.max(1, nw);
      const height = Math.max(1, nh);
      bloomComposer.setSize(width, height);
      finalComposer.setSize(width, height);
    },
    render() {
      saved.clear();
      tweaks.length = 0;
      scene.traverse(darken);
      bloomComposer.render();
      for (const t of tweaks) {
        t.mat.color.copy(t.color);
        t.mat.emissive.copy(t.emissive);
        t.mat.emissiveIntensity = t.emissiveIntensity;
        t.mat.toneMapped = t.toneMapped;
      }
      tweaks.length = 0;
      scene.traverse(restore);
      finalComposer.render();
    },
    dispose() {
      bloomComposer.dispose();
      finalComposer.dispose();
    },
  };
}
