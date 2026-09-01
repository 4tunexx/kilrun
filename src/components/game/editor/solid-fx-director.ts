import * as THREE from 'three';
import type { SolidFxConfig, SolidFxStyle } from '@shared/solid-fx';
import { ensureSolidFx } from '@shared/solid-fx';

const STYLE_INDEX: Record<SolidFxStyle, number> = {
  fade: 0,
  unveil: 1,
  glitch: 2,
  matrix: 3,
};

const GLOW_HALO_NAME = '__glow_halo__';

type FxUniforms = {
  uSolidFxProgress: { value: number };
  uSolidFxStyle: { value: number };
  uSolidFxTime: { value: number };
  uSolidFxMinY: { value: number };
  uSolidFxMaxY: { value: number };
};

type MatSnap = {
  opacity: number;
  transparent: boolean;
  emissive: THREE.Color | null;
  emissiveIntensity: number;
};

type MeshEntry = {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  owned: THREE.Material | THREE.Material[];
  uniforms: FxUniforms[];
  origVisible: boolean;
  origPos: THREE.Vector3;
  origScale: THREE.Vector3;
  snaps: MatSnap[];
};

type RootEntry = {
  root: THREE.Object3D;
  meshes: MeshEntry[];
  progress: number;
  style: SolidFxStyle;
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
    float rim = 1.0 - smoothstep(edge - 0.08, edge, h);
    diffuseColor.rgb += vec3(0.45, 0.9, 1.0) * rim * 1.5;
  } else if (uSolidFxStyle < 2.5) {
    float band = floor(vSolidFxWorld.y * 18.0);
    float n = solidFxHash(vec3(band, floor(uSolidFxTime * 22.0), 3.1));
    if (n > p * 1.08) discard;
    float slice = step(0.78, solidFxHash(vec3(band, 8.2, floor(uSolidFxTime * 30.0))));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 1.0, 0.95), slice * (1.0 - p) * 0.95);
    diffuseColor.rgb += vec3(0.85, 0.2, 1.0) * (1.0 - p) * 0.55;
  } else {
    float cell = 0.14;
    vec3 gp = floor(vSolidFxWorld / cell);
    float n = solidFxHash(gp);
    if (n > p) discard;
    float rim = 1.0 - smoothstep(p - 0.08, p, n);
    diffuseColor.rgb += vec3(0.2, 1.0, 0.4) * rim * 1.7;
  }
}
`;

function asMatList(m: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(m) ? m : [m];
}

function applyFxProgram(mat: THREE.Material, uniforms: FxUniforms) {
  mat.transparent = true;
  mat.customProgramCacheKey = () => 'solid-fx-v2';
  mat.onBeforeCompile = (shader) => {
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
    const tagged = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${FRAG_BODY}`
    );
    shader.fragmentShader =
      tagged !== shader.fragmentShader
        ? tagged
        : shader.fragmentShader.replace(
            'void main() {',
            `void main() {\n  if (uSolidFxProgress <= 0.001) discard;`
          );
  };
  mat.needsUpdate = true;
}

function patchMaterial(mat: THREE.Material, uniforms: FxUniforms): THREE.Material {
  const cloned = mat.clone();
  applyFxProgram(cloned, uniforms);
  return cloned;
}

function snapshotMat(mat: THREE.Material): MatSnap {
  const std = mat as THREE.MeshStandardMaterial;
  return {
    opacity: typeof std.opacity === 'number' ? std.opacity : 1,
    transparent: !!std.transparent,
    emissive: std.emissive ? std.emissive.clone() : null,
    emissiveIntensity: typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 0,
  };
}

function copySurface(from: THREE.Material, to: THREE.Material) {
  const src = from as THREE.MeshStandardMaterial;
  const dst = to as THREE.MeshStandardMaterial;
  if (src.map && 'map' in dst) dst.map = src.map;
  if (src.color && dst.color) dst.color.copy(src.color);
  dst.needsUpdate = true;
}

function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
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

function makeMeshEntry(
  child: THREE.Mesh,
  original: THREE.Material | THREE.Material[],
  owned: THREE.Material | THREE.Material[],
  uniforms: FxUniforms[]
): MeshEntry {
  return {
    mesh: child,
    original,
    owned,
    uniforms,
    origVisible: child.visible,
    origPos: child.position.clone(),
    origScale: child.scale.clone(),
    snaps: asMatList(owned).map(snapshotMat),
  };
}

