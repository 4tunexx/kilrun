'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorEntity, EditorLayer, MapDocument, MapEnvironment } from './map-document';
import {
  DEFAULT_ENVIRONMENT,
  defaultAnimation,
  defaultHazard,
  defaultHealthFloor,
  defaultLight,
  defaultMonsterSpawn,
  defaultRedZone,
  defaultRevive,
  defaultWaveAnchor,
  ensureLight,
  entityExportsAsPlatform,
  entityKindLabel,
  generateId,
  snapToGrid,
  ensureEnvironment,
} from './map-document';

function makeLightBulb(ent: EditorEntity): THREE.Group {
  const lightCfg = ensureLight(ent);
  const group = new THREE.Group();
  group.name = 'light-bulb';
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 12),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(lightCfg.color),
      emissive: new THREE.Color(lightCfg.color),
      emissiveIntensity: 1.2,
      roughness: 0.35,
      metalness: 0.1,
    })
  );
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0x334155 })
  );
  stem.position.y = -0.2;
  const point = new THREE.PointLight(
    new THREE.Color(lightCfg.color),
    lightCfg.intensity,
    lightCfg.distance,
    2
  );
  point.castShadow = !!lightCfg.castShadow;
  point.userData.isEntityLight = true;
  group.add(bulb);
  group.add(stem);
  group.add(point);
  return group;
}

function syncLightParams(root: THREE.Object3D, ent: EditorEntity) {
  const cfg = ensureLight(ent);
  root.traverse((o) => {
    if (o instanceof THREE.PointLight && o.userData.isEntityLight) {
      o.color.set(cfg.color);
      o.intensity = cfg.intensity;
      o.distance = cfg.distance;
      o.castShadow = !!cfg.castShadow;
    }
    if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
      const mat = o.material as THREE.MeshStandardMaterial;
      if (mat?.emissive) {
        mat.color.set(cfg.color);
        mat.emissive.set(cfg.color);
      }
    }
  });
}
import { AnimationDirector } from './animation-director';
import { loadAnimatedPrefab, resolveModelSrc, scanModelClips } from './model-scan';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export interface EditorCameraState {
  position: [number, number, number];
  target: [number, number, number];
  freeFly: boolean;
  yaw: number;
  pitch: number;
}

export interface EditorViewportApi {
  setDoc: (doc: MapDocument) => void;
  getDoc: () => MapDocument;
  setSelectedId: (id: string | null) => void;
  getSelectedId: () => string | null;
  getSelectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  setBrush: (model: string | null) => void;
  setActiveLayerId: (id: string) => void;
  setTransformMode: (mode: TransformMode) => void;
  setGridSnap: (on: boolean) => void;
  setGridSize: (n: number) => void;
  setSnapY: (on: boolean) => void;
  setFreeFly: (on: boolean) => void;
  isFreeFly: () => boolean;
  setShowAllCollisionGizmos: (on: boolean) => void;
  getShowAllCollisionGizmos: () => boolean;
  setMeasureMode: (on: boolean) => void;
  isMeasureMode: () => boolean;
  applyEnvironment: (env: MapEnvironment) => void;
  placeSpawn: (
    kind:
      | 'spawn_runner'
      | 'spawn_trapper'
      | 'start'
      | 'finish'
      | 'spawn_monster'
      | 'spawn_team_a'
      | 'spawn_team_b'
  ) => void;
  placeEntity: (kind: EditorEntity['kind'], model?: string) => void;
  stampEntities: (entities: EditorEntity[]) => void;
  duplicateSelected: (axis?: 'x' | 'y' | 'z') => void;
  focusSelected: () => void;
  /** Restore default edit camera (or Start / edit focus). */
  resetCamera: () => void;
  getCameraState: () => EditorCameraState;
  setCameraState: (state: EditorCameraState) => void;
  /** Pause WebGL loop while Play Test overlays the editor. */
  setPaused: (paused: boolean) => void;
  resize: () => void;
  deleteSelected: () => void;
  updateSelected: (patch: Partial<EditorEntity>) => void;
  previewAnim: (which: 'default' | 'active') => void;
  captureThumbnail: () => string | null;
  setTouchAxes: (axes: { moveX: number; moveY: number; lookX: number; lookY: number; sprint?: boolean }) => void;
  destroy: () => void;
}

const SKY_COLORS: Record<string, string> = {
  cavern: '#0a1220',
  dusk: '#1a1530',
  bright: '#87b5e0',
  void: '#050508',
  custom: '#0a1220',
};

