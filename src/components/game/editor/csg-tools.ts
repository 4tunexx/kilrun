/**
 * Subtract / Union (CSG) tool for the map editor's Hammer solids.
 *
 * Visual: real boolean mesh ops via three-bvh-csg, baked into a static GLB
 * (data URL) stored on a new `prop` entity's `customModelUrl` — reuses the
 * exact same load/render path already used for uploaded custom models, so
 * Play Test, live match, and the editor viewport all render it for free.
 *
 * Collision: NOT derived from the baked mesh at runtime (that would need a
 * general triangle-mesh physics solver this project doesn't have). Instead:
 *  - Union stitches together each source entity's own existing pad export
 *    (whatever it already used — box, ramp slope, stair steps, …), just
 *    re-expressed relative to the new entity's origin. Always exact.
 *  - Subtract only computes exact carved collision when both the base and
 *    the cutter are axis-aligned Box primitives sharing the same yaw — the
 *    classic "AABB minus AABB" split into up to 6 boxes. Any other shape
 *    combination still gets the real visual cut; collision is voxel-fitted
 *    to that cut mesh (same path as Solid prop bake). If voxelize finds no
 *    volume, it falls back to the uncut base box with a `csgWarning`.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import type { EditorEntity, CsgLocalPad } from './map-document';
import { isHammerSolidEntity, HAMMER_SOLID_MODEL } from './map-document';
import type { HammerPrimitive } from './hammer-shapes';
import { hammerPrimitiveMeta, makeHammerGeometry } from './hammer-shapes';
import { loadGltf } from '../renderer/asset-loader';
import { voxelizeGeometryToPads } from './mesh-voxelize';

const YAW_TOLERANCE_DEG = 1;
const TILT_TOLERANCE_DEG = 1;
const MIN_HALF_EXTENT = 0.02;

export interface CsgBakeResult {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  customModelUrl: string;
  collisionSize: [number, number, number];
  csgPads: CsgLocalPad[];
  csgOp: 'subtract' | 'union';
  warning?: string;
}

/** Whole-entity delete (cutter fully covers the base) rather than a bake result. */
export interface CsgDeleteResult {
  deleted: true;
}

export type CsgResult = CsgBakeResult | CsgDeleteResult | { error: string };

export function isCsgDeleteResult(r: CsgResult): r is CsgDeleteResult {
  return 'deleted' in r;
}

/** Only Hammer solids (any shape but Arch) and prior CSG bakes are eligible. */
export function isCsgEligible(e: EditorEntity): boolean {
  if (e.csgOp) return true;
  if (!isHammerSolidEntity(e)) return false;
  const shape = (e.primitive as HammerPrimitive | undefined) ?? 'box';
  return shape !== 'arch';
}

/** Local (pre-transform) bottom-aligned geometry, matching `makeHammerSolidObject`'s offsets. */
function localHammerGeometry(e: EditorEntity): THREE.BufferGeometry {
  const shape: HammerPrimitive = (e.primitive as HammerPrimitive | undefined) ?? 'box';
  const size = e.collisionSize ?? hammerPrimitiveMeta(shape).defaultSize;
  const geo = makeHammerGeometry(shape, size);
  if (shape === 'sphere') {
    geo.translate(0, Math.max(size[0], size[1], size[2]) * 0.5, 0);
  } else if (shape !== 'wedge' && shape !== 'ramp') {
    geo.translate(0, size[1] * 0.5, 0);
  }
  return geo;
}

async function loadedCustomGeometry(url: string): Promise<THREE.BufferGeometry> {
  const gltf = await loadGltf(url);
  const geometries: THREE.BufferGeometry[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    // Baked GLBs are always position-only attributes — drop everything else
    // so merge doesn't choke on mismatched attribute sets across source meshes.
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
    }
    geometries.push(g);
  });
  if (!geometries.length) throw new Error('No mesh geometry found in model');
  return geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false)!;
}

