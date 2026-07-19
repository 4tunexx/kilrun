'use client';

import * as THREE from 'three';
import type { MapDocument } from './map-document';
import { ensureEnvironment } from './map-document';
import { getMapThumbnail, loadMapPlayable, saveMap } from './map-storage';

/**
 * Offline isometric-ish preview of a map for admin library cards.
 * Uses simple colored meshes (no GLB load) so it is fast and reliable.
 */
export async function renderMapThumbnail(
  doc: MapDocument,
  size = 480
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.round(size * 0.56);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
  } catch {
    return null;
  }

  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setClearColor(new THREE.Color(ensureEnvironment(doc).skyColor || '#0a1220'), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(ensureEnvironment(doc).fogColor || '#0c1830', 0.035);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.05);
  sun.position.set(18, 28, 12);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x88aacc, 0x334455, 0.4));

  const group = new THREE.Group();
  scene.add(group);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(0.35, 12, 12);

  for (const ent of doc.entities ?? []) {
    if (ent.visible === false) continue;
    const isFloor = !!ent.model?.includes('floor') || ent.kind === 'checkpoint';
    const isSpawn =
      ent.kind === 'spawn_runner' || ent.kind === 'spawn_trapper' || ent.kind === 'player';
    const isHazard = ent.kind === 'hazard' || ent.kind === 'trap' || !!ent.hazard?.enabled;

    let mesh: THREE.Mesh;
    if (isSpawn) {
      mesh = new THREE.Mesh(
        sphere,
        new THREE.MeshStandardMaterial({
          color: ent.kind === 'spawn_trapper' ? '#ef4444' : '#22c55e',
          emissive: ent.kind === 'spawn_trapper' ? '#7f1d1d' : '#14532d',
          emissiveIntensity: 0.35,
        })
      );
    } else {
      const color = isHazard
        ? '#f97316'
        : isFloor
          ? ent.color || ensureEnvironment(doc).floorColor || '#3d5a80'
          : ent.color || '#94a3b8';
      mesh = new THREE.Mesh(
        box,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.85,
          metalness: 0.05,
        })
      );
      if (isFloor) {
        mesh.scale.set(
          Math.max(0.4, Math.abs(ent.scale[0]) * 2),
          Math.max(0.12, Math.abs(ent.scale[1]) * 0.25),
          Math.max(0.4, Math.abs(ent.scale[2]) * 2)
        );
      } else {
        mesh.scale.set(
          Math.max(0.3, Math.abs(ent.scale[0])),
          Math.max(0.3, Math.abs(ent.scale[1])),
          Math.max(0.3, Math.abs(ent.scale[2]))
        );
      }
    }

    mesh.position.set(ent.position[0], ent.position[1], ent.position[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(ent.rotation[0]),
      THREE.MathUtils.degToRad(ent.rotation[1]),
      THREE.MathUtils.degToRad(ent.rotation[2])
    );
    group.add(mesh);
  }

  // Ground grid hint so empty maps aren't a blank void
  const grid = new THREE.GridHelper(40, 40, 0x334155, 0x1e293b);
  grid.position.y = -0.02;
  scene.add(grid);

  const box3 = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  const size3 = new THREE.Vector3();
  if (box3.isEmpty()) {
    center.set(0, 0.5, 0);
    size3.set(8, 2, 8);
  } else {
    box3.getCenter(center);
    box3.getSize(size3);
  }

  const maxDim = Math.max(size3.x, size3.y, size3.z, 6);
  const camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 500);
  const dist = maxDim * 1.55;
  camera.position.set(center.x + dist * 0.75, center.y + dist * 0.7, center.z + dist * 0.75);
  camera.lookAt(center);

  renderer.render(scene, camera);
  let dataUrl: string | null = null;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    dataUrl = null;
  }

  // Dispose
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && m.geometry !== box && m.geometry !== sphere) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  box.dispose();
  sphere.dispose();
  renderer.dispose();

  return dataUrl;
}

/** Generate + persist a thumbnail if missing (or force=true). */
export async function ensureMapThumbnail(
  id: string,
  opts?: { force?: boolean }
): Promise<string | null> {
  if (!opts?.force) {
    const existing = getMapThumbnail(id);
    if (existing) return existing;
  }
  const doc = loadMapPlayable(id);
  if (!doc) return null;
  const thumb = await renderMapThumbnail(doc);
  if (thumb) saveMap(id, doc, { thumbnailDataUrl: thumb });
  return thumb;
}
