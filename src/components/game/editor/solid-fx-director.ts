import * as THREE from 'three';
import type { SolidFxConfig, SolidFxStyle } from '@shared/solid-fx';
import { ensureSolidFx } from '@shared/solid-fx';

const STYLE_INDEX: Record<SolidFxStyle, number> = {
  fade: 0,
  unveil: 1,
  glitch: 2,
  matrix: 3,
};

type FxUniforms = {
  uSolidFxProgress: { value: number };
  uSolidFxStyle: { value: number };
  uSolidFxTime: { value: number };
  uSolidFxMinY: { value: number };
  uSolidFxMaxY: { value: number };
};

type MeshEntry = {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  clone: THREE.Material | THREE.Material[];
  uniforms: FxUniforms[];
};

type RootEntry = {
  root: THREE.Object3D;
  meshes: MeshEntry[];
  previewUntil: number;
  previewDuration: number;
  previewMode: 'appear' | 'disappear' | null;
};

function makeUniforms(style: SolidFxStyle, minY: number, maxY: number): FxUniforms {
  return {
    uSolidFxProgress: { value: 1 },
    uSolidFxStyle: { value: STYLE_INDEX[style] ?? 1 },
    uSolidFxTime: { value: 0 },
    uSolidFxMinY: { value: minY },
    uSolidFxMaxY: { value: maxY },
  };
}

