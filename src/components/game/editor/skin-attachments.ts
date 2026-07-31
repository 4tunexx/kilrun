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
import { isPackPreviewIconUrl } from '@/lib/asset-registry';

/** Food/prop fullbodies authored outside Characters_7 — their FBX points at a
 *  missing pack atlas, so we tint materials instead of sampling the wrong sheet. */
const PACK_SOLID_COLOR_HINTS: { test: RegExp; color: string }[] = [
  { test: /banana/i, color: '#f2c84b' },
  { test: /eggplant/i, color: '#6b3d9a' },
  { test: /hot[_-]?dog/i, color: '#e39a5c' },
  { test: /sausage/i, color: '#c45c3e' },
  { test: /mushroom/i, color: '#d4a574' },
  { test: /sushi/i, color: '#f5efe4' },
  { test: /shark/i, color: '#5b7c99' },
  { test: /snake/i, color: '#4f8f3e' },
  { test: /ghost/i, color: '#e8eef7' },
  { test: /snowman/i, color: '#f4f7fb' },
  { test: /tooth/i, color: '#fff8ef' },
  { test: /palm/i, color: '#3f8f4a' },
  { test: /flower/i, color: '#e85d8a' },
  { test: /ostrich/i, color: '#c4a574' },
  { test: /crayfish/i, color: '#d4543a' },
  { test: /trash/i, color: '#6b7280' },
  { test: /gift/i, color: '#d64545' },
  { test: /ufo/i, color: '#8be9a0' },
  { test: /nightstand/i, color: '#8b6914' },
  { test: /action[_-]?figure/i, color: '#c45c26' },
  { test: /alien/i, color: '#7dcf6a' },
  { test: /astronaut/i, color: '#dfe7f2' },
  { test: /demon/i, color: '#a11f2c' },
  { test: /lego/i, color: '#e23d28' },
  { test: /red[_-]?guy/i, color: '#e11d48' },
];

/** Characters_7 fullbodies that correctly share Textures.png UVs. */
const PACK_ATLAS_FULLBODY =
  /action[_-]?figure|alien|astronaut|demon|lego|red[_-]?guy/i;

function solidColorHintForSrc(src: string, att: SkinAttachment): string | null {
  if (att.material?.color || att.color) return null;
  const hay = `${src} ${att.id || ''} ${att.slot || ''}`;
  // Atlas-backed Characters_7 costumes keep their map (no solid override).
  if (/\/fullbody\//i.test(src) && PACK_ATLAS_FULLBODY.test(hay)) return null;
  for (const row of PACK_SOLID_COLOR_HINTS) {
    if (row.test.test(hay)) return row.color;
  }
  // Any other /fullbody/ food-or-prop costume: warm neutral so it never stays chrome-grey.
  if (/\/fullbody\//i.test(src)) return '#c4a882';
  return null;
}

function siblingPackAtlasUrl(modelSrc: string): string | null {
  if (!/\/game\/skins\//i.test(modelSrc) || !/\.fbx(\?|$)/i.test(modelSrc)) return null;
  const dir = modelSrc.replace(/\\/g, '/').replace(/[^/]+$/, '');
  return `${dir}Textures.png`;
}

async function ensurePackAtlasMap(root: THREE.Object3D, modelSrc: string): Promise<void> {
  const atlasUrl = siblingPackAtlasUrl(modelSrc);
  if (!atlasUrl) return;
  let needsAtlas = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std || !('map' in std)) continue;
      const tex = std.map;
      if (!tex) {
        needsAtlas = true;
        continue;
      }
      const img = tex.image as HTMLImageElement | undefined;
      if (img && typeof img.complete === 'boolean' && img.complete && !img.naturalWidth) {
        needsAtlas = true;
      }
    }
  });
  if (!needsAtlas) {
    // Still wait briefly so decoding finishes before first paint.
    await waitForRootTextures(root, 2500);
    return;
  }
  try {
    const tex = await loadTexture(atlasUrl);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std || !('map' in std)) continue;
        const img = std.map?.image as HTMLImageElement | undefined;
        const broken =
          !std.map ||
          (img && typeof img.complete === 'boolean' && img.complete && !img.naturalWidth);
        if (broken) {
          std.map = tex;
          if (std.color) std.color.setRGB(1, 1, 1);
          std.needsUpdate = true;
        }
      }
    });
  } catch {
    /* keep existing mats */
  }
  await waitForRootTextures(root, 2500);
}

