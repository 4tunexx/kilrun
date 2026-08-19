'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createBloomComposer } from '../renderer/bloom-composer';
import type { EditorEntity, EditorLayer, MapDocument, MapEnvironment } from './map-document';
import { scrubDanglingReferences } from './map-document';
import {
  DEFAULT_ENVIRONMENT,
  HAMMER_SOLID_MODEL,
  cloneEntity,
  defaultAnimation,
  defaultHazard,
  defaultHealthFloor,
  defaultJumpPad,
  defaultLight,
  defaultMonsterSpawn,
  defaultPushBlock,
  defaultPushRail,
  defaultRedZone,
  defaultRevive,
  defaultSpinHazard,
  defaultWaveAnchor,
  ensureLight,
  entityExportsAsPlatform,
  entityKindLabel,
  generateId,
  isHammerSolidEntity as isHammerSolidEntityDoc,
  isInvisibleMarkerKind,
  isPlatformPlayerKind,
  isEntityEditLocked,
  snapToGrid,
  snapScaleToGrid,
  snapPoseToGridEdges,
  entityWorldSize,
  yawAlignedSize,
  scaleFromSideOffset,
  ensureEnvironment,
  ensureSpinHazard,
} from './map-document';
import { bakeMeshCollisionForEntity, meshCollisionBakeKeyFor, stripMeshCollisionIfModelChanged } from './mesh-voxelize';
import {
  applySelectionTransformOp,
  nearestObbFaceAttach,
  nearestPointSnap,
  obbCorners,
  obbEdgeMidpoints,
  type SelectionTransformOp,
  type SnapObb,
} from './selection-transform';
import { PLAYER_RADIUS } from '@shared/sim-constants';
import { getLastPrefabScale, setLastPrefabScale } from './prefab-defaults';
import {
  applyTextureToObject,
  makeBoundsWireBox,
  makeSelectionOutline,
  plantLocalFeet,
  resolveEntityTextureRepeat,
  worldScaleToUvRepeat,
  disposeClonedMaterials,
  disposeOwnedGeometry,
  markOwnsGpuResources,
} from './editor-mesh';
import { applyEntityOpacity, applyEntityColor, applyEntityGlow, tickEntityGlow, tickSpinHazardVisual, MAP_SKY_COLORS, makeGameplayFallback } from './map-scene-visuals';
import {
  entityStructureFingerprint,
  entityVisualFingerprint,
} from './engine/entity-fingerprint';
import {
  defaultSizeForHammer,
  hollowHammerCollisionPads,
  isHammerPrimitive,
  loadStickyHammerShape,
  makeHammerSolidObject,
  type HammerPrimitive,
} from './hammer-shapes';

/** Editor-only rendering shortcuts — never written into MapDocument.environment. */
export type EditorPerfMode = {
  /** Hide floor plane + void floor disc. */
  hideFloor: boolean;
  /** Skip equirect sky texture (use solid sky color). */
  hideSkyTexture: boolean;
  /** Hide void shadow halo planes. */
  hideVoidEffects: boolean;
  /** Disable scene fog in the editor viewport. */
  hideFog: boolean;
  /**
   * Skip the bloom composer and draw the scene directly. Bloom costs two full
   * scene traversals plus two full renders per drawn frame, so this is the
   * single biggest saving available on a heavy map.
   */
  disableBloom: boolean;
  /** Render at 1 device pixel per CSS pixel — quarters the fragment work on a 2x display. */
  capPixelRatio: boolean;
  /**
   * Stop rebuilding collision wireframes. The gizmo group is rebuilt for the
   * WHOLE document on every refresh, so on a large map this dominates edit
   * latency even though the wires are only a building aid.
   */
  skipCollisionGizmos: boolean;
};

/** What a finished translate drag clicks the selection onto. */
export type SnapTarget = 'off' | 'face' | 'vertex' | 'edge';

/**
 * Which point a multi-selection rotates and scales about.
 *
 * - `median`: average of the objects' own origins.
 * - `bounds`: center of the selection's bounding box, so a lopsided selection
 *   turns about its visual middle rather than being pulled toward whichever
 *   cluster happens to have more pieces in it.
 * - `active`: the origin of the last-clicked object.
 */
export type PivotMode = 'median' | 'bounds' | 'active';

/** Gizmo axis frame: world axes, or the active object's own axes. */
export type TransformSpace = 'world' | 'local';

export const DEFAULT_EDITOR_PERF_MODE: EditorPerfMode = {
  hideFloor: false,
  hideSkyTexture: false,
  hideVoidEffects: false,
  hideFog: false,
  disableBloom: false,
  capPixelRatio: false,
  skipCollisionGizmos: false,
};