/** Local (pre-entity-transform) geometry for any CSG-eligible entity. */
async function entityLocalGeometry(e: EditorEntity): Promise<THREE.BufferGeometry> {
  if (e.csgOp && e.customModelUrl) return loadedCustomGeometry(e.customModelUrl);
  if (isHammerSolidEntity(e)) return localHammerGeometry(e);
  throw new Error('Entity is not CSG-eligible');
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function makeBrush(geometry: THREE.BufferGeometry, e: EditorEntity): Brush {
  const brush = new Brush(geometry);
  brush.position.set(e.position[0], e.position[1], e.position[2]);
  brush.rotation.set(degToRad(e.rotation[0]), degToRad(e.rotation[1]), degToRad(e.rotation[2]));
  brush.scale.set(e.scale[0] || 1, e.scale[1] || 1, e.scale[2] || 1);
  brush.updateMatrixWorld(true);
  return brush;
}

async function exportBrushAsGlbDataUrl(brush: Brush): Promise<string> {
  const mesh = new THREE.Mesh(
    brush.geometry,
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.05 })
  );
  const exporter = new GLTFExporter();
  const buffer = (await exporter.parseAsync(mesh, { binary: true })) as ArrayBuffer;
  return `data:model/gltf-binary;base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function boundingBoxOf(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
}

function isBoxPrimitive(e: EditorEntity): boolean {
  if (e.model === HAMMER_SOLID_MODEL && !e.primitive) return true;
  return (e.primitive as HammerPrimitive | undefined) === 'box';
}

function nearZero(deg: number, tolerance: number): boolean {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped <= tolerance || wrapped >= 360 - tolerance;
}

function angleDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Base-local half-extents (world units at scale 1) for a Box hammer solid. */
function boxWorldHalfExtents(e: EditorEntity): [number, number, number] {
  const size = e.collisionSize ?? hammerPrimitiveMeta('box').defaultSize;
  return [
    (size[0] * Math.abs(e.scale[0])) / 2,
    (size[1] * Math.abs(e.scale[1])) / 2,
    (size[2] * Math.abs(e.scale[2])) / 2,
  ];
}

/** Box hammer solids are bottom-aligned: world center is position.y + halfHeight. */
function boxWorldCenter(e: EditorEntity): THREE.Vector3 {
  const [, hy] = boxWorldHalfExtents(e);
  return new THREE.Vector3(e.position[0], e.position[1] + hy, e.position[2]);
}

function pad(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): CsgLocalPad | null {
  if (hx < MIN_HALF_EXTENT || hy < MIN_HALF_EXTENT || hz < MIN_HALF_EXTENT) return null;
  return { cx, cy, cz, hx, hy, hz };
}

/**
 * Exact "AABB minus AABB" decomposition in base-local (unrotated) space.
 * Returns null when the shapes aren't both aligned boxes (caller falls back
 * to an uncut approximation), or [] when the cutter fully covers the base.
 */
function subtractBoxPads(base: EditorEntity, cutter: EditorEntity): CsgLocalPad[] | null {
  if (!isBoxPrimitive(base) || !isBoxPrimitive(cutter)) return null;
  if (!nearZero(base.rotation[0], TILT_TOLERANCE_DEG) || !nearZero(base.rotation[2], TILT_TOLERANCE_DEG)) {
    return null;
  }
  if (!nearZero(cutter.rotation[0], TILT_TOLERANCE_DEG) || !nearZero(cutter.rotation[2], TILT_TOLERANCE_DEG)) {
    return null;
  }
  if (angleDiffDeg(base.rotation[1], cutter.rotation[1]) > YAW_TOLERANCE_DEG) return null;

  const baseCenter = boxWorldCenter(base);
  const [hxB, hyB, hzB] = boxWorldHalfExtents(base);
  const cutCenter = boxWorldCenter(cutter);
  const [hxC, hyC, hzC] = boxWorldHalfExtents(cutter);

  const yaw = degToRad(base.rotation[1]);
  const dx = cutCenter.x - baseCenter.x;
  const dz = cutCenter.z - baseCenter.z;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Inverse-rotate the cutter's center into base-local (unrotated) space.
  const clx = dx * cos - dz * sin;
  const clz = dx * sin + dz * cos;
  const cly = cutCenter.y - baseCenter.y;

  const bx0 = -hxB, bx1 = hxB;
  const by0 = -hyB, by1 = hyB;
  const bz0 = -hzB, bz1 = hzB;
  const cx0 = Math.max(bx0, clx - hxC);
  const cx1 = Math.min(bx1, clx + hxC);
  const cy0 = Math.max(by0, cly - hyC);
  const cy1 = Math.min(by1, cly + hyC);
  const cz0 = Math.max(bz0, clz - hzC);
  const cz1 = Math.min(bz1, clz + hzC);

  if (cx0 >= cx1 || cy0 >= cy1 || cz0 >= cz1) return null; // no real overlap

  const boxes: CsgLocalPad[] = [];
  const push = (p: CsgLocalPad | null) => {
    if (p) boxes.push(p);
  };
  // X slabs — full Y/Z range.
  if (cx0 > bx0) push(pad((bx0 + cx0) / 2, 0, 0, (cx0 - bx0) / 2, hyB, hzB));
  if (cx1 < bx1) push(pad((cx1 + bx1) / 2, 0, 0, (bx1 - cx1) / 2, hyB, hzB));
  // Z slabs — only over the cutter's X range, full Y range.
  if (cz0 > bz0) push(pad((cx0 + cx1) / 2, 0, (bz0 + cz0) / 2, (cx1 - cx0) / 2, hyB, (cz0 - bz0) / 2));
  if (cz1 < bz1) push(pad((cx0 + cx1) / 2, 0, (cz1 + bz1) / 2, (cx1 - cx0) / 2, hyB, (bz1 - cz1) / 2));
  // Y slabs — only over the cutter's X/Z footprint.
  if (cy0 > by0) {
    push(pad((cx0 + cx1) / 2, (by0 + cy0) / 2, (cz0 + cz1) / 2, (cx1 - cx0) / 2, (cy0 - by0) / 2, (cz1 - cz0) / 2));
  }
  if (cy1 < by1) {
    push(pad((cx0 + cx1) / 2, (cy1 + by1) / 2, (cz0 + cz1) / 2, (cx1 - cx0) / 2, (by1 - cy1) / 2, (cz1 - cz0) / 2));
  }
  return boxes;
}

/** Convert one source entity's own (already-correct) world pad into anchor-relative space. */
function reprojectPad(
  worldCenter: THREE.Vector3,
  halfX: number,
  halfY: number,
  halfZ: number,
  yawRad: number,
  anchor: THREE.Vector3
): CsgLocalPad {
  return {
    cx: worldCenter.x - anchor.x,
    cy: worldCenter.y - anchor.y,
    cz: worldCenter.z - anchor.z,
    hx: halfX,
    hy: halfY,
    hz: halfZ,
    yaw: yawRad,
  };
}

/** Re-express a base-local (unrotated) pad in world space, then anchor-relative space. */
function rebasePad(
  p: CsgLocalPad,
  baseCenter: THREE.Vector3,
  baseYaw: number,
  anchor: THREE.Vector3
): CsgLocalPad {
  const cos = Math.cos(baseYaw);
  const sin = Math.sin(baseYaw);
  const wx = baseCenter.x + (p.cx * cos + p.cz * sin);
  const wz = baseCenter.z + (-p.cx * sin + p.cz * cos);
  const wy = baseCenter.y + p.cy;
  return reprojectPad(new THREE.Vector3(wx, wy, wz), p.hx, p.hy, p.hz, baseYaw + (p.yaw ?? 0), anchor);
}

/**
 * Every renderer (editor viewport, Play Test, live match) bottom-aligns and
 * XZ-centers any `customModelUrl` mesh relative to `entity.position`
 * (`plantLocalFeet`). Pre-baking that same anchor into the exported geometry
 * — instead of leaving it wherever the source entities happened to sit in
 * the world — makes that step a no-op, so the baked mesh renders exactly
 * where its collision pads say it is everywhere, not just in the editor.
 */
function plantedAnchorOf(geometry: THREE.BufferGeometry): THREE.Vector3 {
  const box = boundingBoxOf(geometry);
  return new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
}

/** Subtract `cutter` from `base` — base stays, cutter is consumed. */
export async function subtractEntities(base: EditorEntity, cutter: EditorEntity): Promise<CsgResult> {
  if (!isCsgEligible(base) || !isCsgEligible(cutter)) {
    return { error: 'Subtract only works on Hammer solids (Box, Cylinder, Wedge, …) and prior merge results.' };
  }
  const [baseGeo, cutterGeo] = await Promise.all([entityLocalGeometry(base), entityLocalGeometry(cutter)]);
  const brushA = makeBrush(baseGeo, base);
  const brushB = makeBrush(cutterGeo, cutter);
  const evaluator = new Evaluator();
  const resultBrush = evaluator.evaluate(brushA, brushB, SUBTRACTION);
  resultBrush.geometry.computeVertexNormals();
  const box = boundingBoxOf(resultBrush.geometry);
  if (box.isEmpty()) return { deleted: true };

  const size: [number, number, number] = [
    Math.max(0.1, box.max.x - box.min.x),
    Math.max(0.1, box.max.y - box.min.y),
    Math.max(0.1, box.max.z - box.min.z),
  ];
  const anchor = plantedAnchorOf(resultBrush.geometry);
  resultBrush.geometry.translate(-anchor.x, -anchor.y, -anchor.z);

  const baseCenter = boxWorldCenter(base);
  const baseYaw = degToRad(base.rotation[1]);
  const exactPads = subtractBoxPads(base, cutter);
  let csgPads: CsgLocalPad[];
  let warning: string | undefined;
  if (exactPads) {
    if (exactPads.length === 0) return { deleted: true };
    csgPads = exactPads.map((p) => rebasePad(p, baseCenter, baseYaw, anchor));
  } else {
    // Fit collision to the cut mesh so doorways/openings are walkable.
    // Voxelize needs a closed volume; if it finds nothing, keep the uncut
    // base box and warn the author.
    const fitted = voxelizeGeometryToPads(resultBrush.geometry.clone());
    if (fitted.length) {
      csgPads = fitted;
    } else {
      warning =
        'Collision approximated as the uncut base — mesh-fit bake found no solid volume. Try Box−Box with matching rotation, or Bake mesh collision on the result.';
      const [hx, hy, hz] = boxWorldHalfExtents(base);
      csgPads = [rebasePad({ cx: 0, cy: 0, cz: 0, hx, hy, hz }, baseCenter, baseYaw, anchor)];
    }
  }

  const glb = await exportBrushAsGlbDataUrl(resultBrush);
  return {
    position: [anchor.x, anchor.y, anchor.z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    customModelUrl: glb,
    collisionSize: size,
    csgPads,
    csgOp: 'subtract',
    warning,
  };
}

/** Merge 2+ entities into one visual + collision piece. */
export async function unionEntities(sources: EditorEntity[]): Promise<CsgResult> {
  if (sources.length < 2) return { error: 'Select 2 or more objects to combine.' };
  for (const e of sources) {
    if (!isCsgEligible(e)) {
      return { error: 'Combine only works on Hammer solids (Box, Cylinder, Wedge, …) and prior merge results.' };
    }
  }
  const geometries = await Promise.all(sources.map((e) => entityLocalGeometry(e)));
  const evaluator = new Evaluator();
  let resultBrush = makeBrush(geometries[0], sources[0]);
  for (let i = 1; i < sources.length; i++) {
    const nextBrush = makeBrush(geometries[i], sources[i]);
    resultBrush = evaluator.evaluate(resultBrush, nextBrush, ADDITION);
  }
  resultBrush.geometry.computeVertexNormals();
  const box = boundingBoxOf(resultBrush.geometry);
  const size: [number, number, number] = [
    Math.max(0.1, box.max.x - box.min.x),
    Math.max(0.1, box.max.y - box.min.y),
    Math.max(0.1, box.max.z - box.min.z),
  ];
  const anchor = plantedAnchorOf(resultBrush.geometry);
  resultBrush.geometry.translate(-anchor.x, -anchor.y, -anchor.z);

  const csgPads: CsgLocalPad[] = [];
  for (const e of sources) {
    for (const p of entityWorldBoxes(e)) {
      csgPads.push(reprojectPad(p.center, p.hx, p.hy, p.hz, p.yaw, anchor));
    }
  }

  const glb = await exportBrushAsGlbDataUrl(resultBrush);
  return {
    position: [anchor.x, anchor.y, anchor.z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    customModelUrl: glb,
    collisionSize: size,
    csgPads,
    csgOp: 'union',
  };
}

/**
 * A source entity's own world-space collision box(es), for Union re-basing.
 * Handles the shapes the rest of the editor already knows how to collide:
 * Box, other Hammer volumes (approximated as one box from collisionSize),
 * and a previous CSG bake (its own already-local `csgPads`, re-projected
 * through its current transform).
 */
function entityWorldBoxes(
  e: EditorEntity
): { center: THREE.Vector3; hx: number; hy: number; hz: number; yaw: number }[] {
  const yaw = degToRad(e.rotation[1]);
  if (e.csgOp && e.csgPads?.length) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return e.csgPads.map((p) => {
      const lcx = p.cx * Math.abs(e.scale[0]);
      const lcy = p.cy * Math.abs(e.scale[1]);
      const lcz = p.cz * Math.abs(e.scale[2]);
      const wx = e.position[0] + (lcx * cos + lcz * sin);
      const wz = e.position[2] + (-lcx * sin + lcz * cos);
      const wy = e.position[1] + lcy;
      return {
        center: new THREE.Vector3(wx, wy, wz),
        hx: p.hx * Math.abs(e.scale[0]),
        hy: p.hy * Math.abs(e.scale[1]),
        hz: p.hz * Math.abs(e.scale[2]),
        yaw: yaw + (p.yaw ?? 0),
      };
    });
  }
  const [hx, hy, hz] = boxWorldHalfExtents(e);
  return [{ center: boxWorldCenter(e), hx, hy, hz, yaw }];
}