/**
 * Universal safety net: whatever the source (built-in pack, custom upload,
 * any slot), if a material's texture actually 404'd (image finished loading
 * but decoded to zero size), leave the mesh flat black instead of a graceful
 * neutral tint is worse than no texture at all — this is what previously
 * only /fullbody/ costumes got via `solidColorHintForSrc`'s beige fallback.
 * Non-fullbody accessories (hats, glasses, custom props) had no equivalent,
 * so a broken texture on those just rendered pure black with no fallback.
 */
async function applyBrokenTextureFallback(
  root: THREE.Object3D,
  fallbackColor = '#c4a882'
): Promise<void> {
  await waitForRootTextures(root, 2000);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std || !('map' in std) || !std.map) continue;
      const img = std.map.image as HTMLImageElement | undefined;
      const broken =
        img && typeof img.complete === 'boolean' && img.complete && !img.naturalWidth;
      if (broken) {
        std.map = null;
        std.color?.set(fallbackColor);
        std.needsUpdate = true;
      }
    }
  });
}

function waitForRootTextures(root: THREE.Object3D, timeoutMs: number): Promise<void> {
  const textures: THREE.Texture[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std?.map) textures.push(std.map);
      if (std?.emissiveMap) textures.push(std.emissiveMap);
    }
  });
  if (!textures.length) return Promise.resolve();
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const ready = textures.every((tex) => {
        const img = tex.image as HTMLImageElement | ImageBitmap | { width?: number } | undefined;
        if (!img) return false;
        if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
          return img.complete && img.naturalWidth > 0;
        }
        if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) return true;
        return Boolean((img as { width?: number }).width);
      });
      if (ready || performance.now() - start > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

const ATTACH_ROOT_NAME = '__skin_attachments';
const textureCache = new Map<string, THREE.Texture>();
const attachmentGeneration = new WeakMap<THREE.Object3D, number>();

/**
 * FBX pack skins often arrive with high specular/metalness; under a PMREM
 * environment they read as chrome grey. Keep albedo maps, flatten metal.
 */
export function sanitizePackSkinMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std || typeof std !== 'object') continue;
      if ('metalness' in std && typeof std.metalness === 'number') {
        std.metalness = Math.min(std.metalness, 0.08);
      }
      if ('roughness' in std && typeof std.roughness === 'number') {
        std.roughness = Math.max(std.roughness, 0.45);
      }
      if ('specular' in std && (std as unknown as { specular?: THREE.Color }).specular) {
        (std as unknown as { specular: THREE.Color }).specular.setRGB(0.08, 0.08, 0.08);
      }
      if (std.map && std.map.colorSpace !== THREE.SRGBColorSpace) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.needsUpdate = true;
      }
      if (std.emissiveMap && std.emissiveMap.colorSpace !== THREE.SRGBColorSpace) {
        std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        std.emissiveMap.needsUpdate = true;
      }
      std.needsUpdate = true;
    }
  });
}

