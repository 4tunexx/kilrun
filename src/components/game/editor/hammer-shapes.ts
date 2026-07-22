/**
 * Hammer++ solid primitives — box pads plus cylinders, arches, spikes, etc.
 * Collision still exports as an AABB from collisionSize (mesh-aligned bounds).
 */
import * as THREE from 'three';

export type HammerPrimitive =
  | 'box'
  | 'cylinder'
  | 'arch'
  | 'circle'
  | 'spike'
  | 'oval'
  | 'wedge'
  | 'ramp'
  | 'sphere'
  | 'pyramid';

export const HAMMER_PRIMITIVES: {
  id: HammerPrimitive;
  label: string;
  hint: string;
  /** Default [W, H, D] when first placing this shape. */
  defaultSize: [number, number, number];
}[] = [
  { id: 'box', label: 'Box / Pad', hint: 'Classic solid block or floor pad', defaultSize: [2, 0.25, 2] },
  { id: 'cylinder', label: 'Cylinder', hint: 'Column / pipe volume', defaultSize: [1.2, 2, 1.2] },
  { id: 'arch', label: 'Arch', hint: 'Doorway arch (walk-under opening)', defaultSize: [3, 2.4, 1] },
  { id: 'circle', label: 'Circle pad', hint: 'Round flat disc', defaultSize: [2.4, 0.2, 2.4] },
  { id: 'spike', label: 'Spike', hint: 'Cone hazard / tip', defaultSize: [1, 1.6, 1] },
  { id: 'oval', label: 'Oval', hint: 'Stretched cylinder pad', defaultSize: [3, 0.25, 1.6] },
  { id: 'wedge', label: 'Wedge', hint: 'Triangular prism', defaultSize: [2, 1, 2] },
  { id: 'ramp', label: 'Ramp', hint: 'Sloped wedge for climbs', defaultSize: [2, 1, 3] },
  { id: 'sphere', label: 'Sphere', hint: 'Ball / boulder volume', defaultSize: [1.4, 1.4, 1.4] },
  { id: 'pyramid', label: 'Pyramid', hint: 'Four-sided pyramid', defaultSize: [2, 1.5, 2] },
];

export function isHammerPrimitive(v: unknown): v is HammerPrimitive {
  return typeof v === 'string' && HAMMER_PRIMITIVES.some((p) => p.id === v);
}

export function hammerPrimitiveMeta(id: HammerPrimitive | string | undefined) {
  return HAMMER_PRIMITIVES.find((p) => p.id === id) ?? HAMMER_PRIMITIVES[0];
}

export function defaultSizeForHammer(shape: HammerPrimitive): [number, number, number] {
  return [...hammerPrimitiveMeta(shape).defaultSize] as [number, number, number];
}

const HAMMER_SHAPE_STORAGE_KEY = 'kilrun.hammerShape';

export function loadStickyHammerShape(): HammerPrimitive {
  if (typeof window === 'undefined') return 'box';
  try {
    const raw = window.localStorage.getItem(HAMMER_SHAPE_STORAGE_KEY);
    if (isHammerPrimitive(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'box';
}

export function saveStickyHammerShape(shape: HammerPrimitive) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HAMMER_SHAPE_STORAGE_KEY, shape);
  } catch {
    /* ignore */
  }
}

/** Build a bottom-aligned Hammer mesh for the given shape + size. */
export function makeHammerGeometry(
  shape: HammerPrimitive,
  size: [number, number, number]
): THREE.BufferGeometry {
  const [w, h, d] = size;
  switch (shape) {
    case 'cylinder':
      return new THREE.CylinderGeometry(Math.max(w, d) * 0.5, Math.max(w, d) * 0.5, h, 24);
    case 'circle':
      return new THREE.CylinderGeometry(Math.max(w, d) * 0.5, Math.max(w, d) * 0.5, Math.max(0.08, h), 32);
    case 'oval': {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, Math.max(0.08, h), 32);
      geo.scale(w, 1, d);
      return geo;
    }
    case 'spike':
      return new THREE.ConeGeometry(Math.max(w, d) * 0.5, h, 16);
    case 'sphere':
      return new THREE.SphereGeometry(Math.max(w, h, d) * 0.5, 20, 16);
    case 'pyramid':
      return new THREE.ConeGeometry(Math.max(w, d) * 0.55, h, 4);
    case 'wedge':
    case 'ramp': {
      // Triangle prism along Z (ramp rises toward +Z).
      const hw = w * 0.5;
      const hd = d * 0.5;
      const positions = new Float32Array([
        // bottom
        -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
        // top ridge at +Z
        -hw, h, hd, hw, h, hd,
      ]);
      const indices = [
        0, 1, 2, 0, 2, 3, // bottom
        0, 1, 5, 0, 5, 4, // slope
        3, 2, 5, 3, 5, 4, // back
        0, 3, 4, // left
        1, 5, 2, // right
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }
    case 'arch': {
      // Outer box with a cutout approximated as a torus half + pillars.
      // For collision we still use the full AABB; visual is an archway.
      const groupGeo = new THREE.BoxGeometry(w, h, d);
      return groupGeo;
    }
    case 'box':
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

/** Visual mesh (or group for arch) for Hammer solids. */
export function makeHammerSolidObject(
  shape: HammerPrimitive,
  size: [number, number, number],
  colorHex = '#64748b'
): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.85,
    metalness: 0.05,
  });

  if (shape === 'arch') {
    const [w, h, d] = size;
    const group = new THREE.Group();
    const pillarW = Math.max(0.2, w * 0.18);
    const opening = Math.max(0.4, w - pillarW * 2);
    const left = new THREE.Mesh(new THREE.BoxGeometry(pillarW, h, d), mat);
    left.position.set(-w * 0.5 + pillarW * 0.5, h * 0.5, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(pillarW, h, d), mat.clone());
    right.position.set(w * 0.5 - pillarW * 0.5, h * 0.5, 0);
    const lintelH = Math.max(0.2, h * 0.22);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, lintelH, d), mat.clone());
    lintel.position.set(0, h - lintelH * 0.5, 0);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(opening * 0.5, Math.min(d, lintelH) * 0.45, 8, 16, Math.PI),
      mat.clone()
    );
    arch.rotation.x = Math.PI / 2;
    arch.position.set(0, h - lintelH - opening * 0.15, 0);
    group.add(left, right, lintel, arch);
    group.userData.isHammerSolid = true;
    group.userData.hammerShape = shape;
    return group;
  }

  const geo = makeHammerGeometry(shape, size);
  const mesh = new THREE.Mesh(geo, mat);
  // Bottom-align (sphere centers on mid-height).
  if (shape === 'sphere') {
    mesh.position.y = Math.max(size[0], size[1], size[2]) * 0.5;
  } else if (shape === 'wedge' || shape === 'ramp') {
    mesh.position.y = 0;
  } else {
    mesh.position.y = size[1] * 0.5;
  }
  mesh.userData.isHammerSolid = true;
  mesh.userData.hammerShape = shape;
  return mesh;
}
