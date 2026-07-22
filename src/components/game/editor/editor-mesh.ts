import * as THREE from 'three';
import type { EditorEntity } from './map-document';
import { isInvisibleMarkerKind } from './map-document';

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
            const cloned = m.clone();
            const localTex = tex.clone();
            localTex.needsUpdate = true;
            (cloned as THREE.MeshStandardMaterial).map = localTex;
            (cloned as THREE.MeshStandardMaterial).needsUpdate = true;
            if (Array.isArray(o.material)) o.material[i] = cloned;
            else o.material = cloned;
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
  opts?: { flattenY?: boolean; yPad?: number }
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