export function clearSkinAttachments(avatarRoot: THREE.Object3D) {
  attachmentGeneration.set(avatarRoot, (attachmentGeneration.get(avatarRoot) ?? 0) + 1);
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
  // A full-body preview hides the base skinned body. Restore it when the
  // attachment set changes or is cleared.
  avatarRoot.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && !mesh.userData.reboundToPlayer) mesh.visible = true;
  });
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
      const { root, clips } = await loadAnimatedPrefab(src);
      if (clips.length) {
        root.userData.gltfClips = clips;
      }
      let hasSkinnedMesh = false;
      root.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkinnedMesh = true;
      });
      // Characters_7 clothing/full-body FBXs are authored in the same space as
      // Body_Blue_001. Planting them independently shifts the garment away from
      // the body; rigid props still need thumbnail-style planting.
      if (!hasSkinnedMesh) plantLocal(root);
      root.userData.packSkinnedAsset = hasSkinnedMesh;
      const solidHint = solidColorHintForSrc(src, att);
      // Characters_7 clothing / atlas fullbodies: make sure Textures.png is bound
      // and decoded before first paint (avoids grey chrome flash).
      if (!solidHint && /\/game\/skins\//i.test(src)) {
        await ensurePackAtlasMap(root, src);
      }
      const color = att.material?.color || att.color || solidHint || undefined;
      const matOverrides = att.material;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.userData.sculptable = true;
        const apply = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          // Food/prop costumes: drop the wrong Characters_7 atlas so the tint reads clean.
          if (solidHint && 'map' in std && std.map) {
            std.map = null;
          }
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
      // Pack preview icons (128px FullBody_*.png etc.) are NOT UV atlases — applying
      // them as diffuse maps is what made inventory skins look flat grey/metal.
      if (att.textureUrl && !isPackPreviewIconUrl(att.textureUrl)) {
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
      sanitizePackSkinMaterials(root);
      if (!solidHint) {
        // Reactive, name-independent: catches broken textures on ANY slot
        // (hats/glasses/custom uploads), not just the /fullbody/ category.
        await applyBrokenTextureFallback(root);
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

function normalizedBoneName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Rebind an imported Characters_7 garment to the avatar's live skeleton.
 * The garment's skin indices retain their original ordering; a new Skeleton
 * supplies the matching animated avatar bones in that same ordering.
 */
function rebindSkinnedAsset(
  avatarRoot: THREE.Object3D,
  importedRoot: THREE.Object3D
): boolean {
  const targetBones = new Map<string, THREE.Bone>();
  avatarRoot.traverse((o) => {
    if ((o as THREE.Bone).isBone || o.type === 'Bone') {
      targetBones.set(normalizedBoneName(o.name), o as THREE.Bone);
    }
  });

  const meshes: THREE.SkinnedMesh[] = [];
  importedRoot.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });
  if (!meshes.length || !targetBones.size) return false;

  // Validate every mesh before changing any of them. Falling back to the old
  // rigid attachment is safer than leaving a garment half rebound.
  const mappings = meshes.map((mesh) =>
    mesh.skeleton.bones.map((bone) => targetBones.get(normalizedBoneName(bone.name)) ?? null)
  );
  if (mappings.some((bones) => bones.some((bone) => !bone))) {
    console.warn('[skin] incompatible skinned asset; not all bones match the player rig');
    return false;
  }

  meshes.forEach((mesh, index) => {
    const source = mesh.skeleton;
    const skeleton = new THREE.Skeleton(
      mappings[index] as THREE.Bone[],
      source.boneInverses.map((inverse) => inverse.clone())
    );
    mesh.skeleton = skeleton;
    mesh.normalizeSkinWeights();
    mesh.frustumCulled = false;
    mesh.userData.reboundToPlayer = true;
  });

  // Remove the garment's duplicate rig. Duplicate DEF-* names can steal
  // AnimationMixer property bindings from the real player bones.
  const hasMesh = (root: THREE.Object3D) => {
    let found = false;
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) found = true;
    });
    return found;
  };
  const hasBone = (root: THREE.Object3D) => {
    let found = false;
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.type === 'Bone') found = true;
    });
    return found;
  };
  for (const child of [...importedRoot.children]) {
    if (hasBone(child) && !hasMesh(child)) child.removeFromParent();
  }
  return true;
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
  att: SkinAttachment,
  isCurrent: () => boolean
) {
  const root = await buildSkinPartMesh(att);
  if (!isCurrent()) return;
  const followsPlayerSkeleton =
    root.userData.packSkinnedAsset === true && rebindSkinnedAsset(avatarRoot, root);
  root.scale.set(...att.scale);
  root.rotation.set(
    THREE.MathUtils.degToRad(att.rotation[0]),
    THREE.MathUtils.degToRad(att.rotation[1]),
    THREE.MathUtils.degToRad(att.rotation[2])
  );

  const holder = new THREE.Group();
  holder.name = `skin_${attachmentKey(att)}`;
  if (att.slot === 'weapon') {
    holder.userData.isWeaponSkin = true;
    // Bubble clips up so ThreeCharacter can drive a weapon mixer.
    if (Array.isArray(root.userData.gltfClips)) {
      holder.userData.gltfClips = root.userData.gltfClips;
    }
  }
  const feel = resolveFeel(att);
  holder.userData.skinFeel = feel;
  holder.userData.skinSway =
    feel === 'cape' ? 1 : feel === 'cloth' ? 0.45 : 0;
  holder.userData.baseRotZ = holder.rotation.z;
  holder.userData.baseRotX = holder.rotation.x;
  holder.add(root);
  if (followsPlayerSkeleton) {
    // Skinned pack clothes are already authored around the character origin.
    // Never parent their whole rig to one hand/head/foot bone.
    holder.position.set(...att.position);
    group.add(holder);
  } else {
    placeHolder(avatarRoot, group, att, holder);
  }
}