const VERT_INJECT = /* glsl */ `
varying vec3 vSolidFxWorld;
`;
const VERT_MAIN = /* glsl */ `
vSolidFxWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;
const FRAG_INJECT = /* glsl */ `
uniform float uSolidFxProgress;
uniform float uSolidFxStyle;
uniform float uSolidFxTime;
uniform float uSolidFxMinY;
uniform float uSolidFxMaxY;
varying vec3 vSolidFxWorld;
float solidFxHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
`;
const FRAG_BODY = /* glsl */ `
{
  float p = clamp(uSolidFxProgress, 0.0, 1.0);
  if (p <= 0.001) discard;
  if (uSolidFxStyle < 0.5) {
    diffuseColor.a *= p;
  } else if (uSolidFxStyle < 1.5) {
    float span = max(0.001, uSolidFxMaxY - uSolidFxMinY);
    float h = (vSolidFxWorld.y - uSolidFxMinY) / span;
    float edge = p * 1.12;
    if (h > edge) discard;
    float rim = 1.0 - smoothstep(edge - 0.07, edge, h);
    diffuseColor.rgb += vec3(0.4, 0.85, 1.0) * rim * 1.35;
  } else if (uSolidFxStyle < 2.5) {
    float band = floor(vSolidFxWorld.y * 18.0);
    float n = solidFxHash(vec3(band, floor(uSolidFxTime * 20.0), 3.1));
    if (n > p * 1.06) discard;
    float slice = step(0.8, solidFxHash(vec3(band, 8.2, floor(uSolidFxTime * 28.0))));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 1.0, 0.9), slice * (1.0 - p) * 0.9);
    diffuseColor.rgb += vec3(0.7, 0.15, 1.0) * (1.0 - p) * 0.4;
  } else {
    float cell = 0.16;
    vec3 gp = floor(vSolidFxWorld / cell);
    float n = solidFxHash(gp);
    if (n > p) discard;
    float rim = 1.0 - smoothstep(p - 0.07, p, n);
    diffuseColor.rgb += vec3(0.15, 1.0, 0.4) * rim * 1.55;
  }
}
`;

function patchMaterial(mat: THREE.Material, uniforms: FxUniforms): THREE.Material {
  const cloned = mat.clone();
  cloned.transparent = true;
  cloned.customProgramCacheKey = () => 'solid-fx-v1';
  cloned.onBeforeCompile = (shader) => {
    shader.uniforms.uSolidFxProgress = uniforms.uSolidFxProgress;
    shader.uniforms.uSolidFxStyle = uniforms.uSolidFxStyle;
    shader.uniforms.uSolidFxTime = uniforms.uSolidFxTime;
    shader.uniforms.uSolidFxMinY = uniforms.uSolidFxMinY;
    shader.uniforms.uSolidFxMaxY = uniforms.uSolidFxMaxY;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${VERT_INJECT}`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n${VERT_MAIN}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${FRAG_INJECT}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${FRAG_BODY}`
    );
  };
  cloned.needsUpdate = true;
  return cloned;
}

function worldYBounds(root: THREE.Object3D): { minY: number; maxY: number } {
  const box = new THREE.Box3().setFromObject(root);
  if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y) || box.isEmpty()) {
    return { minY: root.position.y, maxY: root.position.y + 1 };
  }
  if (box.max.y - box.min.y < 0.05) {
    return { minY: box.min.y, maxY: box.min.y + 0.05 };
  }
  return { minY: box.min.y, maxY: box.max.y };
}

/**
 * Clones mesh materials and injects vanish / unveil / glitch / matrix discards.
 * The editor only uses preview(); Play Test and the live overlay attach for the session.
 */
export class SolidFxDirector {
  private entries = new Map<string, RootEntry>();
  private elapsed = 0;

  attach(id: string, root: THREE.Object3D, config: SolidFxConfig) {
    this.detach(id);
    const fx = ensureSolidFx(config);
    const { minY, maxY } = worldYBounds(root);
    const meshes: MeshEntry[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      const uniformsList: FxUniforms[] = [];
      const original = child.material;
      if (Array.isArray(original)) {
        const clones = original.map((m) => {
          const u = makeUniforms(fx.style, minY, maxY);
          uniformsList.push(u);
          return patchMaterial(m, u);
        });
        child.material = clones;
        meshes.push({ mesh: child, original, clone: clones, uniforms: uniformsList });
      } else {
        const u = makeUniforms(fx.style, minY, maxY);
        const clone = patchMaterial(original, u);
        child.material = clone;
        meshes.push({ mesh: child, original, clone, uniforms: [u] });
      }
    });
    this.entries.set(id, {
      root,
      meshes,
      previewUntil: 0,
      previewDuration: fx.durationMs,
      previewMode: null,
    });
    this.setProgress(id, fx.mode === 'appear' ? 0 : 1);
  }

  setProgress(id: string, progress: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    const p = Math.min(1, Math.max(0, progress));
    entry.root.visible = p > 0.001;
    for (const mesh of entry.meshes) {
      for (const u of mesh.uniforms) u.uSolidFxProgress.value = p;
    }
  }

  preview(id: string, root: THREE.Object3D, config: SolidFxConfig) {
    this.attach(id, root, config);
    const entry = this.entries.get(id);
    if (!entry) return;
    const fx = ensureSolidFx(config);
    entry.previewMode = fx.mode;
    entry.previewDuration = Math.max(200, fx.durationMs);
    entry.previewUntil = this.elapsed + entry.previewDuration / 1000 + 0.35;
    this.setProgress(id, fx.mode === 'appear' ? 0 : 1);
  }

  get hasPreview(): boolean {
    for (const entry of this.entries.values()) {
      if (entry.previewMode) return true;
    }
    return false;
  }

  update(dt: number) {
    this.elapsed += dt;
    const t = this.elapsed;
    for (const [id, entry] of this.entries) {
      for (const mesh of entry.meshes) {
        for (const u of mesh.uniforms) u.uSolidFxTime.value = t;
      }
      if (!entry.previewMode) continue;
      const start = entry.previewUntil - entry.previewDuration / 1000 - 0.35;
      const u = (t - start) / Math.max(0.05, entry.previewDuration / 1000);
      const linear = Math.min(1, Math.max(0, u));
      const progress = entry.previewMode === 'appear' ? linear : 1 - linear;
      this.setProgress(id, progress);
      if (t >= entry.previewUntil) this.detach(id);
    }
  }

  detach(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const mesh of entry.meshes) {
      mesh.mesh.material = mesh.original;
      const clones = Array.isArray(mesh.clone) ? mesh.clone : [mesh.clone];
      for (const mat of clones) mat.dispose();
    }
    entry.root.visible = true;
    this.entries.delete(id);
  }

  clear() {
    for (const id of [...this.entries.keys()]) this.detach(id);
  }
}
