'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { EditorEntity, EditorLayer, MapDocument, MapEnvironment } from './map-document';
import {
  DEFAULT_ENVIRONMENT,
  HAMMER_SOLID_MODEL,
  defaultAnimation,
  defaultHazard,
  defaultHealthFloor,
  defaultJumpPad,
  defaultLight,
  defaultMonsterSpawn,
  defaultRedZone,
  defaultRevive,
  defaultWaveAnchor,
  ensureLight,
  entityExportsAsPlatform,
  entityKindLabel,
  generateId,
  isInvisibleMarkerKind,
  isPlatformPlayerKind,
  snapToGrid,
  ensureEnvironment,
} from './map-document';
import {
  applyTextureToObject,
  makeBoundsWireBox,
  makeSelectionOutline,
  plantLocalFeet,
} from './editor-mesh';
import { applyEntityOpacity, MAP_SKY_COLORS } from './map-scene-visuals';

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
import { DEFAULT_DOOR_MODEL, modelFootprint } from './prototype-catalog';

export type TransformMode = 'translate' | 'rotate' | 'scale';

export interface EditorCameraState {
  position: [number, number, number];
  target: [number, number, number];
  freeFly: boolean;
  yaw: number;
  pitch: number;
}

/** Primary pointer tool: Select / Brush / Bucket / Paint / Hammer++ solid. */
export type EditTool = 'select' | 'brush' | 'bucket' | 'paint' | 'hammer';

/** Multi-viewport layout — shares one scene (cheap). */
export type EditorViewLayout = 'single' | 'split' | 'triple';

export interface EditorViewportApi {
  setDoc: (doc: MapDocument) => void;
  getDoc: () => MapDocument;
  setSelectedId: (id: string | null) => void;
  getSelectedId: () => string | null;
  getSelectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  setBrush: (model: string | null) => void;
  setPaintTexture: (url: string | null) => void;
  setEditTool: (tool: EditTool) => void;
  getEditTool: () => EditTool;
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
      | 'action'
      | 'jump_pad'
      | 'door'
      | 'checkpoint'
  ) => void;
  placeEntity: (kind: EditorEntity['kind'], model?: string) => void;
  /** Arm click-to-place for an entity kind (next ground click places it on the floor). */
  armPlaceKind: (kind: EditorEntity['kind'], model?: string) => void;
  getPendingPlaceKind: () => EditorEntity['kind'] | null;
  clearPendingPlace: () => void;
  stampEntities: (entities: EditorEntity[]) => void;
  duplicateSelected: (axis?: 'x' | 'y' | 'z') => void;
  /** Align multi-selection: shared bottom Y, edge-to-edge along X. Returns false if nothing snapped. */
  snapSelectedTogether: (idsOverride?: string[]) => boolean;
  /** Drop selection onto the floor / supporting surface under each pivot. */
  snapSelectedToFloor: (idsOverride?: string[]) => boolean;
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
  setViewLayout: (layout: EditorViewLayout) => void;
  getViewLayout: () => EditorViewLayout;
  /** Snap perspective camera to top / front / side / perspective. */
  setCameraPreset: (preset: 'perspective' | 'top' | 'front' | 'side') => void;
  setPaintUv: (uv: {
    repeat?: [number, number];
    offset?: [number, number];
    rotation?: number;
  }) => void;
  destroy: () => void;
}

const SKY_COLORS = MAP_SKY_COLORS;