export async function applySkinAttachments(
  avatarRoot: THREE.Object3D,
  attachments: SkinAttachment[]
): Promise<void> {
  clearSkinAttachments(avatarRoot);
  const generation = attachmentGeneration.get(avatarRoot) ?? 0;
  const isCurrent = () => attachmentGeneration.get(avatarRoot) === generation;
  avatarRoot.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) mesh.visible = true;
  });
  if (!attachments.length) return;

  const group = new THREE.Group();
  group.name = ATTACH_ROOT_NAME;
  avatarRoot.add(group);

  const expanded = expandAttachments(attachments);

  // Body-slot meshes (Body_Blue_002 etc.) are alternate body meshes — after a
  // successful rebind we hide the default pack body so only one body shows.
  // Fullbody costumes intentionally stay OVER the default player model and
  // must never replace / hide it (live match + inventory + play test).
  const bodyAtts = expanded.filter((att) => att.slot === 'body');
  const loadableBodies = bodyAtts.filter(
    (att) => !!resolveModelSrc(att.model, att.customModelUrl)
  );
  const bodySwapPending = loadableBodies.length > 0;
  let bodySwapLoaded = false;

  for (const att of expanded) {
    try {
      await attachOne(avatarRoot, group, att, isCurrent);
      if (att.slot === 'body' && resolveModelSrc(att.model, att.customModelUrl)) {
        bodySwapLoaded = true;
      }
      if (!isCurrent()) return;
    } catch (err) {
      console.warn('[applySkinAttachments]', att.slot, err);
    }
  }

  if (bodySwapPending && bodySwapLoaded) {
    avatarRoot.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh && !mesh.userData.reboundToPlayer) {
        mesh.visible = false;
      }
    });
  }
}

export interface WeaponSwayOpts {
  enabled: boolean;
  /** Idle sway amplitude (degrees). */
  amplitudeDeg: number;
  /** Idle sway speed (Hz). */
  speedHz: number;
  /** Extra amplitude multiplier while the player is moving. */
  moveMult: number;
  /** Whether the player is currently moving (extra sway kicks in). */
  moving: boolean;
}

/**
 * Soft sway for cloth / cape parts, plus idle weapon sway (CombatSettings
 * swayEnabled/swayAmplitudeDeg/swaySpeedHz/swayMoveMult) — call each frame
 * from character update. Weapon sway targets the holder group tagged
 * `userData.isWeaponSkin` by attachOne() in this file.
 */
export function tickSkinAttachments(
  avatarRoot: THREE.Object3D,
  dt: number,
  timeSec?: number,
  weaponSway?: WeaponSwayOpts
) {
  const t = timeSec ?? performance.now() * 0.001;
  // Walk whole avatar — bone-parented skins live outside __skin_attachments
  avatarRoot.traverse((o) => {
    const sway = o.userData?.skinSway;
    if (sway && typeof sway === 'number' && sway > 0) {
      const amp = 0.045 * sway;
      const baseZ = typeof o.userData.baseRotZ === 'number' ? o.userData.baseRotZ : 0;
      const baseX = typeof o.userData.baseRotX === 'number' ? o.userData.baseRotX : 0;
      o.rotation.z = baseZ + Math.sin(t * 2.2 + o.id) * amp;
      o.rotation.x = baseX + Math.sin(t * 1.6 + o.id * 0.7) * amp * 0.55;
    }
    if (weaponSway?.enabled && o.userData?.isWeaponSkin) {
      const ampRad =
        THREE.MathUtils.degToRad(Math.max(0, weaponSway.amplitudeDeg)) *
        (weaponSway.moving ? Math.max(1, weaponSway.moveMult) : 1);
      const freq = Math.max(0.05, weaponSway.speedHz) * Math.PI * 2;
      const baseZ = typeof o.userData.baseRotZ === 'number' ? o.userData.baseRotZ : 0;
      const baseX = typeof o.userData.baseRotX === 'number' ? o.userData.baseRotX : 0;
      o.rotation.x = baseX + Math.sin(t * freq) * ampRad;
      o.rotation.z = baseZ + Math.sin(t * freq * 0.6 + 1.3) * ampRad * 0.6;
    }
  });
  void dt;
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
