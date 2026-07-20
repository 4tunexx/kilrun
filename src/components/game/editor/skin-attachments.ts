/**
 * Build / attach skin meshes onto a player avatar
 * (primitives with materials/textures, or catalog / uploaded GLBs).
 * Positions are character-local (feet at y=0) so editor "On body" matches gameplay.
 */
import * as THREE from 'three';
import type {
  SkinAttachment,
  SkinBondedPart,
  SkinMaterial,
  SkinMaterialFeel,
  SkinPrimitive,
  SkinShapeParams,
} from '@/lib/player-skins';
import {
  DEFAULT_SKIN_MATERIAL,
  SKIN_ATTACH_SLOTS,
  attachmentKey,
  materialForFeel,
  mirrorAttachmentX,
  skinSlotMeta,
} from '@/lib/player-skins';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { applySculptDataToGeometry } from './skin-sculpt';

const ATTACH_ROOT_NAME = '__skin_attachments';
const textureCache = new Map<string, THREE.Texture>();

export function clearSkinAttachments(avatarRoot: THREE.Object3D) {
  const existing = avatarRoot.getObjectByName(ATTACH_ROOT_NAME);
  if (existing) existing.removeFromParent();
  // Bone-mode holders parent onto bones (not under __skin_attachments) — remove those too
  const orphaned: THREE.Object3D[] = [];
  avatarRoot.traverse((o) => {
    if (o !== avatarRoot && typeof o.name === 'string' && o.name.startsWith('skin_')) {
      orphaned.push(o);
    }
  });
  for (const o of orphaned) o.removeFromParent();
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

export function makeGeometry(kind: SkinPrimitive, shape: SkinShapeParams = {}): THREE.BufferGeometry {
  const w = shape.width ?? 0.4;
  const h = shape.height ?? 0.4;
  const d = shape.depth ?? 0.4;
  const r = shape.radius ?? 0.25;
  // Dense enough for blob sculpt (ZBrush-lite)
  const rs = Math.max(16, Math.round(shape.radialSegments ?? 32));
  const hs = Math.max(12, Math.round(shape.heightSegments ?? 24));
  const boxSeg = Math.max(8, Math.round(shape.radialSegments ?? 12));
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(w, h, d, boxSeg, boxSeg, boxSeg);
    case 'sphere':
      return new THREE.SphereGeometry(r, rs, hs);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        shape.radiusTop ?? r,
        shape.radiusBottom ?? r,
        h,
        rs,
        Math.max(4, Math.round(hs / 3))
      );
    case 'capsule':
      return new THREE.CapsuleGeometry(
        r,
        Math.max(0.01, h),
        Math.max(12, Math.round(hs / 2)),
        Math.max(20, rs)
      );
    case 'cone':
      return new THREE.ConeGeometry(r, h, rs, Math.max(4, Math.round(hs / 3)));
    case 'torus':
      return new THREE.TorusGeometry(
        r,
        shape.tube ?? r * 0.35,
        Math.max(12, hs),
        shape.tubularSegments ?? 48
      );
    case 'plane':
      return new THREE.PlaneGeometry(w, h, boxSeg, boxSeg);
    default:
      return new THREE.BoxGeometry(w, h, d, boxSeg, boxSeg, boxSeg);
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
        ctx.fillStyle = (x / s + y / s) % 2 === 0 ? a : b;
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

function resolveFeel(att: SkinAttachment): SkinMaterialFeel {
  if (att.feel) return att.feel;
  try {
    return skinSlotMeta(att.slot).defaultFeel;
  } catch {
    return 'solid';
  }
}

async function buildMaterial(att: SkinAttachment): Promise<THREE.MeshStandardMaterial> {
  const feel = resolveFeel(att);
  const felt = materialForFeel(feel, {
    ...DEFAULT_SKIN_MATERIAL,
    ...att.material,
    color: att.material?.color || att.color || DEFAULT_SKIN_MATERIAL.color,
  });
  const mat = new THREE.MeshStandardMaterial({
    color: felt.color,
    metalness: felt.metalness ?? 0.15,
    roughness: felt.roughness ?? 0.65,
    transparent: (felt.opacity ?? 1) < 0.999,
    opacity: felt.opacity ?? 1,
    emissive: new THREE.Color(felt.emissive || '#000000'),
    emissiveIntensity: felt.emissiveIntensity ?? 0,
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
    const proc = typeof document !== 'undefined' ? makeProceduralTexture(felt) : null;
    if (proc) {
      mat.map = proc;
      mat.needsUpdate = true;
    }
  }
  return mat;
}

/** Build a standalone Object3D for one attachment (for preview / thumbnail). */
export async function buildSkinPartMesh(att: SkinAttachment): Promise<THREE.Object3D> {
  const bonded = att.bonded?.length ? att.bonded : [];

  const buildPrim = async (
    primitive: SkinPrimitive,
    shape: SkinShapeParams | undefined,
    matSrc: SkinAttachment | SkinBondedPart,
    name: string,
    sculpt?: SkinAttachment['sculpt']
  ) => {
    const geo = makeGeometry(primitive, shape ?? {});
    applySculptDataToGeometry(geo, sculpt);
    const mat = await buildMaterial({
      ...att,
      material: matSrc.material ?? att.material,
      color: matSrc.material?.color || att.color,
      textureUrl: 'textureUrl' in matSrc ? undefined : att.textureUrl,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.sculptable = true;
    mesh.userData.bondId = 'id' in matSrc && name.startsWith('bond_') ? matSrc.id : undefined;
    return mesh;
  };

  let primary: THREE.Object3D;
  if (att.primitive && !att.model && !att.customModelUrl) {
    primary = await buildPrim(
      att.primitive,
      att.shape,
      att,
      `prim_${attachmentKey(att)}`,
      att.sculpt
    );
  } else {
    const src = resolveModelSrc(att.model, att.customModelUrl);
    if (!src) {
      primary = await buildPrim('box', { width: 0.3, height: 0.3, depth: 0.3 }, att, `prim_${attachmentKey(att)}`);
    } else {
      const { root } = await loadAnimatedPrefab(src);
      plantLocal(root);
      const color = att.material?.color || att.color;
      const matOverrides = att.material;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.userData.sculptable = true;
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
      primary = root;
    }
  }

  if (!bonded.length) return primary;

  // Compound skin: primary + bonded shapes in one group (editor + gameplay).
  const group = new THREE.Group();
  group.name = `compound_${attachmentKey(att)}`;
  group.add(primary);
  for (const part of bonded) {
    const mesh = await buildPrim(
      part.primitive,
      part.shape,
      part,
      `bond_${part.id}`,
      part.sculpt
    );
    mesh.position.set(...part.position);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(part.rotation[0]),
      THREE.MathUtils.degToRad(part.rotation[1]),
      THREE.MathUtils.degToRad(part.rotation[2])
    );
    mesh.scale.set(...part.scale);
    group.add(mesh);
  }
  return group;
}

function expandAttachments(attachments: SkinAttachment[]): SkinAttachment[] {
  const out: SkinAttachment[] = [];
  for (const att of attachments) {
    out.push(att);
    const meta = SKIN_ATTACH_SLOTS.find((s) => s.id === att.slot);
    if (att.pairMirror && meta?.canPairMirror) {
      out.push(mirrorAttachmentX(att));
    }
  }
  return out;
}

/**
 * Place holder so `att.position` (character-local, feet y=0) matches
 * the Model Editor "On body" preview exactly in gameplay.
 */
function placeHolder(
  avatarRoot: THREE.Object3D,
  group: THREE.Group,
  att: SkinAttachment,
  holder: THREE.Object3D
) {
  const meta = SKIN_ATTACH_SLOTS.find((s) => s.id === att.slot);
  const mode = att.attachMode ?? meta?.defaultAttachMode ?? 'body';
  const charLocal = new THREE.Vector3(...att.position);

  avatarRoot.updateMatrixWorld(true);

  if (mode === 'body') {
    holder.position.copy(charLocal);
    group.add(holder);
    return;
  }

  // Bone mode: convert character-local → bone-local at current bind pose
  let bone: THREE.Object3D | null = null;
  if (att.bone) bone = avatarRoot.getObjectByName(att.bone) ?? null;
  if (!bone && meta) bone = findBone(avatarRoot, meta.boneHints);

  if (!bone) {
    holder.position.copy(charLocal);
    group.add(holder);
    return;
  }

  const world = avatarRoot.localToWorld(charLocal.clone());
  const boneLocal = bone.worldToLocal(world);
  holder.position.copy(boneLocal);
  bone.add(holder);
}

async function attachOne(
  avatarRoot: THREE.Object3D,
  group: THREE.Group,
  att: SkinAttachment
) {
  const root = await buildSkinPartMesh(att);
  root.scale.set(...att.scale);
  root.rotation.set(
    THREE.MathUtils.degToRad(att.rotation[0]),
    THREE.MathUtils.degToRad(att.rotation[1]),
    THREE.MathUtils.degToRad(att.rotation[2])
  );

  const holder = new THREE.Group();
  holder.name = `skin_${attachmentKey(att)}`;
  const feel = resolveFeel(att);
  holder.userData.skinFeel = feel;
  holder.userData.skinSway =
    feel === 'cape' ? 1 : feel === 'cloth' ? 0.45 : 0;
  holder.userData.baseRotZ = holder.rotation.z;
  holder.userData.baseRotX = holder.rotation.x;
  holder.add(root);
  placeHolder(avatarRoot, group, att, holder);
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

  const expanded = expandAttachments(attachments);
  for (const att of expanded) {
    try {
      await attachOne(avatarRoot, group, att);
    } catch (err) {
      console.warn('[applySkinAttachments]', att.slot, err);
    }
  }
}

/** Soft sway for cloth / cape parts — call each frame from character update. */
export function tickSkinAttachments(avatarRoot: THREE.Object3D, dt: number, timeSec?: number) {
  const t = timeSec ?? performance.now() * 0.001;
  // Walk whole avatar — bone-parented skins live outside __skin_attachments
  avatarRoot.traverse((o) => {
    const sway = o.userData?.skinSway;
    if (!sway || typeof sway !== 'number' || sway <= 0) return;
    const amp = 0.045 * sway;
    const baseZ = typeof o.userData.baseRotZ === 'number' ? o.userData.baseRotZ : 0;
    const baseX = typeof o.userData.baseRotX === 'number' ? o.userData.baseRotX : 0;
    o.rotation.z = baseZ + Math.sin(t * 2.2 + o.id) * amp;
    o.rotation.x = baseX + Math.sin(t * 1.6 + o.id * 0.7) * amp * 0.55;
    void dt;
  });
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
