/**
 * "Bake mesh collision" — approximates an arbitrary (possibly concave/hollow)
 * mesh as a small set of axis-aligned boxes that actually follow its real
 * shape, instead of the single bounding box every Solid prop gets by
 * default. The engine has no general triangle-mesh physics solver (see
 * prefab-storage.ts), so this is the practical middle ground: sample the
 * mesh on a voxel grid using ray-parity containment tests (needs a closed/
 * manifold mesh to be reliable — most catalog props are), then greedily
 * merge filled cells into a compact box list. An arch's open doorway or a
 * curved wall's hollow interior comes out as empty space instead of solid
 * air, without requiring a full mesh-collision runtime.
 *
 * Output pads use the same local-space convention as `EditorEntity.csgPads`
 * (world units at entity.scale === 1, relative to entity.position) so they
 * flow through the exact same collision export path.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CsgLocalPad, EditorEntity } from './map-document';
import { resolveModelSrc } from './model-scan';
import { loadGltf } from '../renderer/asset-loader';

export interface VoxelizeOptions {
  /** Voxel count along the mesh's longest bounding-box axis. Higher = more
   * accurate silhouette but more boxes (and slower). */
  resolution?: number;
}

/** A non-axis-aligned direction avoids degenerate axis-aligned ray hits
 * (grazing exactly along a box face/edge) that break the parity count. */
const PROBE_DIR = new THREE.Vector3(0.998, 0.0537, 0.0261).normalize();

/** Some catalog GLBs export duplicate coincident triangles per face (seen on
 * wall-doorway-garage: every real surface crossing produces two raycast hits
 * at the exact same distance) — that doubles every crossing and makes the
 * ray-parity count always even, so containment could never register as
 * "inside" no matter the point. Collapse hits within EPS of each other (the
 * same physical surface) into one crossing before taking parity. */
const DUPLICATE_HIT_EPS = 1e-4;
function isPointInside(bvh: MeshBVH, point: THREE.Vector3): boolean {
  const ray = new THREE.Ray(point, PROBE_DIR);
  const hits = bvh.raycast(ray, THREE.DoubleSide);
  if (hits.length === 0) return false;
  hits.sort((a, b) => a.distance - b.distance);
  let crossings = 1;
  for (let i = 1; i < hits.length; i++) {
    if (hits[i].distance - hits[i - 1].distance > DUPLICATE_HIT_EPS) crossings++;
  }
  return crossings % 2 === 1;
}

interface Cell {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Greedy 3D run-merge (X runs, then matching Y rows, then matching Z layers). */
function mergeOccupancyToBoxes(
  occ: Uint8Array,
  nx: number,
  ny: number,
  nz: number
): Cell[] {
  const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const used = new Uint8Array(nx * ny * nz);
  const boxes: Cell[] = [];

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      let x = 0;
      while (x < nx) {
        if (!occ[idx(x, y, z)] || used[idx(x, y, z)]) {
          x++;
          continue;
        }
        let x1 = x + 1;
        while (x1 < nx && occ[idx(x1, y, z)] && !used[idx(x1, y, z)]) x1++;

        let y1 = y + 1;
        rowGrow: while (y1 < ny) {
          for (let xi = x; xi < x1; xi++) {
            if (!occ[idx(xi, y1, z)] || used[idx(xi, y1, z)]) break rowGrow;
          }
          y1++;
        }

        let z1 = z + 1;
        layerGrow: while (z1 < nz) {
          for (let yi = y; yi < y1; yi++) {
            for (let xi = x; xi < x1; xi++) {
              if (!occ[idx(xi, yi, z1)] || used[idx(xi, yi, z1)]) break layerGrow;
            }
          }
          z1++;
        }

        for (let zi = z; zi < z1; zi++) {
          for (let yi = y; yi < y1; yi++) {
            for (let xi = x; xi < x1; xi++) used[idx(xi, yi, zi)] = 1;
          }
        }
        boxes.push({ x0: x, x1, y0: y, y1, z0: z, z1 });
        x = x1;
      }
    }
  }
  return boxes;
}