/** One-click preset for maps that stall the editor (hundreds of solids / lights). */
export const LARGE_MAP_EDITOR_PERF_MODE: EditorPerfMode = {
  hideFloor: false,
  hideSkyTexture: true,
  hideVoidEffects: true,
  hideFog: true,
  disableBloom: true,
  capPixelRatio: true,
  skipCollisionGizmos: true,
};
function makeLightBulb(ent: EditorEntity): THREE.Group {
  const lightCfg = ensureLight(ent);
  const group = new THREE.Group();
  group.name = 'light-bulb';
  const type = lightCfg.type ?? 'point';
  const bulb = new THREE.Mesh(
    type === 'beam'
      ? new THREE.CylinderGeometry(0.08, 0.14, 0.35, 10)
      : new THREE.SphereGeometry(0.18, 16, 12),
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

  let light: THREE.Light;
  if (type === 'spot' || type === 'flashlight' || type === 'beam') {
    const angle = THREE.MathUtils.degToRad(lightCfg.angleDeg ?? (type === 'beam' ? 12 : 40));
    const spot = new THREE.SpotLight(
      new THREE.Color(lightCfg.color),
      lightCfg.intensity,
      lightCfg.beamLength ?? lightCfg.distance,
      angle,
      lightCfg.penumbra ?? 0.35,
      1.5
    );
    spot.castShadow = !!lightCfg.castShadow;
    spot.userData.isEntityLight = true;
    spot.userData.lightType = type;
    const target = new THREE.Object3D();
    const pitch = THREE.MathUtils.degToRad(lightCfg.pitchDeg ?? (type === 'flashlight' ? -8 : -25));
    target.position.set(0, Math.sin(pitch) * 4, Math.cos(pitch) * 4);
    group.add(target);
    spot.target = target;
    light = spot;
  } else {
    const point = new THREE.PointLight(
      new THREE.Color(lightCfg.color),
      lightCfg.intensity,
      lightCfg.distance,
      2
    );
    point.castShadow = !!lightCfg.castShadow;
    point.userData.isEntityLight = true;
    point.userData.lightType = 'point';
    light = point;
  }

  group.add(bulb);
  group.add(stem);
  group.add(light);
  return group;
}

function syncLightParams(root: THREE.Object3D, ent: EditorEntity) {
  const cfg = ensureLight(ent);
  const type = cfg.type ?? 'point';
  // Rebuild if light class no longer matches (point ↔ spot).
  let hasSpot = false;
  let hasPoint = false;
  root.traverse((o) => {
    if (o instanceof THREE.SpotLight && o.userData.isEntityLight) hasSpot = true;
    if (o instanceof THREE.PointLight && o.userData.isEntityLight) hasPoint = true;
  });
  const wantsSpot = type === 'spot' || type === 'flashlight' || type === 'beam';
  if ((wantsSpot && !hasSpot) || (!wantsSpot && !hasPoint)) {
    // Caller should remesh; update what we can in place.
  }
  root.traverse((o) => {
    if (o instanceof THREE.SpotLight && o.userData.isEntityLight) {
      o.color.set(cfg.color);
      o.intensity = cfg.intensity;
      o.distance = cfg.beamLength ?? cfg.distance;
      o.angle = THREE.MathUtils.degToRad(cfg.angleDeg ?? 40);
      o.penumbra = cfg.penumbra ?? 0.35;
      o.castShadow = !!cfg.castShadow;
    }
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
  /** Sticky Hammer++ shape — used for every place until changed. */
  setHammerShape: (shape: HammerPrimitive) => void;
  getHammerShape: () => HammerPrimitive;
  setActiveLayerId: (id: string) => void;
  setTransformMode: (mode: TransformMode) => void;
  setGridSnap: (on: boolean) => void;
  setGridSize: (n: number) => void;
  setSnapY: (on: boolean) => void;
  /** What a finished translate drag clicks onto: nothing, faces, vertices, or edges. */
  setSnapTarget: (target: SnapTarget) => void;
  getSnapTarget: () => SnapTarget;
  setPivotMode: (mode: PivotMode) => void;
  getPivotMode: () => PivotMode;
  /** Gizmo axis frame. TransformControls defaults to world and never switched before. */
  setTransformSpace: (space: TransformSpace) => void;
  getTransformSpace: () => TransformSpace;
  /** When true, scale gizmo grows/shrinks from the pulled side (opposite face fixed). */
  setScaleFromSide: (on: boolean) => void;
  getScaleFromSide: () => boolean;
  setFreeFly: (on: boolean) => void;
  isFreeFly: () => boolean;
  setShowAllCollisionGizmos: (on: boolean) => void;
  getShowAllCollisionGizmos: () => boolean;
  setMeasureMode: (on: boolean) => void;
  isMeasureMode: () => boolean;
  applyEnvironment: (env: MapEnvironment) => void;
  /** Editor-only visual toggles (not saved to the map — Play Test / live keep full effects). */
  setEditorPerfMode: (opts: Partial<EditorPerfMode>) => void;
  getEditorPerfMode: () => EditorPerfMode;
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
  /**
   * Snap every non-anchor selected object onto an EXPLICIT face of the anchor
   * (first-selected item), instead of auto-guessing the closest face. `face`
   * picks which side of the anchor the rest of the selection is glued to —
   * e.g. '+x' = to the right, '-y' = underneath / hanging below, '+y' =
   * stacked on top. Centers the two non-chosen axes so pieces line up
   * face-to-face cleanly (side-to-side, top-to-top).
   */
  snapSelectedToFace: (
    face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z',
    idsOverride?: string[],
    /**
     * `alignRotation` turns each moved piece to the anchor's orientation before
     * placing it, so a piece lands parallel to the anchor face instead of merely
     * touching it at whatever angle it happened to be sitting.
     */
    opts?: { alignRotation?: boolean }
  ) => boolean;
  /** Drop selection onto the floor / supporting surface under each pivot. */
  snapSelectedToFloor: (idsOverride?: string[]) => boolean;
  /** Click the current selection flush onto the nearest neighbor face (if close). */
  snapSelectionToNearestNeighbor: () => boolean;
  /** Rotate / flip the current selection (and groups) around its pivot. */
  transformSelection: (op: SelectionTransformOp) => boolean;
  /**
   * "Bake mesh collision" for a catalog/library prop — voxel-approximates
   * its real mesh into a compact box list (mesh-voxelize.ts) so a concave
   * shape (an arch, a curved wall) doesn't collide as one solid bounding
   * box. Async since it (re)loads the model's geometry.
   */
  bakeMeshCollision: (id: string) => Promise<{ ok: true; boxCount: number } | { ok: false; error: string }>;
  /** Clears a previous mesh-collision bake, reverting to the default box collider. */
  clearMeshCollision: (id: string) => void;
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
  /** Freeze the selected (or given) entity's animation in the editor viewport — does not touch the map document. */
  stopEntityAnim: (entityId?: string) => void;
  /** Resume normal trigger-driven animation for one entity after stopEntityAnim(). */
  resumeEntityAnim: (entityId?: string) => void;
  /** Freeze every animated entity in the editor viewport at once. */
  stopAllAnim: () => void;
  /** Resume every entity frozen by stopAllAnim() / stopEntityAnim(). */
  resumeAllAnim: () => void;
  isAllAnimStopped: () => boolean;
  isEntityAnimStopped: (entityId: string) => boolean;
  captureThumbnail: () => string | null;
  setTouchAxes: (axes: { moveX: number; moveY: number; lookX: number; lookY: number; sprint?: boolean }) => void;
  setViewLayout: (layout: EditorViewLayout) => void;
  getViewLayout: () => EditorViewLayout;
  /** Snap perspective camera to top / front / side / perspective. */
  setCameraPreset: (preset: 'perspective' | 'top' | 'front' | 'side') => void;
  setPaintUv: (uv: {
    worldScale?: number;
    repeat?: [number, number];
    offset?: [number, number];
    rotation?: number;
  }) => void;
  /** Read back the last texture+UV copied via Paint Tool RMB, or null. */
  getCopiedTexture: () => {
    textureUrl: string | null;
    worldScale: number;
    repeat: [number, number];
    offset: [number, number];
    rotation: number;
    sourceName?: string;
  } | null;
  /** Clear the copied paint state so LMB clicks revert to the brush default. */
  clearCopiedTexture: () => void;
  destroy: () => void;
}

const SKY_COLORS = MAP_SKY_COLORS;

export function createEditorViewport(
  host: HTMLElement,
  initial: MapDocument,
  handlers: {
    onSelect: (id: string | null) => void;
    onSelectionChange?: (ids: string[]) => void;
    /**
     * `transient` marks an intermediate state that will be superseded within
     * milliseconds — every frame of a gizmo drag. The consumer may skip its
     * expensive work (React re-render) for those and wait for the settled call
     * that always follows when the drag ends.
     */
    onDocChange: (doc: MapDocument, opts?: { transient?: boolean }) => void;
    onFreeFlyChange?: (on: boolean) => void;
    onMeasureChange?: (distance: number | null) => void;
    /** Fired when place is blocked (locked layer) or placed onto a hidden layer. */
    onPlaceResult?: (result: 'locked' | 'ok' | 'hidden-layer', layerName?: string) => void;
    /** Fired right after a new entity is created and added to the doc. */
    onEntityPlaced?: (entity: EditorEntity) => void;
    /** Fired when click-to-place arming changes (Select / Escape / after place). */
    onPendingPlaceChange?: (kind: EditorEntity['kind'] | null) => void;
    /** Fired when a double-tap/double-click lands on a locked entity (open its props panel). */
    onLockedEntityDoubleTap?: (id: string) => void;
    /** Fired in Paint texture tool: RMB on any solid copies its texture+UV. */
    onCopiedTexture?: (info: {
      textureUrl: string | null;
      worldScale: number;
      repeat: [number, number];
      offset: [number, number];
      rotation: number;
      sourceName?: string;
    }) => void;
  }
): EditorViewportApi {
  let doc: MapDocument = structuredClone(initial);
  if (!doc.environment) doc.environment = { ...DEFAULT_ENVIRONMENT };
  // Bumped on every setDoc() (undo/redo, reopening a map, etc). syncEntity
  // captures this before its `await loadModel(...)` and re-checks after —
  // without it, a slow GLB load from a superseded setDoc() could still land:
  // its root gets added to the scene and orphaned (never disposed, since a
  // newer rebuildAll's dispose pass already ran before this call started),
  // and its collisionSize/animation patch gets spliced into whatever `doc`
  // is CURRENT by the time it resolves — not the doc this call started with.
  let docGeneration = 0;
  let selectedId: string | null = null;
  let selectedIds: string[] = [];
  let brush: string | null = 'floor-square';
  /** Active texture URL for the Paint tool (applies on pointer release). */
  let paintTextureUrl: string | null = null;
  /** Select = pick; Brush = single click place; Bucket = hold-drag continuous paint; Paint = texture on release. */
  let editTool: EditTool = 'select';
  /** Sticky Hammer++ primitive — persists across places until the author changes it. */
  let hammerShape: HammerPrimitive = loadStickyHammerShape();
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
  /** What a finished translate drag clicks onto. */
  let snapTarget: SnapTarget = 'face';
  /** Which point rotate/scale of a multi-selection turns about. */
  let pivotMode: PivotMode = 'median';
  let transformSpace: TransformSpace = 'world';
  /** Scale from pulled side (opposite face fixed) instead of both ways from center. */
  let scaleFromSide = true;
  /**
   * Which local-axis side (+1/-1) was actually grabbed when the current scale
   * drag started. Three.js's scale gizmo reports the same `axis` ('X'/'Y'/'Z')
   * no matter which end handle you grab, and grows/shrinks symmetrically from
   * center either way — so the side to keep fixed can't be inferred from the
   * scale delta's sign (that only says grow vs shrink, not which handle).
   * Captured once at drag start from the grab point so shrinking the same
   * handle you grew doesn't flip which face is anchored.
   */
  let scaleGrabSign: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 };
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
  /** UV / world-scale defaults applied with the texture paint brush. */
  const paintUv = {
    /** World units per texture tile — same density on any object size. */
    worldScale: 1,
    repeat: [2, 2] as [number, number],
    offset: [0, 0] as [number, number],
    rotation: 0,
  };
  /**
   * Last texture+UV package COPIED via Paint Tool RMB-click on any solid.
   * When set, LMB paint clicks use these EXACT values instead of re-deriving
   * world-scale from the paint brush slider. That means the copied texture
   * will tile exactly as many times, with the same offset + rotation as it
   * did on the source wall, ensuring cross-wall alignment / seamlessness.
   */
  let copiedTexture:
    | {
        textureUrl: string | null;
        worldScale: number;
        repeat: [number, number];
        offset: [number, number];
        rotation: number;
        sourceName?: string;
      }
    | null = null;
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
  /** Double-tap on locked entity detection: track last tap time + entity id. */
  let lastTapTime = 0;
  let lastTapId: string | null = null;
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
  // Match Play Test's color pipeline (map-play-preview.tsx) so prefabs don't
  // look flatter/duller in the editor than they do in-game.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    cursor: 'default',
  });

  /**
   * On-demand rendering.
   *
   * The viewport used to redraw unconditionally every frame, which in `single`
   * layout means two full scene traversals plus two full renders through the
   * bloom composer whether or not anything moved — an idle editor sitting on a
   * large map burned a GPU for nothing.
   *
   * `requestRender` marks the view dirty for a short window rather than a single
   * frame. The window matters: model loads, texture decodes and orbit damping
   * all settle asynchronously after the interaction that triggered them, and a
   * one-frame flag would leave those results undrawn until the next input.
   */
  const RENDER_HOLD_MS = 300;
  let renderDeadlineMs = performance.now() + RENDER_HOLD_MS;
  const requestRender = (holdMs = RENDER_HOLD_MS) => {
    const until = performance.now() + holdMs;
    if (until > renderDeadlineMs) renderDeadlineMs = until;
  };

  /**
   * Entities with a live glow pulse or spin, maintained on sync instead of
   * rediscovered by scanning every entity each frame. Doubles as the signal for
   * whether the viewport must keep drawing while otherwise idle.
   *
   * Holds the entity itself so the frame loop needs no lookup; `syncEntity` runs
   * for any entity whose data changed, which is exactly when the stored
   * reference would otherwise go stale.
   */
  const animatedEntities = new Map<string, EditorEntity>();
  const entityIsAnimated = (ent: EditorEntity): boolean => {
    if (ent.glow?.enabled && ent.glow.pulse && ent.glow.pulse !== 'none') return true;
    if (ent.kind !== 'spinner' && !ent.spinHazard?.enabled) return false;
    const spin = ensureSpinHazard(ent);
    return spin.enabled !== false && Math.abs(spin.speed) >= 1e-6;
  };
  const trackAnimatedEntity = (ent: EditorEntity) => {
    if (entityIsAnimated(ent)) animatedEntities.set(ent.id, ent);
    else animatedEntities.delete(ent.id);
  };

  /**
   * Fingerprint of the last completed `syncEntity` per entity id, keyed by
   * `entitySyncKey`. A present entry means the scene already reflects exactly
   * that content, so `syncDoc` can skip it; anything that tears a root down or
   * starts a sync clears the entry first.
   */
  const syncedKeys = new Map<string, { key: string; structure: string }>();
  /** World AABBs for place-on-surface — avoids `Box3.setFromObject` on every click. */
  const worldBoxes = new Map<string, THREE.Box3>();
  let envLoadGen = 0;

  const gizmoMatSolid = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
  });
  const gizmoMatJump = gizmoMatSolid.clone();
  gizmoMatJump.color.setHex(0x38bdf8);
  const gizmoMatHazard = gizmoMatSolid.clone();
  gizmoMatHazard.color.setHex(0xff2244);
  const gizmoMatAnim = new THREE.LineBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.85,
  });
  const gizmoCache = new Map<string, { key: string; objects: THREE.Object3D[] }>();
  const animWireGroup = new THREE.Group();
  animWireGroup.name = '__anim_wires';

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
  sun.position.set(20, 30, 10);
  scene.add(sun);
  const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x334455, 0.45);
  scene.add(hemiLight);
  const bloom = createBloomComposer(renderer, scene, camera);
  let skyTexture: THREE.Texture | null = null;
  let editorPerf: EditorPerfMode = { ...DEFAULT_EDITOR_PERF_MODE };

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

  function makeVoidShadowTexture(): THREE.CanvasTexture {
    const size = 512;
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d')!;
    const grd = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.02,
      size / 2,
      size / 2,
      size * 0.5
    );
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }
  const voidShadowTex = makeVoidShadowTexture();
  const voidShadowMat = new THREE.MeshBasicMaterial({
    color: 0x65ffa9,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: voidShadowTex,
  });
  const voidShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), voidShadowMat);
  voidShadowMesh.rotation.x = -Math.PI / 2;
  voidShadowMesh.position.y = -0.012;
  voidShadowMesh.renderOrder = 1;
  voidShadowMesh.visible = false;
  scene.add(voidShadowMesh);

  // Second slightly-smaller inner halo for a two-stage glow.
  const voidShadowInnerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: voidShadowTex,
  });
  const voidShadowInner = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    voidShadowInnerMat
  );
  voidShadowInner.rotation.x = -Math.PI / 2;
  voidShadowInner.position.y = -0.008;
  voidShadowInner.renderOrder = 2;
  voidShadowInner.visible = false;
  scene.add(voidShadowInner);

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
  scene.add(animWireGroup);
  const measureGroup = new THREE.Group();
  scene.add(measureGroup);

  function applyEnvironment(env: MapEnvironment) {
    const skyHex = env.sky === 'custom' ? env.skyColor : SKY_COLORS[env.sky] ?? env.skyColor;
    const isVoid = env.floor === 'void';
    const perf = editorPerf;
    const loadGen = ++envLoadGen;

    // Void maps: use VOID-SPECIFIC fog override (density & color) so the abyss
    // looks like Minecraft-style glowing-green shadow fog instead of the regular
    // map fog. Falls back to global fog settings when the void overrides are
    // not explicitly set.
    const effectiveFogColor =
      isVoid && env.voidFogColor
        ? env.voidFogColor
        : env.fogColor || env.horizonColor || skyHex;
    const effectiveFogDensity =
      isVoid && env.voidFogDensity != null ? env.voidFogDensity : env.fogDensity ?? 0.022;
    // Void maps also tint the sky towards the void color so the horizon doesn't
    // look mismatched with the glowing abyss below.
    const effectiveSky =
      isVoid && env.voidColor && !env.skyTextureUrl
        ? env.voidColor
        : skyHex;

    if (skyTexture) {
      skyTexture.dispose();
      skyTexture = null;
    }

    if (!perf.hideSkyTexture && env.skyTextureUrl) {
      new THREE.TextureLoader().load(
        env.skyTextureUrl,
        (tex) => {
          if (loadGen !== envLoadGen) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.mapping = THREE.EquirectangularReflectionMapping;
          skyTexture = tex;
          scene.background = tex;
          scene.environment = tex;
          requestRender();
        },
        undefined,
        () => {
          if (loadGen !== envLoadGen) return;
          scene.background = new THREE.Color(effectiveSky);
          scene.environment = null;
          requestRender();
        }
      );
    } else {
      scene.background = new THREE.Color(effectiveSky);
      scene.environment = null;
    }

    if (perf.hideFog) {
      scene.fog = null;
    } else {
      const fogDensity = Number.isFinite(effectiveFogDensity)
        ? Math.max(0, Math.min(0.2, effectiveFogDensity))
        : 0.022;
      scene.fog = new THREE.FogExp2(effectiveFogColor, fogDensity);
    }
    grid.visible = env.gridVisible ?? true;

    const legacyVoidTint = Boolean(env.voidColor);
    const voidFloorColor = env.voidFloorColor ?? env.voidColor ?? '#050810';
    const voidFloorOpacity = env.voidFloorOpacity ?? (legacyVoidTint ? 0.92 : 1);
    const showVoidFloor =
      isVoid &&
      (env.voidFloorColor != null || env.voidColor != null || voidFloorOpacity > 0.01);
    floorMesh.visible = !perf.hideFloor && (!isVoid || showVoidFloor);
    const mat = floorMesh.material as THREE.MeshStandardMaterial;
    if (env.floor === 'water') {
      mat.color.set('#0e4a6e');
      mat.transparent = true;
      mat.opacity = 0.75;
      mat.metalness = 0.4;
      mat.roughness = 0.2;
    } else if (isVoid && showVoidFloor) {
      mat.color.set(voidFloorColor);
      mat.transparent = voidFloorOpacity < 0.999;
      mat.opacity = Math.max(0, Math.min(1, voidFloorOpacity));
      mat.metalness = 0.08;
      mat.roughness = 0.95;
    } else if (isVoid) {
      // Pure void (no tint) — keep material benign so scene state stays sane.
      mat.color.set('#000000');
      mat.transparent = true;
      mat.opacity = 0;
      mat.metalness = 0;
      mat.roughness = 1;
    } else {
      mat.color.set(env.floorColor || '#1a2740');
      mat.transparent = false;
      mat.opacity = 1;
      mat.metalness = 0;
      mat.roughness = 1;
    }

    // Void shadow / glowing fog halo (the "green fog falling down" look).
    const shadowIntensity =
      !perf.hideVoidEffects && isVoid
        ? Math.max(0, Math.min(2, env.voidShadowIntensity ?? 0))
        : 0;
    voidShadowMesh.visible = shadowIntensity > 0;
    voidShadowInner.visible = shadowIntensity > 0;
    if (shadowIntensity > 0) {
      const shadowColor = env.voidShadowColor ?? env.voidFogColor ?? voidFloorColor ?? '#65ffa9';
      voidShadowMat.color.set(shadowColor);
      voidShadowMat.opacity = 0.9 * shadowIntensity;
      // Inner halo uses a slightly brighter shade of the shadow color — makes
      // the glow feel more volumetric right under the platforms.
      const brighter = new THREE.Color(shadowColor).offsetHSL(0, 0, 0.06);
      voidShadowInnerMat.color.copy(brighter);
      voidShadowInnerMat.opacity = 0.55 * shadowIntensity;
      // Expand shadow halo radius for bigger voids.
      const scale = 0.85 + Math.min(1.6, effectiveFogDensity * 18);
      voidShadowMesh.scale.setScalar(scale);
      voidShadowInner.scale.setScalar(scale);
    }

    ambientLight.intensity = env.ambientIntensity ?? 0.55;
    sun.intensity = env.sunIntensity ?? 1.15;
    if (env.sunColor) sun.color.set(env.sunColor);
    hemiLight.intensity = Math.max(0.2, (env.ambientIntensity ?? 0.55) * 0.85);
    if (env.horizonColor) hemiLight.groundColor.set(env.horizonColor);

    const tile = Math.max(1, env.floorTextureScale ?? 40);
    if (!isVoid && !perf.hideFloor && env.defaultTextureUrl) {
      new THREE.TextureLoader().load(env.defaultTextureUrl, (tex) => {
        if (loadGen !== envLoadGen) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(tile, tile);
        if (mat.map && mat.map !== tex) mat.map.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
        requestRender();
      });
    } else if (mat.map) {
      mat.map.dispose();
      mat.map = null;
      mat.needsUpdate = true;
    }
  }
  applyEnvironment(ensureEnvironment(doc));

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.addEventListener('change', () => requestRender());

  const transform = new TransformControls(camera, renderer.domElement);
  transform.addEventListener('change', () => requestRender());
  transform.setMode('translate');
  // Three.js rotate gizmos include a camera-facing filled yellow disc (E) and
  // a gray disc (XYZE). Hovering them — or the infinite axis helper lines in
  // move mode — paints the whole viewport yellow. Keep only X/Y/Z rings/arrows.
  (transform as unknown as { showE: boolean; showXYZE: boolean; showXYZ: boolean }).showE = false;
  (transform as unknown as { showE: boolean; showXYZE: boolean; showXYZ: boolean }).showXYZE = false;
  // Center octahedron hover yellow-highlights every axis. Free-move still
  // works via the XY / XZ / YZ plane squares between the arrows.
  (transform as unknown as { showE: boolean; showXYZE: boolean; showXYZ: boolean }).showXYZ = false;
  transform.size = 0.75;
  const lastPrimaryPos = new THREE.Vector3();
  const lastPrimaryScale = new THREE.Vector3(1, 1, 1);

  /** Invisible pivot so multi-select / groups move·rotate·scale as one unit. */
  const groupProxy = new THREE.Object3D();
  groupProxy.name = 'selection-group-proxy';
  scene.add(groupProxy);
  let proxyActive = false;
  type ProxyMemberStart = {
    id: string;
    localPos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
  };
  let proxyMembers: ProxyMemberStart[] = [];

  const selectionTransformIds = (): string[] => {
    const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    return ids.filter((id) => {
      const e = doc.entities.find((x) => x.id === id);
      return e && !isLockedEnt(e) && roots.has(id);
    });
  };

  const computeSelectionPivot = (ids: string[]): THREE.Vector3 => {
    if (pivotMode === 'active') {
      const active = roots.get(selectedId ?? '') ?? roots.get(ids[ids.length - 1] ?? '');
      if (active) return active.position.clone();
    }
    if (pivotMode === 'bounds') {
      const box = worldBoxForIds(ids);
      if (box) return box.getCenter(new THREE.Vector3());
    }
    const pivot = new THREE.Vector3();
    let n = 0;
    for (const id of ids) {
      const root = roots.get(id);
      if (!root) continue;
      pivot.add(root.position);
      n += 1;
    }
    if (n > 0) pivot.divideScalar(n);
    return pivot;
  };

  const captureProxyMembers = () => {
    const ids = selectionTransformIds();
    proxyMembers = [];
    for (const id of ids) {
      const root = roots.get(id);
      if (!root) continue;
      proxyMembers.push({
        id,
        localPos: root.position.clone().sub(groupProxy.position),
        quat: root.quaternion.clone(),
        scale: root.scale.clone(),
      });
    }
  };

  const applyProxyTransformToMembers = () => {
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

    for (const m of proxyMembers) {
      const root = roots.get(m.id);
      if (!root) continue;
      const scaled = m.localPos.clone();
      scaled.x *= groupProxy.scale.x;
      scaled.y *= groupProxy.scale.y;
      scaled.z *= groupProxy.scale.z;
      scaled.applyQuaternion(groupProxy.quaternion);
      root.position.copy(groupProxy.position).add(scaled);
      root.quaternion.copy(groupProxy.quaternion).multiply(m.quat);
      root.rotation.setFromQuaternion(root.quaternion);
      root.scale.set(
        m.scale.x * groupProxy.scale.x,
        m.scale.y * groupProxy.scale.y,
        m.scale.z * groupProxy.scale.z
      );
      applyPose(m.id, root);
      cacheWorldBox(m.id, root);
    }
  };

  /** Hold Shift → exact grid for move / rotate / scale (TransformControls snaps). */
  const syncTransformSnaps = () => {
    if (shiftHeld) {
      transform.setTranslationSnap(gridSize);
      transform.setRotationSnap(Math.PI / 2);
      // Scale is snapped in objectChange to world-size × grid (not raw scale steps).
      transform.setScaleSnap(null);
    } else {
      transform.setTranslationSnap(null);
      transform.setRotationSnap(null);
      transform.setScaleSnap(null);
    }
  };

  const applyScaleFromSide = (
    obj: THREE.Object3D,
    ent: EditorEntity,
    oldScale: [number, number, number],
    newScale: [number, number, number]
  ) => {
    if (!scaleFromSide) return;
    const base = (ent.collisionSize ?? [1, 1, 1]) as [number, number, number];
    // Bottom-aligned meshes (Hammer / planted) keep feet fixed on Y.
    const offset = scaleFromSideOffset(oldScale, newScale, base, { compensateY: false });
    const axis = (transform as unknown as { axis: string | null }).axis;
    // scaleFromSideOffset always assumes the +axis side was grabbed (anchors
    // -axis). Flip the sign when the drag actually started on the -axis
    // handle so that side stays fixed instead, on both grow and shrink.
    let ox = offset[0] * scaleGrabSign.x;
    let oy = offset[1] * scaleGrabSign.y;
    let oz = offset[2] * scaleGrabSign.z;
    if (axis === 'X') {
      oy = 0;
      oz = 0;
    } else if (axis === 'Y') {
      ox = 0;
      oz = 0;
    } else if (axis === 'Z') {
      ox = 0;
      oy = 0;
    }
    if (ox === 0 && oy === 0 && oz === 0) return;
    const delta = new THREE.Vector3(ox, oy, oz);
    delta.applyEuler(obj.rotation);
    obj.position.add(delta);
  };

  /** True while a TransformControls drag is in progress (mouse still down). */
  let transformDragging = false;

  transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !(e as { value: boolean }).value && !freeFly;
    const dragging = (e as { value: boolean }).value;
    transformDragging = dragging;
    if (dragging) {
      if (proxyActive) {
        // Reset proxy pose so local offsets stay valid for this drag.
        const ids = selectionTransformIds();
        const pivot = computeSelectionPivot(ids);
        groupProxy.position.copy(pivot);
        groupProxy.rotation.set(0, 0, 0);
        groupProxy.quaternion.identity();
        groupProxy.scale.set(1, 1, 1);
        captureProxyMembers();
        lastPrimaryPos.copy(groupProxy.position);
        lastPrimaryScale.copy(groupProxy.scale);
      } else if (selectedId && roots.get(selectedId)) {
        const root = roots.get(selectedId)!;
        lastPrimaryPos.copy(root.position);
        lastPrimaryScale.copy(root.scale);
      }
      if (transform.mode === 'scale') {
        // Record which side of the object the grabbed handle sits on, in the
        // object's own unrotated local space, so the anchor face stays put
        // for this whole drag regardless of grow/shrink.
        const t = transform as unknown as {
          pointStart: THREE.Vector3;
          worldQuaternionStart: THREE.Quaternion;
        };
        const grab = t.pointStart.clone().applyQuaternion(t.worldQuaternionStart.clone().invert());
        scaleGrabSign = {
          x: grab.x >= 0 ? 1 : -1,
          y: grab.y >= 0 ? 1 : -1,
          z: grab.z >= 0 ? 1 : -1,
        };
      }
    } else if (proxyActive) {
      // Re-seat proxy at the new group center with identity pose for the next drag.
      if (transform.mode === 'translate') snapDragToNearestNeighbor();
      const ids = selectionTransformIds();
      const pivot = computeSelectionPivot(ids);
      groupProxy.position.copy(pivot);
      groupProxy.rotation.set(0, 0, 0);
      groupProxy.quaternion.identity();
      groupProxy.scale.set(1, 1, 1);
      captureProxyMembers();
      refreshSelectionOutlines();
    } else if (!dragging && selectedId) {
      // Drag just ended on a single selection: do the heavy grid-edge / 90°
      // re-seat exactly ONCE here, instead of every objectChange tick during
      // the drag. Doing it every frame fought the user's live rotation/move
      // and made ramps appear to resize or reshape mid-drag.
      finalizeSingleDrag();
      if (transform.mode === 'translate') snapDragToNearestNeighbor();
      if (transform.mode === 'scale') {
        const ent = doc.entities.find((x) => x.id === selectedId);
        if (ent?.model) setLastPrefabScale(ent.model, ent.scale);
      }
    }
    if (!dragging) {
      // Settled pose. The per-frame emissions above are flagged transient, so
      // this is the one the consumer commits — it must fire unconditionally,
      // including for drags that ended without any end-of-drag re-seat.
      handlers.onDocChange(doc);
    }
  });

  /** Runs once when a single-object drag ends: snaps rotation to 90° steps
   *  and re-seats grid-edge position for the FINAL pose only (Shift held). */
  function finalizeSingleDrag() {
    if (!shiftHeld || !selectedId) return;
    const ent = doc.entities.find((x) => x.id === selectedId);
    const obj = roots.get(selectedId);
    if (!ent || !obj) return;
    const layer = layerMeta(ent.layerId);
    if (layer?.locked || ent.locked) return;

    const scaleTuple: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];

    if (transform.mode === 'rotate') {
      const snapDeg = 90;
      const sx = Math.round(THREE.MathUtils.radToDeg(obj.rotation.x) / snapDeg) * snapDeg;
      const sy = Math.round(THREE.MathUtils.radToDeg(obj.rotation.y) / snapDeg) * snapDeg;
      const sz = Math.round(THREE.MathUtils.radToDeg(obj.rotation.z) / snapDeg) * snapDeg;
      obj.rotation.set(
        THREE.MathUtils.degToRad(sx),
        THREE.MathUtils.degToRad(sy),
        THREE.MathUtils.degToRad(sz)
      );
      const world = yawAlignedSize(entityWorldSize(ent.collisionSize, scaleTuple), sy);
      obj.position.set(
        ...snapPoseToGridEdges([obj.position.x, obj.position.y, obj.position.z], world, gridSize)
      );
    } else if (transform.mode === 'translate') {
      const yawDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
      const world = yawAlignedSize(entityWorldSize(ent.collisionSize, scaleTuple), yawDeg);
      obj.position.set(
        ...snapPoseToGridEdges([obj.position.x, obj.position.y, obj.position.z], world, gridSize)
      );
    } else {
      return;
    }

    lastPrimaryPos.copy(obj.position);
    const e = doc.entities.find((x) => x.id === selectedId);
    if (e) {
      e.position = [obj.position.x, obj.position.y, obj.position.z];
      e.rotation = [
        THREE.MathUtils.radToDeg(obj.rotation.x),
        THREE.MathUtils.radToDeg(obj.rotation.y),
        THREE.MathUtils.radToDeg(obj.rotation.z),
      ];
      e.scale = [obj.scale.x, obj.scale.y, obj.scale.z];
    }
    handlers.onDocChange(doc);
    refreshSelectionOutlines();
  }

  /** After a move-gizmo drag, click the selection onto the nearest neighbor
   *  if a face is within ~one grid cell — uses each piece's OBB so rotated
   *  solids click on the real face, not the world AABB. */
  function snapDragToNearestNeighbor(): boolean {
    if (snapTarget === 'off') return false;
    const movingIds = selectionTransformIds();
    if (!movingIds.length) return false;
    const skip = new Set(movingIds);
    const anchors: SnapObb[] = [];
    for (const e of doc.entities) {
      if (skip.has(e.id)) continue;
      const root = roots.get(e.id);
      if (!root?.visible) continue;
      if (isInvisibleMarkerKind(e.kind) || isPlatformPlayerKind(e.kind)) continue;
      const obb = snapObbForEntity(e);
      if (obb) anchors.push(obb);
    }
    if (!anchors.length) return false;
    const moving =
      movingIds.length === 1
        ? snapObbForEntity(doc.entities.find((x) => x.id === movingIds[0])!)
        : (() => {
            const box = worldBoxForIds(movingIds);
            return box ? { ...aabbFromBox(box) } : null;
          })();
    if (!moving) return false;
    const maxDist = Math.max(gridSize * 1.35, 0.65);

    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (snapTarget === 'vertex' || snapTarget === 'edge') {
      // Corner-to-corner / edge-to-edge is a point match, so unlike face snap it
      // moves on all three axes at once.
      const points = snapTarget === 'vertex' ? obbCorners : obbEdgeMidpoints;
      const anchorPoints = anchors.flatMap((a) => points(a));
      const hit = nearestPointSnap(points(moving), anchorPoints, maxDist);
      if (!hit) return false;
      [dx, dy, dz] = hit.delta;
    } else {
      const hit = nearestObbFaceAttach(moving, anchors, maxDist);
      if (!hit) return false;
      dx = hit.c[0] - moving.c[0];
      dy = hit.c[1] - moving.c[1];
      dz = hit.c[2] - moving.c[2];
    }
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-5) return false;
    for (const id of movingIds) {
      const root = roots.get(id);
      const ent = doc.entities.find((x) => x.id === id);
      if (!root || !ent) continue;
      root.position.x += dx;
      root.position.y += dy;
      root.position.z += dz;
      ent.position = [root.position.x, root.position.y, root.position.z];
    }
    lastPrimaryPos.copy(roots.get(movingIds[0])?.position ?? lastPrimaryPos);
    handlers.onDocChange(doc);
    refreshSelectionOutlines();
    return true;
  }

  /** Local (unrotated) half-extents + entity rotation — matches magnet OBB. */
  function snapObbForEntity(e: EditorEntity): SnapObb | null {
    const root = roots.get(e.id);
    if (!root?.visible) return null;
    const quat = root.quaternion.clone();
    const saved = quat.clone();
    root.quaternion.identity();
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    root.quaternion.copy(saved);
    root.updateMatrixWorld(true);
    if (box.isEmpty()) {
      const aabbBox = worldBoxForIds([e.id]);
      return aabbBox ? { ...aabbFromBox(aabbBox), rotDeg: [...e.rotation] as [number, number, number] } : null;
    }
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const localPivot = box.getCenter(new THREE.Vector3());
    const center = root.position.clone().add(localPivot.applyQuaternion(quat));
    return {
      c: [center.x, center.y, center.z],
      h: [Math.max(0.05, half.x), Math.max(0.05, half.y), Math.max(0.05, half.z)],
      rotDeg: [
        THREE.MathUtils.radToDeg(root.rotation.x),
        THREE.MathUtils.radToDeg(root.rotation.y),
        THREE.MathUtils.radToDeg(root.rotation.z),
      ],
    };
  }

  function worldBoxForIds(ids: string[]): THREE.Box3 | null {
    const box = new THREE.Box3();
    let any = false;
    for (const id of ids) {
      const root = roots.get(id);
      if (!root?.visible) continue;
      root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(root);
      if (b.isEmpty()) continue;
      if (!any) {
        box.copy(b);
        any = true;
      } else {
        box.union(b);
      }
    }
    return any ? box : null;
  }

  function aabbFromBox(box: THREE.Box3): { c: [number, number, number]; h: [number, number, number] } {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return {
      c: [center.x, center.y, center.z],
      h: [
        Math.max(0.05, size.x / 2),
        Math.max(0.05, size.y / 2),
        Math.max(0.05, size.z / 2),
      ],
    };
  }

  transform.addEventListener('objectChange', () => {
    // —— Multi-select / group: transform proxy drives every member as one ——
    if (proxyActive && (transform as unknown as { object?: THREE.Object3D }).object === groupProxy) {
      if (shiftHeld) {
        if (transform.mode === 'translate') {
          groupProxy.position.x = snapToGrid(groupProxy.position.x, gridSize);
          groupProxy.position.z = snapToGrid(groupProxy.position.z, gridSize);
          groupProxy.position.y = snapToGrid(groupProxy.position.y, gridSize);
        } else if (transform.mode === 'rotate') {
          const snapDeg = 90;
          const sx = Math.round(THREE.MathUtils.radToDeg(groupProxy.rotation.x) / snapDeg) * snapDeg;
          const sy = Math.round(THREE.MathUtils.radToDeg(groupProxy.rotation.y) / snapDeg) * snapDeg;
          const sz = Math.round(THREE.MathUtils.radToDeg(groupProxy.rotation.z) / snapDeg) * snapDeg;
          groupProxy.rotation.set(
            THREE.MathUtils.degToRad(sx),
            THREE.MathUtils.degToRad(sy),
            THREE.MathUtils.degToRad(sz)
          );
          groupProxy.quaternion.setFromEuler(groupProxy.rotation);
        } else if (transform.mode === 'scale') {
          const snapAxis = (v: number) => {
            let s = snapToGrid(v, gridSize);
            if (Math.abs(s) < gridSize * 0.5) s = Math.sign(v || 1) * gridSize;
            return s;
          };
          // Prefer uniform-ish grid steps from average scale.
          const avg = (groupProxy.scale.x + groupProxy.scale.y + groupProxy.scale.z) / 3;
          const snapped = Math.max(gridSize, snapToGrid(avg, gridSize));
          if (Math.abs(groupProxy.scale.x - groupProxy.scale.y) < 1e-4 &&
              Math.abs(groupProxy.scale.y - groupProxy.scale.z) < 1e-4) {
            groupProxy.scale.setScalar(snapped);
          } else {
            groupProxy.scale.x = snapAxis(groupProxy.scale.x);
            groupProxy.scale.y = snapAxis(groupProxy.scale.y);
            groupProxy.scale.z = snapAxis(groupProxy.scale.z);
          }
        }
      }
      applyProxyTransformToMembers();
      lastPrimaryPos.copy(groupProxy.position);
      lastPrimaryScale.copy(groupProxy.scale);
      handlers.onDocChange(doc, { transient: transformDragging });
      refreshSelectionOutlines();
      return;
    }

    if (!selectedId) return;
    const ent = doc.entities.find((x) => x.id === selectedId);
    const obj = roots.get(selectedId);
    if (!ent || !obj) return;
    const layer = layerMeta(ent.layerId);
    if (layer?.locked || ent.locked) {
      // Locked build level or entity — snap visual back to stored pose and ignore the drag.
      obj.position.set(...ent.position);
      obj.rotation.set(
        THREE.MathUtils.degToRad(ent.rotation[0]),
        THREE.MathUtils.degToRad(ent.rotation[1]),
        THREE.MathUtils.degToRad(ent.rotation[2])
      );
      obj.scale.set(...ent.scale);
      return;
    }

    if (transform.mode === 'scale') {
      const oldScale: [number, number, number] = [
        lastPrimaryScale.x,
        lastPrimaryScale.y,
        lastPrimaryScale.z,
      ];
      let nextScale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
      const base = (ent.collisionSize ?? [1, 1, 1]) as [number, number, number];

      if (shiftHeld) {
        nextScale = snapScaleToGrid(nextScale, base, gridSize);
        obj.scale.set(...nextScale);
      }

      if (scaleFromSide && shiftHeld) {
        // One-sided + Shift: keep the face OPPOSITE the dragged handle fixed
        // (grid-snapped), grow only the pulled side. Which face is "fixed"
        // depends on which handle is being dragged (transform.axis), not
        // always the min/-X,-Z corner — otherwise dragging the +X handle
        // and the -X handle both anchored to -X, so -X drags looked like
        // they grew from the wrong side / grew both ways.
        const gizmoAxis = (transform as unknown as { axis: string | null }).axis;
        const yawDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
        const world = yawAlignedSize(entityWorldSize(ent.collisionSize, nextScale), yawDeg);
        const oldWorld = yawAlignedSize(entityWorldSize(ent.collisionSize, oldScale), yawDeg);
        const prevPos = lastPrimaryPos;

        // Local-space delta (which face grew) before applying yaw.
        const deltaX = world[0] - oldWorld[0];
        const deltaZ = world[2] - oldWorld[2];
        // Which side was actually grabbed at drag start (fixed for the whole
        // drag) — NOT the sign of the current scale delta, since three.js's
        // scale gizmo grows/shrinks symmetrically from either end handle and
        // the delta sign only tells grow-vs-shrink, not which face to anchor.
        const grabbedPositiveX = scaleGrabSign.x >= 0;
        const grabbedPositiveZ = scaleGrabSign.z >= 0;

        if (gizmoAxis === 'X') {
          const anchor = grabbedPositiveX
            ? snapToGrid(prevPos.x - oldWorld[0] / 2, gridSize) // -X face fixed, grow/shrink +X
            : snapToGrid(prevPos.x + oldWorld[0] / 2, gridSize); // +X face fixed, grow/shrink -X
          obj.position.x = grabbedPositiveX ? anchor + world[0] / 2 : anchor - world[0] / 2;
        } else if (deltaX !== 0) {
          const left = snapToGrid(prevPos.x - oldWorld[0] / 2, gridSize);
          obj.position.x = left + world[0] / 2;
        }

        if (gizmoAxis === 'Z') {
          const anchor = grabbedPositiveZ
            ? snapToGrid(prevPos.z - oldWorld[2] / 2, gridSize)
            : snapToGrid(prevPos.z + oldWorld[2] / 2, gridSize);
          obj.position.z = grabbedPositiveZ ? anchor + world[2] / 2 : anchor - world[2] / 2;
        } else if (deltaZ !== 0) {
          const back = snapToGrid(prevPos.z - oldWorld[2] / 2, gridSize);
          obj.position.z = back + world[2] / 2;
        }

        if (gizmoAxis === 'Y') {
          const grewPositiveY = nextScale[1] - oldScale[1] >= 0;
          const feet = grewPositiveY
            ? snapToGrid(prevPos.y, gridSize)
            : snapToGrid(prevPos.y + (oldWorld[1] - world[1]), gridSize);
          obj.position.y = feet;
        } else {
          obj.position.y = snapToGrid(prevPos.y, gridSize);
        }
      } else if (scaleFromSide) {
        // Grow/shrink from the pulled handle; opposite face stays put.
        applyScaleFromSide(obj, ent, oldScale, nextScale);
      } else if (shiftHeld) {
        // Centered scale + Shift → seat both edges on the grid.
        const yawDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
        const world = yawAlignedSize(entityWorldSize(ent.collisionSize, nextScale), yawDeg);
        obj.position.set(
          ...snapPoseToGridEdges(
            [obj.position.x, obj.position.y, obj.position.z],
            world,
            gridSize
          )
        );
      }

      lastPrimaryScale.set(...nextScale);
    } else if (shiftHeld && transformDragging) {
      // Live drag, Shift held: snap the RAW value only (position to grid cell,
      // rotation to 15° increments for a smooth feel) — never recompute
      // world-size edges or hard-lock to 90° here. Re-seating edges every
      // frame from a live, not-yet-final rotation is what made ramps look
      // like they were resizing/reshaping mid-drag. The precise 90°/edge
      // snap happens once in finalizeSingleDrag() when the drag ends.
      if (transform.mode === 'translate') {
        obj.position.x = snapToGrid(obj.position.x, gridSize);
        obj.position.z = snapToGrid(obj.position.z, gridSize);
        if (snapY) obj.position.y = snapToGrid(obj.position.y, gridSize);
      } else if (transform.mode === 'rotate') {
        const softSnapDeg = 15;
        obj.rotation.y =
          THREE.MathUtils.degToRad(
            Math.round(THREE.MathUtils.radToDeg(obj.rotation.y) / softSnapDeg) * softSnapDeg
          );
      }
    } else if (gridSnap && transform.mode === 'translate') {
      obj.position.x = snapToGrid(obj.position.x, gridSize);
      obj.position.z = snapToGrid(obj.position.z, gridSize);
      if (snapY) obj.position.y = snapToGrid(obj.position.y, gridSize);
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
    cacheWorldBox(selectedId, obj);

    if (transform.mode === 'translate' && selectedIds.length > 1) {
      for (const id of selectedIds) {
        if (id === selectedId) continue;
        const otherEnt = doc.entities.find((x) => x.id === id);
        if (isLockedEnt(otherEnt)) continue;
        const other = roots.get(id);
        if (!other) continue;
        other.position.x += dx;
        other.position.y += dy;
        other.position.z += dz;
        applyPose(id, other);
        cacheWorldBox(id, other);
      }
    }

    handlers.onDocChange(doc, { transient: transformDragging });
  });
  const transformHelper =
    typeof (transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper === 'function'
      ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
      : (transform as unknown as THREE.Object3D);
  scene.add(transformHelper);
  // After TransformControls rebuilds handle visibility, hide the hover discs
  // and the 1e6-long axis helper lines that otherwise fill the screen yellow.
  const origHelperUpdate = transformHelper.updateMatrixWorld.bind(transformHelper);
  transformHelper.updateMatrixWorld = (force?: boolean) => {
    origHelperUpdate(force);
    transformHelper.traverse((child) => {
      const tagged = child as THREE.Object3D & { tag?: string };
      if (tagged.tag === 'helper') child.visible = false;
      if (child.name === 'E' || child.name === 'XYZE' || child.name === 'XYZ') child.visible = false;
    });
  };

  const roots = new Map<string, THREE.Object3D>();
  // Per-entity in-flight guard: docGeneration only catches a setDoc() (undo/
  // redo/reopen) racing an in-progress syncEntity(); it does nothing for two
  // syncEntity() calls issued for the SAME entity id without an intervening
  // setDoc() (e.g. rapid double-click through catalog thumbnails). Without
  // this, both awaits resolve, both set roots/scene.add — the earlier root
  // becomes an untracked orphan (disposeRoot can never find it again), a
  // permanent duplicate-mesh + geometry/material leak.
  const syncTokens = new Map<string, number>();
  const selectedUpdateTokens = new Map<string, number>();
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
    renderer.setPixelRatio(editorPerf.capPixelRatio ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    bloom.setSize(w, h);
    requestRender();
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
        root: (() => {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
          );
          markOwnsGpuResources(mesh);
          return mesh;
        })(),
        clips: [],
        clipNames: [],
      };
    }
    return loadAnimatedPrefab(src);
  }

  function cacheWorldBox(id: string, root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) worldBoxes.delete(id);
    else worldBoxes.set(id, box.clone());
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
      const box = worldBoxes.get(id) ?? (() => {
        cacheWorldBox(id, root);
        return worldBoxes.get(id);
      })();
      if (!box) return;
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

  function isLockedEnt(ent: EditorEntity | undefined): boolean {
    if (!ent) return false;
    return isEntityEditLocked(ent, doc.layers);
  }

  function applyEntityTexture(root: THREE.Object3D, ent: EditorEntity) {
    const url = ent.textureUrl || doc.environment?.defaultTextureUrl;
    applyTextureToObject(root, url, {
      repeat: resolveEntityTextureRepeat(ent),
      offset: ent.textureOffset,
      rotation: ent.textureRotation,
    });
  }

  function makeHammerSolidMesh(ent: EditorEntity): THREE.Object3D {
    const size = ent.collisionSize ?? defaultSizeForHammer((ent.primitive as HammerPrimitive) || 'box');
    const shape = (ent.primitive as HammerPrimitive) || 'box';
    const obj = makeHammerSolidObject(shape, size, ent.color || '#64748b');
    markOwnsGpuResources(obj);
    return obj;
  }

  function isHammerSolidEntity(ent: EditorEntity): boolean {
    return isHammerSolidEntityDoc(ent);
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
    const gen = docGeneration;
    const myToken = (syncTokens.get(ent.id) ?? 0) + 1;
    syncTokens.set(ent.id, myToken);
    let root = roots.get(ent.id);
    trackAnimatedEntity(ent);
    requestRender();

    // Platform player avatar is settings-only — never show / pick it on the map.
    if (isPlatformPlayerKind(ent.kind)) {
      if (root) {
        scene.remove(root);
        roots.delete(ent.id);
        entityClips.delete(ent.id);
      }
      animatedEntities.delete(ent.id);
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
        const size =
          ent.collisionSize ??
          defaultSizeForHammer((ent.primitive as HammerPrimitive) || hammerShape);
        const idx = doc.entities.findIndex((e) => e.id === ent.id);
        if (idx >= 0 && !doc.entities[idx].collisionSize) {
          const entities = doc.entities.slice();
          entities[idx] = {
            ...entities[idx],
            collisionSize: size,
            primitive: (ent.primitive as HammerPrimitive) || hammerShape || 'box',
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
          // A newer setDoc() (rapid undo/redo, reopening a map) OR a second
          // syncEntity() call for this same entity (e.g. rapid double-click
          // through catalog thumbnails) may have already superseded this
          // call while the load above was pending — bail before touching
          // roots/scene/doc. loaded.root's geometry is shared with
          // loadAnimatedPrefab's module-level cache (never added to the
          // scene here), so simply dropping the reference is enough — no
          // dispose needed.
          if (gen !== docGeneration || syncTokens.get(ent.id) !== myToken) return;
          // Wrap + plant feet so entity.position.y is the stand surface (no gap/clip)
          root = new THREE.Group();
          plantLocalFeet(loaded.root);
          root.add(loaded.root);
          // Measure real mesh size (local, unscaled) for collision export.
          // Only visible meshes count — hidden LODs / helper / collision-proxy
          // nodes some GLBs ship with must not inflate the collision box.
          loaded.root.updateMatrixWorld(true);
          const meshBox = new THREE.Box3();
          loaded.root.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            if (!child.visible) return;
            meshBox.expandByObject(child);
          });
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
          // Same supersede check as the success path above — a rejected
          // load must not resurrect roots/scene for an id that's since moved
          // on to a newer syncEntity() call (or been superseded by a setDoc).
          if (gen !== docGeneration || syncTokens.get(ent.id) !== myToken) return;
          root = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0xff00ff })
          );
          markOwnsGpuResources(root);
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
                  ? '#ef4444'
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
        markOwnsGpuResources(root);
      } else if (ent.kind === 'button') {
        root = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.35 })
        );
        root.position.y = 0.1;
        root.userData.isEditorMarker = true;
        markOwnsGpuResources(root);
      } else if (ent.kind === 'light') {
        root = makeLightBulb(ent);
        root.userData.isEditorMarker = true;
        markOwnsGpuResources(root);
      } else if (
        ent.kind === 'spinner' ||
        ent.kind === 'push_rail' ||
        ent.kind === 'push_block'
      ) {
        root = makeGameplayFallback(ent) ?? new THREE.Group();
        root.userData.isEditorMarker = true;
        markOwnsGpuResources(root);
      } else if (ent.kind === 'player') {
        root = new THREE.Mesh(
          new THREE.CapsuleGeometry(PLAYER_RADIUS, 0.9, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
        );
        root.position.y = 0.9;
        markOwnsGpuResources(root);
      } else {
        root = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        markOwnsGpuResources(root);
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
    applyEntityColor(root, ent.color);
    applyEntityTexture(root, ent);
    applyEntityGlow(root, ent.glow, ent.color);
    if (ent.kind === 'light') syncLightParams(root, ent);
    cacheWorldBox(ent.id, root);
    // Model/texture loads above are async, so the dirty window opened when this
    // sync started may already have closed by the time the mesh actually exists.
    requestRender();
    // No refreshGizmos() here: it rebuilds the gizmos for the WHOLE document,
    // so calling it per entity made rebuildAll O(n^2) (500 entities = 500 full
    // teardowns). Every caller refreshes once after its batch instead.
  }

  function disposeGizmoObjects(objects: THREE.Object3D[]) {
    for (const c of objects) {
      c.removeFromParent();
      if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
        c.geometry?.dispose?.();
        // Shared gizmo materials are owned by the viewport, not these meshes.
      }
    }
  }

  function clearCollisionGizmos() {
    for (const cached of gizmoCache.values()) disposeGizmoObjects(cached.objects);
    gizmoCache.clear();
    while (animWireGroup.children.length) {
      const c = animWireGroup.children[0];
      animWireGroup.remove(c);
      if (c instanceof THREE.Line) c.geometry?.dispose?.();
    }
  }

  function collisionGizmoKey(ent: EditorEntity, isSelected: boolean): string {
    return [
      isSelected ? 1 : 0,
      showAllCollisionGizmos ? 1 : 0,
      ent.kind,
      ent.position.join(','),
      ent.rotation.join(','),
      ent.scale.join(','),
      ent.collisionSize?.join(',') ?? '',
      ent.primitive ?? '',
      ent.jumpPad?.enabled ? 1 : 0,
      ent.hazard?.enabled ? 1 : 0,
      entityExportsAsPlatform(ent) ? 1 : 0,
    ].join('|');
  }

  function buildCollisionGizmo(ent: EditorEntity): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    const root = roots.get(ent.id);
    const isHz = ent.kind === 'hazard' || ent.hazard?.enabled;
    if (isHz) {
      const box =
        (root && makeBoundsWireBox(root, 0xff2244, { material: gizmoMatHazard })) ||
        new THREE.Mesh(
          new THREE.BoxGeometry(
            Math.max(0.5, Math.abs(ent.scale[0]) * 1.6),
            Math.max(0.2, Math.abs(ent.scale[1]) * 0.4),
            Math.max(0.5, Math.abs(ent.scale[2]) * 1.6)
          ),
          gizmoMatHazard
        );
      if (!root) box.position.set(ent.position[0], ent.position[1] + 0.05, ent.position[2]);
      objects.push(box);
      return objects;
    }
    if (!entityExportsAsPlatform(ent)) return objects;
    const jump = ent.jumpPad?.enabled || ent.kind === 'jump_pad';
    const mat = jump ? gizmoMatJump : gizmoMatSolid;
    const hammerVol =
      ent.primitive === 'box' ||
      isHammerPrimitive(ent.primitive) ||
      ent.model === HAMMER_SOLID_MODEL;
    const pad =
      (root &&
        makeBoundsWireBox(root, jump ? 0x38bdf8 : 0x22c55e, {
          flattenY: !hammerVol,
          material: mat,
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
          mat
        );
        m.position.set(
          ent.position[0],
          ent.position[1] + (hammerVol ? hy * 0.5 : 0.04),
          ent.position[2]
        );
        return m;
      })();
    objects.push(pad);
    return objects;
  }

  function refreshGizmos() {
    requestRender();
    if (editorPerf.skipCollisionGizmos) {
      clearCollisionGizmos();
      refreshSelectionOutlines();
      return;
    }
    const selectedSet = new Set(
      selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
    );
    const entityById = new Map(doc.entities.map((e) => [e.id, e] as const));
    const need = new Set<string>();
    if (showAllCollisionGizmos) {
      for (const ent of doc.entities) need.add(ent.id);
    } else {
      for (const id of selectedSet) need.add(id);
    }

    for (const [id, cached] of [...gizmoCache.entries()]) {
      if (!need.has(id)) {
        disposeGizmoObjects(cached.objects);
        gizmoCache.delete(id);
      }
    }

    for (const id of need) {
      const ent = entityById.get(id);
      if (!ent) continue;
      const isSelected = selectedSet.has(ent.id);
      const drawCollision = showAllCollisionGizmos || isSelected;
      if (!drawCollision) continue;
      const key = collisionGizmoKey(ent, isSelected);
      const prev = gizmoCache.get(id);
      if (prev?.key === key) continue;
      if (prev) disposeGizmoObjects(prev.objects);
      const objects = buildCollisionGizmo(ent);
      for (const o of objects) gizmoGroup.add(o);
      gizmoCache.set(id, { key, objects });
    }

    while (animWireGroup.children.length) {
      const c = animWireGroup.children[0];
      animWireGroup.remove(c);
      if (c instanceof THREE.Line) c.geometry?.dispose?.();
    }
    const wireSources = showAllCollisionGizmos
      ? doc.entities
      : doc.entities.filter((e) => {
          if (selectedSet.has(e.id)) return true;
          const listen = e.animation?.listenToEntityId;
          if (listen && selectedSet.has(listen)) return true;
          return (e.animation?.activatesEntityIds ?? []).some((tid) => selectedSet.has(tid));
        });
    for (const ent of wireSources) {
      const listen = ent.animation?.listenToEntityId;
      const activates = ent.animation?.activatesEntityIds ?? [];
      const pairs: [string, string][] = [];
      if (listen) pairs.push([listen, ent.id]);
      for (const tid of activates) pairs.push([ent.id, tid]);
      for (const [fromId, toId] of pairs) {
        const a = entityById.get(fromId);
        const b = entityById.get(toId);
        if (!a || !b) continue;
        const pts = [
          new THREE.Vector3(a.position[0], a.position[1] + 0.8, a.position[2]),
          new THREE.Vector3(b.position[0], b.position[1] + 0.8, b.position[2]),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        animWireGroup.add(new THREE.Line(geo, gizmoMatAnim));
      }
    }
    refreshSelectionOutlines();
  }

  function placingToolActive() {
    return (
      editTool === 'bucket' ||
      editTool === 'paint' ||
      editTool === 'hammer' ||
      editTool === 'brush' ||
      bucketPainting
    );
  }

  function attachSelectionGizmo() {
    if (!selectedId || freeFly || placingToolActive()) {
      proxyActive = false;
      transform.detach();
      return;
    }
    const ids = selectionTransformIds();
    if (ids.length >= 2) {
      const pivot = computeSelectionPivot(ids);
      groupProxy.position.copy(pivot);
      groupProxy.rotation.set(0, 0, 0);
      groupProxy.quaternion.identity();
      groupProxy.scale.set(1, 1, 1);
      if (!groupProxy.parent) scene.add(groupProxy);
      transform.attach(groupProxy);
      proxyActive = true;
      captureProxyMembers();
      return;
    }
    proxyActive = false;
    if (!roots.has(selectedId)) {
      transform.detach();
      return;
    }
    const selEnt = doc.entities.find((e) => e.id === selectedId);
    if (isLockedEnt(selEnt)) {
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
    disposeClonedMaterials(obj);
    disposeOwnedGeometry(obj);
    roots.delete(id);
    animatedEntities.delete(id);
    syncedKeys.delete(id);
    worldBoxes.delete(id);
    const giz = gizmoCache.get(id);
    if (giz) {
      disposeGizmoObjects(giz.objects);
      gizmoCache.delete(id);
    }
    requestRender();
  }

  /**
   * Fingerprint of everything `syncEntity` reads for one entity. Compared across
   * `setDoc` calls so an edit only rebuilds the objects it actually touched.
   *
   * Layer visibility and the environment's default texture are folded in because
   * `syncEntity` reads both — hiding a layer or changing the fallback texture has
   * to resync the affected entities even though their own fields did not change.
   */
  function entitySyncKey(ent: EditorEntity, envTextureKey: string): string {
    const hidden = layerMeta(ent.layerId)?.visible === false;
    return entityVisualFingerprint(ent, { envTextureKey, layerHidden: hidden });
  }

  /**
   * The subset of fields that decide which object `syncEntity` builds. When one
   * of these changes, `syncEntity` cannot patch the existing root — it has to be
   * torn down so the next sync builds from scratch (the same reason
   * `updateSelected` disposes before patching).
   */
  function entityStructureKey(ent: EditorEntity): string {
    return entityStructureFingerprint(ent);
  }

  /**
   * Bring the scene in line with `doc`, syncing only what changed.
   *
   * The previous behaviour resynced every entity on every edit, and because
   * `syncEntity` re-runs the texture, glow and opacity subtree traversals even
   * for an object it is only updating, hiding a single layer cost a full
   * thousand-entity resync.
   */
  async function syncDoc() {
    const gen = docGeneration;
    // Detach first — a resync may remove and recreate the attached mesh.
    transform.detach();
    const keep = new Set(doc.entities.map((e) => e.id));
    roots.forEach((_obj, id) => {
      if (!keep.has(id)) disposeRoot(id);
    });
    for (const id of [...syncedKeys.keys()]) {
      if (!keep.has(id)) syncedKeys.delete(id);
    }

    const envTextureKey = doc.environment?.defaultTextureUrl ?? '';
    const dirty: { ent: EditorEntity; key: string; structure: string }[] = [];
    for (const ent of doc.entities) {
      const key = entitySyncKey(ent, envTextureKey);
      const prev = syncedKeys.get(ent.id);
      if (prev?.key === key) {
        // Unchanged, but the frame loop holds entity references, so re-point it
        // at the object from this document revision.
        trackAnimatedEntity(ent);
        continue;
      }
      const structure = entityStructureKey(ent);
      // Cleared up front so an aborted sync cannot leave a stale "clean" mark.
      syncedKeys.delete(ent.id);
      if (prev && prev.structure !== structure) disposeRoot(ent.id);
      dirty.push({ ent, key, structure });
    }

    if (dirty.length) {
      await Promise.all(
        dirty.map(async ({ ent, key, structure }) => {
          await syncEntity(ent);
          // A newer setDoc may have superseded this pass mid-load.
          if (gen === docGeneration) syncedKeys.set(ent.id, { key, structure });
        })
      );
    }
    refreshGizmos();
    attachSelectionGizmo();
  }

  void syncDoc();

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
    // Locked entities cannot be selected — they are immovable. Only
    // double-tap (handled in onPointerUp) opens their properties panel.
    const ent = doc.entities.find((e) => e.id === id);
    if (isLockedEnt(ent)) {
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
      if (ent?.groupId) {
        selectedIds = doc.entities
          .filter((e) => e.groupId === ent.groupId)
          .map((e) => e.id);
      } else {
        selectedIds = [id];
      }
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
                        ? '#ef4444'
                        : kind === 'health_floor'
                          ? '#34d399'
                          : kind === 'revive_pad'
                            ? '#60a5fa'
                            : kind === 'push_rail'
                              ? '#38bdf8'
                              : kind === 'push_block'
                                ? '#fbbf24'
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
          : kind === 'push_rail'
            ? modelName ?? 'floor-thick'
            : kind === 'push_block'
              ? modelName ?? 'crate'
              : modelName;

    const runnerCount =
      kind === 'start' || kind === 'spawn_runner'
        ? doc.entities.filter((e) => e.kind === 'start' || e.kind === 'spawn_runner').length + 1
        : 0;

    const foot = defaultModel ? modelFootprint(defaultModel) : null;
    const isHammer = defaultModel === HAMMER_SOLID_MODEL;
    const shape: HammerPrimitive = isHammer ? hammerShape : 'box';
    const hammerSize: [number, number, number] = isHammer
      ? defaultSizeForHammer(shape)
      : [2, 0.25, 2];

    const ent: EditorEntity = {
      id: generateId(),
      name:
        kind === 'start' || kind === 'spawn_runner'
          ? `Runner Spawn ${runnerCount}`
          : isHammer
            ? `Hammer ${shape}`
            : kind === 'spinner'
              ? 'Rotating hazard'
              : kind === 'push_rail'
                ? 'Push rail'
                : kind === 'push_block'
                  ? 'Push block'
                  : entityKindLabel(kind),
      kind,
      model: isHammer ? HAMMER_SOLID_MODEL : defaultModel,
      primitive: isHammer ? shape : undefined,
      layerId: activeLayerId,
      position: [x, Math.max(0, y), z],
      rotation: [0, 0, 0],
      scale: isHammer
        ? [1, 1, 1]
        : padKinds
          ? [2, 1, 2]
          : (defaultModel ? getLastPrefabScale(defaultModel) : null) ?? [1, 1, 1],
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
      meshCollisionPads: isHammer ? hollowHammerCollisionPads(shape, hammerSize) : undefined,
      textureWorldScale: isHammer ? 1 : undefined,
      textureRepeat: isHammer
        ? worldScaleToUvRepeat(entityWorldSize(hammerSize, [1, 1, 1]), 1)
        : undefined,
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
      spinHazard: kind === 'spinner' ? defaultSpinHazard() : undefined,
      pushRail: kind === 'push_rail' ? defaultPushRail() : undefined,
      pushBlock: kind === 'push_block' ? defaultPushBlock() : undefined,
    };
    doc = { ...doc, entities: [...doc.entities, ent] };
    // Sync React state immediately so a concurrent setDoc cannot wipe the new entity.
    handlers.onDocChange(doc);
    void syncEntity(ent).then(() => {
      select(ent.id);
    });
    handlers.onPlaceResult?.(layer?.visible === false ? 'hidden-layer' : 'ok', layer?.name);
    handlers.onEntityPlaced?.(ent);
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
    transform.enabled = !placingToolActive() && !freeFly && !measureMode;
    if (placingToolActive()) {
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
    // Paint Tool: RMB = COPY texture + full UV package from whatever solid is
    // under the cursor. This is exact: keeps source tile density, offset, and
    // rotation so pasting onto a neighboring wall with the same worldScale
    // produces continuous, seamless tiling without seams.
    if (ev.button === 2 && editTool === 'paint' && !freeFly && !measureMode) {
      if (!setPointerFromClient(ev.clientX, ev.clientY)) return;
      raycaster.setFromCamera(pointer, camera);
      const pickables = Array.from(roots.values()).filter((r) => r.visible);
      const hits = raycaster.intersectObjects(pickables, true);
      if (!hits.length) return;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.entityId) o = o.parent;
      const id = o?.userData.entityId as string | undefined;
      if (!id) return;
      const ent = doc.entities.find((e) => e.id === id);
      if (!ent || isLockedEnt(ent)) return;
      const worldScale = ent.textureWorldScale ?? paintUv.worldScale;
      const repeat = resolveEntityTextureRepeat(ent) ?? [...paintUv.repeat] as [
        number,
        number,
      ];
      const offset = (ent.textureOffset ?? [...paintUv.offset]) as [number, number];
      const rotation = ent.textureRotation ?? paintUv.rotation;
      copiedTexture = {
        textureUrl: ent.textureUrl || doc.environment?.defaultTextureUrl || null,
        worldScale,
        repeat: [...repeat] as [number, number],
        offset: [...offset] as [number, number],
        rotation,
        sourceName: ent.name || ent.model || undefined,
      };
      // Also update the active paint texture URL so single LMB (non-copied)
      // continues acting like a brush loaded with this texture.
      paintTextureUrl = copiedTexture.textureUrl;
      paintUv.worldScale = worldScale;
      paintUv.repeat = [...repeat] as [number, number];
      paintUv.offset = [...offset] as [number, number];
      paintUv.rotation = rotation;
      handlers.onCopiedTexture?.({ ...copiedTexture });
      return;
    }

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
    // (Works with copied state OR with the explicitly-selected paint URL + UV sliders.)
    if (
      !freeFly &&
      !measureMode &&
      editTool === 'paint' &&
      (paintTextureUrl || copiedTexture)
    ) {
      orbit.enabled = false;
      try {
        renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    // Mobile / touch long-press → additive multi-select (locked entities excluded).
    if (!freeFly && !measureMode && editTool === 'select' && !ev.shiftKey && !ev.altKey) {
      if (!setPointerFromClient(ev.clientX, ev.clientY)) return;
      raycaster.setFromCamera(pointer, camera);
      const pickables = Array.from(roots.values()).filter((r) => r.visible);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !o.userData.entityId) o = o.parent;
        if (o?.userData.entityId) {
          const candidateId = o.userData.entityId as string;
          const candidateEnt = doc.entities.find((e) => e.id === candidateId);
          // Don't arm a long-press for locked entities — they cannot be multi-selected.
          if (!isLockedEnt(candidateEnt)) {
            longPressId = candidateId;
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
      // Locked entities are never box-selected.
      const boxEnt = doc.entities.find((e) => e.id === id);
      if (isLockedEnt(boxEnt)) return;
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
    // Supports two modes:
    //   * Copy-paste mode (copiedTexture != null): uses EXACT repeat/offset/rotation values
    //     captured from the source, plus grid-snapped world-space UV offset so the
    //     pasted brick pattern aligns seamlessly across neighboring walls/floors.
    //     Texture URL taken from the copied package (can be null, meaning "global default").
    //   * Fresh brush mode: uses current paintTextureUrl + paintUv worldScale + sliders.
    if (editTool === 'paint' && (paintTextureUrl || copiedTexture)) {
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
          const usingCopied = copiedTexture != null;
          const tex = copiedTexture?.textureUrl ?? paintTextureUrl ?? null;
          const face = hits[0].face;
          const hitPoint = hits[0].point;

          doc = {
            ...doc,
            entities: doc.entities.map((e) => {
              if (e.id !== id) return e;
              let worldScale: number;
              let repeat: [number, number];
              let offset: [number, number];
              let rotation: number;
              if (usingCopied && copiedTexture) {
                worldScale = copiedTexture.worldScale;
                repeat = [...copiedTexture.repeat] as [number, number];
                offset = [...copiedTexture.offset] as [number, number];
                rotation = copiedTexture.rotation;

                // For seamless copy-paste, snap the UV origin to a world grid
                // aligned with the hit face's tangent plane. This makes the
                // same brick on Wall A and Wall B land on the same grid so
                // corners line up exactly when they meet.
                if (face) {
                  const normal = face.normal.clone();
                  o?.localToWorld(normal);
                  normal.normalize();
                  const UP = new THREE.Vector3(0, 1, 0);
                  const tangent = new THREE.Vector3();
                  const bitangent = new THREE.Vector3();
                  if (Math.abs(normal.dot(UP)) > 0.95) {
                    tangent.set(1, 0, 0);
                    bitangent.set(0, 0, 1);
                  } else {
                    tangent.crossVectors(UP, normal).normalize();
                    bitangent.crossVectors(normal, tangent).normalize();
                  }
                  const ws = Math.max(0.001, worldScale);
                  const u = hitPoint.dot(tangent) / ws;
                  const v = hitPoint.dot(bitangent) / ws;
                  // The first UV hit on the SOURCE face at copy-time was itself
                  // at a world-grid boundary; by snapping the PASTE hit to the
                  // same world grid we get seamless seams on adjacent surfaces.
                  const snapU = u - Math.round(u);
                  const snapV = v - Math.round(v);
                  offset = [offset[0] + snapU, offset[1] + snapV] as [number, number];
                }
              } else {
                worldScale = paintUv.worldScale > 0 ? paintUv.worldScale : 1;
                const size = entityWorldSize(e.collisionSize, e.scale);
                repeat = worldScaleToUvRepeat(size, worldScale);
                offset = [...paintUv.offset] as [number, number];
                rotation = paintUv.rotation;
              }
              return {
                ...e,
                textureUrl: tex ?? e.textureUrl,
                textureWorldScale: worldScale,
                textureRepeat: repeat,
                textureOffset: offset,
                textureRotation: rotation,
              };
            }),
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
      const hitEnt = doc.entities.find((e) => e.id === hitEntityId);
      if (isLockedEnt(hitEnt)) {
        // Locked entity: detect double-tap/double-click to open its properties panel.
        const now = Date.now();
        if (lastTapId === hitEntityId && now - lastTapTime < 400) {
          lastTapTime = 0;
          lastTapId = null;
          handlers.onLockedEntityDoubleTap?.(hitEntityId);
        } else {
          lastTapTime = now;
          lastTapId = hitEntityId;
        }
        return;
      }
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

  // Every interaction path marks the view dirty here rather than inside each
  // individual handler, so no branch can forget to.
  const onPointerDownDirty = (ev: PointerEvent) => {
    requestRender();
    onPointerDown(ev);
  };
  const onPointerUpDirty = (ev: PointerEvent) => {
    requestRender();
    onPointerUp(ev);
  };
  const onMouseMoveDirty = (ev: MouseEvent) => {
    requestRender();
    onMouseMove(ev);
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDownDirty);
  renderer.domElement.addEventListener('pointerup', onPointerUpDirty);
  renderer.domElement.addEventListener('wheel', () => requestRender(), { passive: true });
  renderer.domElement.addEventListener('contextmenu', (ev) => {
    // Prevent browser right-click menu in the viewport — Paint Tool uses RMB
    // as "copy texture + UV from this solid".
    if (editTool === 'paint') ev.preventDefault();
  });
  window.addEventListener('mousemove', onMouseMoveDirty);

  let ctrlAloneCandidate = false;
  const onKeyDown = (e: KeyboardEvent) => {
    requestRender();
    if (e.key === 'Shift') {
      shiftHeld = true;
      syncTransformSnaps();
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
    requestRender();
    if (e.key === 'Shift') {
      shiftHeld = false;
      syncTransformSnaps();
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
    const nowMs = performance.now();
    let drawThisFrame = nowMs <= renderDeadlineMs;
    // Only the handful of entities that actually glow or spin, rather than a
    // scan of the whole map (with two roots.get lookups each) every frame.
    for (const [id, ent] of animatedEntities) {
      const root = roots.get(id);
      if (!root) continue;
      if (ent.glow?.enabled && ent.glow.pulse && ent.glow.pulse !== 'none') {
        tickEntityGlow(root, ent.glow, nowMs);
      }
      tickSpinHazardVisual(root, ent, dt);
    }

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
      // Returns true while damping is still easing the camera to a stop.
      if (orbit.update()) drawThisFrame = true;
    }
    // Guard: TransformControls errors if its target left the scene (rebuild/delete/resync).
    const attached = (transform as unknown as { object?: THREE.Object3D | null }).object;
    if (attached && !attached.parent) {
      transform.detach();
      attachSelectionGizmo();
      drawThisFrame = true;
    }
    director.update(dt);

    // Anything still moving under its own power has to keep drawing, otherwise
    // the dirty window expires mid-animation and the picture freezes.
    if (freeFly || animatedEntities.size > 0 || director.hasRunningAction) {
      drawThisFrame = true;
    }
    if (!drawThisFrame) return;

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
      if (editorPerf.disableBloom) renderer.render(scene, camera);
      else bloom.render();
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

  const api: EditorViewportApi = {
    setDoc: (next) => {
      docGeneration++;
      doc = structuredClone(next);
      if (!doc.environment) doc.environment = { ...DEFAULT_ENVIRONMENT };
      gridSize = doc.gridSize || 1;
      applyEnvironment(ensureEnvironment(doc));
      void syncDoc();
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
      attachSelectionGizmo();
    },
    getEditTool: () => editTool,
    setHammerShape: (shape) => {
      hammerShape = shape;
    },
    getHammerShape: () => hammerShape,
    setActiveLayerId: (id) => {
      activeLayerId = id;
    },
    setTransformMode: (mode) => {
      transform.setMode(mode);
      syncTransformSnaps();
    },
    setGridSnap: (on) => {
      gridSnap = on;
    },
    setGridSize: (n) => {
      gridSize = n;
      doc = { ...doc, gridSize: n };
      syncTransformSnaps();
      handlers.onDocChange(doc);
    },
    setSnapY: (on) => {
      snapY = on;
    },
    setSnapTarget: (target) => {
      snapTarget = target;
    },
    getSnapTarget: () => snapTarget,
    setPivotMode: (mode) => {
      pivotMode = mode;
      // The proxy is seated at the old pivot, so re-seat it for the new mode.
      attachSelectionGizmo();
    },
    getPivotMode: () => pivotMode,
    setTransformSpace: (space) => {
      transformSpace = space;
      transform.setSpace(space);
    },
    getTransformSpace: () => transformSpace,
    setScaleFromSide: (on) => {
      scaleFromSide = on;
    },
    getScaleFromSide: () => scaleFromSide,
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
    setEditorPerfMode: (opts) => {
      const prev = editorPerf;
      editorPerf = { ...editorPerf, ...opts };
      applyEnvironment(ensureEnvironment(doc));
      if (editorPerf.capPixelRatio !== prev.capPixelRatio) setSize();
      if (editorPerf.skipCollisionGizmos !== prev.skipCollisionGizmos) refreshGizmos();
    },
    getEditorPerfMode: () => ({ ...editorPerf }),
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
          'Player Model is platform settings — open Player Model from the left nav'
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
      /** Old groupId → new groupId so each copied cluster stays a group. */
      const groupMap = new Map<string, string>();
      // Old entity id → new copy id, for every entity actually being
      // duplicated — used below to re-target teleport/button/trap wiring
      // between COPIES so a duplicated pair references its own sibling
      // instead of the original entities (which would otherwise mean
      // pressing the new button arms the old trap, and the new trap is only
      // ever armed by the old button).
      const idMap = new Map<string, string>();
      for (const sid of ids) {
        if (doc.entities.some((e) => e.id === sid)) idMap.set(sid, generateId());
      }
      const offset: [number, number, number] = [
        axis === 'x' ? gridSize : 0,
        axis === 'y' ? gridSize : 0,
        axis === 'z' ? gridSize : 0,
      ];
      for (const sid of ids) {
        const src = doc.entities.find((e) => e.id === sid);
        if (!src) continue;
        let newGroupId: string | undefined;
        if (src.groupId) {
          if (!groupMap.has(src.groupId)) {
            groupMap.set(src.groupId, generateId('grp'));
          }
          newGroupId = groupMap.get(src.groupId);
        } else if (ids.length >= 2) {
          // Multi-select copy of ungrouped pieces → one new group so they stay together.
          if (!groupMap.has('__selection__')) {
            groupMap.set('__selection__', generateId('grp'));
          }
          newGroupId = groupMap.get('__selection__');
        }
        const animation = src.animation
          ? { ...src.animation, availableClips: [...src.animation.availableClips] }
          : defaultAnimation();
        if (animation.listenToEntityId && idMap.has(animation.listenToEntityId)) {
          animation.listenToEntityId = idMap.get(animation.listenToEntityId);
        }
        if (animation.activatesEntityIds?.length) {
          animation.activatesEntityIds = animation.activatesEntityIds.map(
            (id) => idMap.get(id) ?? id
          );
        }
        const teleport =
          src.teleport?.targetEntityId && idMap.has(src.teleport.targetEntityId)
            ? { ...src.teleport, targetEntityId: idMap.get(src.teleport.targetEntityId) }
            : src.teleport;
        // Base the copy on cloneEntity()'s full deep-clone (scale/rotation/
        // hazard/motion/csgPads/playerSkins/etc.) instead of a bare `...src`
        // spread — the previous version only rebuilt position/animation/
        // teleport, leaving every other array/object field (scale, rotation,
        // hazard, motion, csgPads, playerSkins, …) aliased to the original
        // entity's own references, so editing a duplicate in place could
        // silently corrupt the entity it was copied from.
        const cloned = cloneEntity(src);
        copies.push({
          ...cloned,
          id: idMap.get(sid) ?? cloned.id,
          name: `${src.name} Copy`,
          locked: false,
          groupId: newGroupId,
          position: [
            src.position[0] + offset[0],
            src.position[1] + offset[1],
            src.position[2] + offset[2],
          ] as [number, number, number],
          animation,
          teleport,
        });
      }
      doc = { ...doc, entities: [...doc.entities, ...copies] };
      handlers.onDocChange(doc);
      void Promise.all(copies.map((c) => syncEntity(c))).then(() => {
        selectedIds = copies.map((c) => c.id);
        selectedId = selectedIds[0] ?? null;
        attachSelectionGizmo();
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
      if (ents.some((e) => isLockedEnt(e))) {
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
    snapSelectedToFace: (face, idsOverride, opts) => {
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
      if (ents.some((e) => isLockedEnt(e))) {
        handlers.onPlaceResult?.('locked', 'selection');
        return false;
      }

      /**
       * World-space quaternion + LOCAL half-extents + world CENTER + the
       * local-space pivot→center offset for an entity.
       *
       * Two things matter here and both bit us before:
       *  1. Local (not world-AABB) half-extents so rotated/tilted pieces
       *     still measure their own true body instead of an inflated
       *     axis-aligned box (breaks face-to-face placement for tilted ramps).
       *  2. The entity's PIVOT is not always its geometric center — Hammer
       *     solids and other "planted" meshes are bottom-aligned (pivot at
       *     the feet), so treating `root.position` as the box center shifted
       *     every anchor by half the object's height and made "Top" snap
       *     sink into (or float above) the other piece instead of touching
       *     exactly. Measuring the real rendered geometry (temporarily at
       *     identity position/rotation) gives the true center and pivot
       *     offset regardless of mesh type, and is also more accurate than
       *     the authored `collisionSize` metadata, which can drift slightly
       *     from the actual mesh.
       */
      const measure = (e: EditorEntity) => {
        const root = roots.get(e.id);
        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            THREE.MathUtils.degToRad(e.rotation[0]),
            THREE.MathUtils.degToRad(e.rotation[1]),
            THREE.MathUtils.degToRad(e.rotation[2])
          )
        );
        let half: THREE.Vector3;
        let localPivotOffset: THREE.Vector3;
        if (root) {
          const savedPos = root.position.clone();
          const savedQuat = root.quaternion.clone();
          root.position.set(0, 0, 0);
          root.quaternion.identity();
          root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(root);
          root.position.copy(savedPos);
          root.quaternion.copy(savedQuat);
          root.updateMatrixWorld(true);
          if (!box.isEmpty()) {
            half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
            half.x = Math.max(0.05, half.x);
            half.y = Math.max(0.05, half.y);
            half.z = Math.max(0.05, half.z);
            localPivotOffset = box.getCenter(new THREE.Vector3());
          } else {
            half = new THREE.Vector3(0.5, 0.5, 0.5);
            localPivotOffset = new THREE.Vector3(0, 0, 0);
          }
        } else {
          const base = (e.collisionSize ?? [1, 1, 1]) as [number, number, number];
          half = new THREE.Vector3(
            Math.max(0.05, (base[0] * Math.abs(e.scale[0])) / 2),
            Math.max(0.05, (base[1] * Math.abs(e.scale[1])) / 2),
            Math.max(0.05, (base[2] * Math.abs(e.scale[2])) / 2)
          );
          localPivotOffset = new THREE.Vector3(0, 0, 0);
        }
        const pivot = new THREE.Vector3(
          root?.position.x ?? e.position[0],
          root?.position.y ?? e.position[1],
          root?.position.z ?? e.position[2]
        );
        const center = pivot.clone().add(localPivotOffset.clone().applyQuaternion(quat));
        return { quat, half, center, localPivotOffset };
      };

      /** OBB support distance: how far this object's own body extends past
       * its center along world-space direction `dir` (unit vector). */
      const support = (m: ReturnType<typeof measure>, dir: THREE.Vector3) => {
        const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quat);
        const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quat);
        const ez = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quat);
        return (
          Math.abs(ex.dot(dir)) * m.half.x +
          Math.abs(ey.dot(dir)) * m.half.y +
          Math.abs(ez.dot(dir)) * m.half.z
        );
      };

      const anchorEnt = ents[0];
      const aM = measure(anchorEnt);
      const updates = new Map<string, [number, number, number]>();
      /** Only populated for `alignRotation`, where pieces adopt the anchor's angle. */
      const rotationUpdates = new Map<string, [number, number, number]>();

      // Anchor never moves — leave its pivot position exactly as-is (not
      // its geometric center, which can differ for bottom-aligned meshes).
      {
        const anchorRoot = roots.get(anchorEnt.id);
        updates.set(anchorEnt.id, [
          anchorRoot?.position.x ?? anchorEnt.position[0],
          anchorRoot?.position.y ?? anchorEnt.position[1],
          anchorRoot?.position.z ?? anchorEnt.position[2],
        ]);
      }

      // Chosen face, expressed as the anchor's OWN local axis (not world X/Z)
      // so this works correctly for rotated/tilted pieces, then rotated into
      // world space by the anchor's own orientation.
      const faceLocal =
        face === '+x'
          ? new THREE.Vector3(1, 0, 0)
          : face === '-x'
            ? new THREE.Vector3(-1, 0, 0)
            : face === '+y'
              ? new THREE.Vector3(0, 1, 0)
              : face === '-y'
                ? new THREE.Vector3(0, -1, 0)
                : face === '+z'
                  ? new THREE.Vector3(0, 0, 1)
                  : new THREE.Vector3(0, 0, -1);
      const faceDir = faceLocal.clone().applyQuaternion(aM.quat).normalize();

      // Every other selected piece is placed flush against the CHOSEN face of
      // the anchor (touching distance computed via each piece's own OBB
      // support along that world direction, so pieces with different
      // rotations than the anchor still butt up correctly) and stacked along
      // that same face for pieces beyond the first. The two axes
      // perpendicular to the chosen face are centered on the anchor IN THE
      // ANCHOR'S LOCAL FRAME (not world space) so faces stay aligned even
      // when the anchor itself is rotated.
      let cursorCenter = aM.center.clone();
      let cursorSupport = support(aM, faceDir);
      for (let i = 1; i < ents.length; i++) {
        const e = ents[i];
        // Measure against the orientation the piece will END UP with, otherwise
        // the flush distance is computed for the old angle and the aligned piece
        // overlaps or floats.
        let posed = e;
        if (opts?.alignRotation) {
          const rot = [...anchorEnt.rotation] as [number, number, number];
          rotationUpdates.set(e.id, rot);
          posed = { ...e, rotation: rot };
        }
        const m = measure(posed);
        const eSupport = support(m, faceDir);
        const newCenter = cursorCenter
          .clone()
          .add(faceDir.clone().multiplyScalar(cursorSupport + eSupport));
        // Re-center the two non-face axes onto the anchor in the anchor's
        // local frame (keeps side-to-side / top-to-top edges flush).
        const localOffset = newCenter.clone().sub(aM.center).applyQuaternion(aM.quat.clone().invert());
        if (face === '+x' || face === '-x') {
          localOffset.y = 0;
          localOffset.z = 0;
        } else if (face === '+y' || face === '-y') {
          localOffset.x = 0;
          localOffset.z = 0;
        } else {
          localOffset.x = 0;
          localOffset.y = 0;
        }
        const finalCenter = aM.center.clone().add(localOffset.applyQuaternion(aM.quat));
        // Convert this piece's own geometric center back to its pivot
        // (position field) using ITS OWN local pivot offset/rotation, not
        // the anchor's — each piece keeps its own rotation and pivot type.
        const pivot = finalCenter
          .clone()
          .sub(m.localPivotOffset.clone().applyQuaternion(m.quat));
        const pos: [number, number, number] = [pivot.x, pivot.y, pivot.z];
        updates.set(e.id, pos);
        cursorCenter = finalCenter;
        cursorSupport = eSupport;
      }

      selectedIds = ids;
      selectedId = ids[ids.length - 1] ?? null;

      doc = {
        ...doc,
        entities: doc.entities.map((e) => {
          const pos = updates.get(e.id);
          const rot = rotationUpdates.get(e.id);
          if (!pos && !rot) return e;
          return { ...e, ...(pos ? { position: pos } : {}), ...(rot ? { rotation: rot } : {}) };
        }),
      };
      for (const [id, pos] of updates) {
        const root = roots.get(id);
        if (root) root.position.set(pos[0], pos[1], pos[2]);
      }
      for (const [id, rot] of rotationUpdates) {
        const root = roots.get(id);
        if (!root) continue;
        root.rotation.set(
          THREE.MathUtils.degToRad(rot[0]),
          THREE.MathUtils.degToRad(rot[1]),
          THREE.MathUtils.degToRad(rot[2])
        );
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
        if (isLockedEnt(e)) continue;
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
    snapSelectionToNearestNeighbor: () => snapDragToNearestNeighbor(),
    transformSelection: (op) => {
      const ids = selectionTransformIds();
      if (!ids.length) return false;
      const pivotVec = computeSelectionPivot(ids);
      const pivot: [number, number, number] = [pivotVec.x, pivotVec.y, pivotVec.z];
      const applyPose = (eId: string, root: THREE.Object3D) => {
        const e = doc.entities.find((x) => x.id === eId);
        if (!e) return;
        e.position = [root.position.x, root.position.y, root.position.z];
        e.rotation = [
          THREE.MathUtils.radToDeg(root.rotation.x),
          THREE.MathUtils.radToDeg(root.rotation.y),
          THREE.MathUtils.radToDeg(root.rotation.z),
        ];
      };
      for (const id of ids) {
        const e = doc.entities.find((x) => x.id === id);
        const root = roots.get(id);
        if (!e || !root) continue;
        const next = applySelectionTransformOp(e.position, e.rotation, pivot, op);
        root.position.set(...next.position);
        root.rotation.set(
          THREE.MathUtils.degToRad(next.rotation[0]),
          THREE.MathUtils.degToRad(next.rotation[1]),
          THREE.MathUtils.degToRad(next.rotation[2])
        );
        applyPose(id, root);
      }
      handlers.onDocChange(doc);
      attachSelectionGizmo();
      refreshGizmos();
      return true;
    },
    bakeMeshCollision: async (id) => {
      const e = doc.entities.find((x) => x.id === id);
      if (!e) return { ok: false, error: 'Object not found.' };
      if (isLockedEnt(e)) return { ok: false, error: 'Object is locked.' };
      try {
        const pads = await bakeMeshCollisionForEntity(e);
        const cur = doc.entities.find((x) => x.id === id);
        if (!cur) return { ok: false, error: 'Object was removed while baking.' };
        // Stamp what this bake was derived from so Play Test can skip it next
        // time (see needsMeshCollisionBake). Keyed off `cur`, not `e`, in case
        // the model changed while the load was in flight.
        const bakeKey = meshCollisionBakeKeyFor(cur) ?? undefined;
        doc = {
          ...doc,
          entities: doc.entities.map((x) =>
            x.id === id ? { ...x, meshCollisionPads: pads, meshCollisionBakeKey: bakeKey } : x
          ),
        };
        handlers.onDocChange(doc);
        return { ok: true, boxCount: pads.length };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Bake failed.' };
      }
    },
    clearMeshCollision: (id) => {
      const e = doc.entities.find((x) => x.id === id);
      if (!e || !e.meshCollisionPads) return;
      doc = {
        ...doc,
        entities: doc.entities.map((x) =>
          x.id === id
            ? { ...x, meshCollisionPads: undefined, meshCollisionBakeKey: undefined }
            : x
        ),
      };
      handlers.onDocChange(doc);
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
        .find((e) => e && isLockedEnt(e));
      if (lockedHit) {
        handlers.onPlaceResult?.(
          'locked',
          lockedHit.locked ? lockedHit.name : layerMeta(lockedHit.layerId)?.name
        );
        return;
      }
      const removedIds = new Set(ids);
      const remaining = doc.entities.filter((e) => !removedIds.has(e.id));
      doc = { ...doc, entities: scrubDanglingReferences(remaining, removedIds) };
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
            (isHammerSolidEntityDoc(prev) ||
              (patch.primitive !== undefined && isHammerPrimitive(patch.primitive)) ||
              patch.model === HAMMER_SOLID_MODEL)
        );
      const lightTypeChanged =
        patch.light !== undefined &&
        prev?.kind === 'light' &&
        (patch.light as { type?: string } | undefined)?.type !== undefined &&
        (patch.light as { type?: string }).type !== prev.light?.type;
      if (modelChanged || kindChanged || hammerGeomChanged || lightTypeChanged) {
        transform.detach();
        disposeRoot(id);
      }
      const gen = docGeneration;
      const myToken = (selectedUpdateTokens.get(id) ?? 0) + 1;
      selectedUpdateTokens.set(id, myToken);
      doc = {
        ...doc,
        entities: doc.entities.map((e) => {
          if (e.id !== id) return e;
          let next = { ...e, ...patch };
          if (patch.kind === 'light' && !next.light) next.light = defaultLight(next.color);
          if (patch.kind === 'hazard' && !next.hazard) next.hazard = defaultHazard();
          if (patch.kind === 'spinner' && !next.spinHazard) next.spinHazard = defaultSpinHazard();
          if (patch.kind === 'push_rail' && !next.pushRail) next.pushRail = defaultPushRail();
          if (patch.kind === 'push_block' && !next.pushBlock) next.pushBlock = defaultPushBlock();
          if (hammerGeomChanged) {
            const shape = ((next.primitive as HammerPrimitive) || 'box') as HammerPrimitive;
            const size =
              (next.collisionSize as [number, number, number] | undefined) ??
              defaultSizeForHammer(shape);
            next.meshCollisionPads = hollowHammerCollisionPads(shape, size);
          }
          if (modelChanged) next = stripMeshCollisionIfModelChanged(e, next);
          return next;
        }),
      };
      const ent = doc.entities.find((e) => e.id === id);
      if (ent) {
        void (async () => {
          if (gen !== docGeneration || selectedUpdateTokens.get(id) !== myToken) return;
          if (modelChanged && (ent.model || ent.customModelUrl)) {
            const src = resolveModelSrc(ent.model, ent.customModelUrl);
            if (src) {
              const names = await scanModelClips(src);
              if (gen !== docGeneration || selectedUpdateTokens.get(id) !== myToken) return;
              const live = doc.entities.find((e) => e.id === id);
              if (!live) return;
              if (names.length) {
                const sug = AnimationDirector.suggestClips(names);
                live.animation = {
                  ...defaultAnimation(),
                  ...live.animation,
                  availableClips: names,
                  defaultClip: live.animation?.defaultClip || sug.defaultClip,
                  activeClip: live.animation?.activeClip || sug.activeClip,
                };
                doc = {
                  ...doc,
                  entities: doc.entities.map((e) => (e.id === id ? { ...live } : e)),
                };
              }
            }
          }
          if (gen !== docGeneration || selectedUpdateTokens.get(id) !== myToken) return;
          const live = doc.entities.find((e) => e.id === id);
          if (!live) return;
          await syncEntity(live);
          if (gen !== docGeneration || selectedUpdateTokens.get(id) !== myToken) return;
          attachSelectionGizmo();
          refreshGizmos();
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
    stopEntityAnim: (entityId) => {
      const id = entityId ?? selectedId;
      if (!id) return;
      director.stopEntity(id);
    },
    resumeEntityAnim: (entityId) => {
      const id = entityId ?? selectedId;
      if (!id) return;
      director.resumeEntity(id);
      const ent = doc.entities.find((e) => e.id === id);
      if (ent) director.playDefault(ent);
    },
    stopAllAnim: () => {
      director.stopAll();
    },
    resumeAllAnim: () => {
      director.resumeAll();
      // Re-kick every entity's default/always animation now that freeze is lifted.
      for (const ent of doc.entities) {
        if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
          director.playDefault(ent);
        }
      }
    },
    isAllAnimStopped: () => director.isAllStopped,
    isEntityAnimStopped: (entityId) => director.isFrozen(entityId),
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
      worldScale?: number;
      repeat?: [number, number];
      offset?: [number, number];
      rotation?: number;
    }) => {
      if (typeof uv.worldScale === 'number' && uv.worldScale > 0) {
        paintUv.worldScale = uv.worldScale;
      }
      if (uv.repeat) paintUv.repeat = uv.repeat;
      if (uv.offset) paintUv.offset = uv.offset;
      if (typeof uv.rotation === 'number') paintUv.rotation = uv.rotation;
    },
    /** Read back the last texture+UV copied via Paint Tool RMB, or null. */
    getCopiedTexture: () =>
      copiedTexture
        ? {
            textureUrl: copiedTexture.textureUrl,
            worldScale: copiedTexture.worldScale,
            repeat: [...copiedTexture.repeat] as [number, number],
            offset: [...copiedTexture.offset] as [number, number],
            rotation: copiedTexture.rotation,
            sourceName: copiedTexture.sourceName,
          }
        : null,
    /**
     * Clear the copied paint state so subsequent LMB clicks fall back to the
     * brush default paint UV settings again.
     */
    clearCopiedTexture: () => {
      copiedTexture = null;
    },
    destroy: () => {
      envLoadGen += 1;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDownDirty);
      renderer.domElement.removeEventListener('pointerup', onPointerUpDirty);
      window.removeEventListener('mousemove', onMouseMoveDirty);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement) document.exitPointerLock?.();
      boxOverlay.remove();
      director.clear();
      clearSelectionOutlines();
      clearCollisionGizmos();
      for (const id of [...roots.keys()]) disposeRoot(id);
      gizmoMatSolid.dispose();
      gizmoMatJump.dispose();
      gizmoMatHazard.dispose();
      gizmoMatAnim.dispose();
      if (skyTexture) {
        skyTexture.dispose();
        skyTexture = null;
      }
      floorMesh.geometry.dispose();
      (floorMesh.material as THREE.Material).dispose();
      voidShadowMesh.geometry.dispose();
      voidShadowMat.dispose();
      voidShadowInner.geometry.dispose();
      voidShadowInnerMat.dispose();
      voidShadowTex.dispose();
      transform.dispose();
      orbit.dispose();
      try {
        bloom.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    },
  };

  /**
   * Any call in from the outside can change what the viewport should show, so
   * mark the view dirty around the whole API surface rather than trusting ~70
   * individual methods to each remember. A redundant request from a getter costs
   * one extra drawn frame, which is far cheaper than a missed one leaving the
   * canvas stale until the user happens to move the mouse.
   */
  for (const key of Object.keys(api) as (keyof EditorViewportApi)[]) {
    if (key === 'destroy') continue;
    const original = api[key];
    if (typeof original !== 'function') continue;
    const wrapped = (...args: unknown[]) => {
      const result = (original as (...a: unknown[]) => unknown).apply(api, args);
      requestRender();
      return result;
    };
    (api as unknown as Record<string, unknown>)[key] = wrapped;
  }

  return api;
}