export function createEditorViewport(
  host: HTMLElement,
  initial: MapDocument,
  handlers: {
    onSelect: (id: string | null) => void;
    onSelectionChange?: (ids: string[]) => void;
    onDocChange: (doc: MapDocument) => void;
    onFreeFlyChange?: (on: boolean) => void;
    onMeasureChange?: (distance: number | null) => void;
    /** Fired when place is blocked (e.g. locked build level). */
    onPlaceResult?: (result: 'locked' | 'ok', layerName?: string) => void;
    /** Fired when click-to-place arming changes (Select / Escape / after place). */
    onPendingPlaceChange?: (kind: EditorEntity['kind'] | null) => void;
  }
): EditorViewportApi {
  let doc: MapDocument = structuredClone(initial);
  if (!doc.environment) doc.environment = { ...DEFAULT_ENVIRONMENT };
  let selectedId: string | null = null;
  let selectedIds: string[] = [];
  let brush: string | null = 'floor-square';
  /** Active texture URL for the Paint tool (applies on pointer release). */
  let paintTextureUrl: string | null = null;
  /** Select = pick; Brush = single click place; Bucket = hold-drag continuous paint; Paint = texture on release. */
  let editTool: EditTool = 'select';
  let stampEntitiesQueue: EditorEntity[] | null = null;
  /** Click-to-place: next ground click places this entity kind on the floor surface. */
  let pendingPlaceKind: EditorEntity['kind'] | null = null;
  let pendingPlaceModel: string | undefined;
  const setPendingPlace = (
    kind: EditorEntity['kind'] | null,
    model?: string
  ) => {
    pendingPlaceKind = kind;
    pendingPlaceModel = kind ? model : undefined;
    handlers.onPendingPlaceChange?.(kind);
  };
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
  /** Paint Bucket only: hold LMB and drag to paint continuously. */
  let bucketPainting = false;
  let lastPaintCellKey: string | null = null;
  /** UV defaults applied with the texture paint brush. */
  let paintUv = {
    repeat: [2, 2] as [number, number],
    offset: [0, 0] as [number, number],
    rotation: 0,
  };
  /** Multi-viewport layout (shared scene). */
  let viewLayout: EditorViewLayout = 'single';
  const topCam = new THREE.OrthographicCamera(-24, 24, 24, -24, 0.1, 500);
  topCam.position.set(0, 80, 0);
  topCam.up.set(0, 0, -1);
  topCam.lookAt(0, 0, 0);
  const sideCam = new THREE.OrthographicCamera(-24, 24, 24, -24, 0.1, 500);
  sideCam.position.set(80, 8, 0);
  sideCam.lookAt(0, 8, 0);
  /** Long-press multi-select (mobile): hold ~400ms to toggle additive pick. */
  let longPressTimer: number | null = null;
  let longPressId: string | null = null;
  let longPressFired = false;
  const selectionOutlines: THREE.BoxHelper[] = [];
  const keys = new Set<string>();
  let touchAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false };
  const DEFAULT_CAM_POS = new THREE.Vector3(12, 14, 18);
  const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 0);
  const director = new AnimationDirector();
  const entityClips = new Map<string, THREE.AnimationClip[]>();

  // Box-select (Alt+drag). Short Alt+click falls through so Brush can force-stack.
  let boxSelecting = false;
  let altBoxPending = false;
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
    cursor: 'default',
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
  sun.position.set(20, 30, 10);
  scene.add(sun);
  const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x334455, 0.45);
  scene.add(hemiLight);
  let skyTexture: THREE.Texture | null = null;

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
    const fogHex = env.fogColor || env.horizonColor || skyHex;

    if (skyTexture) {
      skyTexture.dispose();
      skyTexture = null;
    }

    if (env.skyTextureUrl) {
      new THREE.TextureLoader().load(
        env.skyTextureUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          skyTexture = tex;
          scene.background = tex;
          scene.environment = tex;
        },
        undefined,
        () => {
          scene.background = new THREE.Color(skyHex);
          scene.environment = null;
        }
      );
    } else {
      scene.background = new THREE.Color(skyHex);
      scene.environment = null;
    }

    scene.fog = new THREE.FogExp2(fogHex, env.fogDensity ?? 0.02);
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
    ambientLight.intensity = env.ambientIntensity ?? 0.55;
    sun.intensity = env.sunIntensity ?? 1.15;
    if (env.sunColor) sun.color.set(env.sunColor);
    hemiLight.intensity = Math.max(0.2, (env.ambientIntensity ?? 0.55) * 0.85);
    if (env.horizonColor) hemiLight.groundColor.set(env.horizonColor);

    const tile = Math.max(1, env.floorTextureScale ?? 40);
    if (env.defaultTextureUrl) {
      new THREE.TextureLoader().load(env.defaultTextureUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(tile, tile);
        mat.map = tex;
        mat.needsUpdate = true;
      });
    } else if (mat.map) {
      mat.map = null;
      mat.needsUpdate = true;
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
    const layer = layerMeta(ent.layerId);
    if (layer?.locked) {
      // Locked build level — snap visual back to stored pose and ignore the drag.
      obj.position.set(...ent.position);
      obj.rotation.set(
        THREE.MathUtils.degToRad(ent.rotation[0]),
        THREE.MathUtils.degToRad(ent.rotation[1]),
        THREE.MathUtils.degToRad(ent.rotation[2])
      );
      obj.scale.set(...ent.scale);
      return;
    }
    if (gridSnap && transform.mode === 'translate') {
      obj.position.x = snapToGrid(obj.position.x, gridSize);
      obj.position.z = snapToGrid(obj.position.z, gridSize);
      if (snapY || shiftHeld) obj.position.y = snapToGrid(obj.position.y, gridSize);
    }
    // Hold Shift while rotating → hard 90° (4-way) grid turns
    if (transform.mode === 'rotate' && shiftHeld) {
      const snapDeg = 90;
      const sx = Math.round(THREE.MathUtils.radToDeg(obj.rotation.x) / snapDeg) * snapDeg;
      const sy = Math.round(THREE.MathUtils.radToDeg(obj.rotation.y) / snapDeg) * snapDeg;
      const sz = Math.round(THREE.MathUtils.radToDeg(obj.rotation.z) / snapDeg) * snapDeg;
      obj.rotation.set(
        THREE.MathUtils.degToRad(sx),
        THREE.MathUtils.degToRad(sy),
        THREE.MathUtils.degToRad(sz)
      );
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

  /** World Y of the top surface under a point (mesh AABB or ground). Ignores invisible markers. */
  function surfaceYAt(x: number, z: number, ignoreId?: string): number {
    let best = 0;
    roots.forEach((root, id) => {
      if (ignoreId && id === ignoreId) return;
      if (!root.visible) return;
      const ent = doc.entities.find((e) => e.id === id);
      // Markers / lights / buttons shouldn't lift props off the floor.
      if (ent && (isInvisibleMarkerKind(ent.kind) || ent.kind === 'light' || ent.kind === 'button' || ent.kind === 'action')) {
        return;
      }
      if (root.userData.isEditorMarker) return;
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
    g.userData.isEditorMarker = true;
    return g;
  }

  function layerMeta(id: string): EditorLayer | undefined {
    return doc.layers.find((l) => l.id === id);
  }

  function applyEntityTexture(root: THREE.Object3D, ent: EditorEntity) {
    const url = ent.textureUrl || doc.environment?.defaultTextureUrl;
    applyTextureToObject(root, url, {
      repeat: ent.textureRepeat,
      offset: ent.textureOffset,
      rotation: ent.textureRotation,
    });
  }

  function makeHammerSolidMesh(ent: EditorEntity): THREE.Mesh {
    const size = ent.collisionSize ?? [2, 0.25, 2];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      new THREE.MeshStandardMaterial({
        color: ent.color ? new THREE.Color(ent.color) : 0x64748b,
        roughness: 0.85,
        metalness: 0.05,
      })
    );
    mesh.position.y = size[1] * 0.5;
    mesh.userData.isHammerSolid = true;
    return mesh;
  }

  function isHammerSolidEntity(ent: EditorEntity): boolean {
    return ent.primitive === 'box' || ent.model === HAMMER_SOLID_MODEL;
  }

  function clearSelectionOutlines() {
    while (selectionOutlines.length) {
      const h = selectionOutlines.pop()!;
      h.removeFromParent();
      h.geometry?.dispose?.();
      (h.material as THREE.Material)?.dispose?.();
    }
  }

  function refreshSelectionOutlines() {
    clearSelectionOutlines();
    const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    for (const id of ids) {
      const root = roots.get(id);
      if (!root || !root.visible) continue;
      try {
        const outline = makeSelectionOutline(root, 0x38bdf8);
        outline.userData.isSelectionOutline = true;
        scene.add(outline);
        selectionOutlines.push(outline);
      } catch {
        /* ignore empty meshes */
      }
    }
  }

  async function syncEntity(ent: EditorEntity) {
    let root = roots.get(ent.id);

    // Platform player avatar is settings-only — never show / pick it on the map.
    if (isPlatformPlayerKind(ent.kind)) {
      if (root) {
        scene.remove(root);
        roots.delete(ent.id);
        entityClips.delete(ent.id);
      }
      return;
    }

    if (!root) {
      const wantsMarker =
        isInvisibleMarkerKind(ent.kind) ||
        ((ent.kind === 'finish' ||
          ent.kind === 'jump_pad' ||
          ent.kind === 'hazard' ||
          ent.kind === 'red_zone' ||
          ent.kind === 'revive_pad' ||
          ent.kind === 'health_floor' ||
          ent.kind === 'action' ||
          ent.kind === 'door') &&
          !ent.model &&
          !ent.customModelUrl);

      if (!wantsMarker && isHammerSolidEntity(ent)) {
        root = new THREE.Group();
        root.add(makeHammerSolidMesh(ent));
        const size = ent.collisionSize ?? [2, 0.25, 2];
        const idx = doc.entities.findIndex((e) => e.id === ent.id);
        if (idx >= 0 && !doc.entities[idx].collisionSize) {
          const entities = doc.entities.slice();
          entities[idx] = {
            ...entities[idx],
            collisionSize: size,
            primitive: 'box',
            model: HAMMER_SOLID_MODEL,
            solid: true,
            collideMaterial: entities[idx].collideMaterial ?? 'solid',
          };
          doc = { ...doc, entities };
          ent = entities[idx];
          handlers.onDocChange(doc);
        }
      } else if (!wantsMarker && (ent.model || ent.customModelUrl)) {
        try {
          const loaded = await loadModel(ent.model, ent.customModelUrl);
          // Wrap + plant feet so entity.position.y is the stand surface (no gap/clip)
          root = new THREE.Group();
          plantLocalFeet(loaded.root);
          root.add(loaded.root);
          // Measure real mesh size (local, unscaled) for collision export.
          loaded.root.updateMatrixWorld(true);
          const meshBox = new THREE.Box3().setFromObject(loaded.root);
          if (!meshBox.isEmpty()) {
            const size = new THREE.Vector3();
            meshBox.getSize(size);
            const measured: [number, number, number] = [
              Math.max(0.05, size.x),
              Math.max(0.05, size.y),
              Math.max(0.05, size.z),
            ];
            const idx = doc.entities.findIndex((e) => e.id === ent.id);
            if (idx >= 0) {
              const prevSize = doc.entities[idx].collisionSize;
              const changed =
                !prevSize ||
                Math.abs(prevSize[0] - measured[0]) > 0.01 ||
                Math.abs(prevSize[1] - measured[1]) > 0.01 ||
                Math.abs(prevSize[2] - measured[2]) > 0.01;
              if (changed) {
                const entities = doc.entities.slice();
                entities[idx] = { ...entities[idx], collisionSize: measured };
                doc = { ...doc, entities };
                ent = entities[idx];
                handlers.onDocChange(doc);
              }
            }
          }
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
        wantsMarker ||
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
        ent.kind === 'wave_anchor' ||
        ent.kind === 'action' ||
        ent.kind === 'jump_pad' ||
        ent.kind === 'door' ||
        ent.kind === 'checkpoint'
      ) {
        const fallbackColor =
          ent.kind === 'finish' || ent.kind === 'jump_pad'
            ? '#fbbf24'
            : ent.kind === 'spawn_trapper' ||
                ent.kind === 'spawn_monster' ||
                ent.kind === 'red_zone' ||
                ent.kind === 'hazard'
              ? '#ef4444'
              : ent.kind === 'spawn_team_a'
                ? '#38bdf8'
                : ent.kind === 'spawn_team_b'
                  ? '#f97316'
                  : ent.kind === 'health_floor'
                    ? '#34d399'
                    : ent.kind === 'revive_pad'
                      ? '#60a5fa'
                      : ent.kind === 'wave_anchor' || ent.kind === 'action'
                        ? '#fbbf24'
                        : ent.kind === 'door'
                          ? '#a78bfa'
                          : '#22c55e';
        const markerKind =
          ent.kind === 'jump_pad'
            ? 'finish'
            : ent.kind === 'door' || ent.kind === 'action' || ent.kind === 'checkpoint'
              ? 'start'
              : ent.kind;
        root = makeSpawnMarker(markerKind, ent.color ?? fallbackColor);
      } else if (ent.kind === 'button') {
        root = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.35 })
        );
        root.position.y = 0.1;
        root.userData.isEditorMarker = true;
      } else if (ent.kind === 'light') {
        root = makeLightBulb(ent);
        root.userData.isEditorMarker = true;
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
      applyEntityOpacity(root, ent.opacity);
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
      const drawCollision = showAllCollisionGizmos || isSelected;
      const root = roots.get(ent.id);
      const isHz = ent.kind === 'hazard' || ent.hazard?.enabled;

      if (drawCollision && isHz) {
        const box =
          (root && makeBoundsWireBox(root, 0xff2244)) ||
          (() => {
            const m = new THREE.Mesh(
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
            m.position.set(ent.position[0], ent.position[1] + 0.05, ent.position[2]);
            return m;
          })();
        gizmoGroup.add(box);
      }

      const showSolid = entityExportsAsPlatform(ent);
      if (drawCollision && showSolid && !isHz) {
        const color = ent.jumpPad?.enabled || ent.kind === 'jump_pad' ? 0x38bdf8 : 0x22c55e;
        const hammerVol =
          ent.primitive === 'box' || ent.model === HAMMER_SOLID_MODEL;
        // Hammer solids are full volumes — show full-height wire, not flat pad.
        const pad =
          (root &&
            makeBoundsWireBox(root, color, {
              flattenY: !hammerVol,
            })) ||
          (() => {
            const foot = ent.collisionSize ?? [2, 0.25, 2];
            const hy = hammerVol
              ? Math.max(0.4, Math.abs(foot[1] * (ent.scale?.[1] ?? 1)))
              : 0.08;
            const m = new THREE.Mesh(
              new THREE.BoxGeometry(
                Math.max(0.5, Math.abs((ent.collisionSize?.[0] ?? ent.scale[0]) * (hammerVol ? 1 : 2))),
                hy,
                Math.max(0.5, Math.abs((ent.collisionSize?.[2] ?? ent.scale[2]) * (hammerVol ? 1 : 2)))
              ),
              new THREE.MeshBasicMaterial({
                color,
                wireframe: true,
                transparent: true,
                opacity: 0.75,
                depthTest: false,
              })
            );
            m.position.set(
              ent.position[0],
              ent.position[1] + (hammerVol ? hy * 0.5 : 0.04),
              ent.position[2]
            );
            return m;
          })();
        gizmoGroup.add(pad);
      }

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
    refreshSelectionOutlines();
  }

  function attachSelectionGizmo() {
    if (!selectedId || !roots.has(selectedId) || freeFly || editTool === 'bucket' || editTool === 'paint' || bucketPainting) {
      transform.detach();
      return;
    }
    const selEnt = doc.entities.find((e) => e.id === selectedId);
    if (selEnt && layerMeta(selEnt.layerId)?.locked) {
      transform.detach();
      return;
    }
    const obj = roots.get(selectedId);
    // TransformControls throws if the object is not in the scene graph.
    if (!obj || !obj.parent) {
      transform.detach();
      return;
    }
    transform.attach(obj);
  }

  /** Remove an entity root safely — never leave TransformControls attached to a detached mesh. */
  function disposeRoot(id: string) {
    const obj = roots.get(id);
    if (!obj) return;
    if ((transform as unknown as { object?: THREE.Object3D }).object === obj) {
      transform.detach();
    }
    director.unregister(id);
    entityClips.delete(id);
    obj.removeFromParent();
    roots.delete(id);
  }

  async function rebuildAll() {
    // Detach first — rebuild may remove/recreate the attached mesh.
    transform.detach();
    const keep = new Set(doc.entities.map((e) => e.id));
    roots.forEach((_obj, id) => {
      if (!keep.has(id)) disposeRoot(id);
    });
    await Promise.all(doc.entities.map((e) => syncEntity(e)));
    refreshGizmos();
    attachSelectionGizmo();
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
    if (selectedId && roots.has(selectedId) && !freeFly) {
      attachSelectionGizmo();
    } else transform.detach();
    refreshGizmos();
    handlers.onSelect(selectedId);
    handlers.onSelectionChange?.(selectedIds);
  }

  function placeAt(point: THREE.Vector3, kind: EditorEntity['kind'] = 'prop', model?: string): 'ok' | 'locked' {
    const layer = layerMeta(activeLayerId);
    if (layer?.locked) {
      handlers.onPlaceResult?.('locked', layer.name);
      return 'locked';
    }

    let x = point.x;
    let z = point.z;
    if (gridSnap) {
      x = snapToGrid(x, gridSize);
      z = snapToGrid(z, gridSize);
    }
    // Always sit cleanly on the top surface under this XZ cell (layer N above N-1).
    // Recompute after snap so we never keep a tall Y from a neighboring mesh hit.
    let y = surfaceYAt(x, z);
    if (snapY) {
      const snapped = snapToGrid(y, gridSize);
      // Snap upward when rounding would sink below the supporting surface.
      y = snapped + 1e-4 < y ? snapped + gridSize : snapped;
    }

    const modelName =
      model ??
      (kind === 'prop' || kind === 'player' || kind === 'trap' || kind === 'door'
        ? brush ?? undefined
        : undefined);

    const padKinds =
      kind === 'finish' ||
      kind === 'health_floor' ||
      kind === 'revive_pad' ||
      kind === 'red_zone' ||
      kind === 'jump_pad';

    const defaultColor =
      kind === 'spawn_runner' || kind === 'start'
        ? '#22c55e'
        : kind === 'spawn_trapper' || kind === 'spawn_monster' || kind === 'red_zone'
          ? '#ef4444'
          : kind === 'finish' || kind === 'wave_anchor' || kind === 'jump_pad' || kind === 'action'
            ? '#fbbf24'
            : kind === 'button'
              ? '#fbbf24'
              : kind === 'trap' || kind === 'door'
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

    // Invisible markers / gameplay entities: no GLB by default (editor shows flag/cone only).
    // Doors always get a real door model so they aren't invisible markers.
    const markerNoModel =
      isInvisibleMarkerKind(kind) ||
      kind === 'finish' ||
      kind === 'jump_pad' ||
      kind === 'light' ||
      kind === 'action' ||
      kind === 'hazard' ||
      kind === 'button' ||
      kind === 'red_zone' ||
      kind === 'revive_pad';

    const defaultModel = markerNoModel
      ? undefined
      : kind === 'door'
        ? modelName ?? DEFAULT_DOOR_MODEL
        : kind === 'health_floor'
          ? modelName ?? 'floor-square'
          : modelName;

    const runnerCount =
      kind === 'start' || kind === 'spawn_runner'
        ? doc.entities.filter((e) => e.kind === 'start' || e.kind === 'spawn_runner').length + 1
        : 0;

    const foot = defaultModel ? modelFootprint(defaultModel) : null;
    const isHammer = defaultModel === HAMMER_SOLID_MODEL;

    const hammerSize: [number, number, number] = [2, 0.25, 2];
    const ent: EditorEntity = {
      id: generateId(),
      name:
        kind === 'start' || kind === 'spawn_runner'
          ? `Runner Spawn ${runnerCount}`
          : isHammer
            ? 'Hammer Solid'
            : entityKindLabel(kind),
      kind,
      model: isHammer ? HAMMER_SOLID_MODEL : defaultModel,
      primitive: isHammer ? 'box' : undefined,
      layerId: activeLayerId,
      position: [x, Math.max(0, y), z],
      rotation: [0, 0, 0],
      scale: isHammer ? [1, 1, 1] : padKinds ? [2, 1, 2] : [1, 1, 1],
      color: isHammer ? '#64748b' : defaultColor,
      opacity: 1,
      visible: true,
      solid: isHammer ? true : kind === 'door' ? true : padKinds && kind !== 'red_zone' ? true : undefined,
      collideMaterial:
        isHammer || kind === 'door' || (padKinds && kind !== 'red_zone')
          ? 'solid'
          : defaultModel &&
              (defaultModel.includes('floor') ||
                defaultModel.includes('stair') ||
                defaultModel.includes('ramp') ||
                defaultModel.startsWith('platform') ||
                defaultModel.startsWith('wall') ||
                defaultModel.startsWith('column') ||
                defaultModel.startsWith('crate'))
            ? 'solid'
            : undefined,
      collisionSize: isHammer ? hammerSize : foot ?? undefined,
      textureRepeat: isHammer ? [2, 2] : undefined,
      animation: defaultAnimation(),
      playerAnims: kind === 'player' ? {} : undefined,
      hazard: kind === 'hazard' ? defaultHazard() : undefined,
      jumpPad: kind === 'jump_pad' ? defaultJumpPad() : undefined,
      light: kind === 'light' ? defaultLight() : undefined,
      monsterSpawn: kind === 'spawn_monster' ? defaultMonsterSpawn() : undefined,
      redZone: kind === 'red_zone' ? defaultRedZone() : undefined,
      revive: kind === 'revive_pad' ? defaultRevive() : undefined,
      healthFloor: kind === 'health_floor' ? defaultHealthFloor() : undefined,
      waveAnchor: kind === 'wave_anchor' ? defaultWaveAnchor() : undefined,
    };
    doc = { ...doc, entities: [...doc.entities, ent] };
    // Sync React state immediately so a concurrent setDoc cannot wipe the new entity.
    handlers.onDocChange(doc);
    void syncEntity(ent).then(() => {
      select(ent.id);
    });
    handlers.onPlaceResult?.('ok', layer?.name);
    return 'ok';
  }

  function updateCursor() {
    if (freeFly) renderer.domElement.style.cursor = 'none';
    else if (measureMode) renderer.domElement.style.cursor = 'cell';
    else if (pendingPlaceKind) renderer.domElement.style.cursor = 'crosshair';
    else if (editTool === 'select') renderer.domElement.style.cursor = 'default';
    else if (
      editTool === 'bucket' ||
      editTool === 'paint' ||
      editTool === 'hammer'
    ) {
      renderer.domElement.style.cursor = 'cell';
    } else renderer.domElement.style.cursor = 'crosshair';
  }

  function applyToolCameraLock() {
    // Bucket + texture paint lock orbit; Hammer++ only locks while hold-dragging.
    const lockCam =
      editTool === 'bucket' ||
      editTool === 'paint' ||
      freeFly ||
      measureMode ||
      bucketPainting;
    orbit.enabled = !lockCam;
    transform.enabled =
      editTool !== 'bucket' &&
      editTool !== 'paint' &&
      !freeFly &&
      !measureMode &&
      !bucketPainting;
    if (editTool === 'bucket' || editTool === 'paint' || bucketPainting) {
      transform.detach();
    }
    updateCursor();
  }

  /**
   * Map pointer into the main perspective pane. In split/triple layouts the
   * right/side ortho panes are view-only — clicks there are ignored so we
   * don't place with the wrong camera projection.
   */
  function setPointerFromClient(clientX: number, clientY: number): boolean {
    const rect = renderer.domElement.getBoundingClientRect();
    const paneFrac = viewLayout === 'triple' ? 1 / 3 : viewLayout === 'split' ? 0.5 : 1;
    const paneW = rect.width * paneFrac;
    const localX = clientX - rect.left;
    if (viewLayout !== 'single' && localX > paneW) return false;
    pointer.x = (localX / Math.max(1, paneW)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    return true;
  }

  function catalogBrushOrDefault(preferred?: string | null): string {
    const candidate = preferred?.trim() || brush;
    if (!candidate || candidate === HAMMER_SOLID_MODEL) return 'floor-square';
    return candidate;
  }

  function setFreeFly(on: boolean) {
    const wasFlying = freeFly;
    freeFly = on;
    if (on && (editTool === 'bucket' || editTool === 'paint' || editTool === 'hammer')) {
      // Free fly wins — leave painting tools so camera works.
      editTool = 'select';
      bucketPainting = false;
      lastPaintCellKey = null;
    }
    applyToolCameraLock();
    if (on) {
      transform.detach();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      yaw = Math.atan2(dir.x, dir.z);
      pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      host.requestPointerLock?.().catch(() => {});
    } else if (wasFlying) {
      if (document.pointerLockElement) document.exitPointerLock?.();
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      const lookDist = 14;
      orbit.target.set(
        camera.position.x + dir.x * lookDist,
        camera.position.y + dir.y * lookDist,
        camera.position.z + dir.z * lookDist
      );
      orbit.update();
      if (selectedId && roots.has(selectedId) && editTool !== 'bucket') {
        transform.attach(roots.get(selectedId)!);
      }
    }
    handlers.onFreeFlyChange?.(on);
  }

  function placeBrushModel(): string | null {
    if (editTool === 'hammer') return HAMMER_SOLID_MODEL;
    if (!brush || brush === HAMMER_SOLID_MODEL) return null;
    return brush;
  }

  /** Continuous place for Paint Bucket / Hammer++ hold-drag. */
  function paintBucketAtEvent(ev: { clientX: number; clientY: number }): boolean {
    const model = placeBrushModel();
    if (
      (editTool !== 'bucket' && editTool !== 'hammer') ||
      !model ||
      measureMode ||
      freeFly
    ) {
      return false;
    }
    if (!setPointerFromClient(ev.clientX, ev.clientY)) return false;
    raycaster.setFromCamera(pointer, camera);
    const placed = pickPlacePoint(true);
    const point = placed?.point ?? raycaster.intersectObject(ground)[0]?.point;
    if (!point) return false;
    let px = point.x;
    let pz = point.z;
    if (gridSnap) {
      px = snapToGrid(px, gridSize);
      pz = snapToGrid(pz, gridSize);
    }
    const cellKey = `${px.toFixed(3)},${pz.toFixed(3)}`;
    if (cellKey === lastPaintCellKey) return false;
    // Skip cells that already have this model (no spam stacks while dragging).
    const hit = doc.entities.find(
      (e) =>
        e.model === model &&
        Math.abs((gridSnap ? snapToGrid(e.position[0], gridSize) : e.position[0]) - px) <
          Math.max(0.2, gridSize * 0.45) &&
        Math.abs((gridSnap ? snapToGrid(e.position[2], gridSize) : e.position[2]) - pz) <
          Math.max(0.2, gridSize * 0.45)
    );
    if (hit) {
      lastPaintCellKey = cellKey;
      return false;
    }
    lastPaintCellKey = cellKey;
    placeAt(new THREE.Vector3(px, 0, pz), 'prop', model);
    return true;
  }

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    downX = ev.clientX;
    downY = ev.clientY;
    longPressFired = false;
    longPressId = null;
    if (longPressTimer != null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (ev.altKey && !freeFly && !measureMode && editTool !== 'bucket' && editTool !== 'paint') {
      altBoxPending = true;
      boxStart = { x: ev.clientX, y: ev.clientY };
      return;
    }
    // Paint Bucket: hold + drag paints the selected library model; camera stays locked.
    if (
      !freeFly &&
      !measureMode &&
      editTool === 'bucket' &&
      brush &&
      brush !== HAMMER_SOLID_MODEL &&
      !ev.shiftKey
    ) {
      bucketPainting = true;
      lastPaintCellKey = null;
      applyToolCameraLock();
      paintBucketAtEvent(ev);
      try {
        renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    // Hammer++ hold-drag paints solids (does not touch catalog brush).
    if (
      !freeFly &&
      !measureMode &&
      editTool === 'hammer' &&
      !ev.shiftKey
    ) {
      bucketPainting = true;
      lastPaintCellKey = null;
      applyToolCameraLock();
      paintBucketAtEvent(ev);
      try {
        renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    // Texture paint: arm on down; apply on release under finger/cursor.
    if (!freeFly && !measureMode && editTool === 'paint' && paintTextureUrl) {
      orbit.enabled = false;
      try {
        renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    // Mobile / touch long-press → additive multi-select.
    if (!freeFly && !measureMode && editTool === 'select' && !ev.shiftKey && !ev.altKey) {
      if (!setPointerFromClient(ev.clientX, ev.clientY)) return;
      raycaster.setFromCamera(pointer, camera);
      const pickables = Array.from(roots.values()).filter((r) => r.visible);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !o.userData.entityId) o = o.parent;
        if (o?.userData.entityId) {
          longPressId = o.userData.entityId as string;
          longPressTimer = window.setTimeout(() => {
            if (!longPressId) return;
            longPressFired = true;
            select(longPressId, true);
            try {
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(12);
              }
            } catch {
              /* ignore */
            }
          }, 420);
        }
      }
    }
  };

  const beginBoxSelect = (ev: { clientX: number; clientY: number }) => {
    if (boxSelecting) return;
    altBoxPending = false;
    boxSelecting = true;
    const hostRect = host.getBoundingClientRect();
    boxOverlay.style.display = 'block';
    boxOverlay.style.left = `${boxStart.x - hostRect.left}px`;
    boxOverlay.style.top = `${boxStart.y - hostRect.top}px`;
    boxOverlay.style.width = '0px';
    boxOverlay.style.height = '0px';
    orbit.enabled = false;
    void ev;
  };

  const onPointerMoveBox = (ev: PointerEvent) => {
    if (altBoxPending && !boxSelecting) {
      const d = Math.hypot(ev.clientX - boxStart.x, ev.clientY - boxStart.y);
      if (d > 6) beginBoxSelect(ev);
    }
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
    orbit.enabled = !freeFly && editTool !== 'bucket';
    const hostRect = host.getBoundingClientRect();
    const x1 = Math.min(boxStart.x, ev.clientX);
    const x2 = Math.max(boxStart.x, ev.clientX);
    const y1 = Math.min(boxStart.y, ev.clientY);
    const y2 = Math.max(boxStart.y, ev.clientY);
    if (x2 - x1 < 6 && y2 - y1 < 6) return;

    const picked: string[] = [];
    const tmp = new THREE.Vector3();
    const corners = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];
    roots.forEach((root, id) => {
      if (!root.visible) return;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) {
        tmp.copy(root.position).project(camera);
        const sx = (tmp.x * 0.5 + 0.5) * hostRect.width + hostRect.left;
        const sy = (-tmp.y * 0.5 + 0.5) * hostRect.height + hostRect.top;
        if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) picked.push(id);
        return;
      }
      // Project real mesh AABB corners — selection matches the model, not just the pivot.
      corners[0].set(box.min.x, box.min.y, box.min.z);
      corners[1].set(box.min.x, box.min.y, box.max.z);
      corners[2].set(box.min.x, box.max.y, box.min.z);
      corners[3].set(box.min.x, box.max.y, box.max.z);
      corners[4].set(box.max.x, box.min.y, box.min.z);
      corners[5].set(box.max.x, box.min.y, box.max.z);
      corners[6].set(box.max.x, box.max.y, box.min.z);
      corners[7].set(box.max.x, box.max.y, box.max.z);
      let minSX = Infinity;
      let maxSX = -Infinity;
      let minSY = Infinity;
      let maxSY = -Infinity;
      for (const c of corners) {
        tmp.copy(c).project(camera);
        const sx = (tmp.x * 0.5 + 0.5) * hostRect.width + hostRect.left;
        const sy = (-tmp.y * 0.5 + 0.5) * hostRect.height + hostRect.top;
        minSX = Math.min(minSX, sx);
        maxSX = Math.max(maxSX, sx);
        minSY = Math.min(minSY, sy);
        maxSY = Math.max(maxSY, sy);
      }
      const overlaps = !(maxSX < x1 || minSX > x2 || maxSY < y1 || minSY > y2);
      if (overlaps) picked.push(id);
    });
    if (!picked.length) {
      select(null);
      return;
    }
    selectedIds = picked;
    selectedId = picked[picked.length - 1];
    attachSelectionGizmo();
    handlers.onSelect(selectedId);
    handlers.onSelectionChange?.(selectedIds);
    refreshGizmos();
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (longPressTimer != null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const wasLongPress = longPressFired;
    longPressFired = false;
    longPressId = null;

    const wasBucketPainting = bucketPainting;
    if (bucketPainting) {
      bucketPainting = false;
      lastPaintCellKey = null;
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      applyToolCameraLock();
    }
    if (freeFly) return;
    if (boxSelecting) {
      finishBoxSelect(ev);
      return;
    }
    // Short Alt+click: cancel pending box-select and continue (force-stack / normal click).
    if (altBoxPending) altBoxPending = false;
    if ((transform as unknown as { dragging: boolean }).dragging) return;

    // Texture paint: apply texture to the mesh under the pointer on release (no properties menu).
    if (editTool === 'paint' && paintTextureUrl) {
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      applyToolCameraLock();
      if (!setPointerFromClient(ev.clientX, ev.clientY)) return;
      raycaster.setFromCamera(pointer, camera);
      const pickables = Array.from(roots.values()).filter((r) => r.visible);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !o.userData.entityId) o = o.parent;
        const id = o?.userData.entityId as string | undefined;
        if (id) {
          const tex = paintTextureUrl;
          doc = {
            ...doc,
            entities: doc.entities.map((e) =>
              e.id === id
                ? {
                    ...e,
                    textureUrl: tex ?? e.textureUrl,
                    textureRepeat: paintUv.repeat,
                    textureOffset: paintUv.offset,
                    textureRotation: paintUv.rotation,
                  }
                : e
            ),
          };
          const ent = doc.entities.find((e) => e.id === id);
          const root = roots.get(id);
          if (ent && root) applyEntityTexture(root, ent);
          handlers.onDocChange(doc);
        }
      }
      return;
    }

    // Paint Bucket / Hammer++ already painted on down/move — skip click place.
    if (wasBucketPainting || editTool === 'bucket' || editTool === 'hammer') return;
    // Long-press already toggled multi-select — don't re-select on release.
    if (wasLongPress) return;
    const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
    if (dist > 5) return;

    if (!setPointerFromClient(ev.clientX, ev.clientY)) return;
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

    let hitEntityId: string | null = null;
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.entityId) o = o.parent;
      if (o?.userData.entityId) hitEntityId = o.userData.entityId as string;
    }

    // Armed entity placement: click floor (or stack on mesh) to place on surface top.
    // Default = place once then return to select. Hold Shift to keep placing.
    if (pendingPlaceKind) {
      const placedPt = pickPlacePoint(true);
      const p = placedPt?.point ?? groundHits[0]?.point;
      if (p) {
        const kind = pendingPlaceKind;
        const model = pendingPlaceModel;
        if (!ev.shiftKey) {
          setPendingPlace(null);
        }
        placeAt(p, kind, model);
        updateCursor();
        return;
      }
    }

    // Prefab stamp wins over brush paint (armed from Prefabs tab).
    if (groundHits[0] && stampEntitiesQueue?.length) {
      const stampLayer = layerMeta(activeLayerId);
      if (stampLayer?.locked) {
        handlers.onPlaceResult?.('locked', stampLayer.name);
        return;
      }
      const placedPt = pickPlacePoint(true);
      const p = placedPt?.point ?? groundHits[0].point;
      let x = p.x;
      let z = p.z;
      if (gridSnap) {
        x = snapToGrid(x, gridSize);
        z = snapToGrid(z, gridSize);
      }
      let y = surfaceYAt(x, z);
      if (snapY) {
        const snapped = snapToGrid(y, gridSize);
        y = snapped + 1e-4 < y ? snapped + gridSize : snapped;
      }
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
      handlers.onDocChange(doc);
      void Promise.all(placed.map((e) => syncEntity(e))).then(() => {
        select(placed[0]?.id ?? null);
      });
      return;
    }

    // Brush paint: place on ground / stack. Select tool never places.
    // (Hammer++ places on pointer-down via continuous paint path.)
    const placeModel = placeBrushModel();
    const canPaint =
      editTool === 'brush' && Boolean(brush) && !measureMode && !ev.shiftKey;
    if (canPaint && placeModel) {
      if (hitEntityId && !ev.altKey) {
        const ent = doc.entities.find((e) => e.id === hitEntityId);
        if (ent?.model === placeModel) {
          const placed = pickPlacePoint(true);
          if (placed) {
            let px = placed.point.x;
            let pz = placed.point.z;
            if (gridSnap) {
              px = snapToGrid(px, gridSize);
              pz = snapToGrid(pz, gridSize);
            }
            const ex = gridSnap ? snapToGrid(ent.position[0], gridSize) : ent.position[0];
            const ez = gridSnap ? snapToGrid(ent.position[2], gridSize) : ent.position[2];
            const cellTol = Math.max(0.2, gridSize * 0.45);
            const sameCell = Math.abs(px - ex) < cellTol && Math.abs(pz - ez) < cellTol;
            if (sameCell) {
              select(hitEntityId, false);
              return;
            }
            placeAt(new THREE.Vector3(px, 0, pz), 'prop', placeModel);
            return;
          }
        }
      }
      const placed = pickPlacePoint(true);
      if (placed) {
        placeAt(placed.point, 'prop', placeModel);
        return;
      }
    }

    if (hitEntityId) {
      select(hitEntityId, ev.shiftKey);
      return;
    }

    if (
      groundHits[0] &&
      editTool === 'brush' &&
      brush &&
      !measureMode
    ) {
      placeAt(groundHits[0].point, 'prop', placeBrushModel() ?? undefined);
    } else if (!ev.shiftKey) {
      select(null);
    }
  };

  const onMouseMove = (ev: MouseEvent) => {
    if (longPressTimer != null && Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressId = null;
    }
    if (
      bucketPainting &&
      (editTool === 'bucket' || editTool === 'hammer') &&
      !freeFly &&
      !measureMode
    ) {
      paintBucketAtEvent(ev);
      return;
    }
    if (altBoxPending || boxSelecting) {
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

  let ctrlAloneCandidate = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      shiftHeld = true;
      if (transform.mode === 'rotate') transform.setRotationSnap(Math.PI / 2);
    }
    keys.add(e.code);
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      if (!e.repeat) ctrlAloneCandidate = true;
    } else {
      // Any other key with Ctrl (undo/save) cancels Free Fly toggle.
      ctrlAloneCandidate = false;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      shiftHeld = false;
      transform.setRotationSnap(0);
    }
    keys.delete(e.code);
    if (
      (e.code === 'ControlLeft' || e.code === 'ControlRight') &&
      ctrlAloneCandidate
    ) {
      ctrlAloneCandidate = false;
      setFreeFly(!freeFly);
    }
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

      // Strafe relative to look: A = left, D = right
      if (keys.has('KeyW')) camera.position.addScaledVector(forward, speed);
      if (keys.has('KeyS')) camera.position.addScaledVector(forward, -speed);
      if (keys.has('KeyA')) camera.position.addScaledVector(right, speed);
      if (keys.has('KeyD')) camera.position.addScaledVector(right, -speed);
      if (keys.has('Space')) camera.position.y += speed;
      if (keys.has('KeyC') || keys.has('KeyZ')) camera.position.y -= speed;

      // Right stick: Y = forward/back along look, X = strafe (same A/D sense)
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
    // Guard: TransformControls errors if its target left the scene (rebuild/delete/resync).
    const attached = (transform as unknown as { object?: THREE.Object3D | null }).object;
    if (attached && !attached.parent) {
      transform.detach();
      attachSelectionGizmo();
    }
    director.update(dt);
    for (const outline of selectionOutlines) {
      try {
        outline.update();
      } catch {
        /* ignore */
      }
    }

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    if (viewLayout === 'single') {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, camera);
    } else if (viewLayout === 'split') {
      // Main perspective (left) + top ortho (right) — shared scene.
      renderer.setScissorTest(true);
      const half = Math.floor(w / 2);
      camera.aspect = half / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, half, h);
      renderer.setScissor(0, 0, half, h);
      renderer.render(scene, camera);
      const span = Math.max(8, orbit.target.length() + camera.position.distanceTo(orbit.target));
      topCam.left = -span;
      topCam.right = span;
      topCam.top = span * (h / Math.max(1, half));
      topCam.bottom = -span * (h / Math.max(1, half));
      topCam.position.set(orbit.target.x, orbit.target.y + 80, orbit.target.z);
      topCam.lookAt(orbit.target);
      topCam.updateProjectionMatrix();
      renderer.setViewport(half, 0, w - half, h);
      renderer.setScissor(half, 0, w - half, h);
      renderer.render(scene, topCam);
    } else {
      // Triple: perspective | top | side
      renderer.setScissorTest(true);
      const col = Math.floor(w / 3);
      camera.aspect = col / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, col, h);
      renderer.setScissor(0, 0, col, h);
      renderer.render(scene, camera);
      const span = Math.max(8, orbit.target.length() + camera.position.distanceTo(orbit.target));
      topCam.left = -span;
      topCam.right = span;
      topCam.top = span * (h / Math.max(1, col));
      topCam.bottom = -span * (h / Math.max(1, col));
      topCam.position.set(orbit.target.x, orbit.target.y + 80, orbit.target.z);
      topCam.lookAt(orbit.target);
      topCam.updateProjectionMatrix();
      renderer.setViewport(col, 0, col, h);
      renderer.setScissor(col, 0, col, h);
      renderer.render(scene, topCam);
      sideCam.left = -span;
      sideCam.right = span;
      sideCam.top = span * (h / Math.max(1, col));
      sideCam.bottom = -span * (h / Math.max(1, col));
      sideCam.position.set(orbit.target.x + 80, orbit.target.y + 8, orbit.target.z);
      sideCam.lookAt(orbit.target.x, orbit.target.y + 8, orbit.target.z);
      sideCam.updateProjectionMatrix();
      renderer.setViewport(col * 2, 0, w - col * 2, h);
      renderer.setScissor(col * 2, 0, w - col * 2, h);
      renderer.render(scene, sideCam);
    }
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
      attachSelectionGizmo();
      refreshGizmos();
      handlers.onSelect(selectedId);
      handlers.onSelectionChange?.(selectedIds);
    },
    setBrush: (m) => {
      brush = m;
      if (m) stampEntitiesQueue = null;
    },
    setPaintTexture: (url) => {
      paintTextureUrl = url;
    },
    setEditTool: (tool) => {
      // Clear armed entity placement when switching to a paint/place tool.
      // Select does NOT clear here — Select button / Esc / V call clearPendingPlace
      // so placeSpawn can leave the tool on Select while still armed.
      if (
        pendingPlaceKind &&
        (tool === 'brush' || tool === 'bucket' || tool === 'hammer' || tool === 'paint')
      ) {
        setPendingPlace(null);
      }
      editTool = tool;
      bucketPainting = false;
      lastPaintCellKey = null;
      if (tool === 'bucket') {
        if (freeFly) setFreeFly(false);
        // Prefer painting the model of the current scene selection if it has one.
        // Never steal Hammer++ into the catalog brush slot.
        if (selectedId) {
          const sel = doc.entities.find((e) => e.id === selectedId);
          if (sel?.model && sel.model !== HAMMER_SOLID_MODEL) brush = sel.model;
        }
        brush = catalogBrushOrDefault(brush);
      }
      if (tool === 'brush') {
        brush = catalogBrushOrDefault(brush);
      }
      if (tool === 'hammer') {
        if (freeFly) setFreeFly(false);
        // Do not overwrite catalog brush — Hammer++ uses its own solid model.
      }
      if (tool === 'paint') {
        if (freeFly) setFreeFly(false);
        if (!paintTextureUrl) {
          paintTextureUrl = doc.environment?.defaultTextureUrl ?? null;
        }
      }
      applyToolCameraLock();
      if (
        tool !== 'bucket' &&
        tool !== 'paint' &&
        selectedId &&
        roots.has(selectedId) &&
        !freeFly
      ) {
        const selEnt = doc.entities.find((e) => e.id === selectedId);
        if (!layerMeta(selEnt?.layerId ?? '')?.locked) {
          transform.attach(roots.get(selectedId)!);
        }
      }
    },
    getEditTool: () => editTool,
    setActiveLayerId: (id) => {
      activeLayerId = id;
    },
    setTransformMode: (mode) => {
      transform.setMode(mode);
      transform.setRotationSnap(mode === 'rotate' && shiftHeld ? Math.PI / 2 : 0);
    },
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
      if (on) {
        bucketPainting = false;
        if (editTool === 'bucket' || editTool === 'paint' || editTool === 'hammer') {
          editTool = 'select';
        }
      }
      applyToolCameraLock();
    },
    isMeasureMode: () => measureMode,
    applyEnvironment: (env) => {
      doc = { ...doc, environment: env };
      applyEnvironment(env);
      handlers.onDocChange(doc);
    },
    placeSpawn: (kind) => {
      // Click-to-place on the floor — not camera-forward dump.
      setPendingPlace(kind);
      if (editTool === 'bucket' || editTool === 'paint' || editTool === 'hammer' || editTool === 'brush') {
        editTool = 'select';
      }
      if (freeFly) setFreeFly(false);
      applyToolCameraLock();
      updateCursor();
      handlers.onPlaceResult?.(
        'ok',
        `Click once to place ${entityKindLabel(kind)} (Shift+click keeps placing)`
      );
    },
    placeEntity: (kind, model) => {
      // Player avatar is platform settings — never arm map placement.
      if (isPlatformPlayerKind(kind)) {
        handlers.onPlaceResult?.(
          'ok',
          'Player Model is platform settings — open Player Model from the top bar'
        );
        return;
      }
      setPendingPlace(kind, model);
      if (editTool === 'bucket' || editTool === 'paint' || editTool === 'hammer' || editTool === 'brush') {
        editTool = 'select';
      }
      if (freeFly) setFreeFly(false);
      applyToolCameraLock();
      updateCursor();
      handlers.onPlaceResult?.(
        'ok',
        `Click once to place ${entityKindLabel(kind)} (Shift+click keeps placing)`
      );
    },
    armPlaceKind: (kind, model) => {
      if (isPlatformPlayerKind(kind)) return;
      setPendingPlace(kind, model);
      if (editTool === 'bucket' || editTool === 'paint' || editTool === 'hammer' || editTool === 'brush') {
        editTool = 'select';
      }
      if (freeFly) setFreeFly(false);
      applyToolCameraLock();
      updateCursor();
    },
    getPendingPlaceKind: () => pendingPlaceKind,
    clearPendingPlace: () => {
      setPendingPlace(null);
      updateCursor();
    },
    stampEntities: (entities) => {
      stampEntitiesQueue = entities;
      // Keep brush model armed; stamp is handled before paint on click.
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
      handlers.onDocChange(doc);
      void Promise.all(copies.map((c) => syncEntity(c))).then(() => {
        selectedIds = copies.map((c) => c.id);
        selectedId = selectedIds[0] ?? null;
        if (selectedId && roots.has(selectedId) && !freeFly) {
          const selEnt = doc.entities.find((e) => e.id === selectedId);
          const locked = selEnt ? Boolean(layerMeta(selEnt.layerId)?.locked) : false;
          if (!locked) transform.attach(roots.get(selectedId)!);
          else transform.detach();
        }
        refreshGizmos();
        handlers.onSelect(selectedId);
        handlers.onSelectionChange?.(selectedIds);
      });
    },
    snapSelectedTogether: (idsOverride) => {
      // Prefer ids passed from UI (Shift-multi select), fall back to viewport selection.
      const raw =
        idsOverride && idsOverride.length >= 2
          ? idsOverride
          : selectedIds.length >= 2
            ? selectedIds
            : selectedId
              ? [selectedId]
              : [];
      const ids = Array.from(new Set(raw.filter(Boolean)));
      if (ids.length < 2) return false;

      const ents = ids
        .map((id) => doc.entities.find((e) => e.id === id))
        .filter((e): e is EditorEntity => !!e);
      if (ents.length < 2) return false;
      if (ents.some((e) => layerMeta(e.layerId)?.locked)) {
        handlers.onPlaceResult?.('locked', 'selection');
        return false;
      }

      /** Real world AABB half-extents + center + pivot offset. */
      const measure = (e: EditorEntity) => {
        const root = roots.get(e.id);
        if (root) {
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          if (!box.isEmpty()) {
            return {
              hx: Math.max(0.05, (box.max.x - box.min.x) / 2),
              hy: Math.max(0.05, (box.max.y - box.min.y) / 2),
              hz: Math.max(0.05, (box.max.z - box.min.z) / 2),
              cx: (box.min.x + box.max.x) / 2,
              cy: (box.min.y + box.max.y) / 2,
              cz: (box.min.z + box.max.z) / 2,
              ox: (box.min.x + box.max.x) / 2 - root.position.x,
              oy: (box.min.y + box.max.y) / 2 - root.position.y,
              oz: (box.min.z + box.max.z) / 2 - root.position.z,
            };
          }
        }
        const hx = Math.max(0.5, Math.abs(e.scale[0]));
        const hy = Math.max(0.15, Math.abs(e.scale[1]));
        const hz = Math.max(0.5, Math.abs(e.scale[2]));
        return {
          hx,
          hy,
          hz,
          cx: e.position[0],
          cy: e.position[1],
          cz: e.position[2],
          ox: 0,
          oy: 0,
          oz: 0,
        };
      };

      type Meas = ReturnType<typeof measure>;

      /** Snap moving AABB onto the closest face of the anchor AABB. */
      const snapToClosestFace = (anchor: Meas, moving: Meas) => {
        type Cand = { cx: number; cy: number; cz: number; dist: number };
        const cands: Cand[] = [
          // +X of anchor (moving sits to the right)
          {
            cx: anchor.cx + anchor.hx + moving.hx,
            cy: moving.cy,
            cz: moving.cz,
            dist: Math.abs(moving.cx - moving.hx - (anchor.cx + anchor.hx)),
          },
          // -X of anchor
          {
            cx: anchor.cx - anchor.hx - moving.hx,
            cy: moving.cy,
            cz: moving.cz,
            dist: Math.abs(anchor.cx - anchor.hx - (moving.cx + moving.hx)),
          },
          // +Y (stack on top) — keep XZ so arches stay aligned above
          {
            cx: moving.cx,
            cy: anchor.cy + anchor.hy + moving.hy,
            cz: moving.cz,
            dist: Math.abs(moving.cy - moving.hy - (anchor.cy + anchor.hy)),
          },
          // -Y (below)
          {
            cx: moving.cx,
            cy: anchor.cy - anchor.hy - moving.hy,
            cz: moving.cz,
            dist: Math.abs(anchor.cy - anchor.hy - (moving.cy + moving.hy)),
          },
          // +Z
          {
            cx: moving.cx,
            cy: moving.cy,
            cz: anchor.cz + anchor.hz + moving.hz,
            dist: Math.abs(moving.cz - moving.hz - (anchor.cz + anchor.hz)),
          },
          // -Z
          {
            cx: moving.cx,
            cy: moving.cy,
            cz: anchor.cz - anchor.hz - moving.hz,
            dist: Math.abs(anchor.cz - anchor.hz - (moving.cz + moving.hz)),
          },
        ];
        cands.sort((a, b) => a.dist - b.dist);
        return cands[0];
      };

      const anchor = ents[0];
      const aM = measure(anchor);
      const updates = new Map<string, [number, number, number]>();

      // Anchor stays put
      {
        const root = roots.get(anchor.id);
        updates.set(anchor.id, [
          root?.position.x ?? anchor.position[0],
          root?.position.y ?? anchor.position[1],
          root?.position.z ?? anchor.position[2],
        ]);
      }

      // Each other selection snaps to the closest face of the nearest already-placed piece
      // (anchor first, then previously snapped), so stacking / side joins follow proximity.
      const placed: Meas[] = [aM];

      for (let i = 1; i < ents.length; i++) {
        const e = ents[i];
        const m = measure(e);
        let best: { cx: number; cy: number; cz: number; dist: number } | null = null;
        for (const p of placed) {
          const cand = snapToClosestFace(p, m);
          if (!best || cand.dist < best.dist) best = cand;
        }
        if (!best) continue;
        const pos: [number, number, number] = [
          best.cx - m.ox,
          best.cy - m.oy,
          best.cz - m.oz,
        ];
        updates.set(e.id, pos);
        placed.push({
          ...m,
          cx: best.cx,
          cy: best.cy,
          cz: best.cz,
        });
      }

      // Keep selection order in viewport for further snaps
      selectedIds = ids;
      selectedId = ids[ids.length - 1] ?? null;

      doc = {
        ...doc,
        entities: doc.entities.map((e) => {
          const pos = updates.get(e.id);
          return pos ? { ...e, position: pos } : e;
        }),
      };
      for (const [id, pos] of updates) {
        const root = roots.get(id);
        if (root) root.position.set(pos[0], pos[1], pos[2]);
      }
      handlers.onDocChange(doc);
      attachSelectionGizmo();
      refreshGizmos();
      handlers.onSelectionChange?.(selectedIds);
      return true;
    },
    snapSelectedToFloor: (idsOverride) => {
      const ids =
        idsOverride && idsOverride.length
          ? idsOverride
          : selectedIds.length
            ? selectedIds
            : selectedId
              ? [selectedId]
              : [];
      if (!ids.length) return false;
      const updates = new Map<string, [number, number, number]>();
      for (const id of ids) {
        const e = doc.entities.find((x) => x.id === id);
        if (!e) continue;
        if (layerMeta(e.layerId)?.locked) continue;
        const y = Math.max(0, surfaceYAt(e.position[0], e.position[2], id));
        updates.set(id, [e.position[0], y, e.position[2]]);
      }
      if (!updates.size) return false;
      doc = {
        ...doc,
        entities: doc.entities.map((e) => {
          const pos = updates.get(e.id);
          return pos ? { ...e, position: pos } : e;
        }),
      };
      for (const [id, pos] of updates) {
        const root = roots.get(id);
        if (root) root.position.set(pos[0], pos[1], pos[2]);
      }
      handlers.onDocChange(doc);
      attachSelectionGizmo();
      refreshGizmos();
      return true;
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
      const lockedHit = ids
        .map((id) => doc.entities.find((e) => e.id === id))
        .find((e) => e && layerMeta(e.layerId)?.locked);
      if (lockedHit) {
        handlers.onPlaceResult?.(
          'locked',
          layerMeta(lockedHit.layerId)?.name
        );
        return;
      }
      doc = { ...doc, entities: doc.entities.filter((e) => !ids.includes(e.id)) };
      transform.detach();
      ids.forEach((id) => disposeRoot(id));
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
      const hammerGeomChanged =
        (patch.collisionSize !== undefined || patch.primitive !== undefined) &&
        Boolean(
          prev &&
            (prev.primitive === 'box' ||
              prev.model === HAMMER_SOLID_MODEL ||
              patch.primitive === 'box' ||
              patch.model === HAMMER_SOLID_MODEL)
        );
      if (modelChanged || kindChanged || hammerGeomChanged) {
        transform.detach();
        disposeRoot(id);
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
          attachSelectionGizmo();
          handlers.onDocChange(doc);
        })();
      } else {
        const ent = doc.entities.find((e) => e.id === id);
        if (ent) {
          void syncEntity(ent).then(() => attachSelectionGizmo());
        }
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
    setViewLayout: (layout) => {
      viewLayout = layout;
      setSize();
    },
    getViewLayout: () => viewLayout,
    setCameraPreset: (preset) => {
      const t = orbit.target.clone();
      if (preset === 'top') {
        camera.position.set(t.x, t.y + 40, t.z + 0.01);
        camera.up.set(0, 0, -1);
        camera.lookAt(t);
        freeFly = false;
        handlers.onFreeFlyChange?.(false);
        applyToolCameraLock();
      } else if (preset === 'front') {
        camera.up.set(0, 1, 0);
        camera.position.set(t.x, t.y + 6, t.z + 36);
        camera.lookAt(t);
      } else if (preset === 'side') {
        camera.up.set(0, 1, 0);
        camera.position.set(t.x + 36, t.y + 6, t.z);
        camera.lookAt(t);
      } else {
        camera.up.set(0, 1, 0);
        camera.position.copy(DEFAULT_CAM_POS);
        orbit.target.copy(DEFAULT_CAM_TARGET);
        camera.lookAt(orbit.target);
      }
      orbit.update();
    },
    setPaintUv: (uv: {
      repeat?: [number, number];
      offset?: [number, number];
      rotation?: number;
    }) => {
      if (uv.repeat) paintUv.repeat = uv.repeat;
      if (uv.offset) paintUv.offset = uv.offset;
      if (typeof uv.rotation === 'number') paintUv.rotation = uv.rotation;
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
