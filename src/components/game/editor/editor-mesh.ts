import * as THREE from 'three';
import { entityWorldSize, isInvisibleMarkerKind, type EditorEntity } from './map-document';

/**
 * Recursively release GPU resources (geometry, material, and the standard
 * material texture slots) for a detached Object3D tree. Only safe to call on
 * trees that are fully owned by the caller (e.g. a preview's own loaded
 * avatar/attachment meshes) — never on nodes that share geometry/materials
 * with a cache other code still reads from. See `disposeClonedMaterials`
 * below for trees loaded via loadAnimatedPrefab/loadPlayerAvatar, which DO
 * share geometry/textures with a module-level cache.
 */
export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      for (const key of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
        'aoMap',
        'alphaMap',
      ] as const) {
        const tex = std[key];
        if (tex) tex.dispose();
      }
      m.dispose();
    }
  });
}

/**
 * Release only the per-instance-cloned Material objects (GPU program/uniform
 * state) of a tree loaded via loadAnimatedPrefab / loadPlayerAvatar /
 * loadPackPlayerPrefab. Those loaders cache the source GLTF/FBX scene at
 * module scope and hand back `scene.clone(true)` with only materials cloned
 * per call (see cloneGltfScene/cloneFbxScene) — geometry and material.map
 * textures still point at the shared cached original. Disposing geometry or
 * textures here would corrupt every other live/future avatar built from the
 * same cached model, so this deliberately disposes materials only.
 */
export function disposeClonedMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) m.dispose();
  });
}

/**
 * Dispose geometry only for nodes explicitly tagged
 * `userData.__ownsGpuResources` at creation — the mirror image of
 * disposeClonedMaterials for a tree that mixes freshly-built geometry (own,
 * safe to fully dispose) with cache-derived GLB parts (shared with
 * loadAnimatedPrefab/loadPlayerAvatar's module-level cache, NEVER safe to
 * dispose geometry for — see disposeObject3D's doc comment above). Geometry
 * only, not material: callers already run disposeClonedMaterials over the
 * same tree for material/texture cleanup, and double-disposing a Material is
 * needless. Mirrors ThreeMap's private disposeOwnResources; exported here so
 * any caller building its own mix of unique + cached geometry can reuse the
 * same tag convention instead of leaking the unique half.
 */
export function disposeOwnedGeometry(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!obj.userData?.__ownsGpuResources) return;
    (obj as THREE.Mesh).geometry?.dispose();
  });
}

/** Tags every node in a tree as owning its own GPU resources (fresh,
 *  uniquely-created geometry/material — never shared with a loader cache),
 *  so disposeOwnedGeometry knows it's safe to fully dispose. */
export function markOwnsGpuResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    obj.userData.__ownsGpuResources = true;
  });
}

/** Shift mesh so local AABB feet sit on y=0 and XZ is centered on the pivot. */
export function plantLocalFeet(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= box.min.y;
}

/** Wrap a loaded model with planted feet so entity.position.y is the stand surface. */
export function wrapPlantedModel(modelRoot: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group();
  plantLocalFeet(modelRoot);
  wrap.add(modelRoot);
  return wrap;
}

/** World-space AABB of an entity root (actual mesh bounds). */
export function entityWorldBox(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box.isEmpty() ? null : box;
}

/** Optional UV controls so painted textures tile instead of stretch. */
export type TextureApplyOpts = {
  repeat?: [number, number] | null;
  offset?: [number, number] | null;
  rotation?: number | null;
};

/**
 * Convert world-space texture scale (units per tile) into UV repeat for a
 * mesh of the given world size. Same scale → same visual density on any size.
 */
export function worldScaleToUvRepeat(
  worldSize: [number, number, number],
  worldUnitsPerTile: number
): [number, number] {
  const u = Math.max(0.05, worldUnitsPerTile);
  // Horizontal faces dominate floors/solids — use X × Z (Three: width × depth).
  const rx = Math.max(0.01, Math.abs(worldSize[0]) / u);
  const ry = Math.max(0.01, Math.abs(worldSize[2]) / u);
  return [rx, ry];
}

