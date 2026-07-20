/**
 * Build / attach skin meshes onto a player avatar
 * (primitives with materials/textures, or catalog / uploaded GLBs).
 */
import * as THREE from 'three';
import type {
  SkinAttachment,
  SkinMaterial,
  SkinPrimitive,
  SkinShapeParams,
} from '@/lib/player-skins';
import {
  DEFAULT_SKIN_MATERIAL,
  SKIN_ATTACH_SLOTS,
} from '@/lib/player-skins';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';

const ATTACH_ROOT_NAME = '__skin_attachments';
const textureCache = new Map<string, THREE.Texture>();

export function clearSkinAttachments(avatarRoot: THREE.Object3D) {
  const existing = avatarRoot.getObjectByName(ATTACH_ROOT_NAME);
  if (existing) existing.removeFromParent();
}

function findBone(root: THREE.Object3D, hints: string[]): THREE.Object3D | null {
  const lowerHints = hints.map((h) => h.toLowerCase());
  let best: THREE.Object3D | null = null;
  root.traverse((o) => {
    const name = (o.name || '').toLowerCase();
    if (!name) return;
    if (lowerHints.some((h) => name.includes(h))) {
      if (!best || name.length < (best.name?.length ?? 99)) best = o;
    }
  });
  return best;
}

function plantLocal(mesh: THREE.Object3D) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  mesh.position.x -= center.x;
  mesh.position.z -= center.z;
  mesh.position.y -= box.min.y;
}

function makeGeometry(kind: SkinPrimitive, shape: SkinShapeParams = {}): THREE.BufferGeometry {
  const w = shape.width ?? 0.4;
  const h = shape.height ?? 0.4;
  const d = shape.depth ?? 0.4;
  const r = shape.radius ?? 0.25;
  const rs = Math.max(3, Math.round(shape.radialSegments ?? 24));
  const hs = Math.max(1, Math.round(shape.heightSegments ?? 8));
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(w, h, d);
    case 'sphere':
      return new THREE.SphereGeometry(r, rs, hs);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        shape.radiusTop ?? r,
        shape.radiusBottom ?? r,
        h,
        rs
      );
    case 'capsule':
      return new THREE.CapsuleGeometry(r, Math.max(0.01, h), 4, rs);
    case 'cone':
      return new THREE.ConeGeometry(r, h, rs);
    case 'torus':
      return new THREE.TorusGeometry(r, shape.tube ?? r * 0.35, hs, shape.tubularSegments ?? 32);
    case 'plane':
      return new THREE.PlaneGeometry(w, h);
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

function makeProceduralTexture(mat: SkinMaterial): THREE.CanvasTexture | null {
  const pattern = mat.pattern ?? 'flat';
  if (pattern === 'flat') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const a = mat.color || '#c4a574';
  const b = mat.patternColor || '#8b6914';
  if (pattern === 'stripes') {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = b;
    for (let i = 0; i < 128; i += 16) ctx.fillRect(i, 0, 8, 128);
  } else if (pattern === 'checker') {
    const s = 16;
    for (let y = 0; y < 128; y += s) {
      for (let x = 0; x < 128; x += s) {
        ctx.fillStyle = ((x / s + y / s) % 2 === 0 ? a : b);
        ctx.fillRect(x, y, s, s);
      }
    }
  } else if (pattern === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function loadTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        textureCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

async function buildMaterial(att: SkinAttachment): Promise<THREE.MeshStandardMaterial> {
  const m: SkinMaterial = {
    ...DEFAULT_SKIN_MATERIAL,
    ...att.material,
    color: att.material?.color || att.color || DEFAULT_SKIN_MATERIAL.color,
  };
  const mat = new THREE.MeshStandardMaterial({
    color: m.color,
    metalness: m.metalness ?? 0.15,
    roughness: m.roughness ?? 0.65,
    transparent: (m.opacity ?? 1) < 0.999,
    opacity: m.opacity ?? 1,
    emissive: new THREE.Color(m.emissive || '#000000'),
    emissiveIntensity: m.emissiveIntensity ?? 0,
    side: THREE.DoubleSide,
  });
  if (att.textureUrl) {
    try {
      mat.map = await loadTexture(att.textureUrl);
      mat.needsUpdate = true;
    } catch {
      /* ignore bad texture */
    }
  } else {
    const proc = typeof document !== 'undefined' ? makeProceduralTexture(m) : null;
    if (proc) {
      mat.map = proc;
      mat.needsUpdate = true;
    }
  }
  return mat;
}

/** Build a standalone Object3D for one attachment (for preview / thumbnail). */
export async function buildSkinPartMesh(att: SkinAttachment): Promise<THREE.Object3D> {
  if (att.primitive && !att.model && !att.customModelUrl) {
    const geo = makeGeometry(att.primitive, att.shape ?? {});
    const mat = await buildMaterial(att);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `prim_${att.slot}`;
    return mesh;
  }

  const src = resolveModelSrc(att.model, att.customModelUrl);
  if (!src) {
    // Fallback empty box so UI never goes blank
    const geo = makeGeometry('box', { width: 0.3, height: 0.3, depth: 0.3 });
    const mat = await buildMaterial(att);
    return new THREE.Mesh(geo, mat);
  }
  const { root } = await loadAnimatedPrefab(src);
  plantLocal(root);
  const color = att.material?.color || att.color;
  const matOverrides = att.material;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const apply = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      if (color && 'color' in std) std.color?.set(color);
      if (matOverrides) {
        if (typeof matOverrides.metalness === 'number' && 'metalness' in std) {
          std.metalness = matOverrides.metalness;
        }
        if (typeof matOverrides.roughness === 'number' && 'roughness' in std) {
          std.roughness = matOverrides.roughness;
        }
        if (typeof matOverrides.opacity === 'number') {
          std.opacity = matOverrides.opacity;
          std.transparent = matOverrides.opacity < 0.999;
        }
      }
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else if (mesh.material) apply(mesh.material);
  });
  if (att.textureUrl) {
    try {
      const tex = await loadTexture(att.textureUrl);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const apply = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          if ('map' in std) {
            std.map = tex;
            std.needsUpdate = true;
          }
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
        else if (mesh.material) apply(mesh.material);
      });
    } catch {
      /* ignore */
    }
  }
  return root;
}