/** Voxelize local (pre-entity-transform) geometry into a compact box list. */
export function voxelizeGeometryToPads(
  geometry: THREE.BufferGeometry,
  opts?: VoxelizeOptions
): CsgLocalPad[] {
  const resolution = Math.max(2, Math.min(24, opts?.resolution ?? 8));
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.isEmpty()) return [];
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim <= 1e-6) return [];
  const cell = maxDim / resolution;

  const nx = Math.max(1, Math.min(resolution * 2, Math.round(size.x / cell)));
  const ny = Math.max(1, Math.min(resolution * 2, Math.round(size.y / cell)));
  const nz = Math.max(1, Math.min(resolution * 2, Math.round(size.z / cell)));
  const cellX = size.x / nx;
  const cellY = size.y / ny;
  const cellZ = size.z / nz;

  const bvh = new MeshBVH(geometry);
  const occ = new Uint8Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  const p = new THREE.Vector3();
  for (let zi = 0; zi < nz; zi++) {
    for (let yi = 0; yi < ny; yi++) {
      for (let xi = 0; xi < nx; xi++) {
        p.set(
          box.min.x + (xi + 0.5) * cellX,
          box.min.y + (yi + 0.5) * cellY,
          box.min.z + (zi + 0.5) * cellZ
        );
        if (isPointInside(bvh, p)) occ[idx(xi, yi, zi)] = 1;
      }
    }
  }

  const boxes = mergeOccupancyToBoxes(occ, nx, ny, nz);
  const pads: CsgLocalPad[] = [];
  for (const b of boxes) {
    const hx = ((b.x1 - b.x0) * cellX) / 2;
    const hy = ((b.y1 - b.y0) * cellY) / 2;
    const hz = ((b.z1 - b.z0) * cellZ) / 2;
    if (hx < 0.02 || hy < 0.02 || hz < 0.02) continue;
    pads.push({
      cx: box.min.x + b.x0 * cellX + hx,
      cy: box.min.y + b.y0 * cellY + hy,
      cz: box.min.z + b.z0 * cellZ + hz,
      hx,
      hy,
      hz,
    });
  }
  return pads;
}

/** Local (pre-entity-transform) merged geometry loaded from this entity's
 * catalog model / uploaded GLB — matches how `plantLocalFeet` positions it
 * (bottom-aligned, XZ-centered) so voxel space lines up with where the mesh
 * actually renders relative to entity.position. */
async function entityLocalRenderGeometry(e: EditorEntity): Promise<THREE.BufferGeometry> {
  const src = resolveModelSrc(e.model, e.customModelUrl);
  if (!src) throw new Error('This model type isn\'t supported for mesh collision baking yet.');
  const gltf = await loadGltf(src);
  gltf.scene.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position') g.deleteAttribute(key);
    }
    if (g.index) g.toNonIndexed();
    geometries.push(g);
  });
  if (!geometries.length) throw new Error('No mesh geometry found in this model.');
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!merged) throw new Error('Could not merge model geometry.');

  // Same bottom-align + XZ-center convention every renderer applies via
  // plantLocalFeet, so voxel-space matches where the mesh visually sits
  // relative to entity.position (see map-play-preview.tsx / editor-viewport.ts).
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  merged.translate(-cx, -box.min.y, -cz);
  return merged;
}

/** Bake mesh collision for a catalog/library prop — loads its real geometry
 * and voxelizes it. Throws on unsupported model types / load failures; the
 * caller (Properties panel) is expected to catch and surface that message. */
export async function bakeMeshCollisionForEntity(
  e: EditorEntity,
  opts?: VoxelizeOptions
): Promise<CsgLocalPad[]> {
  const geometry = await entityLocalRenderGeometry(e);
  const pads = voxelizeGeometryToPads(geometry, opts);
  if (!pads.length) {
    throw new Error('Could not find any solid volume in this model to bake.');
  }
  return pads;
}