/**
 * Owns cloned materials and reapplies hide/opacity/glitch every frame so
 * Appear cannot get stuck fully visible after a texture swap. Editor preview
 * detaches and restores the original mesh.
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
      if (child.name === GLOW_HALO_NAME) return;
      const original = child.material;
      if (Array.isArray(original)) {
        const uniforms: FxUniforms[] = [];
        const owned = original.map((m) => {
          const u = makeUniforms(fx.style, minY, maxY);
          uniforms.push(u);
          return patchMaterial(m, u);
        });
        child.material = owned;
        meshes.push(makeMeshEntry(child, original, owned, uniforms));
      } else {
        const u = makeUniforms(fx.style, minY, maxY);
        const owned = patchMaterial(original, u);
        child.material = owned;
        meshes.push(makeMeshEntry(child, original, owned, [u]));
      }
    });
    this.entries.set(id, {
      root,
      meshes,
      progress: fx.mode === 'appear' ? 0 : 1,
      style: fx.style,
      previewUntil: 0,
      previewDuration: fx.durationMs,
      previewMode: null,
    });
    this.paint(id);
  }

  setProgress(id: string, progress: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.progress = Math.min(1, Math.max(0, progress));
    this.paint(id);
  }

  preview(id: string, root: THREE.Object3D, config: SolidFxConfig) {
    this.attach(id, root, config);
    const entry = this.entries.get(id);
    if (!entry) return;
    const fx = ensureSolidFx(config);
    entry.previewMode = fx.mode;
    entry.previewDuration = Math.max(280, fx.durationMs);
    entry.previewUntil = this.elapsed + entry.previewDuration / 1000 + 0.28;
    entry.progress = fx.mode === 'appear' ? 0 : 1;
    this.paint(id);
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
      this.healEntry(entry);
      for (const rec of entry.meshes) {
        for (const u of rec.uniforms) u.uSolidFxTime.value = t;
      }
      if (entry.previewMode) {
        const start = entry.previewUntil - entry.previewDuration / 1000 - 0.28;
        const u = (t - start) / Math.max(0.05, entry.previewDuration / 1000);
        const linear = Math.min(1, Math.max(0, u));
        entry.progress = entry.previewMode === 'appear' ? linear : 1 - linear;
        if (t >= entry.previewUntil) {
          this.detach(id);
          continue;
        }
      }
      this.applyVisual(entry);
    }
  }

  detach(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const rec of entry.meshes) {
      rec.mesh.material = rec.original;
      rec.mesh.visible = rec.origVisible;
      rec.mesh.position.copy(rec.origPos);
      rec.mesh.scale.copy(rec.origScale);
      for (const mat of asMatList(rec.owned)) {
        if (mat !== rec.original && !(Array.isArray(rec.original) && rec.original.includes(mat))) {
          mat.dispose();
        }
      }
    }
    entry.root.traverse((child) => {
      if (child.name === GLOW_HALO_NAME) child.visible = true;
    });
    entry.root.visible = true;
    this.entries.delete(id);
  }

  clear() {
    for (const id of [...this.entries.keys()]) this.detach(id);
  }

  private paint(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.healEntry(entry);
    this.applyVisual(entry);
  }

  /**
   * Texture load replaces materials. Put our owned clone back (keeping the new
   * albedo) so hide/opacity/shader cannot be stripped mid Play Test.
   */
  private healEntry(entry: RootEntry) {
    for (const rec of entry.meshes) {
      const current = asMatList(rec.mesh.material);
      const owned = asMatList(rec.owned);
      let stolen = current.length !== owned.length;
      if (!stolen) {
        for (let i = 0; i < owned.length; i++) {
          if (current[i] !== owned[i]) {
            stolen = true;
            break;
          }
        }
      }
      if (!stolen) continue;
      for (let i = 0; i < owned.length; i++) {
        if (current[i] && owned[i]) copySurface(current[i], owned[i]);
      }
      rec.mesh.material = rec.owned;
    }
  }

  private applyVisual(entry: RootEntry) {
    const p = entry.progress;
    const eased = easeOutCubic(p);
    const style = entry.style;
    const t = this.elapsed;
    const shown = p > 0.001;

    for (const rec of entry.meshes) {
      rec.mesh.visible = shown ? rec.origVisible : false;
      rec.mesh.position.copy(rec.origPos);
      rec.mesh.scale.copy(rec.origScale);

      if (shown && p < 0.995) {
        if (style === 'glitch') {
          const amp = (1 - eased) * 0.16;
          rec.mesh.position.x += Math.sin(t * 48 + rec.mesh.id) * amp;
          rec.mesh.position.z += Math.cos(t * 57 + rec.mesh.id) * amp;
        } else if (style === 'matrix') {
          rec.mesh.scale.copy(rec.origScale).multiplyScalar(Math.min(1, 0.12 + eased * 0.92));
        } else if (style === 'unveil') {
          rec.mesh.scale.set(
            rec.origScale.x,
            rec.origScale.y * Math.max(0.06, eased),
            rec.origScale.z
          );
        }
      }

      for (const u of rec.uniforms) u.uSolidFxProgress.value = p;

      const mats = asMatList(rec.mesh.material);
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i] as THREE.MeshStandardMaterial;
        const snap = rec.snaps[i];
        if (!mat || !snap) continue;
        if (p >= 0.995) {
          mat.opacity = snap.opacity;
          mat.transparent = snap.transparent;
          if (mat.emissive && snap.emissive) mat.emissive.copy(snap.emissive);
          if ('emissiveIntensity' in mat) mat.emissiveIntensity = snap.emissiveIntensity;
        } else {
          mat.transparent = true;
          let op = snap.opacity;
          if (style === 'fade') op *= eased;
          else if (style === 'glitch') {
            const flick = Math.sin(t * 38 + rec.mesh.id) > 0.55 ? 0.4 : 1;
            op *= (0.4 + 0.6 * eased) * flick;
          } else {
            op *= Math.min(1, 0.25 + eased * 0.85);
          }
          mat.opacity = shown ? op : 0;
          if (mat.emissive) {
            const pulse = Math.max(0, 1 - Math.abs(eased - 0.5) * 2);
            if (style === 'glitch') {
              mat.emissive.setRGB(0.75, 0.18, 1);
              mat.emissiveIntensity = 0.55 + pulse * 0.9;
            } else if (style === 'matrix') {
              mat.emissive.setRGB(0.12, 1, 0.32);
              mat.emissiveIntensity = 0.4 + pulse * 1.1;
            } else if (style === 'unveil') {
              mat.emissive.setRGB(0.3, 0.85, 1);
              mat.emissiveIntensity = 0.25 + pulse * 0.85;
            }
          }
        }
      }
    }

    entry.root.traverse((child) => {
      if (child.name === GLOW_HALO_NAME) child.visible = shown;
    });
  }
}