export async function applySkinAttachments(
  avatarRoot: THREE.Object3D,
  attachments: SkinAttachment[]
): Promise<void> {
  clearSkinAttachments(avatarRoot);
  if (!attachments.length) return;

  const group = new THREE.Group();
  group.name = ATTACH_ROOT_NAME;
  avatarRoot.add(group);

  for (const att of attachments) {
    try {
      const root = await buildSkinPartMesh(att);
      root.scale.set(...att.scale);
      root.rotation.set(
        THREE.MathUtils.degToRad(att.rotation[0]),
        THREE.MathUtils.degToRad(att.rotation[1]),
        THREE.MathUtils.degToRad(att.rotation[2])
      );

      const meta = SKIN_ATTACH_SLOTS.find((s) => s.id === att.slot);
      const boneName = att.bone;
      let parent: THREE.Object3D = group;
      if (boneName) {
        const named = avatarRoot.getObjectByName(boneName);
        if (named) parent = named;
      } else if (meta) {
        const bone = findBone(avatarRoot, meta.boneHints);
        if (bone) parent = bone;
      }

      const holder = new THREE.Group();
      holder.name = `skin_${att.slot}`;
      holder.position.set(...att.position);
      if (parent !== group && meta) {
        holder.position.set(
          att.position[0] - meta.defaultOffset[0],
          att.position[1] - meta.defaultOffset[1],
          att.position[2] - meta.defaultOffset[2]
        );
      }
      holder.add(root);
      parent.add(holder);
    } catch (err) {
      console.warn('[applySkinAttachments]', att.slot, err);
    }
  }
}

/**
 * Render a skin part alone (no full avatar) for shop thumbnails.
 * Returns a JPEG data URL or null.
 */
export async function captureSkinPartThumbnail(
  att: SkinAttachment,
  size = 256
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0e1620');
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.1);
    sun.position.set(2, 3, 4);
    scene.add(sun);

    const part = await buildSkinPartMesh(att);
    part.scale.set(...att.scale);
    part.rotation.set(
      THREE.MathUtils.degToRad(att.rotation[0]),
      THREE.MathUtils.degToRad(att.rotation[1] + 25),
      THREE.MathUtils.degToRad(att.rotation[2])
    );
    scene.add(part);

    part.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part);
    const center = new THREE.Vector3();
    const sizeV = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(sizeV);
    const maxDim = Math.max(sizeV.x, sizeV.y, sizeV.z, 0.2);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    const dist = maxDim * 2.4;
    camera.position.set(center.x + dist * 0.55, center.y + dist * 0.25, center.z + dist);
    camera.lookAt(center);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(size, size, false);
    renderer.setPixelRatio(1);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.82);
    renderer.dispose();
    return url;
  } catch (err) {
    console.warn('[captureSkinPartThumbnail]', err);
    return null;
  }
}