/** Resolve UV repeat for an entity: world-scale when set, else stored UV repeat. */
export function resolveEntityTextureRepeat(ent: {
  textureRepeat?: [number, number];
  textureWorldScale?: number;
  collisionSize?: [number, number, number];
  scale: [number, number, number];
}): [number, number] | undefined {
  if (typeof ent.textureWorldScale === 'number' && ent.textureWorldScale > 0) {
    const size = entityWorldSize(ent.collisionSize, ent.scale);
    return worldScaleToUvRepeat(size, ent.textureWorldScale);
  }
  return ent.textureRepeat;
}

/** Apply texture URL to all standard materials under a root. */
export function applyTextureToObject(
  root: THREE.Object3D,
  url: string | undefined | null,
  opts?: TextureApplyOpts
) {
  if (!url) return;
  new THREE.TextureLoader().load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts?.repeat?.[0] ?? 1, opts?.repeat?.[1] ?? 1);
    tex.offset.set(opts?.offset?.[0] ?? 0, opts?.offset?.[1] ?? 0);
    tex.rotation = opts?.rotation ?? 0;
    tex.center.set(0.5, 0.5);
    tex.needsUpdate = true;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          if (m && 'map' in m) {
            // Only dispose the material/texture we're replacing if WE made it
            // (tagged below) on a prior call — the very first call here may
            // still be looking at a loaded model's shared cached original
            // material, which must never be disposed (see disposeObject3D's
            // doc comment). Every call after the first re-textures a clone we
            // already own, so this now actually frees it instead of leaking
            // one Material+Texture per re-texture (syncEntity calls this on
            // every entity sync, including every prop edit and undo/redo).
            const replacingOwnClone = m.userData?.__kilrunTextureClone === true;
            const cloned = m.clone();
            const localTex = tex.clone();
            localTex.needsUpdate = true;
            (cloned as THREE.MeshStandardMaterial).map = localTex;
            (cloned as THREE.MeshStandardMaterial).needsUpdate = true;
            cloned.userData.__kilrunTextureClone = true;
            if (Array.isArray(o.material)) o.material[i] = cloned;
            else o.material = cloned;
            if (replacingOwnClone) {
              (m as THREE.MeshStandardMaterial).map?.dispose();
              m.dispose();
            }
          }
        }
      }
    });
  });
}

/** Marker entities that should never appear in playtest / live match. */
export function shouldHideEntityInPlay(ent: EditorEntity): boolean {
  if (ent.visible === false) return true;
  if (ent.kind === 'player') return true;
  if (isInvisibleMarkerKind(ent.kind)) return true;
  // Lights keep their PointLight; bulb mesh can stay for atmosphere.
  return false;
}

/** Create a BoxHelper-like selection outline from real mesh bounds. */
export function makeSelectionOutline(root: THREE.Object3D, color = 0x38bdf8): THREE.BoxHelper {
  const helper = new THREE.BoxHelper(root, color);
  helper.material.depthTest = false;
  helper.renderOrder = 999;
  return helper;
}

/** Wireframe collision helper sized to the real mesh AABB (not scale heuristics). */
export function makeBoundsWireBox(
  root: THREE.Object3D,
  color: number,
  opts?: { flattenY?: boolean; yPad?: number; material?: THREE.Material }
): THREE.Mesh | null {
  const box = entityWorldBox(root);
  if (!box) return null;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const h = opts?.flattenY ? Math.max(0.06, opts.yPad ?? 0.08) : Math.max(0.08, size.y);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, size.x), h, Math.max(0.2, size.z)),
    opts?.material ??
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      })
  );
  mesh.position.copy(center);
  if (opts?.flattenY) mesh.position.y = box.min.y + h * 0.5;
  return mesh;
}