export function createEditorViewport(
  host: HTMLElement,
  initial: MapDocument,
  handlers: {
    onSelect: (id: string | null) => void;
    onSelectionChange?: (ids: string[]) => void;
    onDocChange: (doc: MapDocument) => void;
    onFreeFlyChange?: (on: boolean) => void;
    onMeasureChange?: (distance: number | null) => void;
  }
): EditorViewportApi {
  let doc: MapDocument = structuredClone(initial);
  if (!doc.environment) doc.environment = { ...DEFAULT_ENVIRONMENT };
  let selectedId: string | null = null;
  let selectedIds: string[] = [];
  let brush: string | null = 'floor-square';
  let stampEntitiesQueue: EditorEntity[] | null = null;
  let activeLayerId = doc.layers[0]?.id ?? '';
  let gridSnap = true;
  let snapY = false;
  let gridSize = doc.gridSize || 1;
  let shiftHeld = false;
  let freeFly = false;
  /** Pause render loop while Play Test overlays (keeps WebGL context alive). */
  let paused = false;
  /** When false, solid/hazard gizmos only draw for the current selection (less clutter). */
  let showAllCollisionGizmos = false;
  let measureMode = false;
  let measureA: THREE.Vector3 | null = null;
  const keys = new Set<string>();
  let touchAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false };
  const DEFAULT_CAM_POS = new THREE.Vector3(12, 14, 18);
  const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);
  const director = new AnimationDirector();
  const entityClips = new Map<string, THREE.AnimationClip[]>();

  // Box-select (Alt+drag)
  let boxSelecting = false;
  let boxStart = { x: 0, y: 0 };
  const boxOverlay = document.createElement('div');
  Object.assign(boxOverlay.style, {
    position: 'absolute',
    border: '1px solid rgba(34,211,238,0.9)',
    background: 'rgba(34,211,238,0.12)',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '20',
  });
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(boxOverlay);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  camera.position.set(12, 14, 18);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    cursor: 'crosshair',
  });

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
  sun.position.set(20, 30, 10);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x88aacc, 0x334455, 0.45));

  const grid = new THREE.GridHelper(80, 80, 0x4b9fff, 0x2a3a4a);
  scene.add(grid);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 1 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.02;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = '__ground';
  scene.add(ground);

  const gizmoGroup = new THREE.Group();
  gizmoGroup.name = '__gizmos';
  scene.add(gizmoGroup);
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);

  function applyEnvironment(env: MapEnvironment) {
    const skyHex = env.sky === 'custom' ? env.skyColor : SKY_COLORS[env.sky] ?? env.skyColor;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(env.fogColor || skyHex, env.fogDensity ?? 0.02);
    grid.visible = env.floor === 'grid';
    floorMesh.visible = env.floor !== 'void';
    const mat = floorMesh.material as THREE.MeshStandardMaterial;
    if (env.floor === 'water') {
      mat.color.set('#0e4a6e');
      mat.transparent = true;
      mat.opacity = 0.75;
      mat.metalness = 0.4;
      mat.roughness = 0.2;
    } else {
      mat.color.set(env.floorColor || '#1a2740');
      mat.transparent = false;
      mat.opacity = 1;
      mat.metalness = 0;
      mat.roughness = 1;
    }
    if (env.defaultTextureUrl) {
      new THREE.TextureLoader().load(env.defaultTextureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(40, 40);
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }
  }
  applyEnvironment(ensureEnvironment(doc));

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.49;

  const transform = new TransformControls(camera, renderer.domElement);
  transform.setMode('translate');
  let lastPrimaryPos = new THREE.Vector3();
  transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !(e as { value: boolean }).value && !freeFly;
    if ((e as { value: boolean }).value && selectedId && roots.get(selectedId)) {
      lastPrimaryPos.copy(roots.get(selectedId)!.position);
    }
  });
  transform.addEventListener('objectChange', () => {
    if (!selectedId) return;
    const ent = doc.entities.find((x) => x.id === selectedId);
    const obj = roots.get(selectedId);
    if (!ent || !obj) return;
    if (gridSnap && transform.mode === 'translate') {
      obj.position.x = snapToGrid(obj.position.x, gridSize);
      obj.position.z = snapToGrid(obj.position.z, gridSize);
      if (snapY || shiftHeld) obj.position.y = snapToGrid(obj.position.y, gridSize);
    }

    const dx = obj.position.x - lastPrimaryPos.x;
    const dy = obj.position.y - lastPrimaryPos.y;
    const dz = obj.position.z - lastPrimaryPos.z;
    lastPrimaryPos.copy(obj.position);

    const applyPose = (eId: string, root: THREE.Object3D) => {
      const e = doc.entities.find((x) => x.id === eId);
      if (!e) return;
      e.position = [root.position.x, root.position.y, root.position.z];
      e.rotation = [
        THREE.MathUtils.radToDeg(root.rotation.x),
        THREE.MathUtils.radToDeg(root.rotation.y),
        THREE.MathUtils.radToDeg(root.rotation.z),
      ];
      e.scale = [root.scale.x, root.scale.y, root.scale.z];
    };

    applyPose(selectedId, obj);

    if (transform.mode === 'translate' && selectedIds.length > 1) {
      for (const id of selectedIds) {
        if (id === selectedId) continue;
        const other = roots.get(id);
        if (!other) continue;
        other.position.x += dx;
        other.position.y += dy;
        other.position.z += dz;
        applyPose(id, other);
      }
    }

    handlers.onDocChange(doc);
  });
  const transformHelper =
    typeof (transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper === 'function'
      ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
      : (transform as unknown as THREE.Object3D);
  scene.add(transformHelper);

  const roots = new Map<string, THREE.Object3D>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let yaw = 0;
  let pitch = -0.4;

  const setSize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(host);

  async function loadModel(
    name?: string,
    customUrl?: string
  ): Promise<{ root: THREE.Object3D; clips: THREE.AnimationClip[]; clipNames: string[] }> {
    const src = resolveModelSrc(name, customUrl);
    if (!src) {
      return {
        root: new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        ),
        clips: [],
        clipNames: [],
      };
    }
    return loadAnimatedPrefab(src);
  }

  /** Shift mesh so local AABB feet sit on y=0 (no gap / float under props & avatars). */
  function plantLocalFeet(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box.min.y;
  }

  /** World Y of the top surface under a point (mesh AABB or ground). */
  function surfaceYAt(x: number, z: number, ignoreId?: string): number {
    let best = 0;
    roots.forEach((root, id) => {
      if (ignoreId && id === ignoreId) return;
      if (!root.visible) return;
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      if (x < box.min.x - 0.05 || x > box.max.x + 0.05) return;
      if (z < box.min.z - 0.05 || z > box.max.z + 0.05) return;
      if (box.max.y > best) best = box.max.y;
    });
    return best;
  }

  function pickPlacePoint(
    preferStack: boolean
  ): { point: THREE.Vector3; stackedOnId?: string } | null {
    const pickables = Array.from(roots.values()).filter((r) => r.visible);
    const meshHits = raycaster.intersectObjects(pickables, true);
    const groundHits = raycaster.intersectObject(ground);

    if (preferStack && meshHits.length) {
      let o: THREE.Object3D | null = meshHits[0].object;
      while (o && !o.userData.entityId) o = o.parent;
      if (o?.userData.entityId) {
        const box = new THREE.Box3().setFromObject(o);
        const p = meshHits[0].point.clone();
        p.y = box.max.y;
        return { point: p, stackedOnId: o.userData.entityId as string };
      }
    }
    if (groundHits[0]) return { point: groundHits[0].point.clone() };
    if (meshHits[0]) return { point: meshHits[0].point.clone() };
    return null;
  }

  function makeSpawnMarker(
    kind: string,
    color: string
  ): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'finish' || kind === 'health_floor' || kind === 'revive_pad' || kind === 'red_zone') {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.12, 1.6),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: kind === 'red_zone' ? 0.7 : 0.55,
          transparent: true,
          opacity: 0.9,
        })
      );
      pad.position.y = 0.06;
      g.add(pad);
      if (kind === 'finish') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc })
        );
        pole.position.set(0.55, 0.75, 0.55);
        g.add(pole);
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.35, 0.04),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
        );
        flag.position.set(0.85, 1.25, 0.55);
        g.add(flag);
      }
    } else {
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 1.4, 12),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 })
      );
      body.position.y = 0.7;
      g.add(body);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.05, 8, 24),
        new THREE.MeshStandardMaterial({ color })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);
    }
    g.userData.kind = kind;
    return g;
  }

  function layerMeta(id: string): EditorLayer | undefined {
    return doc.layers.find((l) => l.id === id);
  }

  function applyEntityTexture(root: THREE.Object3D, ent: EditorEntity) {
    const url = ent.textureUrl || doc.environment?.defaultTextureUrl;
    if (!url) return;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material = o.material.clone();
          o.material.map = tex;
          o.material.needsUpdate = true;
        }
      });
    });
  }

  async function syncEntity(ent: EditorEntity) {
    let root = roots.get(ent.id);

    if (!root) {
      if (ent.model || ent.customModelUrl) {
        try {
          const loaded = await loadModel(ent.model, ent.customModelUrl);
          // Wrap + plant feet so entity.position.y is the stand surface (no gap/clip)
          root = new THREE.Group();
          plantLocalFeet(loaded.root);
          root.add(loaded.root);
          entityClips.set(ent.id, loaded.clips);
          // Persist discovered clips back into document
          if (loaded.clipNames.length) {
            const prev = ent.animation ?? defaultAnimation();
            const suggested =
              !prev.defaultClip && loaded.clipNames.length
                ? AnimationDirector.suggestClips(loaded.clipNames)
                : {};
            const nextAnim = {
              ...prev,
              availableClips: loaded.clipNames,
              ...suggested,
            };
            const idx = doc.entities.findIndex((e) => e.id === ent.id);
            if (idx >= 0) {
              const entities = doc.entities.slice();
              entities[idx] = { ...entities[idx], animation: nextAnim };
              doc = { ...doc, entities };
              ent = entities[idx];
              handlers.onDocChange(doc);
            }
          }
          director.register(ent.id, root, loaded.clips);
          if (ent.animation?.trigger === 'always' || ent.animation?.defaultClip) {
            director.playDefault(ent);
          }
        } catch {
          root = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0xff00ff })
          );
        }
      } else if (
        ent.kind === 'spawn_runner' ||
        ent.kind === 'spawn_trapper' ||
        ent.kind === 'start' ||
        ent.kind === 'finish' ||
        ent.kind === 'spawn_monster' ||
        ent.kind === 'spawn_team_a' ||
        ent.kind === 'spawn_team_b' ||
        ent.kind === 'red_zone' ||
        ent.kind === 'revive_pad' ||
        ent.kind === 'health_floor' ||
        ent.kind === 'wave_anchor'
      ) {
        const fallbackColor =
          ent.kind === 'finish'
            ? '#fbbf24'
            : ent.kind === 'spawn_trapper' || ent.kind === 'spawn_monster' || ent.kind === 'red_zone'
              ? '#ef4444'
              : ent.kind === 'spawn_team_a'
                ? '#38bdf8'
                : ent.kind === 'spawn_team_b'
                  ? '#f97316'
                  : ent.kind === 'health_floor'
                    ? '#34d399'
                    : ent.kind === 'revive_pad'
                      ? '#60a5fa'
                      : ent.kind === 'wave_anchor'
                        ? '#fbbf24'
                        : '#22c55e';
        root = makeSpawnMarker(ent.kind, ent.color ?? fallbackColor);
      } else if (ent.kind === 'button') {
        root = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.35 })
        );
        root.position.y = 0.1;
      } else if (ent.kind === 'light') {
        root = makeLightBulb(ent);
      } else if (ent.kind === 'player') {
        root = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
        );
        root.position.y = 0.9;
      } else {
        root = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
      }
      root.userData.entityId = ent.id;
      roots.set(ent.id, root);
      scene.add(root);
    }

    root.position.set(...ent.position);
    root.rotation.set(
      THREE.MathUtils.degToRad(ent.rotation[0]),
      THREE.MathUtils.degToRad(ent.rotation[1]),
      THREE.MathUtils.degToRad(ent.rotation[2])
    );
    root.scale.set(...ent.scale);

    const layer = layerMeta(ent.layerId);
    root.visible = ent.visible !== false && layer?.visible !== false;

    if (typeof ent.opacity === 'number') {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            m.transparent = ent.opacity! < 1;
            m.opacity = ent.opacity!;
          });
        }
      });
    }
    applyEntityTexture(root, ent);
    if (ent.kind === 'light') syncLightParams(root, ent);
    refreshGizmos();
  }

  function refreshGizmos() {
    while (gizmoGroup.children.length) {
      const c = gizmoGroup.children[0];
      gizmoGroup.remove(c);
      if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
        c.geometry?.dispose?.();
      }
    }
    const selectedSet = new Set(
      selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
    );
    for (const ent of doc.entities) {
      const isSelected = selectedSet.has(ent.id);
      // Green/red wire pads are collision helpers — not multi-select.
      // Default: only the selection, so the scene isn't covered in green boxes.
      const drawCollision = showAllCollisionGizmos || isSelected;

      const isHz = ent.kind === 'hazard' || ent.hazard?.enabled;
      if (drawCollision && isHz) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(0.5, Math.abs(ent.scale[0]) * 1.6),
            Math.max(0.2, Math.abs(ent.scale[1]) * 0.4),
            Math.max(0.5, Math.abs(ent.scale[2]) * 1.6)
          ),
          new THREE.MeshBasicMaterial({
            color: 0xff2244,
            wireframe: true,
            transparent: true,
            opacity: 0.85,
            depthTest: false,
          })
        );
        box.position.set(ent.position[0], ent.position[1] + 0.05, ent.position[2]);
        box.rotation.set(
          THREE.MathUtils.degToRad(ent.rotation[0]),
          THREE.MathUtils.degToRad(ent.rotation[1]),
          THREE.MathUtils.degToRad(ent.rotation[2])
        );
        gizmoGroup.add(box);
      }

      const showSolid = entityExportsAsPlatform(ent);
      if (drawCollision && showSolid && !isHz) {
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(0.5, Math.abs(ent.scale[0]) * 2),
            0.08,
            Math.max(0.5, Math.abs(ent.scale[2]) * 2)
          ),
          new THREE.MeshBasicMaterial({
            color: ent.jumpPad?.enabled ? 0x38bdf8 : 0x22c55e,
            wireframe: true,
            transparent: true,
            opacity: 0.75,
            depthTest: false,
          })
        );
        pad.position.set(ent.position[0], ent.position[1] + 0.04, ent.position[2]);
        gizmoGroup.add(pad);
      }

      // Trap / door ← button links (always visible so wiring stays clear)
      const listen = ent.animation?.listenToEntityId;
      const activates = ent.animation?.activatesEntityIds ?? [];
      const pairs: [string, string][] = [];
      if (listen) pairs.push([listen, ent.id]);
      for (const tid of activates) pairs.push([ent.id, tid]);
      for (const [fromId, toId] of pairs) {
        const a = doc.entities.find((e) => e.id === fromId);
        const b = doc.entities.find((e) => e.id === toId);
        if (!a || !b) continue;
        const pts = [
          new THREE.Vector3(...a.position),
          new THREE.Vector3(...b.position),
        ];
        pts[0].y += 0.8;
        pts[1].y += 0.8;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })
        );
        gizmoGroup.add(line);
      }
    }
  }

  async function rebuildAll() {
    const keep = new Set(doc.entities.map((e) => e.id));
    roots.forEach((obj, id) => {
      if (!keep.has(id)) {
        director.unregister(id);
        entityClips.delete(id);
        obj.removeFromParent();
        roots.delete(id);
      }
    });
    await Promise.all(doc.entities.map((e) => syncEntity(e)));
    refreshGizmos();
    if (selectedId && roots.has(selectedId)) transform.attach(roots.get(selectedId)!);
    else transform.detach();
  }

  void rebuildAll();

  function select(id: string | null, additive = false) {
    if (!id) {
      selectedId = null;
      selectedIds = [];
      transform.detach();
      refreshGizmos();
      handlers.onSelect(null);
      handlers.onSelectionChange?.([]);
      return;
    }
    if (additive) {
      if (selectedIds.includes(id)) {
        selectedIds = selectedIds.filter((x) => x !== id);
      } else {
        selectedIds = [...selectedIds, id];
      }
      selectedId = selectedIds[selectedIds.length - 1] ?? null;
    } else {
      selectedId = id;
      selectedIds = [id];
    }
    if (selectedId && roots.has(selectedId) && !freeFly) transform.attach(roots.get(selectedId)!);
    else transform.detach();
    refreshGizmos();
    handlers.onSelect(selectedId);
    handlers.onSelectionChange?.(selectedIds);
  }

  function placeAt(point: THREE.Vector3, kind: EditorEntity['kind'] = 'prop', model?: string) {
    const layer = layerMeta(activeLayerId);
    if (layer?.locked) return;

    let x = point.x;
    let y = Math.max(0, point.y);
    let z = point.z;
    if (gridSnap) {
      x = snapToGrid(x, gridSize);
      z = snapToGrid(z, gridSize);
      if (snapY) y = snapToGrid(y, gridSize);
    }
    // Sit on top of whatever is under this XZ (stacking / floor)
    const stacked = surfaceYAt(x, z);
    if (stacked > y) y = stacked;
    else if (y < 0.001) y = stacked;

    const modelName =
      model ??
      (kind === 'prop' ||
      kind === 'player' ||
      kind === 'button' ||
      kind === 'trap' ||
      kind === 'hazard' ||
      kind === 'finish' ||
      kind === 'start' ||
      kind.startsWith('spawn')
        ? brush ?? undefined
        : undefined);

    const padKinds =
      kind === 'finish' ||
      kind === 'health_floor' ||
      kind === 'revive_pad' ||
      kind === 'red_zone';

    const defaultColor =
      kind === 'spawn_runner' || kind === 'start'
        ? '#22c55e'
        : kind === 'spawn_trapper' || kind === 'spawn_monster' || kind === 'red_zone'
          ? '#ef4444'
          : kind === 'finish' || kind === 'wave_anchor'
            ? '#fbbf24'
            : kind === 'button'
              ? '#fbbf24'
              : kind === 'trap'
                ? '#a78bfa'
                : kind === 'hazard'
                  ? '#ef4444'
                  : kind === 'light'
                    ? '#ffe9a8'
                    : kind === 'spawn_team_a'
                      ? '#38bdf8'
                      : kind === 'spawn_team_b'
                        ? '#f97316'
                        : kind === 'health_floor'
                          ? '#34d399'
                          : kind === 'revive_pad'
                            ? '#60a5fa'
                            : undefined;

    const defaultModel =
      kind === 'light'
        ? undefined
        : kind === 'start' ||
            kind === 'spawn_runner' ||
            kind === 'spawn_trapper' ||
            kind === 'spawn_monster' ||
            kind === 'spawn_team_a' ||
            kind === 'spawn_team_b'
          ? modelName ?? (kind === 'spawn_trapper' || kind === 'spawn_monster' ? 'figurine-large' : 'figurine')
          : kind === 'finish' ||
              kind === 'health_floor' ||
              kind === 'revive_pad' ||
              kind === 'red_zone'
            ? modelName ?? 'floor-square'
            : kind === 'wave_anchor'
              ? modelName ?? 'target-a-square'
              : modelName;

    const ent: EditorEntity = {
      id: generateId(),
      name: entityKindLabel(kind),
      kind,
      model: defaultModel,
      layerId: activeLayerId,
      position: [x, padKinds ? Math.max(0, y) : y, z],
      rotation: [0, 0, 0],
      scale: padKinds ? [2, 1, 2] : [1, 1, 1],
      color: defaultColor,
      opacity: 1,
      visible: true,
      solid: padKinds && kind !== 'red_zone' ? true : undefined,
      animation: defaultAnimation(),
      playerAnims: kind === 'player' ? {} : undefined,
      hazard: kind === 'hazard' ? defaultHazard() : undefined,
      light: kind === 'light' ? defaultLight() : undefined,
      monsterSpawn: kind === 'spawn_monster' ? defaultMonsterSpawn() : undefined,
      redZone: kind === 'red_zone' ? defaultRedZone() : undefined,
      revive: kind === 'revive_pad' ? defaultRevive() : undefined,
      healthFloor: kind === 'health_floor' ? defaultHealthFloor() : undefined,
      waveAnchor: kind === 'wave_anchor' ? defaultWaveAnchor() : undefined,
    };
    doc = { ...doc, entities: [...doc.entities, ent] };
    void syncEntity(ent).then(() => {
      select(ent.id);
      handlers.onDocChange(doc);
    });
  }

  function setFreeFly(on: boolean) {
    freeFly = on;
    orbit.enabled = !on;
    transform.enabled = !on;
    renderer.domElement.style.cursor = on ? 'none' : 'crosshair';
    if (on) {
      transform.detach();
      // Sync yaw/pitch from camera
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw = Math.atan2(dir.x, dir.z);
      pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      host.requestPointerLock?.().catch(() => {});
    } else if (document.pointerLockElement) {
      document.exitPointerLock?.();
      if (selectedId && roots.has(selectedId)) transform.attach(roots.get(selectedId)!);
    }
    handlers.onFreeFlyChange?.(on);
  }

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    downX = ev.clientX;
    downY = ev.clientY;
    if (ev.altKey && !freeFly && !measureMode) {
      boxSelecting = true;
      boxStart = { x: ev.clientX, y: ev.clientY };
      const hostRect = host.getBoundingClientRect();
      boxOverlay.style.display = 'block';
      boxOverlay.style.left = `${ev.clientX - hostRect.left}px`;
      boxOverlay.style.top = `${ev.clientY - hostRect.top}px`;
      boxOverlay.style.width = '0px';
      boxOverlay.style.height = '0px';
      orbit.enabled = false;
    }
  };

  const onPointerMoveBox = (ev: PointerEvent) => {
    if (!boxSelecting) return;
    const hostRect = host.getBoundingClientRect();
    const x1 = Math.min(boxStart.x, ev.clientX) - hostRect.left;
    const y1 = Math.min(boxStart.y, ev.clientY) - hostRect.top;
    const x2 = Math.max(boxStart.x, ev.clientX) - hostRect.left;
    const y2 = Math.max(boxStart.y, ev.clientY) - hostRect.top;
    boxOverlay.style.left = `${x1}px`;
    boxOverlay.style.top = `${y1}px`;
    boxOverlay.style.width = `${x2 - x1}px`;
    boxOverlay.style.height = `${y2 - y1}px`;
  };

  const finishBoxSelect = (ev: PointerEvent) => {
    if (!boxSelecting) return;
    boxSelecting = false;
    boxOverlay.style.display = 'none';
    orbit.enabled = !freeFly;
    const hostRect = host.getBoundingClientRect();
    const x1 = Math.min(boxStart.x, ev.clientX);
    const x2 = Math.max(boxStart.x, ev.clientX);
    const y1 = Math.min(boxStart.y, ev.clientY);
    const y2 = Math.max(boxStart.y, ev.clientY);
    if (x2 - x1 < 6 && y2 - y1 < 6) return;

    const picked: string[] = [];
    const tmp = new THREE.Vector3();
    roots.forEach((root, id) => {
      if (!root.visible) return;
      tmp.copy(root.position).project(camera);
      const sx = (tmp.x * 0.5 + 0.5) * hostRect.width + hostRect.left;
      const sy = (-tmp.y * 0.5 + 0.5) * hostRect.height + hostRect.top;
      if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(id);
    });
    if (!picked.length) {
      select(null);
      return;
    }
    selectedIds = picked;
    selectedId = picked[picked.length - 1];
    if (selectedId && roots.has(selectedId) && !freeFly) transform.attach(roots.get(selectedId)!);
    handlers.onSelect(selectedId);
    handlers.onSelectionChange?.(selectedIds);
    refreshGizmos();
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0 || freeFly) return;
    if (boxSelecting) {
      finishBoxSelect(ev);
      return;
    }
    if ((transform as unknown as { dragging: boolean }).dragging) return;
    const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
    if (dist > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const groundHits = raycaster.intersectObject(ground);

    if (measureMode && groundHits[0]) {
      const p = groundHits[0].point.clone();
      if (!measureA) {
        measureA = p;
        while (measureGroup.children.length) measureGroup.remove(measureGroup.children[0]);
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x22d3ee })
        );
        marker.position.copy(p);
        measureGroup.add(marker);
        handlers.onMeasureChange?.(null);
      } else {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xf472b6 })
        );
        marker.position.copy(p);
        measureGroup.add(marker);
        const geo = new THREE.BufferGeometry().setFromPoints([measureA, p]);
        measureGroup.add(
          new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x22d3ee }))
        );
        const d = measureA.distanceTo(p);
        handlers.onMeasureChange?.(d);
        measureA = null;
      }
      return;
    }

    const pickables = Array.from(roots.values()).filter((r) => r.visible);
    const hits = raycaster.intersectObjects(pickables, true);

    // With a brush active, place on mesh tops / ground (stack) instead of only selecting
    if (brush && !measureMode && !ev.shiftKey) {
      const placed = pickPlacePoint(true);
      if (placed) {
        placeAt(placed.point, 'prop', brush);
        return;
      }
    }

    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.entityId) o = o.parent;
      if (o?.userData.entityId) {
        select(o.userData.entityId as string, ev.shiftKey);
        return;
      }
    }

    if (groundHits[0] && stampEntitiesQueue?.length) {
      const placedPt = pickPlacePoint(true);
      const p = placedPt?.point ?? groundHits[0].point;
      let x = p.x;
      let y = Math.max(0, p.y);
      let z = p.z;
      if (gridSnap) {
        x = snapToGrid(x, gridSize);
        z = snapToGrid(z, gridSize);
        if (snapY) y = snapToGrid(y, gridSize);
      }
      const stacked = surfaceYAt(x, z);
      if (stacked > y) y = stacked;
      const origin = stampEntitiesQueue[0].position;
      const placed = stampEntitiesQueue.map((e) => ({
        ...e,
        id: generateId(),
        layerId: activeLayerId,
        position: [
          x + (e.position[0] - origin[0]),
          y + (e.position[1] - origin[1]),
          z + (e.position[2] - origin[2]),
        ] as [number, number, number],
      }));
      doc = { ...doc, entities: [...doc.entities, ...placed] };
      stampEntitiesQueue = null;
      void Promise.all(placed.map((e) => syncEntity(e))).then(() => {
        select(placed[0]?.id ?? null);
        handlers.onDocChange(doc);
      });
      return;
    }

    if (groundHits[0] && brush && !measureMode) {
      placeAt(groundHits[0].point, 'prop', brush);
    } else if (!ev.shiftKey) {
      select(null);
    }
  };

  const onMouseMove = (ev: MouseEvent) => {
    if (boxSelecting) {
      onPointerMoveBox(ev as unknown as PointerEvent);
      return;
    }
    if (!freeFly) return;
    yaw -= (ev.movementX || 0) * 0.0016;
    pitch -= (ev.movementY || 0) * 0.0016;
    pitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('mousemove', onMouseMove);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftHeld = true;
    keys.add(e.code);
    if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) {
      e.preventDefault();
      setFreeFly(!freeFly);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') shiftHeld = false;
    keys.delete(e.code);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let raf = 0;
  const clock = new THREE.Clock();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (paused) return;
    const dt = Math.min(clock.getDelta(), 0.05);

    if (freeFly) {
      // Look stick (mobile) — gentle so you don't whip around and get lost
      if (touchAxes.lookX || touchAxes.lookY) {
        yaw -= touchAxes.lookX * 0.85 * dt;
        pitch -= touchAxes.lookY * 0.7 * dt;
        pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
      }

      const sprint =
        keys.has('ShiftLeft') || keys.has('ShiftRight') || touchAxes.sprint;
      // Slow, smooth fly — sprint still faster but controlled
      const speed = (sprint ? 9 : 4.2) * dt;
      // Fly toward where the camera points (pitch included) so looking down flies down
      const forward = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

      if (keys.has('KeyW')) camera.position.addScaledVector(forward, speed);
      if (keys.has('KeyS')) camera.position.addScaledVector(forward, -speed);
      if (keys.has('KeyA')) camera.position.addScaledVector(right, speed);
      if (keys.has('KeyD')) camera.position.addScaledVector(right, -speed);
      if (keys.has('Space')) camera.position.y += speed;
      if (keys.has('KeyC') || keys.has('KeyZ')) camera.position.y -= speed;

      // Right stick: Y = forward/back along look, X = strafe
      if (touchAxes.moveY) camera.position.addScaledVector(forward, -touchAxes.moveY * speed);
      if (touchAxes.moveX) camera.position.addScaledVector(right, -touchAxes.moveX * speed);

      const look = new THREE.Vector3(
        camera.position.x + forward.x,
        camera.position.y + forward.y,
        camera.position.z + forward.z
      );
      camera.lookAt(look);
    } else {
      // Orbit look via left stick when not free-flying — keep mild
      if (touchAxes.lookX || touchAxes.lookY) {
        const offset = new THREE.Vector3().subVectors(camera.position, orbit.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.theta -= touchAxes.lookX * 0.85 * dt;
        sph.phi = THREE.MathUtils.clamp(
          sph.phi + touchAxes.lookY * 0.7 * dt,
          0.15,
          Math.PI - 0.15
        );
        offset.setFromSpherical(sph);
        camera.position.copy(orbit.target).add(offset);
        camera.lookAt(orbit.target);
      }
      orbit.update();
    }
    director.update(dt);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    setDoc: (next) => {
      doc = structuredClone(next);
      if (!doc.environment) doc.environment = { ...DEFAULT_ENVIRONMENT };
      gridSize = doc.gridSize || 1;
      applyEnvironment(ensureEnvironment(doc));
      void rebuildAll();
    },
    getDoc: () => doc,
    setSelectedId: (id) => select(id),
    getSelectedId: () => selectedId,
    getSelectedIds: () => selectedIds,
    setSelectedIds: (ids) => {
      selectedIds = ids;
      selectedId = ids[ids.length - 1] ?? null;
      if (selectedId && roots.has(selectedId) && !freeFly) transform.attach(roots.get(selectedId)!);
      else transform.detach();
      refreshGizmos();
      handlers.onSelect(selectedId);
      handlers.onSelectionChange?.(selectedIds);
    },
    setBrush: (m) => {
      brush = m;
      if (m) stampEntitiesQueue = null;
    },
    setActiveLayerId: (id) => {
      activeLayerId = id;
    },
    setTransformMode: (mode) => transform.setMode(mode),
    setGridSnap: (on) => {
      gridSnap = on;
    },
    setGridSize: (n) => {
      gridSize = n;
      doc = { ...doc, gridSize: n };
      handlers.onDocChange(doc);
    },
    setSnapY: (on) => {
      snapY = on;
    },
    setFreeFly,
    isFreeFly: () => freeFly,
    setShowAllCollisionGizmos: (on) => {
      showAllCollisionGizmos = on;
      refreshGizmos();
    },
    getShowAllCollisionGizmos: () => showAllCollisionGizmos,
    setMeasureMode: (on) => {
      measureMode = on;
      measureA = null;
      while (measureGroup.children.length) measureGroup.remove(measureGroup.children[0]);
      handlers.onMeasureChange?.(null);
      renderer.domElement.style.cursor = on ? 'cell' : freeFly ? 'none' : 'crosshair';
    },
    isMeasureMode: () => measureMode,
    applyEnvironment: (env) => {
      doc = { ...doc, environment: env };
      applyEnvironment(env);
      handlers.onDocChange(doc);
    },
    placeSpawn: (kind) => {
      const t = new THREE.Vector3();
      camera.getWorldDirection(t);
      const p = camera.position.clone().add(t.multiplyScalar(8));
      p.y = surfaceYAt(p.x, p.z);
      const model =
        kind === 'finish'
          ? 'floor-square'
          : kind === 'spawn_trapper' || kind === 'spawn_monster'
            ? 'figurine-large'
            : 'figurine';
      placeAt(p, kind, model);
    },
    placeEntity: (kind, model) => {
      const t = new THREE.Vector3();
      camera.getWorldDirection(t);
      const p = camera.position.clone().add(t.multiplyScalar(8));
      p.y = surfaceYAt(p.x, p.z);
      placeAt(p, kind, model);
    },
    stampEntities: (entities) => {
      stampEntitiesQueue = entities;
      brush = null;
    },
    duplicateSelected: (axis = 'x') => {
      if (!selectedIds.length && !selectedId) return;
      const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
      const copies: EditorEntity[] = [];
      for (const sid of ids) {
        const src = doc.entities.find((e) => e.id === sid);
        if (!src) continue;
        const offset: [number, number, number] = [
          axis === 'x' ? gridSize : 0,
          axis === 'y' ? gridSize : 0,
          axis === 'z' ? gridSize : 0,
        ];
        copies.push({
          ...src,
          id: generateId(),
          name: `${src.name} Copy`,
          position: [
            src.position[0] + offset[0],
            src.position[1] + offset[1],
            src.position[2] + offset[2],
          ] as [number, number, number],
          animation: src.animation
            ? { ...src.animation, availableClips: [...src.animation.availableClips] }
            : defaultAnimation(),
        });
      }
      doc = { ...doc, entities: [...doc.entities, ...copies] };
      void Promise.all(copies.map((c) => syncEntity(c))).then(() => {
        selectedIds = copies.map((c) => c.id);
        selectedId = selectedIds[0] ?? null;
        if (selectedId) transform.attach(roots.get(selectedId)!);
        refreshGizmos();
        handlers.onSelect(selectedId);
        handlers.onSelectionChange?.(selectedIds);
        handlers.onDocChange(doc);
      });
    },
    focusSelected: () => {
      if (!selectedId) return;
      const obj = roots.get(selectedId);
      if (!obj) return;
      orbit.target.copy(obj.position);
      const dist = 8;
      camera.position.set(
        obj.position.x + dist * 0.6,
        obj.position.y + dist * 0.5,
        obj.position.z + dist * 0.6
      );
      orbit.update();
    },
    resetCamera: () => {
      // Prefer Start / player spawn / player entity as the edit "home"
      const home =
        doc.entities.find((e) => e.kind === 'start') ||
        doc.entities.find((e) => e.kind === 'spawn_runner') ||
        doc.entities.find((e) => e.kind === 'player');
      const target = home
        ? new THREE.Vector3(...home.position)
        : DEFAULT_CAM_TARGET.clone();
      if (freeFly) setFreeFly(false);
      orbit.target.copy(target);
      camera.position.set(target.x + 12, target.y + 14, target.z + 18);
      yaw = 0;
      pitch = -0.4;
      orbit.update();
      setSize();
    },
    getCameraState: () => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [orbit.target.x, orbit.target.y, orbit.target.z],
      freeFly,
      yaw,
      pitch,
    }),
    setCameraState: (state) => {
      camera.position.set(...state.position);
      orbit.target.set(...state.target);
      yaw = state.yaw;
      pitch = state.pitch;
      if (state.freeFly !== freeFly) setFreeFly(state.freeFly);
      else {
        orbit.update();
        if (freeFly) {
          const forward = new THREE.Vector3(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch)
          );
          camera.lookAt(camera.position.clone().add(forward));
        }
      }
      setSize();
      renderer.render(scene, camera);
    },
    setPaused: (on) => {
      paused = on;
      if (!on) {
        clock.getDelta();
        setSize();
        renderer.render(scene, camera);
      }
    },
    resize: () => {
      setSize();
      renderer.render(scene, camera);
    },
    deleteSelected: () => {
      const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
      if (!ids.length) return;
      doc = { ...doc, entities: doc.entities.filter((e) => !ids.includes(e.id)) };
      ids.forEach((id) => {
        director.unregister(id);
        entityClips.delete(id);
        roots.get(id)?.removeFromParent();
        roots.delete(id);
      });
      select(null);
      refreshGizmos();
      handlers.onDocChange(doc);
    },
    updateSelected: (patch) => {
      if (!selectedId) return;
      const id = selectedId;
      const prev = doc.entities.find((e) => e.id === id);
      const modelChanged = patch.model !== undefined || patch.customModelUrl !== undefined;
      const kindChanged = patch.kind !== undefined && patch.kind !== prev?.kind;
      if (modelChanged || kindChanged) {
        director.unregister(id);
        entityClips.delete(id);
        roots.get(id)?.removeFromParent();
        roots.delete(id);
      }
      doc = {
        ...doc,
        entities: doc.entities.map((e) => {
          if (e.id !== id) return e;
          const next = { ...e, ...patch };
          if (patch.kind === 'light' && !next.light) next.light = defaultLight(next.color);
          if (patch.kind === 'hazard' && !next.hazard) next.hazard = defaultHazard();
          return next;
        }),
      };
      const ent = doc.entities.find((e) => e.id === id);
      if (ent) {
        void (async () => {
          if (modelChanged && (ent.model || ent.customModelUrl)) {
            const src = resolveModelSrc(ent.model, ent.customModelUrl);
            if (src) {
              const names = await scanModelClips(src);
              if (names.length) {
                const sug = AnimationDirector.suggestClips(names);
                ent.animation = {
                  ...defaultAnimation(),
                  ...ent.animation,
                  availableClips: names,
                  defaultClip: ent.animation?.defaultClip || sug.defaultClip,
                  activeClip: ent.animation?.activeClip || sug.activeClip,
                };
                doc = {
                  ...doc,
                  entities: doc.entities.map((e) => (e.id === id ? { ...ent } : e)),
                };
              }
            }
          }
          await syncEntity(ent);
          handlers.onDocChange(doc);
        })();
      } else {
        handlers.onDocChange(doc);
      }
    },
    previewAnim: (which) => {
      if (!selectedId) return;
      const ent = doc.entities.find((e) => e.id === selectedId);
      if (!ent) return;
      if (which === 'active') director.previewActive(ent);
      else director.playDefault(ent);
    },
    captureThumbnail: () => {
      try {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/jpeg', 0.62);
      } catch {
        return null;
      }
    },
    setTouchAxes: (axes) => {
      touchAxes = {
        moveX: axes.moveX || 0,
        moveY: axes.moveY || 0,
        lookX: axes.lookX || 0,
        lookY: axes.lookY || 0,
        sprint: !!axes.sprint,
      };
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement) document.exitPointerLock?.();
      boxOverlay.remove();
      director.clear();
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    },
  };
}
