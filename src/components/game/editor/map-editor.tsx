'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Save,
  Download,
  Upload,
  X,
  Move3d,
  RotateCcw,
  Maximize2,
  Grid3x3,
  Plus,
  Trash2,
  Copy,
  Flag,
  Play,
  Palette,
  Navigation,
  User,
  CircleDot,
  Undo2,
  Redo2,
  HelpCircle,
  Crosshair,
  Skull,
  Zap,
  Ruler,
  Menu,
  EyeOff,
  Eye,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Rocket,
  FlagTriangleRight,
  PersonStanding,
  Home,
  Heart,
  HeartPulse,
  Bug,
  MousePointer2,
  Paintbrush,
  Magnet,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  PaintBucket,
  Hammer,
  LayoutGrid,
  Square,
  Link2,
  Unlink2,
  Sparkles,
  Scissors,
  Combine,
  Route,
  Package,
  Fan,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import type {
  EditorEntity,
  EntityCollideMaterial,
  EntityLightType,
  GlowPulseMode,
  HammerPrimitive,
  MapDocument,
} from './map-document';
import {
  HAMMER_SOLID_MODEL,
  ensureAnimation,
  ensureEntityGlow,
  ensureEnvironment,
  ensureHazard,
  ensureHealthFloor,
  ensureInteract,
  ensureJumpPad,
  ensureLight,
  ensureMonsterSpawn,
  ensurePlatformMotion,
  ensurePushBlock,
  ensurePushRail,
  ensureRedZone,
  ensureRevive,
  ensureSpinHazard,
  ensureSurface,
  ensureTeleport,
  ensureWaveAnchor,
  entityExportsAsPlatform,
  entityKindHint,
  entityKindLabel,
  entityKindsForMode,
  entityShowsGameplayMaterial,
  getEntityWarnings,
  entityShowsModelPicker,
  findPlayerEntity,
  generateId,
  getMapGameMode,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
  isPlatformPlayerKind,
  isEntityEditLocked,
  expandIdsWithGroups,
  patchCollideMaterial,
  resolveCollideMaterial,
  entityWorldSize,
} from './map-document';
import {
  defaultSizeForHammer,
  HAMMER_PRIMITIVES,
  hollowHammerCollisionPads,
  loadStickyHammerShape,
  saveStickyHammerShape,
} from './hammer-shapes';
import { TextureAtlasPicker } from './texture-atlas-picker';
import { PLAY_TEST_MESH_BAKE_OPTS } from './play-test-bake';
import { worldScaleToUvRepeat } from './editor-mesh';
import type { SelectionTransformOp } from './selection-transform';
import { ModifyPanel } from './modify-panel';
import { getKilrunModeInfo } from '@/lib/game-modes';
import { PROTOTYPE_MODELS } from './prototype-catalog';
import {
  getPrefabLibrary,
  getPrefabLibraryCategories,
  adminUploadPrefabModel,
} from '@/lib/prefab-library-actions';
import { CharacterAssetPicker } from './character-asset-picker';
import { persistEditorModelDataUrl, persistEditorModelFile, persistEditorImageFile } from '@/lib/engine/platform-client';
import {
  ensureStarterMap,
  exportJson,
  getMapThumbnail,
  hydrateCloudMapsIntoLocal,
  importJson,
  listMaps,
  loadMap,
  loadMapDetailed,
  saveMap,
} from './map-storage';
import {
  createEditorViewport,
  DEFAULT_EDITOR_PERF_MODE,
  type EditTool,
  type EditorCameraState,
  type EditorPerfMode,
  type EditorViewLayout,
  type EditorViewportApi,
  type PivotMode,
  type SnapTarget,
  type TransformMode,
  type TransformSpace,
} from './editor-viewport';
import { MapPlayPreview } from './map-play-preview';
import { MenuSfxRoot } from '../effects/menu-sfx';
import { playSound } from '../effects/soundboard';
import { PlayTestEngine } from './play-test-engine';
import { ensureMapPlayerEntity } from './player-avatar';
import type { TpsViewSettings } from '../tps/tps-view-settings';
import { sanitizeTpsView } from '../tps/tps-view-settings';
import type { SkinAttachment } from '@/lib/player-skins';
import { SNAP_FACE_LABELS, SnapFacePicker } from './snap-face-picker';
import './engine/builtins';
import { emitPlaytest } from '@/lib/engine/plugin-sdk';
import { getSidebarPlugin, getSidebarPlugins, isStudioPluginTab } from './engine/registry';
import type { MapEditorBrains, MapEditorStudioOptions } from './engine/types';
import { hydrateWeaponCatalogFromApi } from '@/lib/weapon-catalog';
import { listCloudMapDocuments, publishCloudMap } from '@/lib/game-map-actions';
import { attachPluginRuntimeToDoc } from '@/lib/engine/plugin-runtime-store';
import { loadMapEmbeddedPlugins } from '@/lib/engine/plugin-loader';
import {
  isEditorMapTheLiveCloudMap,
  liveCloudMismatchMessage,
  type CloudActiveMapMeta,
} from './live-map-identity';
import type { MapShopSettings } from './map-document';
import {
  BUILTIN_TEXTURES,
  listCustomTextures,
  saveCustomTexture,
  type CustomTexture,
} from './texture-library';
import { AnimationPropsPanel } from './animation-props-panel';
import {
  EditorTutorial,
  hasCompletedTutorial,
  KeyboardShortcutsOverlay,
  resetTutorialFlag,
  type TutorialStep,
} from './editor-help';
import { shortcutKeys, shortcutTitle } from './editor-shortcuts';
import { EditorTip } from './editor-tooltip';
import {
  getActivePlayMapIdForMode,
  listPrefabs,
  setActivePlayMapIdForMode,
  stripLegacyBakedStairPads,
  type PrefabStamp,
} from './prefab-storage';
import { setLastPrefabScale } from './prefab-defaults';
import { formatValidationSummary, validateMapForPublish } from './map-validate';
import { MAX_MESH_COLLISION_PADS, needsMeshCollisionBake } from './mesh-voxelize';
import { isCsgDeleteResult, isCsgEligible, subtractEntities, unionEntities, intersectEntities } from './csg-tools';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';

/**
 * Any registered sidebar plugin id. Host: undo/history, viewport and play test
 * stay here — every panel, built-in or add-on, comes from engine/registry.
 */
type SidebarTab = string;

function isStudioSidebarTab(tab: SidebarTab): boolean {
  return isStudioPluginTab(tab);
}

function snapshotMapDoc(d: MapDocument) {
  return JSON.stringify(d);
}

/** Undo depth in steps. */
const HISTORY_MAX_STEPS = 60;
/**
 * Ceiling on the serialized bytes the undo stack may hold (~48 MB). Guards
 * against a very large map turning 60 full document snapshots into hundreds of
 * megabytes of retained heap; ordinary maps never come close.
 */
const HISTORY_MAX_BYTES = 48 * 1024 * 1024;

export type MapEditorVariant = 'overlay' | 'engine';

export function MapEditor({
  onClose,
  initialMapId,
  variant = 'overlay',
  onViewportReady,
}: {
  onClose: () => void;
  isAdmin?: boolean;
  initialMapId?: string;
  /** overlay = hub portal; engine = fill Kilrun Engine shell */
  variant?: MapEditorVariant;
  onViewportReady?: (api: EditorViewportApi | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EditorViewportApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const texFileRef = useRef<HTMLInputElement>(null);
  const propTexFileRef = useRef<HTMLInputElement>(null);
  const skyFileRef = useRef<HTMLInputElement>(null);

  const starter = useMemo(() => {
    if (initialMapId) {
      const loaded = loadMapDetailed(initialMapId);
      if (loaded.ok) return { id: initialMapId, doc: stripLegacyBakedStairPads(loaded.doc), error: null as string | null };
      const fresh = ensureStarterMap();
      return { id: fresh.id, doc: stripLegacyBakedStairPads(fresh.doc), error: loaded.error };
    }
    const fresh = ensureStarterMap();
    return { id: fresh.id, doc: stripLegacyBakedStairPads(fresh.doc), error: null as string | null };
  }, [initialMapId]);
  const [mapId, setMapId] = useState(starter.id);
  const [doc, setDoc] = useState<MapDocument>(() => ({
    ...starter.doc,
    environment: ensureEnvironment(starter.doc),
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>('assets');

  // Hydrate admin-tunable global weapon catalog stats from the DB once per
  // editor session, so Weapon Editor defaults / shop presets reflect the
  // latest admin-tuned numbers. Safe no-op on any network/DB failure.
  useEffect(() => {
    void hydrateWeaponCatalogFromApi();
  }, []);

  useEffect(() => {
    void loadMapEmbeddedPlugins(doc.pluginRuntime);
    // Map open / switch — don't re-run on every entity edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);
  /** Active placeable model (kept while in Select so Brush can resume). */
  const [brush, setBrush] = useState<string | null>('floor-square');
  /** Select = pick objects; Brush = paint/place. Defaults to Select so clicks don't stack. */
  const [editTool, setEditTool] = useState<EditTool>('select');
  const [hammerShape, setHammerShape] = useState<HammerPrimitive>(() => loadStickyHammerShape());
  const [paintTextureUrl, setPaintTextureUrl] = useState<string | null>(null);
  /** Set after RMB-click on a solid with the Paint tool: exact texture+UV ready to LMB-paste. */
  const [copiedTextureInfo, setCopiedTextureInfo] = useState<{
    textureUrl: string | null;
    sourceName?: string;
  } | null>(null);
  /** Armed click-to-place kind (spawn flag, light, etc.) — cleared by Select / Escape / place-once. */
  const [pendingPlaceKind, setPendingPlaceKind] = useState<EditorEntity['kind'] | null>(null);
  const [viewLayout, setViewLayout] = useState<EditorViewLayout>('single');
  /** World units per texture tile — remembered across paints (and sessions). */
  const [paintWorldScale, setPaintWorldScale] = useState(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const raw = window.localStorage.getItem('kilrun.paintWorldScale');
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* ignore */
    }
    return 1;
  });
  const [paintRepeat, setPaintRepeat] = useState<[number, number]>([2, 2]);
  const [mode, setMode] = useState<TransformMode>('translate');
  const [gridSnap, setGridSnap] = useState(true);
  const [query, setQuery] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('all');
  const [libraryPrefabs, setLibraryPrefabs] = useState<
    Awaited<ReturnType<typeof getPrefabLibrary>>
  >([]);
  const [libraryCategories, setLibraryCategories] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', category: '', file: null as File | null });

  const reloadPrefabLibrary = () => {
    getPrefabLibrary()
      .then(setLibraryPrefabs)
      .catch(() => {});
    getPrefabLibraryCategories()
      .then(setLibraryCategories)
      .catch(() => {});
  };
  useEffect(() => {
    reloadPrefabLibrary();
    const onLive = () => reloadPrefabLibrary();
    window.addEventListener('kilrun-engine-live-session', onLive);
    return () => window.removeEventListener('kilrun-engine-live-session', onLive);
  }, []);
  const [activeLayerId, setActiveLayerId] = useState(starter.doc.layers[0]?.id ?? '');
  const [freeFly, setFreeFly] = useState(false);
  const [playTest, setPlayTest] = useState(false);
  const [playTestRole, setPlayTestRole] = useState<
    'runner' | 'trapper' | 'team_a' | 'team_b' | undefined
  >(undefined);
  const [playTestRolePrompt, setPlayTestRolePrompt] = useState(false);
  /** "Play Test (Live)" — real KilrunEngine game client (HUD/chat/admin/skill
   * menu) against a private practice room, instead of the lightweight local
   * MapPlayPreview renderer. Requires the Colyseus game server (server/)
   * running locally. Horde starts immediately; Deathrun/Competitive pick a role. */
  const [playTestLive, setPlayTestLive] = useState(false);
  /** Which start function the role-prompt's confirm buttons should call. */
  const [playTestPromptTarget, setPlayTestPromptTarget] = useState<'preview' | 'live'>('preview');
  const [customTextures, setCustomTextures] = useState<CustomTexture[]>([]);
  const [snapY, setSnapY] = useState(false);
  const [snapTarget, setSnapTarget] = useState<SnapTarget>('face');
  const [pivotMode, setPivotMode] = useState<PivotMode>('median');
  const [transformSpace, setTransformSpace] = useState<TransformSpace>('world');
  const [scaleFromSide, setScaleFromSide] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem('kilrun.scaleFromSide');
      if (raw === '0') return false;
      if (raw === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  const isMobile = useIsMobile();
  const { toast } = useToast();
  useEffect(() => {
    if (!starter.error) return;
    toast({
      title: 'Map is corrupted',
      description: `${starter.error}. Opened a new draft instead. The original text was kept for recovery (local storage key ends in .corrupt).`,
      variant: 'destructive',
    });
    // Only once on mount for the initial id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();
  const mobileFirst =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || detectTouchDevice());
  const [showHelp, setShowHelp] = useState(!mobileFirst);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [csgBusy, setCsgBusy] = useState(false);
  const [prefabs, setPrefabs] = useState<PrefabStamp[]>([]);
  const [cloudPrefabs, setCloudPrefabs] = useState<
    Array<{
      id: string;
      name: string;
      updatedAt: string;
      entityCount: number;
      thumbnailUrl?: string | null;
    }>
  >([]);
  const [prefabName, setPrefabName] = useState('My Prefab');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // First-time admins get dropped into a raw 3D viewport with an icon-only
  // toolbar and no explanation otherwise — auto-launch the tour once, ever,
  // per browser. hasCompletedTutorial()/markTutorialDone() already existed
  // but nothing called the auto-open half of that pair.
  useEffect(() => {
    if (!hasCompletedTutorial()) setTutorialOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [cloudActive, setCloudActive] = useState<CloudActiveMapMeta | null>(null);
  const cloudActiveRef = useRef<CloudActiveMapMeta | null>(null);
  useEffect(() => {
    cloudActiveRef.current = cloudActive;
  }, [cloudActive]);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureDist, setMeasureDist] = useState<number | null>(null);
  const [showGraphics, setShowGraphics] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  /** Master hide: collapses top bar, side menus, tools, and properties for a clear canvas. */
  const [uiCollapsed, setUiCollapsed] = useState(mobileFirst);
  /** Mobile left asset/library drawer (overlay). Desktop keeps the panel in-flow. */
  const [sidebarOpen, setSidebarOpen] = useState(!mobileFirst);
  /** Icon rail (tool strip) — stays visible even when the wide content panel is collapsed. */
  const [railOpen, setRailOpen] = useState(!mobileFirst);
  /** Draggable width (px) of the wide content panel. Persisted across sessions. */
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 288;
    const raw = window.localStorage.getItem('kilrun.editorPanelWidth');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 288;
  });
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [panelResizing, setPanelResizing] = useState(false);
  /** Magnet tool: which face to snap the selection onto (side/top/etc) — user picks, we don't guess. */
  const [snapFaceMenuOpen, setSnapFaceMenuOpen] = useState(false);
  const [snapFaceAnchorRect, setSnapFaceAnchorRect] = useState<DOMRect | null>(null);
  const [bakingMeshId, setBakingMeshId] = useState<string | null>(null);
  const [bakingAllMesh, setBakingAllMesh] = useState(false);
  const snapMagnetBtnRef = useRef<HTMLButtonElement>(null);
  const rotateMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [rotateMenuOpen, setRotateMenuOpen] = useState(false);
  const [rotateMenuAnchorRect, setRotateMenuAnchorRect] = useState<DOMRect | null>(null);
  const prefabSnapBtnRef = useRef<HTMLButtonElement>(null);
  /** Entities frozen via per-object Stop in the editor viewport (editor-only, not saved to the map). */
  const [stoppedAnimIds, setStoppedAnimIds] = useState<Set<string>>(new Set());
  /** Global Stop All toggle for every animated entity in the editor viewport. */
  const [allAnimStopped, setAllAnimStopped] = useState(false);
  /** Mobile/desktop properties inspector visibility when something is selected. */
  const [propsOpen, setPropsOpen] = useState(!mobileFirst);
  /** Bottom transform/place toolbar — persisted so Settings can toggle visibility. */
  const [toolsOpen, setToolsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem('kilrun.editorToolsVisible');
      if (raw === '0') return false;
      if (raw === '1') return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  /** Play Test optional camera override (from 3rd View “Test in Play”). */
  const [playTpsOverride, setPlayTpsOverride] = useState<TpsViewSettings | null>(null);
  const [showAllCollisionGizmos, setShowAllCollisionGizmos] = useState(false);
  const [editorPerf, setEditorPerf] = useState<EditorPerfMode>({
    ...DEFAULT_EDITOR_PERF_MODE,
  });
  const lastLockedToastAt = useRef(0);
  /** One-time-per-session nudge toward the Button/Trap/Door wiring UI (Animation panel). */
  const wiringHintShown = useRef<Set<EditorEntity['kind']>>(new Set());
  /** Confirm once per session before an explicit Save overwrites the live/Active map. */
  const liveSaveConfirmedRef = useRef(false);
  const cameraBeforePlayRef = useRef<EditorCameraState | null>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const touchLayerRef = useRef<HTMLDivElement>(null);

  const docRef = useRef(doc);
  const uiCollapsedRef = useRef(mobileFirst);
  const playTestRef = useRef(false);
  const playTestLiveRef = useRef(false);
  const freeFlyRef = useRef(false);
  const handleEngineCommandRef = useRef<(type: string) => void>(() => {});
  const undoStack = useRef<MapDocument[]>([]);
  /** Serialized size of each undoStack entry, same index — see pushUndoSnapshot. */
  const undoStackBytes = useRef<number[]>([]);
  const redoStack = useRef<MapDocument[]>([]);
  const skipHistory = useRef(false);
  const lastSavedRef = useRef(
    snapshotMapDoc({
      ...starter.doc,
      environment: ensureEnvironment(starter.doc),
    })
  );
  docRef.current = doc;
  playTestRef.current = playTest;
  playTestLiveRef.current = playTestLive;
  freeFlyRef.current = freeFly;

  const selected = doc.entities.find((e) => e.id === selectedId) ?? null;
  const env = ensureEnvironment(doc);
  /** Studio open = left-nav tab (single source of truth — no desync with setTab). */
  const tpsViewOpen = tab === 'tps';
  const playerStudioOpen = tab === 'player';
  const modelEditorOpen = tab === 'skins';
  const anyStudioOpen = isStudioSidebarTab(tab);
  const [mapListTick, setMapListTick] = useState(0);
  const maps = useMemo(() => {
    void mapListTick;
    return listMaps();
  }, [mapListTick]);

  /**
   * Push one snapshot, then enforce both ceilings: the step cap (unchanged) and
   * a byte budget. Every entry is a full structuredClone of the document, so on
   * a very large map 60 of them can pin hundreds of megabytes — the step cap
   * alone can't see that. Normal maps stay far under the budget and keep all 60
   * steps; huge maps lose their oldest steps instead of the tab's heap.
   */
  const pushUndoSnapshot = (snapshot: MapDocument) => {
    undoStack.current.push(snapshot);
    // One stringify per debounced history entry (not per mutation), alongside a
    // structuredClone of the same document — no meaningful added cost.
    undoStackBytes.current.push(snapshotMapDoc(snapshot).length);
    const dropOldest = () => {
      undoStack.current.shift();
      undoStackBytes.current.shift();
    };
    if (undoStack.current.length > HISTORY_MAX_STEPS) dropOldest();
    let total = undoStackBytes.current.reduce((sum, n) => sum + n, 0);
    // Always keep at least one step, so a single huge edit stays undoable.
    while (undoStack.current.length > 1 && total > HISTORY_MAX_BYTES) {
      total -= undoStackBytes.current[0];
      dropOldest();
    }
  };

  const popUndoSnapshot = () => {
    undoStackBytes.current.pop();
    return undoStack.current.pop();
  };

  const historyAnchor = useRef<MapDocument | null>(null);
  const historyTimer = useRef<number | null>(null);
  const scheduleHistory = () => {
    if (skipHistory.current) return;
    if (!historyAnchor.current) {
      historyAnchor.current = structuredClone(docRef.current);
      redoStack.current = [];
      setCanRedo(false);
      setCanUndo(true);
    }
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => {
      if (historyAnchor.current) {
        pushUndoSnapshot(historyAnchor.current);
        historyAnchor.current = null;
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
      }
    }, 400);
  };

  const flushHistory = () => {
    if (historyTimer.current) {
      window.clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    if (historyAnchor.current) {
      pushUndoSnapshot(historyAnchor.current);
      historyAnchor.current = null;
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);
    }
  };

  const pullViewportDoc = () => {
    const live = apiRef.current?.getDoc();
    if (!live) return;
    const merged = { ...live, environment: ensureEnvironment(live) };
    docRef.current = merged;
    setDoc(merged);
  };

  const undo = () => {
    flushHistory();
    const prev = popUndoSnapshot();
    if (!prev) return;
    const current = structuredClone(apiRef.current?.getDoc() ?? docRef.current);
    redoStack.current.push(current);
    skipHistory.current = true;
    apiRef.current?.setDoc(prev);
    setDoc({ ...prev, environment: ensureEnvironment(prev) });
    docRef.current = prev;
    skipHistory.current = false;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    flushHistory();
    const next = redoStack.current.pop();
    if (!next) return;
    const current = structuredClone(apiRef.current?.getDoc() ?? docRef.current);
    pushUndoSnapshot(current);
    skipHistory.current = true;
    apiRef.current?.setDoc(next);
    setDoc({ ...next, environment: ensureEnvironment(next) });
    docRef.current = next;
    skipHistory.current = false;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  useEffect(() => {
    setCustomTextures(listCustomTextures());
    setPrefabs(listPrefabs());
    setActivePlayId(getActivePlayMapIdForMode(getMapGameMode(doc)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gameMode = getMapGameMode(doc);
  const modeInfo = getKilrunModeInfo(gameMode);
  const kindOptions = entityKindsForMode(gameMode);
  const isCloudLive = isEditorMapTheLiveCloudMap(mapId, cloudActive);
  const isLiveHere = isCloudLive || (!cloudActive && activePlayId === mapId);

  // Mobile: start with menus tucked away so the viewport is usable for placing.
  useEffect(() => {
    if (!isMobile) {
      setUiCollapsed(false);
      setSidebarOpen(true);
      setRailOpen(true);
      setPropsOpen(true);
      setToolsOpen(true);
      return;
    }
    setUiCollapsed(true);
    setSidebarOpen(false);
    setRailOpen(false);
    setToolsOpen(false);
    setPropsOpen(false);
    setShowHelp(false);
  }, [isMobile]);

  // Keep ref in sync so viewport callbacks can read current value without stale closure.
  uiCollapsedRef.current = uiCollapsed;

  // Re-open properties when selection changes (unless chrome is fully hidden or a studio tab is open).
  useEffect(() => {
    if (selectedId && !uiCollapsed && !isStudioSidebarTab(tab)) setPropsOpen(true);
  }, [selectedId, uiCollapsed, tab]);

  const collapseAllMenus = () => {
    setTab((prev) => (isStudioSidebarTab(prev) ? 'assets' : prev));
    setUiCollapsed(true);
    setSidebarOpen(false);
    setPropsOpen(false);
    setToolsOpen(false);
    setShowHelp(false);
  };

  const expandMenus = () => {
    setUiCollapsed(false);
    if (isMobile) {
      setToolsOpen(true);
    } else {
      setSidebarOpen(true);
      setToolsOpen(true);
      setPropsOpen(true);
    }
  };

  const openEditorTab = (id: SidebarTab) => {
    playSound('ui_transition');
    setUiCollapsed(false);
    setSidebarOpen(true);
    setRailOpen(true);
    setTab(id);
  };

  const toggleEditorUi = () => {
    if (uiCollapsedRef.current) expandMenus();
    else collapseAllMenus();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const api = createEditorViewport(host, doc, {
      onSelect: setSelectedId,
      onSelectionChange: setSelectedIds,
      onDocChange: (next, opts) => {
        scheduleHistory();
        const merged = { ...next, environment: ensureEnvironment(next) };
        docRef.current = merged;
        setDirty(true);
        // Mid-drag the ref is enough: every reader that matters goes through
        // docRef or the viewport's own copy, and re-rendering this component on
        // every gizmo frame is what made dragging stutter on big maps. The
        // viewport always follows up with a settled call when the drag ends.
        if (opts?.transient) return;
        setDoc(merged);
      },
      onFreeFlyChange: setFreeFly,
      onMeasureChange: setMeasureDist,
      onPendingPlaceChange: setPendingPlaceKind,
      onPlaceResult: (result, layerName) => {
        if (result === 'locked') {
          const now = Date.now();
          if (now - lastLockedToastAt.current < 1600) return;
          lastLockedToastAt.current = now;
          toast({
            title: 'Locked',
            description: layerName
              ? `“${layerName}” is locked — unlock it in the Layers panel.`
              : 'Object is locked — double-tap it to open properties, or unlock in Layers panel.',
            variant: 'destructive',
          });
          return;
        }
        if (result === 'hidden-layer') {
          const now = Date.now();
          if (now - lastLockedToastAt.current < 1600) return;
          lastLockedToastAt.current = now;
          toast({
            title: 'Placed on a hidden layer',
            description: layerName
              ? `“${layerName}” is hidden — the object was placed but you won't see it until you toggle that layer visible in the Layers panel.`
              : "This layer is hidden — the object was placed but you won't see it until you toggle the layer visible in the Layers panel.",
          });
          return;
        }
        // Click-to-place arming hint (layerName reused as message).
        if (layerName?.startsWith('Click once to place') || layerName?.startsWith('Click floor')) {
          toast({
            title: 'Place entity',
            description: layerName.includes('Shift')
              ? layerName
              : `${layerName}. Click once to place; Shift+click keeps placing.`,
          });
        }
        if (layerName?.startsWith('Player Model is platform')) {
          toast({
            title: 'Player Model',
            description: 'Opens platform-wide avatar settings — not placed on the map.',
          });
        }
      },
      onEntityPlaced: (ent) => {
        if (wiringHintShown.current.has(ent.kind)) return;
        if (ent.kind === 'button') {
          wiringHintShown.current.add('button');
          toast({
            title: 'Button placed',
            description:
              'Select it, then open Properties → Animation → "Activates trap / door" to wire it to a Trap, Hazard, Door, Prop, or Checkpoint.',
          });
        } else if (ent.kind === 'trap' || ent.kind === 'hazard') {
          wiringHintShown.current.add(ent.kind);
          toast({
            title: `${entityKindLabel(ent.kind)} placed`,
            description:
              'On its own this triggers automatically. To make a Button control it instead, select the Button and set its "Activates trap / door" to this object.',
          });
        } else if (ent.kind === 'door') {
          wiringHintShown.current.add('door');
          toast({
            title: 'Door placed',
            description:
              'Closed by default and stays that way with no setup — open Properties → Animation and set a Trigger (Interact/Proximity), or wire a Button\'s "Activates trap / door" to this door.',
          });
        }
      },
      onCopiedTexture: (info) => {
        // RMB-click with Paint tool copies the source solid's exact texture +
        // UV (tile density, offset, rotation). Surface it so the user knows
        // the copy worked and what's loaded — previously this fired silently
        // with zero UI feedback.
        setCopiedTextureInfo({ textureUrl: info.textureUrl, sourceName: info.sourceName });
        setPaintTextureUrl(info.textureUrl);
        toast({
          title: 'Texture copied',
          description: info.sourceName
            ? `Copied from “${info.sourceName}”. Left-click another solid to paste it aligned exactly the same.`
            : 'Left-click another solid to paste it aligned exactly the same.',
        });
      },
      onLockedEntityDoubleTap: (id) => {
        // Double-tap/double-click on a locked entity opens its properties panel
        // so the user can review and unlock it.
        setSelectedId(id);
        setSelectedIds([id]);
        if (!uiCollapsedRef.current) {
          setPropsOpen(true);
          setSidebarOpen(true);
        }
        toast({
          title: 'Locked object',
          description: 'Properties opened — unlock this object to edit it.',
        });
      },
    });
    apiRef.current = api;
    onViewportReady?.(api);
    api.setBrush(brush);
    api.setEditTool(editTool);
    api.setActiveLayerId(activeLayerId);
    api.setGridSnap(gridSnap);
    api.setSnapY(snapY);
    api.setScaleFromSide(scaleFromSide);
    if (detectTouchDevice()) {
      // Mobile defaults to free-fly so joysticks control look + move immediately
      api.setFreeFly(true);
    }
    return () => {
      api.destroy();
      apiRef.current = null;
      onViewportReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Touch joysticks → editor camera
  useEffect(() => {
    if (!isTouch) return;
    const layer = touchLayerRef.current;
    if (!layer) return;
    const joy = new DualJoystick(layer);
    joystickRef.current = joy;
    let raf = 0;
    const tick = () => {
      const move = joy.getMoveVector();
      const look = joy.getAimVector();
      apiRef.current?.setTouchAxes({
        moveX: move.x,
        moveY: move.y,
        lookX: look.x,
        lookY: look.y,
        sprint: joy.isSprintHeld(),
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      joy.destroy();
      joystickRef.current = null;
      apiRef.current?.setTouchAxes({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    };
  }, [isTouch]);

  const onTutorialStep = (step: TutorialStep) => {
    if (!step.tab) return;
    // Leaving a studio tab: switch library without desync (tab is the only studio flag).
    setTab(step.tab as SidebarTab);
    setSidebarOpen(true);
  };

  const publishToMatch = () => {
    const latest = apiRef.current?.getDoc() ?? doc;
    const issues = validateMapForPublish(latest);
    const errs = issues.filter((i) => i.level === 'error');
    if (errs.length) {
      toast({
        title: 'Cannot set MAIN map',
        description: formatValidationSummary(issues),
        variant: 'destructive',
      });
      return;
    }
    if (issues.length) {
      const ok = confirm(
        `${formatValidationSummary(issues)}\n\nPublish anyway?`
      );
      if (!ok) return;
    }
    persist({ skipCloudSync: true });
    setActivePlayMapIdForMode(gameMode, mapId);
    setActivePlayId(mapId);
    const published = workingDoc();
    void publishCloudMap({
      localId: mapId,
      name: published.name,
      mode: gameMode,
      document: attachPluginRuntimeToDoc(published),
      thumbnailDataUrl: getMapThumbnail(mapId),
      setActive: true,
    })
      .then((row) => {
        setCloudActive({
          id: row.id,
          localId: row.localId,
          name: row.name,
          updatedAt: row.updatedAt,
        });
        toast({
          title: `“${published.name}” is now the MAIN map for ${modeInfo.shortTitle}`,
          description: 'Players load this map on the live web game. Rejoin a match (or wait for the next round) to see it.',
        });
      })
      .catch((err) => {
        console.warn('[publishToMatch cloud]', err);
        toast({
          title: `“${published.name}” is Active locally`,
          description:
            'Cloud publish failed — run Admin → Sync database schema if needed, then retry.',
          variant: 'destructive',
        });
      });
  };

  const workingDoc = () => {
    const latest = apiRef.current?.getDoc() ?? docRef.current;
    return {
      ...latest,
      name: docRef.current.name,
      gameMode: getMapGameMode(docRef.current),
      environment: ensureEnvironment(latest),
    };
  };

  const isDirty = () => snapshotMapDoc(workingDoc()) !== lastSavedRef.current;
  const [dirty, setDirty] = useState(false);

  const clearHistory = () => {
    undoStack.current = [];
    undoStackBytes.current = [];
    redoStack.current = [];
    historyAnchor.current = null;
    setCanUndo(false);
    setCanRedo(false);
  };

  const markClean = (next: MapDocument) => {
    lastSavedRef.current = snapshotMapDoc(next);
    setDirty(false);
  };

  const persist = (opts?: { quiet?: boolean; skipCloudSync?: boolean }) => {
    try {
      const next = workingDoc();
      const liveThumb = apiRef.current?.captureThumbnail() ?? null;
      saveMap(mapId, next, { thumbnailDataUrl: liveThumb });
      setDoc(next);
      docRef.current = next;
      markClean(next);
      setMapListTick((t) => t + 1);
      void import('./map-thumbnail').then(({ ensureMapThumbnail }) =>
        ensureMapThumbnail(mapId, { force: true })
      );
      // Skip when the caller (publishToMatch) is about to fire its own
      // setActive:true publish for the same map right after this — two
      // concurrent publishCloudMap calls for the same row used to race,
      // and if this draft-sync (setActive:false, built from a stale
      // `existing.isActive` read) committed after the real publish, it
      // silently flipped the just-published MAIN map back to inactive.
      if (opts?.skipCloudSync) return true;
      // Keep cloud draft in sync so other devices see the same map.
      void publishCloudMap({
        localId: mapId,
        name: next.name,
        mode: gameMode,
        document: attachPluginRuntimeToDoc(next),
        thumbnailDataUrl: liveThumb ?? getMapThumbnail(mapId),
        setActive: false,
      }).then((row) => {
        if (row.isActive) {
          setCloudActive({
            id: row.id,
            localId: row.localId,
            name: row.name,
            updatedAt: row.updatedAt,
          });
        }
        if (!opts?.quiet) {
          const isLive = row.isActive;
          const origin = typeof window !== 'undefined' ? (window.__KILRUN_PLATFORM_URL__ || '') : '';
          toast({
            title: isLive
              ? `This is now the MAIN map for ${modeInfo.shortTitle}`
              : variant === 'engine'
                ? `Uploaded${origin ? ` to ${origin.replace(/^https?:\/\//, '')}` : ''} as a draft`
                : 'Map saved',
            description: isLive
              ? `Players load “${next.name}” on the next match.`
              : `“${next.name}” saved. Set as MAIN when it is ready for players.`,
          });
        }
      }).catch((err) => {
        console.warn('[map persist cloud]', err);
        const msg = err instanceof Error ? err.message : String(err);
        const isSize = msg.includes('too large');
        if (!opts?.quiet) {
          toast({
            title: 'Map saved locally',
            description: isSize
              ? `Cloud sync skipped — map is too large (embedded model data URLs). Re-upload the GLB in the model studio to fix cross-device sync.`
              : `Cloud sync failed: ${msg}. The map is only saved on this device.`,
            variant: 'destructive',
          });
        }
      });
      return true;
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Could not save map',
        variant: 'destructive',
      });
      return false;
    }
  };

  /**
   * Explicit user-triggered Save (button click / Ctrl+S). Unlike autosave and
   * the Play Test snapshot, this warns once per session before the very first
   * save that would land on the live Active map — plain "Save" looks like it
   * writes a draft, but persist() always syncs to cloud preserving isActive,
   * so if this map is already Active it goes live for players immediately.
   */
  const handleManualSave = () => {
    const cloud = cloudActiveRef.current;
    const editingLive = isEditorMapTheLiveCloudMap(mapId, cloud);
    if (editingLive && !liveSaveConfirmedRef.current) {
      const ok = confirm(
        `“${docRef.current.name}” is the Active ${modeInfo.shortTitle} map — live matches load this document.\n\nSave will publish your changes to new matches immediately. Continue?`
      );
      if (!ok) return;
      liveSaveConfirmedRef.current = true;
    }
    persist();
  };

  const uploadDraftToLive = () => {
    try {
      const next = workingDoc();
      const liveThumb = apiRef.current?.captureThumbnail() ?? null;
      saveMap(mapId, next, { thumbnailDataUrl: liveThumb });
      setDoc(next);
      docRef.current = next;
      markClean(next);
      setMapListTick((t) => t + 1);
      void publishCloudMap({
        localId: mapId,
        name: next.name,
        mode: gameMode,
        document: attachPluginRuntimeToDoc(next),
        thumbnailDataUrl: liveThumb ?? getMapThumbnail(mapId),
        setActive: false,
      })
        .then((row) => {
          if (row.isActive) {
            setCloudActive({
              id: row.id,
              localId: row.localId,
              name: row.name,
              updatedAt: row.updatedAt,
            });
          }
          const origin =
            typeof window !== 'undefined' ? window.__KILRUN_PLATFORM_URL__ || '' : '';
          const host = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
          toast({
            title: host ? `Uploaded to ${host} as a draft` : 'Uploaded as a draft',
            description: `“${next.name}” is on the website. Set as MAIN when it is ready for players.`,
          });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast({
            title: 'Upload failed',
            description: msg,
            variant: 'destructive',
          });
        });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not save map',
        variant: 'destructive',
      });
    }
  };

  const requestClose = () => {
    if (!isDirty()) {
      onClose();
      return;
    }
    // Browser confirm only has 2 buttons — approximate Save / Don't save / Cancel.
    if (confirm('You have unsaved changes.\n\nOK = Save and exit\nCancel = don’t save yet')) {
      persist();
      onClose();
      return;
    }
    if (confirm('Discard unsaved changes and exit the Map Editor?')) {
      onClose();
    }
  };

  // Pull cloud drafts + the real Active/MAIN identity so live-play isn't
  // confused with "whatever this browser last edited".
  useEffect(() => {
    let cancelled = false;
    void listCloudMapDocuments(gameMode)
      .then((rows) => {
        if (cancelled) return;
        const { activeLocalId } = hydrateCloudMapsIntoLocal(
          rows,
          gameMode,
          setActivePlayMapIdForMode
        );
        const active = rows.find((r) => r.isActive) ?? null;
        setCloudActive(
          active
            ? {
                id: active.id,
                localId: active.localId,
                name: active.name,
                updatedAt: active.updatedAt,
              }
            : null
        );
        if (activeLocalId) setActivePlayId(activeLocalId);
        const openRow = rows.find((r) => (r.localId || r.id) === mapId);
        if (
          openRow &&
          snapshotMapDoc(workingDoc()) === lastSavedRef.current
        ) {
          const localUpdated = loadMap(mapId)?.meta?.updatedAt ?? '';
          if (!localUpdated || openRow.updatedAt.localeCompare(localUpdated) > 0) {
            const next = {
              ...openRow.document,
              name: openRow.name || openRow.document.name,
              gameMode,
              environment: ensureEnvironment(openRow.document),
            };
            skipHistory.current = true;
            apiRef.current?.setDoc(next);
            setDoc(next);
            docRef.current = next;
            markClean(next);
            skipHistory.current = false;
          }
        }
      })
      .catch((err) => {
        console.warn('[map editor cloud hydrate]', err);
      });
    return () => {
      cancelled = true;
    };
    // Re-run when switching modes so Horde/Comp MAIN isn't confused with Deathrun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, mapId]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Warn before closing the tab with unsaved creator work
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (snapshotMapDoc(workingDoc()) === lastSavedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave every 30s while dirty — creator engine must not lose work
  useEffect(() => {
    const id = window.setInterval(() => {
      if (playTest || playTestLive) return;
      if (snapshotMapDoc(workingDoc()) === lastSavedRef.current) return;
      persist({ quiet: true });
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, playTest, playTestLive]);

  useEffect(() => {
    apiRef.current?.setBrush(brush);
  }, [brush]);
  useEffect(() => {
    apiRef.current?.setEditTool(editTool);
  }, [editTool]);
  useEffect(() => {
    apiRef.current?.setHammerShape(hammerShape);
    saveStickyHammerShape(hammerShape);
  }, [hammerShape]);
  useEffect(() => {
    apiRef.current?.setPaintTexture(paintTextureUrl);
  }, [paintTextureUrl]);
  useEffect(() => {
    apiRef.current?.setPaintUv({ worldScale: paintWorldScale, repeat: paintRepeat });
    try {
      window.localStorage.setItem('kilrun.paintWorldScale', String(paintWorldScale));
    } catch {
      /* ignore */
    }
  }, [paintWorldScale, paintRepeat]);

  useEffect(() => {
    try {
      window.localStorage.setItem('kilrun.editorToolsVisible', toolsOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [toolsOpen]);
  useEffect(() => {
    apiRef.current?.setViewLayout(viewLayout);
  }, [viewLayout]);
  useEffect(() => {
    apiRef.current?.setActiveLayerId(activeLayerId);
  }, [activeLayerId]);
  useEffect(() => {
    apiRef.current?.setTransformMode(mode);
  }, [mode]);
  useEffect(() => {
    apiRef.current?.setGridSnap(gridSnap);
  }, [gridSnap]);
  useEffect(() => {
    apiRef.current?.setSnapY(snapY);
  }, [snapY]);
  useEffect(() => {
    apiRef.current?.setScaleFromSide(scaleFromSide);
    try {
      window.localStorage.setItem('kilrun.scaleFromSide', scaleFromSide ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [scaleFromSide]);

  const applyMagnetSnap = () => {
    // 2+ selected: join them face-to-face (pick which side).
    // 1 selected: attach to the nearest neighbor if close, else floor.
    if (selectedIds.length >= 2) {
      setSnapFaceAnchorRect(snapMagnetBtnRef.current?.getBoundingClientRect() ?? null);
      setSnapFaceMenuOpen((v) => !v);
      return;
    }
    const attached = apiRef.current?.snapSelectionToNearestNeighbor();
    if (attached) {
      toast({
        title: 'Attached',
        description: 'Clicked onto the nearest object’s closest face.',
      });
      return;
    }
    const ok = apiRef.current?.snapSelectedToFloor(
      selectedIds.length ? selectedIds : selectedId ? [selectedId] : undefined
    );
    toast({
      title: ok ? 'Snapped to floor' : 'Select an object first',
      description: ok
        ? 'Nothing close enough to attach — sat on the floor / surface under it.'
        : undefined,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        !!(e.target as HTMLElement)?.isContentEditable;
      // playTestLive mounts the real KilrunEngine (gameplay's own keyboard
      // handling) over the editor — without this guard, ordinary gameplay
      // keys (WASD, E, R, V, H, B, …) also drove the hidden editor
      // underneath: switching tools/gizmo mode, toggling grid snap, and
      // Delete/Escape could delete the prior selection or pop the exit-editor
      // confirm dialog mid-test.
      if (playTestRef.current || playTestLiveRef.current) return;

      // Save / Hide UI must win over the browser even while a Properties
      // field is focused — otherwise Ctrl+S downloads the page and Ctrl+H
      // opens History.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (!e.repeat) toggleEditorUi();
        return;
      }

      if (inField) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (showGraphics) {
          setShowGraphics(false);
          return;
        }
        if (apiRef.current?.getPendingPlaceKind()) {
          apiRef.current.clearPendingPlace();
          setPendingPlaceKind(null);
          toast({ title: 'Placement cancelled', description: 'Back to Select.' });
          return;
        }
        if (uiCollapsedRef.current) {
          expandMenus();
          return;
        }
        if (freeFly) {
          apiRef.current?.setFreeFly(false);
          return;
        }
        if (selectedId || selectedIds.length > 0) {
          apiRef.current?.setSelectedId(null);
          setSelectedId(null);
          setSelectedIds([]);
          return;
        }
        requestClose();
        return;
      }

      // Placement / edit shortcuts off while free-flying
      if (freeFly) return;

      if (e.key === 'w' || e.key === 'W') {
        setEditTool('select');
        setMode('translate');
      }
      if (e.key === 'e' || e.key === 'E') {
        setEditTool('select');
        setMode('rotate');
      }
      if (e.key === 'r' || e.key === 'R') {
        setEditTool('select');
        setMode('scale');
      }
      if (e.key === 'v' || e.key === 'V') {
        setEditTool('select');
        apiRef.current?.clearPendingPlace();
        setPendingPlaceKind(null);
      }
      if (e.key === 'b' || e.key === 'B') {
        setEditTool('brush');
        if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
      }
      if (e.key === 'p' || e.key === 'P') {
        const selModel = docRef.current.entities.find((ent) => ent.id === selectedId)?.model;
        if (selModel && selModel !== HAMMER_SOLID_MODEL) setBrush(selModel);
        else if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
        setEditTool('bucket');
        if (freeFly) apiRef.current?.setFreeFly(false);
      }
      if (e.key === 'h' || e.key === 'H') {
        if (e.ctrlKey || e.metaKey) return;
        setEditTool('hammer');
        setMode('scale');
        if (freeFly) apiRef.current?.setFreeFly(false);
      }
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        if (e.repeat) {
          // OS key auto-repeat would otherwise flap this toggle rapidly while held.
        } else {
          applyMagnetSnap();
        }
      }
      if (e.key === 'g' || e.key === 'G') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (!e.repeat) {
            if (e.shiftKey) ungroupSelection();
            else groupSelection();
          }
          return;
        }
        // OS key auto-repeat would otherwise flap this toggle rapidly while held.
        if (!e.repeat) setGridSnap((v) => !v);
      }
      if (e.key === 'f' || e.key === 'F') apiRef.current?.focusSelected();
      if (e.key === 'Delete' || e.key === 'Backspace') apiRef.current?.deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        // OS key auto-repeat would otherwise spam-duplicate the selection
        // while the combo is held.
        if (e.repeat) return;
        const axis = e.shiftKey ? 'z' : 'x';
        apiRef.current?.duplicateSelected(axis);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, selectedId, selectedIds, freeFly, playTest, mapId, brush, showShortcuts, showGraphics]);

  const filtered = useMemo(() => {
    if (libraryCategory !== 'all' && libraryCategory !== 'built-in') return [];
    const q = query.trim().toLowerCase();
    return PROTOTYPE_MODELS.filter((n) => !q || n.includes(q));
  }, [query, libraryCategory]);

  const filteredLibraryPrefabs = useMemo(() => {
    if (libraryCategory === 'built-in') return [];
    const q = query.trim().toLowerCase();
    return libraryPrefabs.filter(
      (p) =>
        (libraryCategory === 'all' || p.category === libraryCategory) &&
        (!q || p.name.toLowerCase().includes(q))
    );
  }, [libraryPrefabs, query, libraryCategory]);

  const doExport = () => {
    const blob = new Blob([exportJson(apiRef.current?.getDoc() ?? doc)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
  };

  const patchSelected = (patch: Partial<EditorEntity>) => {
    // Property-panel edits (material, solid toggle, animation, hazard config, etc.)
    // go through here for the single-selection case — this was not calling
    // scheduleHistory(), so Ctrl+Z silently skipped nearly every panel edit and
    // only caught viewport drag/move/rotate/scale mutations. Anchor the
    // pre-edit state like every other mutator does.
    scheduleHistory();
    setDirty(true);
    apiRef.current?.updateSelected(patch);
    pullViewportDoc();
    if (patch.scale && selected?.model) {
      setLastPrefabScale(selected.model, patch.scale as [number, number, number]);
    }
  };

  /** Apply a patch to the current selection (multi + group members). */
  const patchSelection = (patch: Partial<EditorEntity>) => {
    const base = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (!base.length) return;
    scheduleHistory();
    const live = apiRef.current?.getDoc() ?? docRef.current;
    const ids = new Set(expandIdsWithGroups(live.entities, base));
    const next = {
      ...live,
      entities: live.entities.map((e) => (ids.has(e.id) ? { ...e, ...patch } : e)),
      environment: ensureEnvironment(live),
    };
    apiRef.current?.setDoc(next);
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  };

  /** What the Modify panel acts on: the selection, expanded to whole groups. */
  const modifySelection = useMemo(() => {
    const base = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (!base.length) return [];
    const ids = new Set(expandIdsWithGroups(doc.entities, base));
    return doc.entities.filter((e) => ids.has(e.id));
  }, [doc.entities, selectedIds, selectedId]);

  const addBulkEntities = (added: EditorEntity[], label: string) => {
    if (!added.length) return;
    mutateLiveDoc((d) => ({ ...d, entities: [...d.entities, ...added] }));
    // Select the new pieces so the next op chains off them.
    const ids = added.map((e) => e.id);
    setSelectedIds(ids);
    setSelectedId(ids[0] ?? null);
    apiRef.current?.setSelectedIds(ids);
    toast({ title: label, description: `${ids.length} object${ids.length === 1 ? '' : 's'} added.` });
  };

  const updateBulkEntities = (updated: EditorEntity[], label: string) => {
    if (!updated.length) return;
    const byId = new Map(updated.map((e) => [e.id, e]));
    mutateLiveDoc((d) => ({ ...d, entities: d.entities.map((e) => byId.get(e.id) ?? e) }));
    toast({
      title: label,
      description: `${updated.length} object${updated.length === 1 ? '' : 's'} updated.`,
    });
  };

  const mutateLiveDoc = (fn: (d: MapDocument) => MapDocument) => {
    scheduleHistory();
    setDirty(true);
    const live = structuredClone(apiRef.current?.getDoc() ?? docRef.current);
    const mutated = fn(live);
    const next = { ...mutated, environment: ensureEnvironment(mutated) };
    apiRef.current?.setDoc(next);
    docRef.current = next;
    setDoc(next);
  };

  const groupSelection = () => {
    const base = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (base.length < 2) {
      toast({
        title: 'Select 2+ objects',
        description: 'Shift+click multiple objects, then Group.',
        variant: 'destructive',
      });
      return;
    }
    const groupId = generateId('grp');
    patchSelection({ groupId });
    toast({ title: 'Grouped', description: `${base.length} objects linked.` });
  };

  const ungroupSelection = () => {
    const base = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (!base.length) return;
    mutateLiveDoc((d) => {
      const ids = new Set(expandIdsWithGroups(d.entities, base));
      const anyGrouped = d.entities.some((e) => ids.has(e.id) && e.groupId);
      if (!anyGrouped) return d;
      return {
        ...d,
        entities: d.entities.map((e) => {
          if (!ids.has(e.id) || !e.groupId) return e;
          const { groupId: _removed, ...rest } = e;
          return rest;
        }),
      };
    });
    toast({ title: 'Ungrouped', description: 'Objects are independent again.' });
  };

  const persistCsgOrWarn = async (dataUrl: string, filename: string) => {
    const url = await persistEditorModelDataUrl(dataUrl, filename);
    if (url.startsWith('data:')) {
      toast({
        title: 'CSG kept locally',
        description:
          'Link live game and keep the mesh under ~4 MB to publish it. Publish rejects inline meshes.',
      });
    }
    return url;
  };

  /** First selected = stays (base), last shift-clicked = cut off (cutter). */
  const runCsgSubtract = async () => {
    if (selectedIds.length !== 2) {
      toast({
        title: 'Select exactly 2 objects',
        description: 'Click the object that stays, then shift+click the one to cut off, then Subtract.',
        variant: 'destructive',
      });
      return;
    }
    const base = doc.entities.find((e) => e.id === selectedIds[0]);
    const cutter = doc.entities.find((e) => e.id === selectedIds[1]);
    if (!base || !cutter) return;
    if (!isCsgEligible(base) || !isCsgEligible(cutter)) {
      toast({
        title: 'Not supported',
        description: 'Subtract works on Hammer solids (Box, Cylinder, Wedge, …) and prior merge results.',
        variant: 'destructive',
      });
      return;
    }
    setCsgBusy(true);
    try {
      const result = await subtractEntities(base, cutter);
      if ('error' in result) {
        toast({ title: 'Subtract failed', description: result.error, variant: 'destructive' });
        return;
      }
      const deleted = isCsgDeleteResult(result);
      const meshUrl = isCsgDeleteResult(result)
        ? ''
        : await persistCsgOrWarn(result.customModelUrl, 'csg-subtract.glb');
      mutateLiveDoc((d) => {
        let entities = d.entities.filter((e) => e.id !== cutter.id);
        entities = deleted
          ? entities.filter((e) => e.id !== base.id)
          : entities.map((e) =>
              e.id === base.id
                ? {
                    ...e,
                    model: undefined,
                    primitive: undefined,
                    customModelUrl: meshUrl,
                    position: result.position,
                    rotation: result.rotation,
                    scale: result.scale,
                    collisionSize: result.collisionSize,
                    csgPads: result.csgPads,
                    csgOp: result.csgOp,
                    csgSources: result.csgSources,
                    csgWarning: result.warning,
                    solid: true,
                    collideMaterial: 'solid' as const,
                  }
                : e
            );
        return { ...d, entities };
      });
      const nextSelected = deleted ? null : base.id;
      setSelectedIds([]);
      setSelectedId(nextSelected);
      apiRef.current?.setSelectedId(nextSelected);
      if (deleted) {
        toast({ title: 'Object removed', description: 'The cutter fully covered the base — nothing left.' });
      } else if (result.warning) {
        toast({ title: 'Subtract applied', description: result.warning });
      } else {
        toast({ title: 'Subtract applied', description: 'Collision matches the cut exactly.' });
      }
    } catch (err) {
      toast({
        title: 'Subtract failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCsgBusy(false);
    }
  };

  /** Merge 2+ selected objects into one visual + collision piece. */
  const runCsgUnion = async () => {
    if (selectedIds.length < 2) {
      toast({
        title: 'Select 2+ objects',
        description: 'Shift+click multiple Hammer solids, then Union.',
        variant: 'destructive',
      });
      return;
    }
    const sources = selectedIds
      .map((id) => doc.entities.find((e) => e.id === id))
      .filter((e): e is EditorEntity => !!e);
    if (sources.length !== selectedIds.length || sources.some((e) => !isCsgEligible(e))) {
      toast({
        title: 'Not supported',
        description: 'Union works on Hammer solids (Box, Cylinder, Wedge, …) and prior merge results.',
        variant: 'destructive',
      });
      return;
    }
    setCsgBusy(true);
    try {
      const result = await unionEntities(sources);
      if ('error' in result || isCsgDeleteResult(result)) {
        toast({
          title: 'Union failed',
          description: 'error' in result ? result.error : 'Unexpected result.',
          variant: 'destructive',
        });
        return;
      }
      const newId = generateId('csg');
      const meshUrl = await persistCsgOrWarn(result.customModelUrl, 'csg-union.glb');
      mutateLiveDoc((d) => {
        const entities = d.entities.filter((e) => !selectedIds.includes(e.id));
        const merged: EditorEntity = {
          id: newId,
          name: 'Union',
          kind: 'prop',
          layerId: sources[0].layerId,
          position: result.position,
          rotation: result.rotation,
          scale: result.scale,
          color: sources[0].color,
          customModelUrl: meshUrl,
          collisionSize: result.collisionSize,
          csgPads: result.csgPads,
          csgOp: result.csgOp,
          csgSources: result.csgSources,
          solid: true,
          collideMaterial: 'solid',
        };
        return { ...d, entities: [...entities, merged] };
      });
      setSelectedIds([]);
      setSelectedId(newId);
      apiRef.current?.setSelectedId(newId);
      toast({ title: 'Combined', description: `${sources.length} objects merged into one.` });
    } catch (err) {
      toast({
        title: 'Union failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCsgBusy(false);
    }
  };

  /** Keep only the overlapping volume of two selected solids. */
  const runCsgIntersect = async () => {
    if (selectedIds.length !== 2) {
      toast({
        title: 'Select exactly 2 objects',
        description: 'Shift+click two overlapping Hammer solids, then Intersect.',
        variant: 'destructive',
      });
      return;
    }
    const a = doc.entities.find((e) => e.id === selectedIds[0]);
    const b = doc.entities.find((e) => e.id === selectedIds[1]);
    if (!a || !b) return;
    if (!isCsgEligible(a) || !isCsgEligible(b)) {
      toast({
        title: 'Not supported',
        description: 'Intersect works on Hammer solids (Box, Cylinder, Wedge, …) and prior merge results.',
        variant: 'destructive',
      });
      return;
    }
    setCsgBusy(true);
    try {
      const result = await intersectEntities(a, b);
      if ('error' in result) {
        toast({ title: 'Intersect failed', description: result.error, variant: 'destructive' });
        return;
      }
      const deleted = isCsgDeleteResult(result);
      const newId = generateId('csg');
      const meshUrl = isCsgDeleteResult(result)
        ? ''
        : await persistCsgOrWarn(result.customModelUrl, 'csg-intersect.glb');
      mutateLiveDoc((d) => {
        const entities = d.entities.filter((e) => e.id !== a.id && e.id !== b.id);
        if (deleted) return { ...d, entities };
        const merged: EditorEntity = {
          id: newId,
          name: 'Intersect',
          kind: 'prop',
          layerId: a.layerId,
          position: result.position,
          rotation: result.rotation,
          scale: result.scale,
          color: a.color,
          customModelUrl: meshUrl,
          collisionSize: result.collisionSize,
          csgPads: result.csgPads,
          csgOp: result.csgOp,
          csgSources: result.csgSources,
          csgWarning: result.warning,
          solid: true,
          collideMaterial: 'solid',
        };
        return { ...d, entities: [...entities, merged] };
      });
      setSelectedIds([]);
      if (deleted) {
        setSelectedId(null);
        apiRef.current?.setSelectedId(null);
        toast({ title: 'Nothing left', description: 'The two solids did not overlap.' });
      } else {
        setSelectedId(newId);
        apiRef.current?.setSelectedId(newId);
        toast({
          title: 'Intersect applied',
          description: result.warning ?? 'Only the overlapping volume remains. Restore original brushes from Properties if you need to re-edit.',
        });
      }
    } catch (err) {
      toast({
        title: 'Intersect failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCsgBusy(false);
    }
  };

  const restoreCsgSources = () => {
    if (!selected?.csgSources?.length) return;
    const sources = selected.csgSources.map((s) => ({
      ...structuredClone(s),
      id: generateId(),
      name: s.name || 'Brush',
    }));
    const keepId = selected.id;
    mutateLiveDoc((d) => ({
      ...d,
      entities: [...d.entities.filter((e) => e.id !== keepId), ...sources],
    }));
    setSelectedIds(sources.map((s) => s.id));
    setSelectedId(sources[0]?.id ?? null);
    apiRef.current?.setSelectedIds(sources.map((s) => s.id));
    toast({
      title: 'Brushes restored',
      description: `${sources.length} original solid${sources.length === 1 ? '' : 's'} put back. The baked mesh was removed.`,
    });
  };

  const selectionIds = useMemo(() => {
    const base = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    return expandIdsWithGroups(doc.entities, base);
  }, [doc.entities, selectedId, selectedIds]);

  const selectionMeta = useMemo(() => {
    const ents = doc.entities.filter((e) => selectionIds.includes(e.id));
    if (!ents.length) {
      return { count: 0, allVisible: true, allLocked: false, anyGrouped: false };
    }
    return {
      count: ents.length,
      allVisible: ents.every((e) => e.visible !== false),
      allLocked: ents.every((e) => Boolean(e.locked)),
      anyGrouped: ents.some((e) => Boolean(e.groupId)),
    };
  }, [doc.entities, selectionIds]);

  const patchEntityById = (id: string, patch: Partial<EditorEntity>) => {
    // For the selected entity `updateSelected` is the complete path: it applies
    // the patch to the live doc, fills in defaults for a changed kind, rebuilds
    // the object, and reports back through onDocChange. Going through
    // mutateLiveDoc as well applied and synced the same patch a second time.
    if (id === selectedId && apiRef.current) {
      scheduleHistory();
      apiRef.current.updateSelected(patch);
      return;
    }
    mutateLiveDoc((d) => ({
      ...d,
      entities: d.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const sortedLayers = useMemo(
    () => (doc.layers ?? []).slice().sort((a, b) => a.order - b.order),
    [doc.layers]
  );
  const activeLayer = doc.layers.find((l) => l.id === activeLayerId) ?? sortedLayers[0] ?? null;

  const applyDocLayers = (
    layersOrFn: typeof doc.layers | ((prev: typeof doc.layers) => typeof doc.layers)
  ) => {
    mutateLiveDoc((d) => {
      const layers = typeof layersOrFn === 'function' ? layersOrFn(d.layers) : layersOrFn;
      return { ...d, layers };
    });
  };

  const setLayerFlag = (
    id: string,
    patch: Partial<{ visible: boolean; locked: boolean; name: string }>
  ) => {
    applyDocLayers((layers) => layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  /** Hide every layer except this one — inspect a single build level. */
  const soloLayer = (id: string) => {
    applyDocLayers((layers) => layers.map((l) => ({ ...l, visible: l.id === id })));
    setActiveLayerId(id);
  };

  const showAllLayers = () => {
    applyDocLayers((layers) => layers.map((l) => ({ ...l, visible: true })));
  };

  const moveSelectionToLayer = (layerId: string) => {
    const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    mutateLiveDoc((d) => ({
      ...d,
      entities: d.entities.map((e) => (ids.includes(e.id) ? { ...e, layerId } : e)),
    }));
  };

  const addBuildLevel = () => {
    const layer = {
      id: generateId('layer'),
      name: '',
      visible: true,
      locked: false,
      order: 0,
    };
    applyDocLayers((layers) => {
      const order = layers.length ? Math.max(...layers.map((l) => l.order)) + 1 : 0;
      layer.name = `Level ${order}`;
      layer.order = order;
      return [...layers, layer];
    });
    setActiveLayerId(layer.id);
  };

  const deleteBuildLevel = (id: string) => {
    const layers = docRef.current.layers ?? [];
    if (layers.length <= 1) {
      toast({
        title: 'Keep at least one level',
        description: 'A map always needs a Floor / Level 0 to paint onto.',
        variant: 'destructive',
      });
      return;
    }
    const sorted = [...layers].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const fallback = sorted[idx - 1] ?? sorted[idx + 1];
    if (!fallback) return;
    const count = docRef.current.entities.filter((e) => e.layerId === id).length;
    const label = sorted[idx].name || `Level ${idx}`;
    if (
      count > 0 &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete “${label}”? ${count} object${count === 1 ? '' : 's'} will move to “${fallback.name}”.`
      )
    ) {
      return;
    }
    mutateLiveDoc((d) => ({
      ...d,
      layers: d.layers.filter((l) => l.id !== id),
      entities: d.entities.map((e) => (e.layerId === id ? { ...e, layerId: fallback.id } : e)),
    }));
    if (activeLayerId === id) setActiveLayerId(fallback.id);
  };

  const armPlaceSpawn = (
    kind: Parameters<NonNullable<EditorViewportApi['placeSpawn']>>[0]
  ) => {
    setEditTool('select');
    apiRef.current?.placeSpawn(kind);
  };

  const armPlaceEntity = (kind: EditorEntity['kind'], model?: string) => {
    setEditTool('select');
    apiRef.current?.placeEntity(kind, model);
  };

  /**
   * Opens any studio panel. What used to be nine near-identical openX helpers is
   * now this one, driven by the plugin's declared `studio` options.
   */
  const openStudioTab = (id: SidebarTab, studio?: MapEditorStudioOptions) => {
    if (studio?.ensurePlayerEntity) {
      const ensured = ensureMapPlayerEntity(docRef.current);
      if (ensured.created) {
        scheduleHistory();
        setDoc(ensured.doc);
        docRef.current = ensured.doc;
        apiRef.current?.setDoc(ensured.doc);
      }
    }
    if (studio?.clearSelection) {
      // Studios edit platform settings, so nothing stays selected on the map.
      setSelectedId(null);
      apiRef.current?.setSelectedId(null);
      setSelectedIds([]);
    }
    playSound('ui_transition');
    setTab(id);
    setUiCollapsed(false);
    setPropsOpen(false);
    setSidebarOpen(true);
    setToolsOpen(false);
  };

  const openStudioPluginTab = (id: SidebarTab) => {
    openStudioTab(id, getSidebarPlugin(id)?.studio);
  };

  const openPlayerStudio = () => openStudioPluginTab('player');
  const openModelEditor = () => openStudioPluginTab('skins');

  const saveShopSettings = (settings: MapShopSettings) => {
    mutateLiveDoc((d) => ({ ...d, shopSettings: settings }));
    toast({
      title: 'Buy menu saved',
      description: `${settings.items.filter((i) => i.enabled).length} weapons · Horde & Competitive.`,
    });
  };

  const saveCustomMoves = (moves: import('./map-document').CustomMoveDef[]) => {
    mutateLiveDoc((d) => ({ ...d, customMoves: moves }));
  };

  const saveWeaponDef = (def: Partial<import('./map-document').MapWeaponDef>) => {
    mutateLiveDoc((d) => ({ ...d, weaponDef: { ...d.weaponDef, ...def } }));
    toast({ title: 'Weapon saved', description: 'Weapon definition saved to map.' });
  };

  const saveCombatSettings = (settings: Partial<import('./map-document').CombatSettings>) => {
    mutateLiveDoc((d) => ({ ...d, combatSettings: { ...d.combatSettings, ...settings } }));
    toast({ title: 'Combat settings saved', description: 'Physics and combat applied to map.' });
  };

  const applySkinsToPlayer = (attachments: SkinAttachment[]) => {
    const player = findPlayerEntity(docRef.current);
    if (!player) return;
    mutateLiveDoc((d) => {
      const playerSkins = attachments.length > 0 ? attachments : undefined;
      return {
        ...d,
        entities: d.entities.map((e) => (e.id === player.id ? { ...e, playerSkins } : e)),
      };
    });
    toast({
      title: attachments.length > 0 ? 'Skins applied to player avatar' : 'Skins removed from player avatar',
    });
  };

  const playerAvatar =
    findPlayerEntity(doc) ??
    (playerStudioOpen || modelEditorOpen || tpsViewOpen
      ? findPlayerEntity(docRef.current)
      : null);

  const wireTrapToButton = (trapId: string, buttonId: string) => {
    mutateLiveDoc((d) => ({
      ...d,
      entities: d.entities.map((e) => {
        if (e.id !== trapId) return e;
        const anim = ensureAnimation(e);
        return {
          ...e,
          kind: e.kind === 'prop' ? ('trap' as const) : e.kind,
          animation: {
            ...anim,
            trigger: 'signal' as const,
            listenToEntityId: buttonId,
          },
        };
      }),
    }));
  };

  const patchEnv = (partial: Partial<typeof env>) => {
    const next = { ...env, ...partial };
    mutateLiveDoc((d) => ({ ...d, environment: next }));
    apiRef.current?.applyEnvironment(next);
  };

  const closeStudioPanels = () => {
    setTab((prev) => (isStudioSidebarTab(prev) ? 'assets' : prev));
  };

  const selectLibraryTab = (id: SidebarTab) => {
    if (isStudioSidebarTab(id)) return;
    setTab(id);
    setSidebarOpen(true);
  };

  const saveTpsToMap = (settings: TpsViewSettings) => {
    const clean = sanitizeTpsView(settings);
    mutateLiveDoc((d) => ({ ...d, tpsView: clean }));
    toast({
      title: '3rd View saved to map',
      description:
        gameMode === 'deathrun'
          ? 'Deathrun MAIN 3rd View is used as the fallback camera for any mode that has not saved its own.'
          : 'Saved on this map — this camera now wins for this mode in live matches. Remember to press Save (top toolbar) to publish it, or it stays a local draft.',
    });
  };

  const startPlay = async (tpsOverride?: TpsViewSettings | null) => {
    if (freeFly) apiRef.current?.setFreeFly(false);
    // Snapshot camera so Exit restores the exact map view you left
    cameraBeforePlayRef.current = apiRef.current?.getCameraState() ?? null;
    apiRef.current?.setPaused(true);
    // Every Solid prop must have mesh-fit collision before Play Test builds
    // its pad list — a wall/prop marked Solid without a bake still falls
    // back to one bounding-box collider (blocks doorway openings/arches
    // solid). Users were relying on manually clicking "Bake"/"Fix Solid
    // Collision" first, which is easy to forget and left stale maps broken;
    // do it here automatically so entering Play Test always reflects the
    // real mesh shape with no extra step. Only stale/missing bakes are
    // recomputed — a prop baked before a voxelizer accuracy fix has a stale
    // meshCollisionBakeKey and is re-fit, while unchanged props are skipped
    // (see PLAY_TEST_MESH_BAKE_OPTS).
    await bakeAllSolidMeshCollision(PLAY_TEST_MESH_BAKE_OPTS);
    // Do NOT auto-insert Player Avatar into the map — Play Test uses default
    // mannequin / existing avatar, and invents Start on a floor if needed.
    persist();
    emitPlaytest('beforeStart', { live: false, mode: gameMode });
    setPlayTpsOverride(tpsOverride ?? null);
    setPlayTest(true);
  };

  const exitPlayTest = () => {
    setPlayTest(false);
    setPlayTpsOverride(null);
    setPlayTestRole(undefined);
    // Keep editor host mounted — resume WebGL and restore camera (fixes blank screen)
    requestAnimationFrame(() => {
      apiRef.current?.setPaused(false);
      apiRef.current?.resize();
      const saved = cameraBeforePlayRef.current;
      if (saved) apiRef.current?.setCameraState(saved);
      else apiRef.current?.resetCamera();
      cameraBeforePlayRef.current = null;
    });
  };

  /** Batch-fits mesh collision for every Solid prop that's still using the
   * default full-bounding-box collider (i.e. placed/marked Solid before
   * per-prop auto-bake existed, or baked entities from an older save).
   * Brings existing maps in line with newly-placed props without making
   * the user re-toggle the Material dropdown on each one by hand. */
  const bakeAllSolidMeshCollision = async (opts?: { silent?: boolean; force?: boolean }) => {
    const targets = (apiRef.current?.getDoc() ?? docRef.current).entities.filter(
      (e) =>
        resolveCollideMaterial(e) === 'solid' &&
        !isHammerSolidEntity(e) &&
        (e.model || e.customModelUrl) &&
        // force: the "Fix Solid Collision" button, which must re-bake even
        // up-to-date props. Otherwise bake only what has no pads or whose pads
        // came from a different model / older voxelizer.
        (opts?.force || needsMeshCollisionBake(e))
    );
    if (!targets.length) {
      if (!opts?.silent) {
        toast({
          title: 'Nothing to fix',
          description: 'Every Solid prop already has mesh-fit collision.',
        });
      }
      return;
    }
    setBakingAllMesh(true);
    let ok = 0;
    let fail = 0;
    for (const e of targets) {
      const result = await apiRef.current?.bakeMeshCollision(e.id);
      if (result?.ok) ok++;
      else fail++;
    }
    setBakingAllMesh(false);
    if (!opts?.silent) {
      toast({
        title: 'Mesh collision fitted',
        description: `${ok} prop${ok === 1 ? '' : 's'} updated to match their real shape${
          fail ? ` (${fail} failed)` : ''
        }.`,
      });
    }
  };

  /** "Play Test (Live)" — same pre-play snapshot/pause/persist as startPlay,
   * but launches the real KilrunEngine against a private practice room
   * instead of the local MapPlayPreview renderer. */
  const startPlayLive = async () => {
    if (freeFly) apiRef.current?.setFreeFly(false);
    cameraBeforePlayRef.current = apiRef.current?.getCameraState() ?? null;
    apiRef.current?.setPaused(true);
    // Same auto-bake as startPlay — the live server reads whatever collision
    // is persisted, so it must be up to date before persist() runs.
    await bakeAllSolidMeshCollision(PLAY_TEST_MESH_BAKE_OPTS);
    persist();
    emitPlaytest('beforeStart', { live: true, mode: gameMode });
    setPlayTestLive(true);
  };

  const requestPlayTest = (target: 'preview' | 'live') => {
    const mode = getMapGameMode(docRef.current);
    if (mode === 'deathrun' || mode === 'competitive') {
      setPlayTestPromptTarget(target);
      setPlayTestRolePrompt(true);
      return;
    }
    setPlayTestRole(undefined);
    if (target === 'live') void startPlayLive();
    else void startPlay();
  };

  const exitPlayTestLive = () => {
    setPlayTestLive(false);
    setPlayTestRole(undefined);
    requestAnimationFrame(() => {
      apiRef.current?.setPaused(false);
      apiRef.current?.resize();
      const saved = cameraBeforePlayRef.current;
      if (saved) apiRef.current?.setCameraState(saved);
      else apiRef.current?.resetCamera();
      cameraBeforePlayRef.current = null;
    });
  };

  const brains: MapEditorBrains = {
    doc,
    mapId,
    isMobile,
    tab,
    selectedId,
    selectedIds,
    playerAvatar: playerAvatar ?? null,
    sortedLayers,
    activeLayerId,
    setActiveLayerId,
    closeStudioPanels,
    startPlay,
    saveTpsToMap,
    openPlayerStudio,
    openModelEditor,
    patchEntityById,
    saveCustomMoves,
    applySkinsToPlayer,
    saveWeaponDef,
    saveCombatSettings,
    saveShopSettings,
    showAllLayers,
    addBuildLevel,
    setLayerFlag,
    soloLayer,
    deleteBuildLevel,
    moveSelectionToLayer,
    apiRef,
    setSelectedId,
    setSelectedIds,
    setTutorialOpen,
    setSidebarOpen,
    setUiCollapsed,
    prefabs,
    setPrefabs,
    cloudPrefabs,
    setCloudPrefabs,
    prefabName,
    setPrefabName,
    prefabSnapBtnRef,
    snapFaceMenuOpen,
    setSnapFaceMenuOpen,
    snapFaceAnchorRect,
    setSnapFaceAnchorRect,
    selected,
    env,
    patchSelected,
    patchEnv,
    editTool,
    setEditTool,
    texFileRef,
    paintTextureUrl,
    setPaintTextureUrl,
    copiedTextureInfo,
    setCopiedTextureInfo,
    paintRepeat,
    setPaintRepeat,
    paintWorldScale,
    setPaintWorldScale,
    customTextures,
    setCustomTextures,
    mutateLiveDoc,
    toolsOpen,
    setToolsOpen,
    skyFileRef,
    editorPerf,
    setEditorPerf,
    query,
    setQuery,
    setUploadOpen,
    libraryCategories,
    libraryCategory,
    setLibraryCategory,
    brush,
    setBrush,
    freeFly,
    pendingPlaceKind,
    setPendingPlaceKind,
    filtered,
    filteredLibraryPrefabs,
    reloadPrefabLibrary,
    setTab,
    openStudioTab,
    toast: (opts) => {
      toast({
        title: typeof opts.title === 'string' ? opts.title : undefined,
        description: typeof opts.description === 'string' ? opts.description : undefined,
        variant: opts.variant,
      });
    },
  };

  const [pluginEpoch, setPluginEpoch] = useState(0);
  useEffect(() => {
    const bump = () => setPluginEpoch((n) => n + 1);
    window.addEventListener('kilrun-plugins-changed', bump);
    return () => window.removeEventListener('kilrun-plugins-changed', bump);
  }, []);
  const sidebarPlugin = getSidebarPlugin(tab);
  const railPlugins = getSidebarPlugins();
  void pluginEpoch;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('kilrun-engine-ui-state', {
        detail: {
          uiCollapsed,
          sidebarOpen,
          toolsOpen,
          propsOpen,
          gridVisible: env.gridVisible !== false,
          showAllCollisionGizmos,
          viewLayout,
          freeFly,
          editorPerf,
          showHelp,
        },
      })
    );
  }, [
    uiCollapsed,
    sidebarOpen,
    toolsOpen,
    propsOpen,
    env.gridVisible,
    showAllCollisionGizmos,
    viewLayout,
    freeFly,
    editorPerf,
    showHelp,
  ]);

  handleEngineCommandRef.current = (type: string) => {
    if (type === 'save') handleManualSave();
    else if (type === 'upload-draft') uploadDraftToLive();
    else if (type === 'export') doExport();
    else if (type === 'import') fileRef.current?.click();
    else if (type === 'undo') undo();
    else if (type === 'redo') redo();
    else if (type === 'play') requestPlayTest('preview');
    else if (type === 'play-live') requestPlayTest('live');
    else if (type === 'publish') publishToMatch();
    else if (type === 'hide-ui') collapseAllMenus();
    else if (type === 'show-ui') expandMenus();
    else if (type === 'toggle-ui') toggleEditorUi();
    else if (type === 'help') {
      openEditorTab('help');
      setShowHelp(true);
    }
    else if (type === 'tips') setShowHelp((v) => !v);
    else if (type === 'shortcuts') {
      setShowGraphics(false);
      setShowShortcuts(true);
    }
    else if (type === 'tutorial') {
      resetTutorialFlag();
      expandMenus();
      setTutorialOpen(true);
    }
    else if (type === 'graphics') {
      expandMenus();
      setShowShortcuts(false);
      setShowGraphics(true);
    }
    else if (type === 'tab-settings') openEditorTab('settings');
    else if (type === 'tab-world') openEditorTab('world');
    else if (type === 'tab-assets') openEditorTab('assets');
    else if (type === 'tab-layers') openEditorTab('layers');
    else if (type === 'tab-outliner') openEditorTab('outliner');
    else if (type === 'tab-prefabs') openEditorTab('prefabs');
    else if (type === 'tab-textures') openEditorTab('textures');
    else if (type.startsWith('tab-')) {
      const id = type.slice(4);
      if (isStudioPluginTab(id)) openStudioPluginTab(id);
      else openEditorTab(id);
    }
    else if (type === 'reset-camera') apiRef.current?.resetCamera();
    else if (type === 'camera-top') apiRef.current?.setCameraPreset('top');
    else if (type === 'camera-side') apiRef.current?.setCameraPreset('side');
    else if (type === 'camera-front') apiRef.current?.setCameraPreset('front');
    else if (type === 'focus-selected') apiRef.current?.focusSelected();
    else if (type === 'layout-single') setViewLayout('single');
    else if (type === 'layout-split') setViewLayout('split');
    else if (type === 'layout-triple') setViewLayout('triple');
    else if (type === 'toggle-sidebar') {
      setUiCollapsed(false);
      setSidebarOpen((v) => !v);
      setRailOpen(true);
    }
    else if (type === 'toggle-tools') {
      setUiCollapsed(false);
      setToolsOpen((v) => !v);
    }
    else if (type === 'toggle-props') {
      setUiCollapsed(false);
      setPropsOpen((v) => !v);
    }
    else if (type === 'toggle-grid') {
      const liveEnv = ensureEnvironment(apiRef.current?.getDoc() ?? docRef.current);
      patchEnv({ gridVisible: liveEnv.gridVisible === false });
    }
    else if (type === 'toggle-collision-gizmos') {
      setShowAllCollisionGizmos((prev) => {
        const next = !prev;
        apiRef.current?.setShowAllCollisionGizmos(next);
        return next;
      });
    }
    else if (type === 'toggle-free-fly') {
      apiRef.current?.setFreeFly(!freeFlyRef.current);
    }
    else if (type === 'duplicate') apiRef.current?.duplicateSelected('x');
    else if (type === 'duplicate-z') apiRef.current?.duplicateSelected('z');
    else if (type === 'delete') apiRef.current?.deleteSelected();
    else if (type === 'group') groupSelection();
    else if (type === 'ungroup') ungroupSelection();
    else if (type === 'select-none') {
      apiRef.current?.setSelectedId(null);
      setSelectedId(null);
      setSelectedIds([]);
    }
    else if (type.startsWith('perf-')) {
      const key = type.slice(5) as keyof EditorPerfMode;
      setEditorPerf((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev, [key]: !prev[key] };
        apiRef.current?.setEditorPerfMode(next);
        return next;
      });
    }
    else if (type === 'validate') {
      const issues = validateMapForPublish(workingDoc());
      const errors = issues.filter((i) => i.level === 'error').length;
      toast({
        title: errors ? `Map has ${errors} error${errors === 1 ? '' : 's'}` : 'Validation passed',
        description: formatValidationSummary(issues) || 'No issues.',
        variant: errors ? 'destructive' : undefined,
      });
    }
  };

  useEffect(() => {
    if (variant !== 'engine' || typeof window === 'undefined') return;
    const onCommand = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (!type) return;
      if ((playTestRef.current || playTestLiveRef.current) && type !== 'save') return;
      handleEngineCommandRef.current(type);
    };
    window.addEventListener('kilrun-engine-command', onCommand);
    return () => window.removeEventListener('kilrun-engine-command', onCommand);
  }, [variant]);

  const editorShell = (
    <TooltipProvider delayDuration={350}>
    <MenuSfxRoot
      music={playTest || playTestLive ? 'none' : 'menu'}
      className={
        variant === 'engine'
          ? 'absolute inset-0 bg-[#0d121a] text-white flex flex-col'
          : 'fixed inset-0 z-[9999] bg-[#0d121a] text-white flex flex-col'
      }
    >
      {isTouch && (
        <>
          {/* Joystick layer stays under chrome (z-[120]+) so Tools / Levels stay clickable */}
          <div
            ref={touchLayerRef}
            className="fixed inset-0 z-[40] touch-none"
            style={{ pointerEvents: freeFly ? 'auto' : 'none' }}
          />
          <div className="fixed inset-0 z-[41] pointer-events-none">
            <JoystickOverlay joystickRef={joystickRef} enabled={freeFly} />
          </div>
          <div
            className={`fixed z-[120] flex flex-col gap-2 pointer-events-auto ${
              uiCollapsed ? 'bottom-6 right-3' : 'bottom-20 right-3'
            }`}
          >
            <button
              type="button"
              className="w-14 h-14 rounded-full border-2 border-sky-400/70 bg-sky-500/35 text-white font-black text-[10px] uppercase tracking-wider active:scale-95"
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                joystickRef.current?.setSprintHeld(true);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                joystickRef.current?.setSprintHeld(false);
              }}
              onTouchCancel={() => joystickRef.current?.setSprintHeld(false)}
            >
              Sprint
            </button>
            <button
              type="button"
              className={`w-14 h-14 rounded-full border-2 text-white font-black text-[10px] uppercase tracking-wider active:scale-95 ${
                freeFly
                  ? 'border-amber-400/80 bg-amber-500/40'
                  : 'border-emerald-400/70 bg-emerald-500/35'
              }`}
              onClick={() => apiRef.current?.setFreeFly(!freeFly)}
            >
              {freeFly ? 'Edit' : 'Fly'}
            </button>
          </div>
        </>
      )}

      {/* Restored when chrome is hidden — below the Engine bar, above the touch layer */}
      {uiCollapsed && (
        <div
          className={`fixed left-3 z-[150] flex flex-col gap-2 pointer-events-auto ${
            variant === 'engine' ? 'top-14' : 'top-3'
          }`}
        >
          <button
            type="button"
            onClick={expandMenus}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/70 bg-cyan-500/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            title={shortcutTitle('toggle-ui', 'Show editor UI')}
          >
            <Menu className="w-4 h-4" />
            Show UI
          </button>
          <button
            type="button"
            onClick={() => handleManualSave()}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 ${
              dirty
                ? 'border-amber-400/70 bg-amber-500/45'
                : 'border-white/25 bg-black/70'
            }`}
            title={dirty ? 'Unsaved changes — tap to save' : 'Saved'}
          >
            <Save className="w-4 h-4" />
            {dirty ? 'Save •' : 'Save'}
          </button>
          {isLiveHere && (
            <span
              className="flex items-center gap-1.5 rounded-xl border border-red-400/60 bg-red-500/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-red-200 shadow-lg"
              title="This document is the cloud Active/MAIN map live matches load."
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              Live map
            </span>
          )}
          {(isMobile || isTouch) && (
            <>
              <button
                type="button"
                onClick={() => armPlaceSpawn('start')}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-400/60 bg-emerald-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
              >
                <Flag className="w-4 h-4" />
                Start
              </button>
              {gameMode === 'deathrun' && (
                <button
                  type="button"
                  onClick={() => armPlaceSpawn('finish')}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
                >
                  <FlagTriangleRight className="w-4 h-4" />
                  Finish
                </button>
              )}
              {gameMode === 'competitive' && (
                <>
                  <button
                    type="button"
                    onClick={() => armPlaceSpawn('spawn_team_a')}
                    className="flex items-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
                  >
                    <Flag className="w-4 h-4" />
                    Team A
                  </button>
                  <button
                    type="button"
                    onClick={() => armPlaceSpawn('spawn_team_b')}
                    className="flex items-center gap-1.5 rounded-xl border border-rose-400/60 bg-rose-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
                  >
                    <Flag className="w-4 h-4" />
                    Team B
                  </button>
                </>
              )}
              {gameMode === 'horde' && (
                <button
                  type="button"
                  onClick={() => armPlaceSpawn('spawn_monster')}
                  className="flex items-center gap-1.5 rounded-xl border border-violet-400/60 bg-violet-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
                >
                  <Flag className="w-4 h-4" />
                  Monster
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  openPlayerStudio();
                }}
                className="flex items-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
              >
                <PersonStanding className="w-4 h-4" />
                Avatar
              </button>
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    setUiCollapsed(false);
                    setPropsOpen(true);
                    setToolsOpen(false);
                    setSidebarOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-white/30 bg-black/75 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11 backdrop-blur"
                >
                  Props
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Mobile quick access while chrome is visible */}
      {!uiCollapsed && isMobile && (
        <div className="fixed top-14 left-3 z-[140] flex flex-col gap-2 pointer-events-auto max-h-[50vh] overflow-y-auto">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/25 bg-black/75 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white/90 shadow-lg active:scale-95 backdrop-blur"
              title="Open library drawer"
            >
              <ChevronRight className="w-4 h-4" />
              Library
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              armPlaceSpawn('start');
              collapseAllMenus();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-black/75 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-emerald-100 shadow-lg active:scale-95 min-h-11"
          >
            <Flag className="w-4 h-4" />
            Start
          </button>
          {gameMode === 'deathrun' && (
            <button
              type="button"
              onClick={() => {
                armPlaceSpawn('finish');
                collapseAllMenus();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-black/75 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-amber-100 shadow-lg active:scale-95 min-h-11"
            >
              <FlagTriangleRight className="w-4 h-4" />
              Finish
            </button>
          )}
        </div>
      )}

      {/* Desktop: reopen library when collapsed (offset past the icon rail when it's showing) */}
      {!uiCollapsed && !isMobile && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className={`fixed top-16 z-[140] flex h-12 w-7 items-center justify-center rounded-r-lg border border-l-0 border-white/20 bg-[#121a24] text-white/80 shadow-lg hover:bg-cyan-500/20 hover:text-cyan-200 ${
            railOpen ? 'left-10' : 'left-0'
          }`}
          title="Expand model library"
          aria-label="Expand model library"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Always-available camera home — find your edit view if you get lost */}
      {!playTest && (
        <button
          type="button"
          onClick={() => apiRef.current?.resetCamera()}
          className="fixed top-1/2 right-2 z-[130] -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/40 bg-black/70 text-emerald-200 shadow-lg hover:bg-emerald-500/25 active:scale-95"
          title="Reset camera to edit home (Start / spawn) — always available, even with toolbars hidden"
          aria-label="Reset camera to edit home (Start / spawn)"
        >
          <Home className="w-4 h-4" />
        </button>
      )}

      {/* Top bar */}
      {!uiCollapsed && (
      <div className={`h-12 border-b flex items-center gap-2 px-3 overflow-x-auto shrink-0 ${
        variant === 'engine'
          ? 'border-red-500/20 bg-[#0c1018] relative z-10'
          : 'border-white/10 bg-[#121a24] relative z-[60]'
      }`}>
        <span className={`text-xs font-bold tracking-widest uppercase shrink-0 ${
          variant === 'engine' ? 'text-red-300/90' : 'text-cyan-300/90'
        }`}>{variant === 'engine' ? 'Map' : 'Map Editor'}</span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0 ${modeInfo.badgeClass}`}
          title={modeInfo.editorBlurb}
        >
          {modeInfo.shortTitle}
        </span>
        <input
          className="ml-2 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm w-40 sm:w-56 shrink-0"
          value={doc.name}
          onChange={(e) => {
            const name = e.target.value;
            const live = apiRef.current?.getDoc() ?? docRef.current;
            const next = { ...live, name };
            docRef.current = next;
            setDoc(next);
            setDirty(true);
          }}
        />
        <select
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm shrink-0"
          value={mapId}
          onChange={(e) => {
            const id = e.target.value;
            const loaded = loadMapDetailed(id);
            if (!loaded.ok) {
              toast({
                title: 'Map is corrupted',
                description: `${loaded.error}. The original text was kept so you can recover it from local storage (key ends in .corrupt).`,
                variant: 'destructive',
              });
              return;
            }
            if (isDirty()) {
              const ok = confirm(
                'You have unsaved changes on this map.\n\nOK = discard and switch\nCancel = stay'
              );
              if (!ok) return;
            }
            const cleaned = stripLegacyBakedStairPads(loaded.doc);
            const withEnv = { ...cleaned, environment: ensureEnvironment(cleaned) };
            closeStudioPanels();
            setMapId(id);
            setDoc(withEnv);
            docRef.current = withEnv;
            markClean(withEnv);
            clearHistory();
            apiRef.current?.setDoc(withEnv);
            setActivePlayId(getActivePlayMapIdForMode(getMapGameMode(withEnv)));
            if (cleaned.entities.length !== loaded.doc.entities.length) {
              toast({
                title: 'Removed old baked stair pads',
                description: 'Stairs now collide automatically — no Bake button needed.',
              });
            }
          }}
        >
          {maps
            .filter((m) => (m.gameMode ?? 'deathrun') === gameMode)
            .map((m) => (
            <option key={m.id} value={m.id}>
              {m.corrupt ? `${m.name} (corrupted)` : m.name}
            </option>
          ))}
        </select>

        {variant !== 'engine' ? (
        <>
        <Button
          size="sm"
          className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          onClick={() => requestPlayTest('preview')}
        >
          <Play className="w-4 h-4 mr-1" /> Play Test
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ml-2 border-amber-500/60 text-amber-300 hover:bg-amber-500/10 shrink-0"
          title="Real game client — HUD, chat, admin panel, skill menu. Requires the game server (server/) running locally."
          onClick={() => requestPlayTest('live')}
        >
          <Play className="w-4 h-4 mr-1" /> Play Test (Live)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={`shrink-0 ${isLiveHere ? 'border border-emerald-400/50 text-emerald-200' : ''}`}
          onClick={publishToMatch}
          title={
            isLiveHere
              ? 'This is the cloud Active/MAIN map live matches load'
              : cloudActive
                ? liveCloudMismatchMessage(doc.name, cloudActive)
                : 'Publish this map as the live match map for this mode'
          }
        >
          {isLiveHere ? 'MAIN map ✓' : 'Set as MAIN map'}
        </Button>
        </>
        ) : (
          <span className={`ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
            isLiveHere ? 'border border-red-400/50 text-red-200 bg-red-500/15' : 'text-slate-500'
          }`}>
            {isLiveHere ? 'MAIN' : dirty ? 'Unsaved' : 'Draft'}
          </span>
        )}

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={bakingAllMesh}
          onClick={() => bakeAllSolidMeshCollision({ force: true })}
          title="Re-fit collision to the real mesh shape for every Solid prop, including ones with an existing bake — use this to pick up a fixed voxelizer/collision algorithm on props baked before the fix."
        >
          {bakingAllMesh ? 'Fitting collision…' : 'Fix Solid Collision'}
        </Button>

        {!isMobile && (
          <Button
            size="sm"
            variant={freeFly ? 'default' : 'secondary'}
            className={`shrink-0 ${freeFly ? 'bg-amber-600 hover:bg-amber-500' : ''}`}
            onClick={() => apiRef.current?.setFreeFly(!freeFly)}
            title="Toggle free fly — WASD move, mouse look, Space up, C down. Click again to exit."
          >
            <Navigation className="w-4 h-4 mr-1" /> {freeFly ? 'Free Fly ON' : 'Free Fly'}
          </Button>
        )}

        <Button size="sm" variant="secondary" className="shrink-0" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => setShowHelp((v) => !v)}
          title="Quick tips overlay"
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 border border-cyan-400/40 text-cyan-100"
          onClick={toggleEditorUi}
          title={shortcutTitle('toggle-ui', 'Hide all menus for placing — Ctrl+H / Esc / Show UI to restore')}
        >
          <EyeOff className="w-4 h-4 mr-1" /> Hide UI
        </Button>

        <div className="flex-1 min-w-2" />
        {isLiveHere && (
          <span
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-red-400/60 bg-red-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-200"
            title="This document is the cloud Active/MAIN map live matches load — Save publishes to new matches."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            Live map
          </span>
        )}
        {variant !== 'engine' ? (
        <>
        <Button
          size="sm"
          variant="secondary"
          className={`shrink-0 ${dirty ? 'border border-amber-400/60 text-amber-100 bg-amber-500/15' : ''}`}
          onClick={() => handleManualSave()}
          title={dirty ? 'Unsaved changes — click to save' : 'Saved'}
        >
          <Save className="w-4 h-4 mr-1" /> {dirty ? 'Save •' : 'Save'}
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={doExport}>
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1" /> Import
        </Button>
        </>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (isDirty()) {
                const ok = confirm(
                  'Import replaces the current map in the editor.\n\nOK = continue (save first if you need this map)\nCancel = abort'
                );
                if (!ok) {
                  e.target.value = '';
                  return;
                }
              }
              const parsed = importJson(await f.text());
              const cleaned = stripLegacyBakedStairPads(parsed);
              const withEnv = { ...cleaned, environment: ensureEnvironment(cleaned) };
              const id = generateId('map');
              saveMap(id, withEnv);
              closeStudioPanels();
              setMapId(id);
              setDoc(withEnv);
              docRef.current = withEnv;
              markClean(withEnv);
              clearHistory();
              apiRef.current?.setDoc(withEnv);
              toast({
                title: 'Map imported',
                description: `“${withEnv.name}” ready to edit.`,
              });
            } catch (err) {
              console.error(err);
              toast({
                title: 'Import failed',
                description: err instanceof Error ? err.message : 'Invalid map JSON',
                variant: 'destructive',
              });
            }
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="destructive" className="shrink-0" onClick={requestClose} title={variant === 'engine' ? 'Back to projects (Esc)' : 'Exit (Esc)'}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      )}

      {!uiCollapsed && cloudActive && !isCloudLive && (
        <div className={`shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-950/90 border-b border-amber-500/35 text-[11px] text-amber-100 relative ${
          variant === 'engine' ? 'z-10' : 'z-[55]'
        }`}>
          <span className="min-w-0 truncate">
            {liveCloudMismatchMessage(doc.name, cloudActive)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 h-7 border border-amber-400/50 text-amber-50"
            onClick={publishToMatch}
          >
            Set as MAIN
          </Button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {!uiCollapsed && isMobile && sidebarOpen && (
          <button
            type="button"
            aria-label="Close library"
            className="absolute inset-0 z-[65] bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {!uiCollapsed && railOpen && (
        <div
          className={`border-r border-white/10 bg-[#0f1620] flex flex-col items-center py-2 gap-1 z-[70] ${
            isMobile
              ? 'absolute left-0 top-0 bottom-0 w-10 shadow-xl'
              : 'w-10 relative'
          }`}
        >
          {railPlugins.map((plugin) => {
            const Icon = plugin.icon;
            return (
              <button
                key={plugin.id}
                type="button"
                title={plugin.label}
                className={`w-8 h-8 rounded flex items-center justify-center ${
                  tab === plugin.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/50 hover:text-white'
                }`}
                onClick={() => {
                  if (plugin.onActivate) {
                    plugin.onActivate(brains);
                    return;
                  }
                  if (plugin.studio) {
                    // Second click on an open studio closes it.
                    if (tab === plugin.id) closeStudioPanels();
                    else openStudioTab(plugin.id, plugin.studio);
                    return;
                  }
                  selectLibraryTab(plugin.id);
                }}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
          <button
            type="button"
            title="Hide tool icons"
            className="mt-auto w-8 h-8 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => {
              closeStudioPanels();
              setSidebarOpen(false);
              setRailOpen(false);
            }}
            aria-label="Hide tool icon rail"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        )}

        {/* Reopen the icon rail once fully hidden */}
        {!uiCollapsed && !isMobile && !railOpen && (
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            className="absolute top-1/2 left-0 z-[140] flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/20 bg-[#121a24] text-white/80 shadow-lg hover:bg-cyan-500/20 hover:text-cyan-200"
            title="Show tool icons"
            aria-label="Show tool icon rail"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {!uiCollapsed && sidebarOpen && (
        <div
          style={
            isMobile
              ? undefined
              : {
                  width: Math.max(
                    220,
                    Math.min(
                      panelWidth,
                      Math.round((typeof window !== 'undefined' ? window.innerWidth : 1280) * 0.7)
                    )
                  ),
                }
          }
          className={`border-r border-white/10 bg-[#121a24] flex flex-col min-h-0 z-[70] relative ${
            isMobile
              ? `absolute left-10 top-0 bottom-0 shadow-2xl ${
                  isStudioSidebarTab(tab)
                    ? 'w-[min(22rem,calc(100vw-2.5rem))]'
                    : 'w-[min(18rem,calc(100vw-2.5rem))]'
                }`
              : `relative ${panelResizing ? 'select-none' : ''}`
          }`}
        >
          {/* Edge arrow to collapse the model / library panel */}
          <button
            type="button"
            onClick={() => {
              closeStudioPanels();
              setSidebarOpen(false);
            }}
            className="absolute -right-3 top-1/2 z-[80] flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-white/25 bg-[#1a2433] text-white/85 shadow-md hover:bg-cyan-500/25 hover:text-cyan-100 active:scale-95"
            title="Collapse model panel"
            aria-label="Collapse model panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Drag handle to resize the panel width (desktop only) */}
          {!isMobile && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              title="Drag to resize"
              onMouseDown={(e) => {
                e.preventDefault();
                panelResizeRef.current = { startX: e.clientX, startWidth: panelWidth };
                setPanelResizing(true);
                const onMove = (ev: MouseEvent) => {
                  if (!panelResizeRef.current) return;
                  const delta = ev.clientX - panelResizeRef.current.startX;
                  const next = Math.max(
                    220,
                    Math.min(panelResizeRef.current.startWidth + delta, Math.round(window.innerWidth * 0.7))
                  );
                  setPanelWidth(next);
                };
                const onUp = () => {
                  panelResizeRef.current = null;
                  setPanelResizing(false);
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                  setPanelWidth((w) => {
                    window.localStorage.setItem('kilrun.editorPanelWidth', String(w));
                    return w;
                  });
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
              className="absolute top-0 right-0 bottom-0 w-1.5 -mr-0.5 cursor-col-resize z-[75] hover:bg-cyan-400/40 active:bg-cyan-400/60"
            />
          )}

          {sidebarPlugin?.render(brains)}

        </div>
        )}

        {/* Viewport + optional Player Model studio */}
        <div className="flex-1 relative min-w-0 flex">
          <div className="flex-1 relative min-w-0">
          <div ref={hostRef} className="absolute inset-0" />

          {freeFly && !uiCollapsed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-600/90 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-wide pointer-events-none text-center max-w-[90vw] z-[40]">
              {isTouch
                ? 'FREE FLY · Left look · Right move · Fly toward look · Edit to place'
                : 'FREE FLY · WASD toward look · Mouse · Space/C · Ctrl exit · placement off'}
            </div>
          )}

          {pendingPlaceKind && !freeFly && !uiCollapsed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-600/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
              <span>
                Placing {entityKindLabel(pendingPlaceKind)} — click once
                <span className="font-normal opacity-80"> · Shift+click for more · Esc / Select to cancel</span>
              </span>
              <button
                type="button"
                className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-black/50"
                onClick={() => {
                  apiRef.current?.clearPendingPlace();
                  setPendingPlaceKind(null);
                  setEditTool('select');
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {showHelp && !freeFly && !uiCollapsed && !pendingPlaceKind && (
            <div
              className={`absolute max-w-xs bg-black/75 border border-white/15 rounded-xl p-3 text-[11px] text-white/70 space-y-1 pointer-events-none z-[40] ${
                isMobile ? 'top-24 left-3' : 'top-3 left-3'
              }`}
            >
              <p className="text-cyan-300 font-bold tracking-wide">QUICK TIPS</p>
              {isTouch || isMobile ? (
                <>
                  <p>· Tap <b className="text-white">Hide UI</b> for a clear place canvas</p>
                  <p>· <b className="text-white">Select</b> (arrow) picks objects · <b className="text-white">Brush</b> paints</p>
                  <p>· <b className="text-white">Level</b> strip: paint Floor (0) then Props (1); eye hides a level</p>
                  <p>· <b className="text-white">Library</b> picks a model then arm Brush · tap ground</p>
                  <p>· <b className="text-white">Fly</b> for joysticks · <b className="text-white">Edit</b> to place</p>
                  <p>· Set <b className="text-white">MAIN map</b> so Deathrun loads it</p>
                </>
              ) : (
                <>
                  <p>· <b className="text-white">Select (V)</b> picks · cancels spawn placement</p>
                  <p>· Flag / spawn tools: click once to place · Shift keeps placing</p>
                  <p>· <b className="text-white">Player Model</b> (left nav) = platform avatar (not map spawn)</p>
                  <p>· <b className="text-white">Hammer (H)</b> solids: Material + size in Properties</p>
                  <p>· <b className="text-white">Textures</b> tab: drag atlas region · paint brush</p>
                  <p>· Paint tool: <b className="text-white">right-click</b> a solid to copy its texture, <b className="text-white">left-click</b> another to paste it aligned exactly the same</p>
                  <p>· <b className="text-white">Ctrl</b> free fly · <b className="text-white">G</b> snap · <b className="text-white">W/E/R</b> gizmo · <b className="text-white">Shift</b> exact grid</p>
                  <p>· Set as <b className="text-white">MAIN map</b> for Deathrun Play</p>
                </>
              )}
            </div>
          )}

          {measureMode && !uiCollapsed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-cyan-700/90 text-white text-xs font-bold px-3 py-1.5 rounded-full tracking-wide pointer-events-none">
              MEASURE · click two ground points
              {measureDist != null ? ` · ${measureDist.toFixed(2)} u` : ''}
            </div>
          )}

          <EditorTutorial
            open={tutorialOpen}
            onClose={() => setTutorialOpen(false)}
            onStep={onTutorialStep}
          />
          <KeyboardShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          <EditorGraphicsOverlay
            open={showGraphics}
            perf={editorPerf}
            toolsOpen={toolsOpen}
            onClose={() => setShowGraphics(false)}
            onToggleTools={() => setToolsOpen((v) => !v)}
            onTogglePerf={(key) => {
              setEditorPerf((prev) => {
                const next = { ...prev, [key]: !prev[key] };
                apiRef.current?.setEditorPerfMode(next);
                return next;
              });
            }}
            onRestorePerf={() => {
              const next = { ...DEFAULT_EDITOR_PERF_MODE };
              setEditorPerf(next);
              apiRef.current?.setEditorPerfMode(next);
            }}
            onOpenWorld={() => {
              setShowGraphics(false);
              openEditorTab('world');
            }}
            onOpenSettings={() => {
              setShowGraphics(false);
              openEditorTab('settings');
            }}
          />

          {!uiCollapsed && (
          <div className="absolute bottom-14 left-3 text-[10px] text-white/45 bg-black/50 px-2 py-1 rounded pointer-events-none z-[40] max-w-[55vw] truncate">
            {doc.entities.length} entities · grid {doc.gridSize}
            {gridSnap ? ' · snap' : ''}
            {snapY ? 'Y' : ''}
            {activeLayer
              ? ` · L${sortedLayers.findIndex((l) => l.id === activeLayer.id)}:${activeLayer.name}`
              : ''}
            {editTool === 'paint'
              ? ' · texture paint'
              : editTool === 'hammer'
                ? ' · Hammer++ solid'
              : editTool === 'bucket' && brush && brush !== HAMMER_SOLID_MODEL
              ? ` · bucket: ${brush}`
              : editTool === 'brush' && brush && brush !== HAMMER_SOLID_MODEL
                ? ` · brush: ${brush}`
                : editTool === 'brush' || editTool === 'bucket'
                  ? ' · pick a model'
                  : ' · select'}
            {selectedIds.length > 1
              ? ` · multi: ${selectedIds.length}`
              : selected
                ? ` · sel: ${selected.name}`
                : ''}
            {selected && entityExportsAsPlatform(selected) ? ' · green pad = solid' : ''}
          </div>
          )}

          {/* Quick level strip — switch / hide build levels without opening the sidebar */}
          {!uiCollapsed && sortedLayers.length > 0 && (
            <div
              className={`absolute z-[85] flex items-center gap-1 max-w-[min(70vw,22rem)] overflow-x-auto rounded-xl border border-white/15 bg-black/75 px-1.5 py-1 backdrop-blur ${
                toolsOpen
                  ? 'bottom-[4.25rem] left-1/2 -translate-x-1/2'
                  : 'bottom-14 left-1/2 -translate-x-1/2'
              }`}
            >
              <span className="text-[9px] font-bold uppercase tracking-wide text-white/40 px-1 shrink-0">
                Level
              </span>
              {sortedLayers.map((layer, index) => {
                const isActive = activeLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    className={`flex items-center rounded-lg border shrink-0 ${
                      isActive
                        ? 'border-cyan-400/60 bg-cyan-500/25'
                        : layer.visible
                          ? 'border-white/10 bg-white/5'
                          : 'border-white/5 bg-black/40 opacity-60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLayerId(layer.id);
                        selectLibraryTab('layers');
                      }}
                      className="px-2 py-1 text-[10px] font-bold text-white/85"
                      title={`Build on ${layer.name} (level ${index})`}
                    >
                      {index}
                      <span className="ml-1 font-medium text-white/50 hidden sm:inline">
                        {layer.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayerFlag(layer.id, { visible: !layer.visible })}
                      className="w-7 h-7 flex items-center justify-center border-l border-white/10 text-white/50 hover:text-white/90"
                      title={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                    >
                      {layer.visible ? (
                        <Eye className="w-3 h-3 text-emerald-300" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addBuildLevel}
                className="w-7 h-7 shrink-0 rounded-lg border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/10"
                title="Add build level"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!uiCollapsed && (
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="absolute bottom-3 left-3 z-[90] flex items-center gap-1 rounded-xl border border-white/20 bg-black/75 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur active:scale-95"
            title={toolsOpen ? 'Hide tool bar' : 'Show tool bar'}
          >
            {toolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            Tools
          </button>
          )}

          {!uiCollapsed && toolsOpen && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 border border-white/15 rounded-xl px-2 py-1.5 backdrop-blur z-[90] max-w-[calc(100vw-7rem)] overflow-x-auto">
            <ToolBtn
              active={editTool === 'select' && !pendingPlaceKind}
              onClick={() => {
                setEditTool('select');
                apiRef.current?.clearPendingPlace();
                setPendingPlaceKind(null);
              }}
              title="Select (V) — click objects; cancels spawn placement"
            >
              <MousePointer2 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={editTool === 'brush'}
              onClick={() => {
                setEditTool('brush');
                if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
              }}
              title={
                brush && brush !== HAMMER_SOLID_MODEL
                  ? `Brush (B) — click to place ${brush}`
                  : 'Brush (B) — pick a model in Assets'
              }
            >
              <Paintbrush className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={editTool === 'bucket'}
              onClick={() => {
                // If a scene object is selected, paint that model; else keep library brush.
                const selModel = selected?.model;
                if (selModel && selModel !== HAMMER_SOLID_MODEL) setBrush(selModel);
                else if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
                setEditTool('bucket');
                if (freeFly) apiRef.current?.setFreeFly(false);
              }}
              title={
                brush && brush !== HAMMER_SOLID_MODEL
                  ? `Paint Bucket (P) — hold+drag paints ${brush}; camera locked`
                  : 'Paint Bucket (P) — pick a model, then hold+drag'
              }
            >
              <PaintBucket className="w-4 h-4 text-fuchsia-300" />
            </ToolBtn>
            <ToolBtn
              active={editTool === 'hammer'}
              onClick={() => {
                setEditTool('hammer');
                setMode('scale');
                if (freeFly) apiRef.current?.setFreeFly(false);
              }}
              title="Hammer++ (H) — place solid shapes; hold-drag to paint; shape sticks until you change it"
            >
              <Hammer className="w-4 h-4 text-amber-300" />
            </ToolBtn>
            {editTool === 'hammer' && (
              <label className="flex items-center gap-1 text-[10px] text-amber-100/90 ml-1">
                <span className="uppercase tracking-wide text-white/40">Shape</span>
                <select
                  className="bg-black/50 border border-amber-500/40 rounded px-1.5 py-1 text-xs text-white max-w-[7.5rem]"
                  value={hammerShape}
                  onChange={(e) => setHammerShape(e.target.value as HammerPrimitive)}
                  title="Sticky Hammer shape for the next solids you place"
                >
                  {HAMMER_PRIMITIVES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ToolBtn
              active={editTool === 'paint'}
              onClick={() => {
                setEditTool('paint');
                if (freeFly) apiRef.current?.setFreeFly(false);
                selectLibraryTab('textures');
              }}
              title="Texture brush — tap objects to apply selected texture + UV tile"
            >
              <Palette className="w-4 h-4 text-sky-300" />
            </ToolBtn>
            <div className="w-px h-6 bg-white/15 mx-1" />
            <ToolBtn
              active={viewLayout === 'single'}
              onClick={() => setViewLayout('single')}
              title="Single 3D view"
            >
              <Square className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={viewLayout === 'split'}
              onClick={() => setViewLayout('split')}
              title="Split: 3D + top (shared scene)"
            >
              <LayoutGrid className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={viewLayout === 'triple'}
              onClick={() => setViewLayout('triple')}
              title="Triple: 3D + top + side"
            >
              <Box className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={false}
              onClick={() => apiRef.current?.setCameraPreset('top')}
              title="Camera: top view"
            >
              <span className="text-[9px] font-bold">TOP</span>
            </ToolBtn>
            <ToolBtn
              active={false}
              onClick={() => apiRef.current?.setCameraPreset('side')}
              title="Camera: side view"
            >
              <span className="text-[9px] font-bold">SIDE</span>
            </ToolBtn>
            <div className="w-px h-6 bg-white/15 mx-1" />
            <ToolBtn
              active={mode === 'translate'}
              onClick={() => {
                setEditTool('select');
                setMode('translate');
              }}
              title="Move (W) — switch to Select so the gizmo can drag"
            >
              <Move3d className="w-4 h-4" />
            </ToolBtn>
            <div className="relative">
              <ToolBtn
                btnRef={rotateMenuBtnRef}
                active={mode === 'rotate' || rotateMenuOpen}
                onClick={() => {
                  setEditTool('select');
                  setMode('rotate');
                  setRotateMenuAnchorRect(rotateMenuBtnRef.current?.getBoundingClientRect() ?? null);
                  setRotateMenuOpen((v) => !v);
                }}
                title="Rotate (E) — click for 90° / flip presets (works on groups)"
              >
                <RotateCcw className="w-4 h-4" />
              </ToolBtn>
              {rotateMenuOpen && (
                <RotatePresetPicker
                  anchorRect={rotateMenuAnchorRect}
                  onPick={(op) => {
                    const ok = apiRef.current?.transformSelection(op);
                    setRotateMenuOpen(false);
                    toast({
                      title: ok ? 'Rotated' : 'Select an object first',
                      description: ok
                        ? 'Applied to the whole selection / group.'
                        : 'Click an unlocked object, then use Rotate again.',
                      ...(ok ? {} : { variant: 'destructive' as const }),
                    });
                  }}
                  onClose={() => setRotateMenuOpen(false)}
                />
              )}
            </div>
            <ToolBtn
              active={mode === 'scale'}
              onClick={() => {
                setEditTool('select');
                setMode('scale');
              }}
              title="Scale (R) — switch to Select so the gizmo can drag"
            >
              <Maximize2 className="w-4 h-4" />
            </ToolBtn>
            <div className="w-px h-6 bg-white/15 mx-1" />
            <ToolBtn active={gridSnap} onClick={() => setGridSnap((v) => !v)} title="Grid snap XZ (G)">
              <Grid3x3 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={snapY} onClick={() => setSnapY((v) => !v)} title="Also snap Y height">
              <span className="text-[10px] font-bold">Y</span>
            </ToolBtn>
            <div className="relative">
              <ToolBtn
                btnRef={snapMagnetBtnRef}
                active={snapFaceMenuOpen}
                onClick={applyMagnetSnap}
                title={
                  selectedIds.length >= 2
                    ? 'Snap (magnet) — choose which side to join'
                    : 'Attach to the nearest object (or the floor if nothing is close)'
                }
              >
                <Magnet className="w-4 h-4 text-emerald-300" />
              </ToolBtn>
              {snapFaceMenuOpen && (
                <SnapFacePicker
                  anchorRect={snapFaceAnchorRect}
                  onPick={(face, opts) => {
                    const ok = apiRef.current?.snapSelectedToFace(face, selectedIds, opts);
                    setSnapFaceMenuOpen(false);
                    if (ok) {
                      toast({
                        title: 'Snapped',
                        description: `Joined ${SNAP_FACE_LABELS[face]} of the first-selected object${
                          opts.alignRotation ? ', turned to match its angle' : ''
                        }.`,
                      });
                    } else {
                      toast({
                        title: 'Snap failed',
                        description: 'Select 2+ unlocked objects, then try again.',
                        variant: 'destructive',
                      });
                    }
                  }}
                  onSnapTogether={() => {
                    const ok = apiRef.current?.snapSelectedTogether(selectedIds);
                    setSnapFaceMenuOpen(false);
                    toast({
                      title: ok ? 'Lined up' : 'Line up failed',
                      description: ok
                        ? 'Shared bottom, edge to edge along X.'
                        : 'Select 2+ unlocked objects, then try again.',
                      variant: ok ? undefined : 'destructive',
                    });
                  }}
                  onClose={() => setSnapFaceMenuOpen(false)}
                />
              )}
            </div>
            <ToolBtn
              active={measureMode}
              onClick={() => {
                const next = !measureMode;
                setMeasureMode(next);
                apiRef.current?.setMeasureMode(next);
                if (next && freeFly) apiRef.current?.setFreeFly(false);
              }}
              title="Measure distance (click two points)"
            >
              <Ruler className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={showAllCollisionGizmos}
              onClick={() => {
                const next = !showAllCollisionGizmos;
                setShowAllCollisionGizmos(next);
                apiRef.current?.setShowAllCollisionGizmos(next);
              }}
              title="Show all solid/collision pads (green) — not selection"
            >
              <span className="text-[9px] font-bold text-emerald-300">COL</span>
            </ToolBtn>
            <div className="flex items-center gap-0.5">
              {([0.25, 0.5, 1, 2, 4] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    scheduleHistory();
                    const live = apiRef.current?.getDoc() ?? docRef.current;
                    const next = { ...live, gridSize: g };
                    docRef.current = next;
                    setDoc(next);
                    apiRef.current?.setGridSize(g);
                    setDirty(true);
                  }}
                  className={`px-1 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    doc.gridSize === g
                      ? 'bg-sky-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={`Grid size ${g}`}
                >
                  {g}
                </button>
              ))}
              <input
                type="number"
                min={0.1}
                max={16}
                step={0.25}
                value={doc.gridSize}
                className="w-12 bg-black/50 border border-white/10 rounded px-1 py-0.5 text-[10px] ml-0.5"
                onChange={(e) => {
                  const n = Math.max(0.1, Math.min(16, Number(e.target.value) || 1));
                  scheduleHistory();
                  const live = apiRef.current?.getDoc() ?? docRef.current;
                  const next = { ...live, gridSize: n };
                  docRef.current = next;
                  setDoc(next);
                  apiRef.current?.setGridSize(n);
                  setDirty(true);
                }}
                title="Custom grid size"
              />
            </div>
            <div className="flex items-center gap-0.5">
              {(
                [
                  ['off', 'OFF', 'Drop where you let go — no attach'],
                  ['face', 'FACE', 'Click flush onto the nearest neighbour face'],
                  ['vertex', 'VERT', 'Snap the nearest corner onto a neighbour corner'],
                  ['edge', 'EDGE', 'Snap the nearest edge midpoint onto a neighbour edge'],
                ] as const
              ).map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSnapTarget(value);
                    apiRef.current?.setSnapTarget(value);
                  }}
                  className={`px-1 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    snapTarget === value
                      ? 'bg-emerald-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={title}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              {(
                [
                  ['median', 'MED', 'Rotate / scale about the average of the objects’ origins'],
                  ['bounds', 'BOX', 'Rotate / scale about the selection’s bounding-box center'],
                  ['active', 'ACT', 'Rotate / scale about the last-clicked object'],
                ] as const
              ).map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPivotMode(value);
                    apiRef.current?.setPivotMode(value);
                  }}
                  className={`px-1 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    pivotMode === value
                      ? 'bg-violet-500/80 text-white'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                  title={title}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const next: TransformSpace = transformSpace === 'world' ? 'local' : 'world';
                setTransformSpace(next);
                apiRef.current?.setTransformSpace(next);
              }}
              className="px-1 py-0.5 rounded text-[9px] font-bold bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              title="Gizmo axes: world axes, or the selected object's own axes"
            >
              {transformSpace === 'world' ? 'WORLD' : 'LOCAL'}
            </button>
            <ToolBtn onClick={() => apiRef.current?.focusSelected()} title="Focus selection (F)">
              <Crosshair className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              onClick={() => apiRef.current?.resetCamera()}
              title="Reset camera to edit home (Start / spawn)"
            >
              <Home className="w-4 h-4 text-emerald-300" />
            </ToolBtn>
            <ToolBtn onClick={() => armPlaceSpawn('start')} title="Runner / Player spawn (invisible marker)">
              <Flag className="w-4 h-4 text-emerald-400" />
            </ToolBtn>
            {gameMode === 'deathrun' && (
              <>
                <ToolBtn onClick={() => armPlaceSpawn('finish')} title="Finish (invisible unless you assign a model)">
                  <FlagTriangleRight className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn onClick={() => armPlaceSpawn('spawn_trapper')} title="Trapper spawn (invisible)">
                  <Flag className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('button')}
                  title="Button"
                >
                  <CircleDot className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('trap')}
                  title="Trap"
                >
                  <Zap className="w-4 h-4 text-violet-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('hazard')}
                  title="Death"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('spinner')}
                  title="Rotating hazard (saw / blade / crushing bar)"
                >
                  <Fan className="w-4 h-4 text-red-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('door')}
                  title="Door"
                >
                  <Box className="w-4 h-4 text-violet-200" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('jump_pad')}
                  title="Jump pad"
                >
                  <Rocket className="w-4 h-4 text-sky-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('action')}
                  title="Action trigger"
                >
                  <Zap className="w-4 h-4 text-amber-200" />
                </ToolBtn>
              </>
            )}
            {gameMode === 'horde' && (
              <>
                <ToolBtn
                  onClick={() => armPlaceSpawn('spawn_monster')}
                  title="Enemy spawn (invisible)"
                >
                  <Bug className="w-4 h-4 text-rose-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('wave_anchor')}
                  title="Wave anchor (marks wave zone)"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('red_zone')}
                  title="Red death zone (damages players inside)"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('health_floor')}
                  title="Health floor (heals players)"
                >
                  <Heart className="w-4 h-4 text-emerald-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('revive_pad')}
                  title="Revive pad (resurrects fallen players)"
                >
                  <HeartPulse className="w-4 h-4 text-sky-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('jump_pad')}
                  title="Jump pad"
                >
                  <Rocket className="w-4 h-4 text-sky-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('hazard')}
                  title="Hazard / trap"
                >
                  <Zap className="w-4 h-4 text-violet-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('spinner')}
                  title="Rotating hazard (saw / blade / crushing bar)"
                >
                  <Fan className="w-4 h-4 text-red-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('door')}
                  title="Door"
                >
                  <Box className="w-4 h-4 text-violet-200" />
                </ToolBtn>
              </>
            )}
            {gameMode === 'competitive' && (
              <>
                <ToolBtn
                  onClick={() => armPlaceSpawn('spawn_team_a')}
                  title="Player A spawn (invisible)"
                >
                  <Flag className="w-4 h-4 text-sky-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceSpawn('spawn_team_b')}
                  title="Player B spawn (invisible)"
                >
                  <Flag className="w-4 h-4 text-red-500" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('hazard')}
                  title="Death zone / hazard"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('spinner')}
                  title="Rotating hazard (saw / blade / crushing bar)"
                >
                  <Fan className="w-4 h-4 text-red-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('jump_pad')}
                  title="Jump pad"
                >
                  <Rocket className="w-4 h-4 text-sky-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('button')}
                  title="Button trigger"
                >
                  <CircleDot className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('action')}
                  title="Action trigger"
                >
                  <Zap className="w-4 h-4 text-amber-200" />
                </ToolBtn>
            <ToolBtn
              onClick={() => armPlaceEntity('door')}
              title="Door"
            >
              <Box className="w-4 h-4 text-violet-200" />
            </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('push_rail')}
                  title="Push rail (payload track — place before the block)"
                >
                  <Route className="w-4 h-4 text-sky-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('push_block')}
                  title="Push payload (escort cart — stand near it to push along the rail)"
                >
                  <Package className="w-4 h-4 text-amber-300" />
                </ToolBtn>
              </>
            )}
            <ToolBtn
              onClick={() => armPlaceEntity('light')}
              title="Light bulb"
            >
              <Lightbulb className="w-4 h-4 text-amber-200" />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.duplicateSelected()} title="Duplicate">
              <Copy className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.deleteSelected()} title="Delete">
              <Trash2 className="w-4 h-4 text-red-300" />
            </ToolBtn>
            <ToolBtn
              active={allAnimStopped}
              onClick={() => {
                if (allAnimStopped) {
                  apiRef.current?.resumeAllAnim();
                  setAllAnimStopped(false);
                  setStoppedAnimIds(new Set());
                  toast({ title: 'Animations resumed', description: 'Every object plays normally again.' });
                } else {
                  apiRef.current?.stopAllAnim();
                  setAllAnimStopped(true);
                  toast({
                    title: 'Animations stopped',
                    description: 'Every looping animation is frozen in the editor (Play Test / live match unaffected).',
                  });
                }
              }}
              title={
                allAnimStopped
                  ? 'Resume all animations in the editor'
                  : 'Stop all animations in the editor (freeze looping objects like "Always" triggers)'
              }
            >
              {allAnimStopped ? (
                <Play className="w-4 h-4 text-emerald-300" />
              ) : (
                <Square className="w-4 h-4 text-rose-300" />
              )}
            </ToolBtn>
          </div>
          )}

          {!uiCollapsed && selected && !propsOpen && !anyStudioOpen && (
            <button
              type="button"
              onClick={() => setPropsOpen(true)}
              className="absolute top-3 right-3 z-[80] flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/30 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            >
              Props
            </button>
          )}

          {!uiCollapsed && selected && propsOpen && !anyStudioOpen && (
            <div
              className={`absolute z-[80] bg-black/80 border border-white/15 rounded-xl p-3 backdrop-blur space-y-2 text-sm overflow-y-auto ${
                isMobile
                  ? 'left-3 right-3 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] top-auto max-h-[42vh] w-auto overscroll-contain'
                  : 'top-3 right-3 w-72 max-h-[calc(100%-6rem)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <EditorTip content="Inspector for the selected object — transform, color, glow, solid, wiring.">
                  <p className="text-[10px] tracking-widest text-white/50 uppercase cursor-help">Properties</p>
                </EditorTip>
                <button
                  type="button"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10"
                  title="Collapse properties"
                  onClick={() => setPropsOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="block text-xs text-white/60">
                Name
                <input
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                  value={selected.name}
                  onChange={(e) => patchSelected({ name: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Plugin script
                <input
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[11px]"
                  placeholder="kilrun-example.pulse"
                  value={selected.pluginScript ?? ''}
                  onChange={(e) =>
                    patchSelected({ pluginScript: e.target.value.trim() || undefined })
                  }
                />
              </label>

              {getEntityWarnings(selected, doc.entities).map((msg, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100 leading-snug"
                >
                  ⚠ {msg}
                </div>
              ))}

              <div className="rounded-lg border border-white/10 bg-black/30 p-2 space-y-2">
                <EditorTip
                  content="Show, lock, or group the current selection. Multi-select with Shift+click."
                  shortcut={shortcutKeys('group')}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-white/50 cursor-help">
                    Selection
                    {selectionMeta.count > 1 ? ` · ${selectionMeta.count}` : ''}
                    {selectionMeta.anyGrouped ? ' · grouped' : ''}
                  </p>
                </EditorTip>
                {selectionMeta.count > 1 && (
                  <p className="text-[10px] text-white/45 leading-snug">
                    Move / rotate / scale the gizmo to transform the whole selection as one.
                    Duplicate (Ctrl+D) keeps a new group.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => patchSelection({ visible: !selectionMeta.allVisible })}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${
                      selectionMeta.allVisible
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/15 bg-white/5 text-white/55'
                    }`}
                    title="Show / hide in viewport"
                  >
                    {selectionMeta.allVisible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                    Visible
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLocked = !selectionMeta.allLocked;
                      patchSelection({ locked: nextLocked });
                      toast({
                        title: nextLocked ? 'Locked' : 'Unlocked',
                        description: nextLocked
                          ? 'Cannot move, scale, rotate, or delete until unlocked.'
                          : 'Transforms enabled again.',
                      });
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${
                      selectionMeta.allLocked
                        ? 'border-amber-500/50 bg-amber-500/20 text-amber-100'
                        : 'border-white/15 bg-white/5 text-white/55'
                    }`}
                    title="Lock — no move / rotate / scale / delete"
                  >
                    {selectionMeta.allLocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                    {selectionMeta.allLocked ? 'Locked' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    onClick={groupSelection}
                    disabled={selectionMeta.count < 2}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs text-sky-100 disabled:opacity-35"
                    title="Group selected objects (selecting one picks all)"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Group
                  </button>
                  <button
                    type="button"
                    onClick={ungroupSelection}
                    disabled={!selectionMeta.anyGrouped}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white/70 disabled:opacity-35"
                    title="Ungroup selection"
                  >
                    <Unlink2 className="w-3.5 h-3.5" />
                    Ungroup
                  </button>
                  <button
                    type="button"
                    onClick={runCsgSubtract}
                    disabled={csgBusy || selectedIds.length !== 2}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-100 disabled:opacity-35"
                    title="Cut the 2nd (shift-clicked) object out of the 1st"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Subtract
                  </button>
                  <button
                    type="button"
                    onClick={runCsgUnion}
                    disabled={csgBusy || selectedIds.length < 2}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs text-violet-100 disabled:opacity-35"
                    title="Merge selected objects into one solid piece"
                  >
                    <Combine className="w-3.5 h-3.5" />
                    Union
                  </button>
                  <button
                    type="button"
                    onClick={runCsgIntersect}
                    disabled={csgBusy || selectedIds.length !== 2}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs text-sky-100 disabled:opacity-35"
                    title="Keep only the overlapping volume of two solids"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Intersect
                  </button>
                </div>
                <p className="text-[10px] text-white/40 leading-snug">
                  Subtract / Union / Intersect: Hammer solids only (Box, Cylinder, Wedge, …). Select order
                  matters for Subtract — first stays, second (shift+click) is cut off.
                </p>
                {selected.csgSources && selected.csgSources.length > 0 && (
                  <button
                    type="button"
                    onClick={restoreCsgSources}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100"
                    title="Replace this baked mesh with the original solids"
                  >
                    Restore original brushes ({selected.csgSources.length})
                  </button>
                )}
                <ModifyPanel
                  selection={modifySelection}
                  onAdd={addBulkEntities}
                  onUpdate={updateBulkEntities}
                />
                {(selected.locked || isEntityEditLocked(selected, doc.layers)) && (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-amber-200">
                        {selected.locked ? 'Object is locked' : 'Layer is locked'}
                      </p>
                      <p className="text-[10px] text-white/55 mt-0.5">
                        {selected.locked
                          ? 'This object cannot be moved or edited.'
                          : 'The build layer containing this object is locked.'}
                      </p>
                      {selected.locked && (
                        <button
                          className="mt-1.5 flex items-center gap-1 rounded bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-400/30 transition-colors"
                          onClick={() => patchEntityById(selected.id, { locked: false })}
                        >
                          <Unlock className="w-3 h-3" />
                          Unlock object
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {selected.csgWarning && (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 flex items-start gap-2">
                    <Scissors className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-amber-200">Collision approximated</p>
                      <p className="text-[10px] text-white/55 mt-0.5">{selected.csgWarning}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Type label — never a confusing Kind dropdown for hammer / markers / player */}
              {isHammerSolidEntity(selected) ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Hammer solid
                  </p>
                  <p className="text-[10px] text-white/55 leading-snug">
                    Solid brush — pick a shape, material, and size. Shape also sticks for the Hammer
                    tool until you change it.
                  </p>
                  <label className="block text-xs text-white/60">
                    Shape
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white"
                      value={(selected.primitive as HammerPrimitive) || 'box'}
                      onChange={(e) => {
                        const shape = e.target.value as HammerPrimitive;
                        const size =
                          selected.collisionSize ?? defaultSizeForHammer(shape);
                        setHammerShape(shape);
                        patchSelected({
                          primitive: shape,
                          model: HAMMER_SOLID_MODEL,
                          collisionSize: size,
                          solid: true,
                          meshCollisionPads: hollowHammerCollisionPads(shape, size),
                        });
                      }}
                    >
                      {HAMMER_PRIMITIVES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-[10px] text-white/40">
                    {HAMMER_PRIMITIVES.find((p) => p.id === (selected.primitive || 'box'))?.hint}
                  </p>
                </div>
              ) : selected.kind === 'player' ? (
                <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-sky-200">
                    Player model (platform)
                  </p>
                  <p className="text-[10px] text-white/60 leading-snug">
                    How players look in this map — not a spawn point. Configure in Player Model.
                  </p>
                  <Button
                    size="sm"
                    className="w-full bg-sky-600 hover:bg-sky-500"
                    onClick={() => openPlayerStudio()}
                  >
                    <User className="w-3.5 h-3.5 mr-1" />
                    Open Player Model
                  </Button>
                </div>
              ) : isInvisibleMarkerKind(selected.kind) ||
                selected.kind === 'finish' ||
                selected.kind === 'jump_pad' ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                    {entityKindLabel(selected.kind)}
                  </p>
                  {entityKindHint(selected.kind) && (
                    <p className="text-[10px] text-white/55 leading-snug">
                      {entityKindHint(selected.kind)}
                    </p>
                  )}
                </div>
              ) : (
                <label className="block text-xs text-white/60">
                  Kind
                  <select
                    className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                    value={selected.kind}
                    onChange={(e) =>
                      patchSelected({ kind: e.target.value as EditorEntity['kind'] })
                    }
                  >
                    {/* Include current kind + mode palette so props/hammer stay valid */}
                    {Array.from(
                      new Set<EditorEntity['kind']>([
                        selected.kind,
                        'prop',
                        ...kindOptions,
                      ])
                    ).map((k) => (
                      <option key={k} value={k}>
                        {entityKindLabel(k)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!isHammerSolidEntity(selected) &&
                selected.kind !== 'player' &&
                !isInvisibleMarkerKind(selected.kind) &&
                selected.kind !== 'finish' &&
                selected.kind !== 'jump_pad' &&
                entityKindHint(selected.kind) && (
                  <p className="text-[10px] leading-snug text-cyan-200/80 -mt-1">
                    {entityKindHint(selected.kind)}
                  </p>
                )}

              {entityShowsModelPicker(selected) && (
                <>
                  <label className="block text-xs text-white/60">
                    Model
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={selected.model ?? ''}
                      onChange={(e) =>
                        patchSelected({
                          model: e.target.value || undefined,
                          customModelUrl: undefined,
                        })
                      }
                    >
                      <option value="">— none —</option>
                      {PROTOTYPE_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CharacterAssetPicker
                    valueUrl={
                      selected.customModelUrl?.startsWith('/game/skins/')
                        ? selected.customModelUrl
                        : null
                    }
                    onPick={(entry, modelUrl) =>
                      patchSelected({
                        model: undefined,
                        customModelUrl: modelUrl,
                        name: selected.name || entry.displayName,
                      })
                    }
                    label="Character pack"
                  />
                  <label className="block text-xs text-white/60">
                    Upload animated GLB
                    <input
                      type="file"
                      accept=".glb,.gltf,.fbx,model/gltf-binary"
                      className="mt-0.5 w-full text-[10px]"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        void (async () => {
                          try {
                            const url = await persistEditorModelFile(f);
                            patchSelected({
                              customModelUrl: url,
                              model: undefined,
                              name: selected.name || f.name.replace(/\.(glb|gltf|fbx)$/i, ''),
                            });
                            toast({ title: 'Model uploaded' });
                          } catch (err) {
                            toast({
                              title: 'Model upload failed',
                              description: err instanceof Error ? err.message : 'Link live game, then try again.',
                              variant: 'destructive',
                            });
                          }
                        })();
                      }}
                    />
                  </label>
                </>
              )}

              {entityShowsModelPicker(selected) &&
                selected.kind !== 'finish' &&
                selected.kind !== 'jump_pad' && (
                <AnimationPropsPanel
                  entity={selected}
                  allEntities={doc.entities}
                  onChange={patchSelected}
                  onPreview={(which) => apiRef.current?.previewAnim(which)}
                  onStop={() => {
                    apiRef.current?.stopEntityAnim(selected.id);
                    setStoppedAnimIds((prev) => new Set(prev).add(selected.id));
                  }}
                  onResume={() => {
                    apiRef.current?.resumeEntityAnim(selected.id);
                    setStoppedAnimIds((prev) => {
                      const next = new Set(prev);
                      next.delete(selected.id);
                      return next;
                    });
                  }}
                  isStopped={allAnimStopped || stoppedAnimIds.has(selected.id)}
                  onWireTrap={wireTrapToButton}
                  onOpenPlayerStudio={openPlayerStudio}
                />
              )}

              {/* Interaction: anim / damage / push on props, traps, doors, hammer solids */}
              {(isHammerSolidEntity(selected) ||
                selected.kind === 'prop' ||
                selected.kind === 'trap' ||
                selected.kind === 'door' ||
                selected.kind === 'hazard') && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-white/50 uppercase">
                    Interaction
                  </p>
                  {(() => {
                    const ix = ensureInteract(selected);
                    return (
                      <>
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={!!ix.playAnimationOnTouch || selected.animation?.trigger === 'collide'}
                            onChange={(e) => {
                              const on = e.target.checked;
                              patchSelected({
                                interact: { ...ix, playAnimationOnTouch: on },
                                animation: {
                                  ...ensureAnimation(selected),
                                  trigger: on ? 'collide' : selected.animation?.trigger === 'collide' ? 'none' : selected.animation?.trigger ?? 'none',
                                },
                              });
                            }}
                          />
                          Play animation on touch
                        </label>
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={!!ix.damageOnTouch || !!selected.hazard?.enabled}
                            onChange={(e) => {
                              const on = e.target.checked;
                              patchSelected({
                                interact: { ...ix, damageOnTouch: on },
                                hazard: { ...ensureHazard(selected), enabled: on },
                                kind: on && selected.kind === 'prop' ? 'hazard' : selected.kind,
                              });
                            }}
                          />
                          Damages player on touch
                        </label>
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={!!ix.pushPlayer || !!selected.surface?.conveyor}
                            onChange={(e) => {
                              const on = e.target.checked;
                              patchSelected({
                                interact: {
                                  ...ix,
                                  pushPlayer: on,
                                  pushStrength: ix.pushStrength ?? 8,
                                },
                                surface: {
                                  ...ensureSurface(selected),
                                  conveyor: on,
                                  conveyorSpeed: ix.pushStrength ?? 8,
                                },
                                solid: on ? true : selected.solid,
                              });
                            }}
                          />
                          Push player on touch
                        </label>
                        {(ix.pushPlayer || selected.surface?.conveyor) && (
                          <label className="block text-xs text-white/60">
                            Push strength ({ix.pushStrength ?? selected.surface?.conveyorSpeed ?? 8})
                            <input
                              type="range"
                              min={1}
                              max={24}
                              className="w-full"
                              value={ix.pushStrength ?? selected.surface?.conveyorSpeed ?? 8}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                patchSelected({
                                  interact: { ...ix, pushStrength: v, pushPlayer: true },
                                  surface: {
                                    ...ensureSurface(selected),
                                    conveyor: true,
                                    conveyorSpeed: v,
                                  },
                                });
                              }}
                            />
                          </label>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Gameplay: material / jump pad / damage — hammer solids + props / pads */}
              {entityShowsGameplayMaterial(selected) && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-white/50 uppercase">
                    Gameplay
                  </p>
                  {selected.kind === 'finish' && (
                    <p className="text-[10px] text-amber-200/80">
                      Runners finish when they step on or touch this volume.
                    </p>
                  )}
                  <label className="block text-xs text-white/60">
                    Material
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white"
                      value={resolveCollideMaterial(selected)}
                      onChange={(e) => {
                        const material = e.target.value as EntityCollideMaterial;
                        const target = selected;
                        patchSelected({
                          ...patchCollideMaterial(target, material),
                          ...(material === 'walkthrough'
                            ? { jumpPad: { ...ensureJumpPad(target), enabled: false } }
                            : {}),
                        });
                        // Picking Solid on a catalog prop used to leave collision as one
                        // box spanning the model's full bounding box — including any
                        // opening/hollow (a doorway's hole, an arch) — so the "Solid"
                        // dropdown alone couldn't make a doorway actually match its
                        // visible shape; that required a separate manual "Bake mesh
                        // collision" click most users never found. Auto-bake right away
                        // so every prefab's Solid collision matches its real mesh shape
                        // by default, with no extra step.
                        if (
                          material === 'solid' &&
                          !isHammerSolidEntity(target) &&
                          (target.model || target.customModelUrl) &&
                          !target.meshCollisionPads?.length
                        ) {
                          void apiRef.current?.bakeMeshCollision(target.id);
                        }
                      }}
                    >
                      <option value="solid">Solid — collide / stand on mesh</option>
                      <option value="water">Water — walk / swim when deep</option>
                      <option value="sand">Sand — slow walk</option>
                      <option value="ice">Ice — slippery</option>
                      <option value="walkthrough">Walkthrough — no collision</option>
                    </select>
                  </label>
                  <p className="text-[10px] text-white/40">
                    Solid scans the model size (stairs become climbable steps). Water / sand /
                    ice change how you move on top. Walkthrough disables collision.
                  </p>

                  {!isHammerSolidEntity(selected) &&
                    resolveCollideMaterial(selected) === 'solid' &&
                    (selected.model || selected.customModelUrl) && (
                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-200">
                          Mesh collision
                        </p>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          Solid props default to one box matching the model&apos;s bounding
                          box — wrong for anything with an opening or hollow (an arch, a
                          curved wall segment). Bake fits collision to the real mesh shape
                          instead, so openings stay walkable.
                          {selected.meshCollisionPads?.length
                            ? ` Currently baked: ${selected.meshCollisionPads.length} box${
                                selected.meshCollisionPads.length === 1 ? '' : 'es'
                              }.`
                            : ''}
                          {selected.meshCollisionPads &&
                          selected.meshCollisionPads.length >= MAX_MESH_COLLISION_PADS
                            ? ` At the ${MAX_MESH_COLLISION_PADS}-box cap — leftover volume is merged/dropped, so thin openings can fill in. Simplify the mesh or split the prop.`
                            : ''}
                        </p>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            disabled={bakingMeshId === selected.id}
                            onClick={async () => {
                              setBakingMeshId(selected.id);
                              let result;
                              try {
                                result = await apiRef.current?.bakeMeshCollision(selected.id);
                              } catch (err) {
                                result = {
                                  ok: false as const,
                                  error: err instanceof Error ? err.message : String(err),
                                };
                              }
                              setBakingMeshId(null);
                              if (!result) {
                                toast({
                                  title: 'Bake failed',
                                  description: 'Editor viewport is not ready yet — try again in a moment.',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              // eslint-disable-next-line no-console
                              console.log('[bake-mesh-collision] result:', result);
                              if (result.ok) {
                                toast({
                                  title: 'Mesh collision baked',
                                  description: `Fit to ${result.boxCount} box${
                                    result.boxCount === 1 ? '' : 'es'
                                  } from the real mesh shape.`,
                                });
                              } else {
                                toast({
                                  title: 'Bake failed',
                                  description: result.error,
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            {bakingMeshId === selected.id
                              ? 'Baking…'
                              : selected.meshCollisionPads?.length
                                ? 'Re-bake mesh collision'
                                : 'Bake mesh collision'}
                          </Button>
                          {!!selected.meshCollisionPads?.length && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => apiRef.current?.clearMeshCollision(selected.id)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                  {isHammerSolidEntity(selected) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">
                        Solid size
                      </p>
                      <p className="text-[10px] text-white/55">
                        Or use Scale (R) in the viewport. Enable Scale one side below so only the
                        pulled face grows. Collision matches these dimensions.
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {(['W', 'H', 'D'] as const).map((axis, i) => {
                          const sizeFallback = defaultSizeForHammer(
                            (selected.primitive as HammerPrimitive) || 'box'
                          );
                          return (
                          <label key={axis} className="text-[9px] text-white/50">
                            {axis}
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              className="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                              value={Number(
                                (selected.collisionSize?.[i] ?? sizeFallback[i]).toFixed(2)
                              )}
                              onChange={(e) => {
                                const next: [number, number, number] = [
                                  ...(selected.collisionSize ?? sizeFallback),
                                ] as [number, number, number];
                                next[i] = Math.max(0.1, Number(e.target.value) || 0.1);
                                const shape = (selected.primitive as HammerPrimitive) || 'box';
                                patchSelected({
                                  collisionSize: next,
                                  scale: [1, 1, 1],
                                  meshCollisionPads: hollowHammerCollisionPads(shape, next),
                                });
                              }}
                            />
                          </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={ensureJumpPad(selected).enabled}
                      onChange={(e) => {
                        const jp = ensureJumpPad(selected);
                        patchSelected({
                          jumpPad: { ...jp, enabled: e.target.checked },
                          ...(e.target.checked
                            ? patchCollideMaterial(selected, 'solid')
                            : {}),
                        });
                      }}
                    />
                    <Rocket className="w-3.5 h-3.5 text-sky-300" />
                    Jump pad
                  </label>
                  {ensureJumpPad(selected).enabled && (
                    <label className="block text-xs text-white/60">
                      Boost ({ensureJumpPad(selected).boost})
                      <input
                        type="range"
                        min={6}
                        max={28}
                        step={1}
                        className="w-full"
                        value={ensureJumpPad(selected).boost}
                        onChange={(e) =>
                          patchSelected({
                            jumpPad: {
                              enabled: true,
                              boost: Number(e.target.value),
                            },
                            ...patchCollideMaterial(selected, 'solid'),
                          })
                        }
                      />
                    </label>
                  )}

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={!!ensureSurface(selected).conveyor}
                      onChange={(e) =>
                        patchSelected({
                          surface: { ...ensureSurface(selected), conveyor: e.target.checked },
                          ...(e.target.checked
                            ? patchCollideMaterial(selected, 'solid')
                            : {}),
                        })
                      }
                    />
                    Conveyor (push along facing)
                  </label>
                  {ensureSurface(selected).conveyor && (
                    <label className="block text-xs text-white/60">
                      Conveyor speed ({ensureSurface(selected).conveyorSpeed ?? 4})
                      <input
                        type="range"
                        min={1}
                        max={12}
                        step={0.5}
                        className="w-full"
                        value={ensureSurface(selected).conveyorSpeed ?? 4}
                        onChange={(e) =>
                          patchSelected({
                            surface: {
                              ...ensureSurface(selected),
                              conveyor: true,
                              conveyorSpeed: Number(e.target.value),
                            },
                            ...patchCollideMaterial(selected, 'solid'),
                          })
                        }
                      />
                    </label>
                  )}

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={ensurePlatformMotion(selected).enabled}
                      onChange={(e) => {
                        const m = ensurePlatformMotion(selected);
                        patchSelected({
                          motion: { ...m, enabled: e.target.checked },
                          ...(e.target.checked
                            ? patchCollideMaterial(selected, 'solid')
                            : {}),
                        });
                      }}
                    />
                    Moving platform (ping-pong)
                  </label>
                  {ensurePlatformMotion(selected).enabled && (
                    <div className="space-y-2 pl-1 border-l border-sky-500/30 ml-1">
                      <p className="text-[10px] text-white/45 leading-snug">
                        Oscillates between rest pose and rest + offset (Y up). Players ride it.
                        Offset is in world units — same scale as Position/Scale in Properties. All
                        three at 0 means it won&apos;t move at all.
                      </p>
                      {([0, 1, 2] as const).map((i) => (
                        <label key={i} className="block text-[10px] text-white/55">
                          Offset {['X', 'Y', 'Z'][i]} (
                          {ensurePlatformMotion(selected).offset[i].toFixed(1)}u)
                          <input
                            type="range"
                            min={-12}
                            max={12}
                            step={0.5}
                            className="w-full"
                            value={ensurePlatformMotion(selected).offset[i]}
                            onChange={(e) => {
                              const m = ensurePlatformMotion(selected);
                              const offset: [number, number, number] = [...m.offset];
                              offset[i] = Number(e.target.value);
                              patchSelected({ motion: { ...m, offset } });
                            }}
                          />
                        </label>
                      ))}
                      <label className="block text-[10px] text-white/55">
                        Period ({(ensurePlatformMotion(selected).periodMs / 1000).toFixed(1)}s)
                        <input
                          type="range"
                          min={1000}
                          max={12000}
                          step={250}
                          className="w-full"
                          value={ensurePlatformMotion(selected).periodMs}
                          onChange={(e) =>
                            patchSelected({
                              motion: {
                                ...ensurePlatformMotion(selected),
                                periodMs: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="block text-[10px] text-white/55">
                        Phase ({ensurePlatformMotion(selected).phaseMs}ms)
                        <input
                          type="range"
                          min={0}
                          max={8000}
                          step={100}
                          className="w-full"
                          value={ensurePlatformMotion(selected).phaseMs}
                          onChange={(e) =>
                            patchSelected({
                              motion: {
                                ...ensurePlatformMotion(selected),
                                phaseMs: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={!!ensureTeleport(selected).enabled}
                      onChange={(e) =>
                        patchSelected({
                          teleport: { ...ensureTeleport(selected), enabled: e.target.checked },
                        })
                      }
                    />
                    Teleporter
                  </label>
                  {ensureTeleport(selected).enabled && (
                    <>
                    <label className="block text-xs text-white/60">
                      Target entity
                      <select
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                        value={ensureTeleport(selected).targetEntityId ?? ''}
                        onChange={(e) =>
                          patchSelected({
                            teleport: {
                              ...ensureTeleport(selected),
                              enabled: true,
                              targetEntityId: e.target.value || undefined,
                            },
                          })
                        }
                      >
                        <option value="">— pick exit —</option>
                        {doc.entities
                          .filter((e) => e.id !== selected.id)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} ({e.kind})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block text-xs text-white/60">
                      Cooldown ({ensureTeleport(selected).cooldownMs ?? 800}ms)
                      <input
                        type="range"
                        min={200}
                        max={5000}
                        step={50}
                        className="w-full"
                        value={ensureTeleport(selected).cooldownMs ?? 800}
                        onChange={(e) =>
                          patchSelected({
                            teleport: {
                              ...ensureTeleport(selected),
                              enabled: true,
                              cooldownMs: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    </>
                  )}
                </div>
              )}

              {selected.kind === 'spawn_monster' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-rose-300/80 uppercase">
                    Enemy Editor
                  </p>
                  <label className="block text-xs text-white/60">
                    Display name
                    <input
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).displayName ?? ''}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            displayName: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Type
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).monsterType}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            monsterType: e.target.value as
                              | 'basic'
                              | 'fast'
                              | 'brute'
                              | 'boss'
                              | 'custom',
                          },
                        })
                      }
                    >
                      <option value="basic">Basic</option>
                      <option value="fast">Fast</option>
                      <option value="brute">Brute</option>
                      <option value="boss">Boss</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/60">
                    Level
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).level ?? 1}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            level: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['hp', 'HP (0=default)'],
                      ['damage', 'Dmg (0=default)'],
                      ['speed', 'Speed'],
                      ['radius', 'Radius'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="block text-[10px] text-white/55">
                        {label}
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                          value={ensureMonsterSpawn(selected)[key] ?? 0}
                          onChange={(e) =>
                            patchSelected({
                              monsterSpawn: {
                                ...ensureMonsterSpawn(selected),
                                [key]: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs text-white/60">
                    Model upload URL
                    <input
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px]"
                      placeholder="/uploads/… or https://"
                      value={
                        ensureMonsterSpawn(selected).modelUrl ?? selected.customModelUrl ?? ''
                      }
                      onChange={(e) =>
                        patchSelected({
                          customModelUrl: e.target.value || undefined,
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            modelUrl: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Wave min
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).waveMin}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            waveMin: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Wave max (0 = ∞)
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).waveMax}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            waveMax: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Count / wave
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).countPerWave}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            countPerWave: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Spawn interval (sec)
                    <input
                      type="number"
                      min={0.2}
                      step={0.1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureMonsterSpawn(selected).spawnIntervalSec}
                      onChange={(e) =>
                        patchSelected({
                          monsterSpawn: {
                            ...ensureMonsterSpawn(selected),
                            spawnIntervalSec: Math.max(0.2, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'red_zone' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-red-300/80 uppercase">Red zone</p>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={ensureRedZone(selected).instantKill}
                      onChange={(e) =>
                        patchSelected({
                          redZone: { ...ensureRedZone(selected), instantKill: e.target.checked },
                        })
                      }
                    />
                    Instant kill
                  </label>
                  <label className="block text-xs text-white/60">
                    Damage / tick
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureRedZone(selected).damagePerTick}
                      onChange={(e) =>
                        patchSelected({
                          redZone: {
                            ...ensureRedZone(selected),
                            damagePerTick: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Interval (ms)
                    <input
                      type="number"
                      min={100}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureRedZone(selected).intervalMs}
                      onChange={(e) =>
                        patchSelected({
                          redZone: {
                            ...ensureRedZone(selected),
                            intervalMs: Math.max(100, Number(e.target.value) || 500),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'health_floor' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-emerald-300/80 uppercase">
                    Health floor
                  </p>
                  <label className="block text-xs text-white/60">
                    Heal / tick
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureHealthFloor(selected).healPerTick}
                      onChange={(e) =>
                        patchSelected({
                          healthFloor: {
                            ...ensureHealthFloor(selected),
                            healPerTick: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Interval (ms)
                    <input
                      type="number"
                      min={100}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureHealthFloor(selected).intervalMs}
                      onChange={(e) =>
                        patchSelected({
                          healthFloor: {
                            ...ensureHealthFloor(selected),
                            intervalMs: Math.max(100, Number(e.target.value) || 500),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Max heal % (100 = full)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureHealthFloor(selected).maxHealPercent}
                      onChange={(e) =>
                        patchSelected({
                          healthFloor: {
                            ...ensureHealthFloor(selected),
                            maxHealPercent: Math.min(
                              100,
                              Math.max(1, Number(e.target.value) || 100)
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'revive_pad' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-sky-300/80 uppercase">
                    Revive pad
                  </p>
                  <label className="block text-xs text-white/60">
                    Revive time (ms)
                    <input
                      type="number"
                      min={500}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureRevive(selected).reviveTimeMs}
                      onChange={(e) =>
                        patchSelected({
                          revive: {
                            ...ensureRevive(selected),
                            reviveTimeMs: Math.max(500, Number(e.target.value) || 4000),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Capacity
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureRevive(selected).capacity}
                      onChange={(e) =>
                        patchSelected({
                          revive: {
                            ...ensureRevive(selected),
                            capacity: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'wave_anchor' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-amber-300/80 uppercase">
                    Wave anchor
                  </p>
                  <label className="block text-xs text-white/60">
                    Wave number
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureWaveAnchor(selected).waveNumber}
                      onChange={(e) =>
                        patchSelected({
                          waveAnchor: {
                            ...ensureWaveAnchor(selected),
                            waveNumber: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Difficulty ×
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureWaveAnchor(selected).difficultyMultiplier}
                      onChange={(e) =>
                        patchSelected({
                          waveAnchor: {
                            ...ensureWaveAnchor(selected),
                            difficultyMultiplier: Math.max(0.1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Label
                    <input
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureWaveAnchor(selected).label ?? ''}
                      onChange={(e) =>
                        patchSelected({
                          waveAnchor: {
                            ...ensureWaveAnchor(selected),
                            label: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'light' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-white/50 uppercase flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-200" /> Light
                  </p>
                  <label className="block text-xs text-white/60">
                    Type
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white"
                      value={ensureLight(selected).type ?? 'point'}
                      onChange={(e) =>
                        patchSelected({
                          light: {
                            ...ensureLight(selected),
                            type: e.target.value as EntityLightType,
                          },
                        })
                      }
                    >
                      <option value="point">Point</option>
                      <option value="spot">Spotlight</option>
                      <option value="flashlight">Flashlight</option>
                      <option value="beam">Beam light</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/60">
                    Color
                    <input
                      type="color"
                      className="mt-0.5 w-full h-8 bg-transparent"
                      value={ensureLight(selected).color}
                      onChange={(e) =>
                        patchSelected({
                          color: e.target.value,
                          light: { ...ensureLight(selected), color: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Intensity ({ensureLight(selected).intensity.toFixed(1)})
                    <input
                      type="range"
                      min={0.1}
                      max={5}
                      step={0.1}
                      className="w-full"
                      value={ensureLight(selected).intensity}
                      onChange={(e) =>
                        patchSelected({
                          light: {
                            ...ensureLight(selected),
                            intensity: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Distance ({ensureLight(selected).distance})
                    <input
                      type="range"
                      min={2}
                      max={60}
                      step={1}
                      className="w-full"
                      value={ensureLight(selected).distance}
                      onChange={(e) =>
                        patchSelected({
                          light: {
                            ...ensureLight(selected),
                            distance: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={!!ensureLight(selected).showFixture}
                      onChange={(e) =>
                        patchSelected({
                          light: {
                            ...ensureLight(selected),
                            showFixture: e.target.checked,
                          },
                        })
                      }
                    />
                    Show lamp fixture in game (off = invisible light source, only the editor shows a marker)
                  </label>
                  {(ensureLight(selected).type === 'spot' ||
                    ensureLight(selected).type === 'flashlight' ||
                    ensureLight(selected).type === 'beam') && (
                    <>
                      <label className="block text-xs text-white/60">
                        Cone angle ({ensureLight(selected).angleDeg ?? 40}°)
                        <input
                          type="range"
                          min={5}
                          max={90}
                          step={1}
                          className="w-full"
                          value={ensureLight(selected).angleDeg ?? 40}
                          onChange={(e) =>
                            patchSelected({
                              light: {
                                ...ensureLight(selected),
                                angleDeg: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/60">
                        Penumbra ({(ensureLight(selected).penumbra ?? 0.35).toFixed(2)})
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          className="w-full"
                          value={ensureLight(selected).penumbra ?? 0.35}
                          onChange={(e) =>
                            patchSelected({
                              light: {
                                ...ensureLight(selected),
                                penumbra: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/60">
                        Pitch ({ensureLight(selected).pitchDeg ?? -12}°)
                        <input
                          type="range"
                          min={-80}
                          max={40}
                          step={1}
                          className="w-full"
                          value={ensureLight(selected).pitchDeg ?? -12}
                          onChange={(e) =>
                            patchSelected({
                              light: {
                                ...ensureLight(selected),
                                pitchDeg: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-white/60">
                        Beam length ({ensureLight(selected).beamLength ?? ensureLight(selected).distance})
                        <input
                          type="range"
                          min={2}
                          max={80}
                          step={1}
                          className="w-full"
                          value={
                            ensureLight(selected).beamLength ?? ensureLight(selected).distance
                          }
                          onChange={(e) =>
                            patchSelected({
                              light: {
                                ...ensureLight(selected),
                                beamLength: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={!!ensureLight(selected).castShadow}
                      onChange={(e) =>
                        patchSelected({
                          light: {
                            ...ensureLight(selected),
                            castShadow: e.target.checked,
                          },
                        })
                      }
                    />
                    Cast shadow
                  </label>
                  <p className="text-[10px] text-white/40">
                    Lights are visual in editor + match overlay (client-side).
                  </p>
                </div>
              )}

              {selected.kind === 'spinner' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-orange-300/80 uppercase">
                    Rotating material
                  </p>
                  <label className="block text-xs text-white/60">
                    Shape
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureSpinHazard(selected).shape}
                      onChange={(e) =>
                        patchSelected({
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            shape: e.target.value as
                              | 'blade'
                              | 'bar'
                              | 'disc'
                              | 'cross'
                              | 'box',
                          },
                        })
                      }
                    >
                      <option value="blade">Blade</option>
                      <option value="bar">Bar</option>
                      <option value="disc">Disc</option>
                      <option value="cross">Cross</option>
                      <option value="box">Box</option>
                    </select>
                  </label>
                  <label className="block text-xs text-white/60">
                    Speed ({ensureSpinHazard(selected).speed.toFixed(2)} rps)
                    <input
                      type="range"
                      min={0.05}
                      max={4}
                      step={0.05}
                      className="w-full"
                      value={ensureSpinHazard(selected).speed}
                      onChange={(e) =>
                        patchSelected({
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            speed: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Axis
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureSpinHazard(selected).axis}
                      onChange={(e) =>
                        patchSelected({
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            axis: e.target.value as 'x' | 'y' | 'z',
                          },
                        })
                      }
                    >
                      <option value="y">Y (yaw)</option>
                      <option value="x">X</option>
                      <option value="z">Z</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['W', 'H', 'D'] as const).map((axis, i) => (
                      <label key={axis} className="text-[9px] text-white/50">
                        {axis}
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          className="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                          value={Number(ensureSpinHazard(selected).size[i].toFixed(2))}
                          onChange={(e) => {
                            const size: [number, number, number] = [
                              ...ensureSpinHazard(selected).size,
                            ] as [number, number, number];
                            size[i] = Math.max(0.1, Number(e.target.value) || 0.1);
                            patchSelected({
                              spinHazard: { ...ensureSpinHazard(selected), size },
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs text-white/60">
                    Texture / model URL
                    <input
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px]"
                      value={
                        ensureSpinHazard(selected).modelUrl ||
                        ensureSpinHazard(selected).textureUrl ||
                        selected.customModelUrl ||
                        selected.textureUrl ||
                        ''
                      }
                      onChange={(e) => {
                        const v = e.target.value || undefined;
                        const looksModel = !!v && /\.(glb|gltf)(\?|$)/i.test(v);
                        patchSelected({
                          customModelUrl: looksModel ? v : selected.customModelUrl,
                          textureUrl: !looksModel ? v : selected.textureUrl,
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            modelUrl: looksModel ? v : undefined,
                            textureUrl: !looksModel ? v : undefined,
                          },
                        });
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={ensureSpinHazard(selected).damageOnTouch}
                      onChange={(e) =>
                        patchSelected({
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            damageOnTouch: e.target.checked,
                            enabled: true,
                          },
                          hazard: {
                            ...ensureHazard(selected),
                            enabled: e.target.checked,
                            damage: ensureSpinHazard(selected).damage,
                          },
                        })
                      }
                    />
                    Causes damage
                  </label>
                  <label className="block text-xs text-white/60">
                    Damage amount
                    <input
                      type="number"
                      min={1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensureSpinHazard(selected).damage}
                      onChange={(e) =>
                        patchSelected({
                          spinHazard: {
                            ...ensureSpinHazard(selected),
                            damage: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'push_rail' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-sky-300/80 uppercase">
                    Push rail
                  </p>
                  <p className="text-[10px] text-white/50">
                    Team A end is −length/2 along yaw; Team B is +length/2. Rotate the rail to aim
                    between spawns.
                  </p>
                  <label className="block text-xs text-white/60">
                    Length
                    <input
                      type="number"
                      min={4}
                      step={0.5}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushRail(selected).length}
                      onChange={(e) =>
                        patchSelected({
                          pushRail: {
                            ...ensurePushRail(selected),
                            length: Math.max(4, Number(e.target.value) || 4),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Width
                    <input
                      type="number"
                      min={1}
                      step={0.1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushRail(selected).width}
                      onChange={(e) =>
                        patchSelected({
                          pushRail: {
                            ...ensurePushRail(selected),
                            width: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Start T (0=A … 1=B)
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushRail(selected).startT}
                      onChange={(e) =>
                        patchSelected({
                          pushRail: {
                            ...ensurePushRail(selected),
                            startT: Math.min(1, Math.max(0, Number(e.target.value) || 0.5)),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selected.kind === 'push_block' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-amber-300/80 uppercase">
                    Push block
                  </p>
                  <label className="block text-xs text-white/60">
                    Linked rail
                    <select
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushBlock(selected).railEntityId ?? ''}
                      onChange={(e) =>
                        patchSelected({
                          pushBlock: {
                            ...ensurePushBlock(selected),
                            railEntityId: e.target.value || undefined,
                          },
                        })
                      }
                    >
                      <option value="">— nearest rail —</option>
                      {doc.entities
                        .filter((e) => e.kind === 'push_rail')
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-xs text-white/60">
                    Push strength
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushBlock(selected).pushStrength}
                      onChange={(e) =>
                        patchSelected({
                          pushBlock: {
                            ...ensurePushBlock(selected),
                            pushStrength: Math.max(0.5, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Push radius
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                      value={ensurePushBlock(selected).pushRadius}
                      onChange={(e) =>
                        patchSelected({
                          pushBlock: {
                            ...ensurePushBlock(selected),
                            pushRadius: Math.max(0.5, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    Model URL (optional)
                    <input
                      className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px]"
                      value={
                        ensurePushBlock(selected).modelUrl ?? selected.customModelUrl ?? ''
                      }
                      onChange={(e) =>
                        patchSelected({
                          customModelUrl: e.target.value || undefined,
                          pushBlock: {
                            ...ensurePushBlock(selected),
                            modelUrl: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {/* Death / trap damage — not for spawn markers, lights, player */}
              {!isInvisibleMarkerKind(selected.kind) &&
                !isPlatformPlayerKind(selected.kind) &&
                selected.kind !== 'light' &&
                selected.kind !== 'start' &&
                selected.kind !== 'finish' &&
                selected.kind !== 'spawn_runner' &&
                selected.kind !== 'spawn_trapper' &&
                selected.kind !== 'jump_pad' &&
                selected.kind !== 'button' &&
                selected.kind !== 'revive_pad' &&
                selected.kind !== 'health_floor' && (
              <div className="space-y-2 border-t border-white/10 pt-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">
                  {selected.kind === 'trap' ? 'Trap / timed hazard' : 'Death zone'}
                </p>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={
                      ensureHazard(selected).enabled ||
                      selected.kind === 'hazard' ||
                      selected.kind === 'trap'
                    }
                    onChange={(e) => {
                      const hz = ensureHazard(selected);
                      patchSelected({
                        kind:
                          e.target.checked && selected.kind === 'prop' ? 'hazard' : selected.kind,
                        hazard: { ...hz, enabled: e.target.checked },
                      });
                    }}
                  />
                  Damages player on touch
                </label>
                {(ensureHazard(selected).enabled ||
                  selected.kind === 'hazard' ||
                  selected.kind === 'trap') && (
                  <>
                    <label className="block text-xs text-white/60">
                      Mode
                      <select
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                        value={
                          ensureHazard(selected).mode ??
                          (selected.kind === 'trap' ? 'timed' : 'always')
                        }
                        onChange={(e) =>
                          patchSelected({
                            hazard: {
                              ...ensureHazard(selected),
                              enabled: true,
                              mode: e.target.value as 'always' | 'timed' | 'button',
                            },
                          })
                        }
                      >
                        <option value="always">Always on</option>
                        <option value="timed">Timed pulse (auto)</option>
                        <option value="button">Button-armed (starts off)</option>
                      </select>
                    </label>
                    {ensureHazard(selected).mode === 'button' && (
                      <p className="text-[10px] text-amber-200/80 leading-snug">
                        Damage stays off until a Button targets this trap: select a Button, set its
                        &ldquo;Activates trap / door&rdquo; to this object. Pressing E on that button arms this
                        trap for damage (and plays its Active clip if one is set).
                      </p>
                    )}
                    <label className="block text-xs text-white/60">
                      Obstacle style
                      <select
                        className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                        value={ensureHazard(selected).obstacleKind ?? 'damage'}
                        onChange={(e) =>
                          patchSelected({
                            hazard: {
                              ...ensureHazard(selected),
                              enabled: true,
                              obstacleKind: e.target.value as
                                | 'spike'
                                | 'saw'
                                | 'laser'
                                | 'crusher'
                                | 'damage',
                            },
                          })
                        }
                      >
                        <option value="damage">Damage volume</option>
                        <option value="spike">Spike</option>
                        <option value="saw">Saw</option>
                        <option value="laser">Laser</option>
                        <option value="crusher">Crusher</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={ensureHazard(selected).instantKill}
                        onChange={(e) =>
                          patchSelected({
                            hazard: {
                              ...ensureHazard(selected),
                              instantKill: e.target.checked,
                              enabled: true,
                            },
                          })
                        }
                      />
                      Instant kill
                    </label>
                    {!ensureHazard(selected).instantKill && (
                      <label className="block text-xs text-white/60">
                        Damage ({ensureHazard(selected).damage})
                        <input
                          type="range"
                          min={1}
                          max={100}
                          className="w-full"
                          value={ensureHazard(selected).damage}
                          onChange={(e) =>
                            patchSelected({
                              hazard: {
                                ...ensureHazard(selected),
                                damage: Number(e.target.value),
                                enabled: true,
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <label className="block text-xs text-white/60">
                      {(ensureHazard(selected).mode ?? 'always') === 'always'
                        ? `Tick cooldown ms (${ensureHazard(selected).intervalMs})`
                        : `Off time ms (${ensureHazard(selected).intervalMs})`}
                      <input
                        type="range"
                        min={100}
                        max={5000}
                        step={50}
                        className="w-full"
                        value={ensureHazard(selected).intervalMs}
                        onChange={(e) =>
                          patchSelected({
                            hazard: {
                              ...ensureHazard(selected),
                              intervalMs: Number(e.target.value),
                              enabled: true,
                            },
                          })
                        }
                      />
                    </label>
                    {(ensureHazard(selected).mode === 'timed' ||
                      ensureHazard(selected).mode === 'button' ||
                      (selected.kind === 'trap' && !ensureHazard(selected).mode)) && (
                      <label className="block text-xs text-white/60">
                        Active / on time ms ({ensureHazard(selected).activeMs ?? 900})
                        <input
                          type="range"
                          min={200}
                          max={5000}
                          step={50}
                          className="w-full"
                          value={ensureHazard(selected).activeMs ?? 900}
                          onChange={(e) =>
                            patchSelected({
                              hazard: {
                                ...ensureHazard(selected),
                                activeMs: Number(e.target.value),
                                enabled: true,
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-white/40">
                      Timed = auto pulse. Button = wire Button → Activates this trap, press E in match.
                    </p>
                  </>
                )}
              </div>
              )}

              <div className="grid grid-cols-3 gap-1 border-t border-white/10 pt-2">
                <label className="col-span-3 flex items-start gap-2 rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/75">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={scaleFromSide}
                    onChange={(e) => setScaleFromSide(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-white/90">Scale one side</span>
                    <span className="mt-0.5 block text-[10px] text-white/45">
                      Pull a Scale (R) handle — only that side grows. Opposite face stays put.
                      Off = expand both ways from center.
                    </span>
                  </span>
                </label>
                {(['position', 'rotation', 'scale'] as const).map((key) => (
                  <div key={key} className="col-span-3">
                    <p className="text-[10px] text-white/50 uppercase mb-0.5">{key}</p>
                    <div className="grid grid-cols-3 gap-1">
                      {([0, 1, 2] as const).map((i) => (
                        <input
                          key={i}
                          type="number"
                          step={key === 'rotation' ? 5 : 0.1}
                          className="bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                          value={Number(selected[key][i].toFixed(2))}
                          onChange={(e) => {
                            const next = [...selected[key]] as [number, number, number];
                            next[i] = Number(e.target.value);
                            patchSelected({ [key]: next });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!isInvisibleMarkerKind(selected.kind) &&
                !isPlatformPlayerKind(selected.kind) && (
              <label className="block text-xs text-white/60">
                <EditorTip content="Mesh fade in the editor and in play. 0 is invisible. Reset restores the model's original material opacity.">
                  <span className="cursor-help">Opacity</span>
                </EditorTip>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    className="w-full"
                    value={selected.opacity ?? 1}
                    onChange={(e) => patchSelected({ opacity: Number(e.target.value) })}
                  />
                  {selected.opacity != null && selected.opacity < 0.999 ? (
                    <button
                      type="button"
                      className="shrink-0 text-[10px] uppercase tracking-wide text-white/50 hover:text-white px-1.5 py-1 rounded border border-white/10"
                      onClick={() => patchSelected({ opacity: undefined })}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </label>
              )}
              <label className="block text-xs text-white/60">
                <EditorTip content="Tints the mesh. Works with Glow — each change replaces the tint instead of stacking darker. Reset restores the original model color.">
                  <span className="cursor-help">Color</span>
                </EditorTip>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <input
                    type="color"
                    className="flex-1 h-8 bg-transparent"
                    value={selected.color ?? '#ffffff'}
                    onChange={(e) => patchSelected({ color: e.target.value })}
                  />
                  {selected.color ? (
                    <button
                      type="button"
                      className="shrink-0 text-[10px] uppercase tracking-wide text-white/50 hover:text-white px-1.5 py-1 rounded border border-white/10"
                      onClick={() => patchSelected({ color: undefined })}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </label>
              {/* ── Glow / Emissive Effects ───────────────────────────── */}
              {!isInvisibleMarkerKind(selected.kind) &&
                !isPlatformPlayerKind(selected.kind) &&
                selected.kind !== 'light' && (() => {
                  const glow = ensureEntityGlow(selected);
                  const isGlowOn = selected.glow?.enabled === true;
                  const GLOW_PRESETS = [
                    { label: 'Cyan', color: '#00f0ff' },
                    { label: 'Pink', color: '#ff007f' },
                    { label: 'Green', color: '#00ff66' },
                    { label: 'Gold', color: '#ffaa00' },
                    { label: 'Purple', color: '#b026ff' },
                    { label: 'White', color: '#ffffff' },
                    { label: 'Red', color: '#ff2244' },
                    { label: 'Blue', color: '#3b82f6' },
                  ];
                  return (
                    <div className="rounded-xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/20 to-black/40 p-3 space-y-3 shadow-lg backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className={`w-4 h-4 transition-colors ${isGlowOn ? 'text-cyan-400 animate-pulse' : 'text-white/40'}`} />
                          <EditorTip content="Self-lit surface plus optional bloom and a point light. Turn off to restore the base Color. Does not stack darker when you re-pick a color.">
                            <span className="text-xs font-semibold text-white/90 cursor-help">Glow & Emissive</span>
                          </EditorTip>
                        </div>
                        <button
                          type="button"
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                            isGlowOn
                              ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)]'
                              : 'bg-white/10 text-white/50 hover:bg-white/15'
                          }`}
                          onClick={() => {
                            patchSelected({
                              glow: {
                                ...glow,
                                enabled: !isGlowOn,
                              },
                            });
                          }}
                        >
                          {isGlowOn ? 'Active' : 'Disabled'}
                        </button>
                      </div>

                      {isGlowOn && (
                        <div className="space-y-3 pt-1">
                          {/* Color & Quick Presets */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-white/60">
                              <span>Glow Color</span>
                              <span className="font-mono text-[10px] text-cyan-300">{glow.color}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                                value={glow.color || '#00f0ff'}
                                onChange={(e) =>
                                  patchSelected({
                                    glow: { ...glow, color: e.target.value },
                                  })
                                }
                              />
                              <div className="flex-1 flex flex-wrap gap-1">
                                {GLOW_PRESETS.map((p) => (
                                  <button
                                    key={p.label}
                                    type="button"
                                    title={p.label}
                                    className="w-5 h-5 rounded-full border border-white/20 transition-transform hover:scale-110 active:scale-95 shadow-sm"
                                    style={{ backgroundColor: p.color }}
                                    onClick={() =>
                                      patchSelected({
                                        glow: { ...glow, color: p.color },
                                      })
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Surface brightness vs halo — two sliders, linear mapping */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-white/60">
                              <span>Brightness</span>
                              <span className="font-mono text-cyan-300">{(glow.intensity ?? 1).toFixed(2)}x</span>
                            </div>
                            <input
                              type="range"
                              min={0.1}
                              max={3}
                              step={0.05}
                              className="w-full accent-cyan-400"
                              value={glow.intensity ?? 1}
                              onChange={(e) =>
                                patchSelected({
                                  glow: { ...glow, intensity: Number(e.target.value) },
                                })
                              }
                            />
                            <p className="text-[10px] text-white/35">How bright the object surface is.</p>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-white/60">
                              <span>Glow Intensity</span>
                              <span className="font-mono text-cyan-300">{(glow.bloom ?? 0.35).toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              className="w-full accent-cyan-400"
                              value={glow.bloom ?? 0.35}
                              onChange={(e) =>
                                patchSelected({
                                  glow: { ...glow, bloom: Number(e.target.value) },
                                })
                              }
                            />
                            <p className="text-[10px] text-white/35">Halo around the object. 0 = no bloom.</p>
                          </div>

                          {/* Animation / Pulse Mode */}
                          <div className="space-y-1.5">
                            <label className="block text-[11px] text-white/60">
                              Animation Effect
                              <select
                                className="mt-1 w-full rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs text-white capitalize focus:border-cyan-500 focus:outline-none"
                                value={glow.pulse || 'none'}
                                onChange={(e) =>
                                  patchSelected({
                                    glow: {
                                      ...glow,
                                      pulse: e.target.value as GlowPulseMode,
                                    },
                                  })
                                }
                              >
                                <option value="none">✨ Constant Glow (Static)</option>
                                <option value="breathe">🌊 Smooth Breathe (Sine)</option>
                                <option value="pulse">💓 Heartbeat Pulse</option>
                                <option value="flicker">⚡ Neon Flicker (Electric)</option>
                                <option value="flash">🚨 Warning Flash (Strobe)</option>
                              </select>
                            </label>
                          </div>

                          {/* Pulse Speed */}
                          {glow.pulse && glow.pulse !== 'none' && (
                            <div className="space-y-1 pl-2 border-l-2 border-cyan-500/30">
                              <div className="flex justify-between text-[11px] text-white/60">
                                <span>Pulse Speed</span>
                                <span className="font-mono text-cyan-300">{(glow.pulseSpeed ?? 1.0).toFixed(1)} Hz</span>
                              </div>
                              <input
                                type="range"
                                min={0.2}
                                max={4.0}
                                step={0.1}
                                className="w-full accent-cyan-400"
                                value={glow.pulseSpeed ?? 1.0}
                                onChange={(e) =>
                                  patchSelected({
                                    glow: { ...glow, pulseSpeed: Number(e.target.value) },
                                  })
                                }
                              />
                            </div>
                          )}

                          {/* Cast Surrounding Point Light */}
                          <div className="pt-1 border-t border-white/10 space-y-2">
                            <label className="flex items-center justify-between text-[11px] text-white/70 cursor-pointer">
                              <span>Cast Surrounding Light</span>
                              <span className="text-[10px] text-white/40 font-normal ml-1">
                                (lights the floor / walls)
                              </span>
                              <input
                                type="checkbox"
                                className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0"
                                checked={glow.castLight === true}
                                onChange={(e) =>
                                  patchSelected({
                                    glow: { ...glow, castLight: e.target.checked },
                                  })
                                }
                              />
                            </label>
                            {glow.castLight && (
                              <div className="space-y-2 pl-2 border-l-2 border-cyan-500/30 pt-1">
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-white/50">
                                    <span>Light Radius</span>
                                    <span className="font-mono text-cyan-300">{glow.lightDistance ?? 6}m</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={1}
                                    max={20}
                                    step={0.5}
                                    className="w-full accent-cyan-400"
                                    value={glow.lightDistance ?? 6}
                                    onChange={(e) =>
                                      patchSelected({
                                        glow: { ...glow, lightDistance: Number(e.target.value) },
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-white/50">
                                    <span>Light Brightness</span>
                                    <span className="font-mono text-cyan-300">{(glow.lightIntensity ?? 1.0).toFixed(1)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={0.1}
                                    max={4.0}
                                    step={0.1}
                                    className="w-full accent-cyan-400"
                                    value={glow.lightIntensity ?? 1.0}
                                    onChange={(e) =>
                                      patchSelected({
                                        glow: { ...glow, lightIntensity: Number(e.target.value) },
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              {!isInvisibleMarkerKind(selected.kind) &&
                !isPlatformPlayerKind(selected.kind) &&
                selected.kind !== 'light' && (
              <div className="space-y-1.5">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">Texture</p>
                <input
                  ref={propTexFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    void (async () => {
                      try {
                        const url = await persistEditorImageFile(f, 'misc');
                        saveCustomTexture(f.name, url);
                        setCustomTextures(listCustomTextures());
                        patchSelected({ textureUrl: url });
                        toast({ title: 'Texture applied to object' });
                      } catch (err) {
                        toast({
                          title: 'Texture upload failed',
                          description: err instanceof Error ? err.message : 'Link live game, then try again.',
                          variant: 'destructive',
                        });
                      }
                    })();
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => propTexFileRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  Upload / replace texture
                </Button>
                {selected.textureUrl && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.textureUrl}
                      alt="Object texture"
                      className="w-10 h-10 rounded object-cover border border-white/15"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-xs text-white/70"
                      onClick={() => patchSelected({ textureUrl: undefined })}
                    >
                      Clear texture
                    </Button>
                  </div>
                )}
                {(selected.textureUrl ||
                  paintTextureUrl ||
                  env.defaultTextureUrl) && (
                  <TextureAtlasPicker
                    imageUrl={
                      selected.textureUrl ||
                      paintTextureUrl ||
                      env.defaultTextureUrl ||
                      BUILTIN_TEXTURES[0].url
                    }
                    repeat={selected.textureRepeat}
                    offset={selected.textureOffset}
                    onChange={(uv) =>
                      patchSelected({
                        textureUrl:
                          selected.textureUrl ||
                          paintTextureUrl ||
                          env.defaultTextureUrl ||
                          undefined,
                        textureRepeat: uv.repeat,
                        textureOffset: uv.offset,
                      })
                    }
                  />
                )}
                <label className="block text-[10px] text-white/55">
                  Texture scale — world units / tile (
                  {(selected.textureWorldScale ?? paintWorldScale).toFixed(2)})
                  <input
                    type="range"
                    min={0.25}
                    max={16}
                    step={0.25}
                    className="w-full"
                    value={selected.textureWorldScale ?? paintWorldScale}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      const size = entityWorldSize(selected.collisionSize, selected.scale);
                      const repeat = worldScaleToUvRepeat(size, n);
                      setPaintWorldScale(n);
                      setPaintRepeat(repeat);
                      patchSelected({
                        textureWorldScale: n,
                        textureRepeat: repeat,
                      });
                    }}
                  />
                </label>
                <p className="text-[9px] text-white/40 leading-snug">
                  Shared world scale — looks the same on any block size. Also sets the paint brush
                  default.
                </p>
                <label className="block text-[10px] text-white/55">
                  Texture rotate ({(((selected.textureRotation ?? 0) * 180) / Math.PI).toFixed(0)}°)
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    className="w-full"
                    value={((selected.textureRotation ?? 0) * 180) / Math.PI}
                    onChange={(e) =>
                      patchSelected({
                        textureRotation: (Number(e.target.value) * Math.PI) / 180,
                      })
                    }
                  />
                </label>
                <p className="text-[10px] text-white/40">
                  Drag a region on the atlas above, or use the Textures tab paint brush.
                </p>
              </div>
              )}
              <label className="block text-xs text-white/60">
                Layer
                <select
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                  value={selected.layerId}
                  onChange={(e) => patchSelected({ layerId: e.target.value })}
                >
                  {doc.layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="border-t border-white/10 pt-2 mt-1 sticky bottom-0 bg-black/90 -mx-1 px-1 pb-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full min-h-11 text-sm font-bold"
                  onClick={() => {
                    apiRef.current?.deleteSelected();
                    setPropsOpen(false);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}
          </div>

        </div>
      </div>
      {playTestRolePrompt && (
        <div className="fixed inset-0 z-[10060] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-3">
            <p className="text-sm font-semibold text-slate-100">
              Test as which player?
            </p>
            <p className="text-xs text-slate-400">
              Spawns you at that role&apos;s placed spawn point (falls back to the
              default spawn if none is placed yet).
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {gameMode === 'deathrun' ? (
                <>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={() => {
                      setPlayTestRole('runner');
                      setPlayTestRolePrompt(false);
                      if (playTestPromptTarget === 'live') startPlayLive();
                      else startPlay();
                    }}
                  >
                    Runner
                  </Button>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-500 text-white"
                    onClick={() => {
                      setPlayTestRole('trapper');
                      setPlayTestRolePrompt(false);
                      if (playTestPromptTarget === 'live') startPlayLive();
                      else startPlay();
                    }}
                  >
                    Trapper
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-500 text-white"
                    onClick={() => {
                      setPlayTestRole('team_a');
                      setPlayTestRolePrompt(false);
                      if (playTestPromptTarget === 'live') startPlayLive();
                      else startPlay();
                    }}
                  >
                    Team A
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-500 text-white"
                    onClick={() => {
                      setPlayTestRole('team_b');
                      setPlayTestRolePrompt(false);
                      if (playTestPromptTarget === 'live') startPlayLive();
                      else startPlay();
                    }}
                  >
                    Team B
                  </Button>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-slate-400"
              onClick={() => setPlayTestRolePrompt(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {uploadOpen && (
        <div className="fixed inset-0 z-[10060] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm space-y-3">
            <p className="text-sm font-semibold text-slate-100">Upload prefab model</p>
            <p className="text-xs text-slate-400">
              .glb, .gltf, or .fbx — appears in the catalog for every mapper immediately.
            </p>
            <input
              type="file"
              accept=".glb,.gltf,.fbx,.obj"
              className="w-full text-xs text-white/70 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-white"
              onChange={(e) =>
                setUploadForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
              }
            />
            <input
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
              placeholder="Name (e.g. Wooden Crate)"
              value={uploadForm.name}
              onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
              placeholder="Category (existing or new)"
              list="prefab-category-options"
              value={uploadForm.category}
              onChange={(e) => setUploadForm((f) => ({ ...f, category: e.target.value }))}
            />
            <datalist id="prefab-category-options">
              {libraryCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={uploadBusy || !uploadForm.file || !uploadForm.name.trim() || !uploadForm.category.trim()}
                onClick={async () => {
                  if (!uploadForm.file) return;
                  setUploadBusy(true);
                  try {
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(uploadForm.file!);
                    });
                    await adminUploadPrefabModel({
                      name: uploadForm.name,
                      category: uploadForm.category,
                      modelDataUrl: dataUrl,
                      originalFilename: uploadForm.file.name,
                    });
                    toast({ title: 'Prefab uploaded' });
                    setUploadForm({ name: '', category: '', file: null });
                    setUploadOpen(false);
                    reloadPrefabLibrary();
                  } catch (err) {
                    toast({
                      title: err instanceof Error ? err.message : 'Upload failed',
                      variant: 'destructive',
                    });
                  } finally {
                    setUploadBusy(false);
                  }
                }}
              >
                {uploadBusy ? 'Uploading…' : 'Upload'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400"
                onClick={() => setUploadOpen(false)}
                disabled={uploadBusy}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {playTest && (
        <div className="fixed inset-0 z-[10050]">
          <MapPlayPreview
            doc={apiRef.current?.getDoc() ?? doc}
            mapId={mapId}
            tpsViewOverride={playTpsOverride}
            onClose={exitPlayTest}
            playTestRole={playTestRole}
          />
        </div>
      )}
      {playTestLive && (
        <div className="fixed inset-0 z-[10050]">
          <PlayTestEngine
            doc={apiRef.current?.getDoc() ?? doc}
            onClose={exitPlayTestLive}
            playTestRole={playTestRole}
            mode={gameMode}
          />
        </div>
      )}
    </MenuSfxRoot>
    </TooltipProvider>
  );

  if (variant === 'engine') return editorShell;
  return createPortal(editorShell, document.body);
}

function EditorGraphicsOverlay({
  open,
  perf,
  toolsOpen,
  onClose,
  onToggleTools,
  onTogglePerf,
  onRestorePerf,
  onOpenWorld,
  onOpenSettings,
}: {
  open: boolean;
  perf: EditorPerfMode;
  toolsOpen: boolean;
  onClose: () => void;
  onToggleTools: () => void;
  onTogglePerf: (key: keyof EditorPerfMode) => void;
  onRestorePerf: () => void;
  onOpenWorld: () => void;
  onOpenSettings: () => void;
}) {
  if (!open) return null;
  const rows: { key: keyof EditorPerfMode; label: string }[] = [
    { key: 'disableBloom', label: 'Disable bloom (biggest GPU saving)' },
    { key: 'capPixelRatio', label: 'Render at 1× pixel ratio' },
    { key: 'skipCollisionGizmos', label: 'Skip collision wireframes' },
    { key: 'hideFloor', label: 'Hide floor / void disc' },
    { key: 'hideSkyTexture', label: 'Hide sky texture (solid color)' },
    { key: 'hideVoidEffects', label: 'Hide void glow / shadow' },
    { key: 'hideFog', label: 'Hide fog' },
  ];
  const dirty = rows.some(({ key }) => perf[key] !== DEFAULT_EDITOR_PERF_MODE[key]);
  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-[#0f1724] p-4 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black tracking-wide text-white">Editor graphics</p>
          <button
            type="button"
            className="w-8 h-8 rounded-lg grid place-items-center text-white/70 hover:bg-white/10"
            onClick={onClose}
            aria-label="Close graphics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-white/50 leading-snug">
          Cuts rendering work while editing. Play Test and live matches stay at full quality and
          these flags are not saved into the map.
        </p>
        <label className="flex items-center justify-between gap-3 text-xs text-white/80">
          <span>Show tool bar</span>
          <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={toolsOpen} onChange={onToggleTools} />
        </label>
        {rows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-white/80">
            <span>{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-400"
              checked={perf[key]}
              onChange={() => onTogglePerf(key)}
            />
          </label>
        ))}
        {dirty && (
          <Button size="sm" variant="ghost" className="w-full text-xs text-amber-200" onClick={onRestorePerf}>
            Restore all editor visuals
          </Button>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={onOpenWorld}>
            World panel
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={onOpenSettings}>
            Match settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  title,
  disabled,
  btnRef,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  btnRef?: React.Ref<HTMLButtonElement>;
}) {
  const btn = (
    <button
      ref={btnRef}
      type="button"
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        disabled
          ? 'text-white/25 cursor-not-allowed'
          : active
            ? 'bg-cyan-500/30 text-cyan-200'
            : 'text-white/70 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
  if (!title) return btn;
  return <EditorTip content={title}>{btn}</EditorTip>;
}

function RotatePresetPicker({
  anchorRect,
  onPick,
  onClose,
}: {
  anchorRect: DOMRect | null;
  onPick: (op: SelectionTransformOp) => void;
  onClose: () => void;
}) {
  const btnCls =
    'flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-white/85 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:text-cyan-100 active:scale-95 transition-colors';
  const width = 288;
  const left = anchorRect
    ? Math.min(
        Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
        window.innerWidth - width - 8
      )
    : 8;
  const bottom = anchorRect ? Math.max(8, window.innerHeight - anchorRect.top + 8) : 8;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] w-72 rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur p-3 shadow-2xl"
        style={{ left, bottom }}
      >
        <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1 text-center">
          Easy rotate
        </p>
        <p className="text-[10px] text-white/40 mb-2.5 text-center leading-relaxed">
          Turns the whole selection around its center — groups stay together. Drag the rings in
          the viewport for free rotate.
        </p>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Yaw (turn)</p>
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {([0, 90, 180, 270] as const).map((deg) => (
            <button
              key={deg}
              type="button"
              className={btnCls}
              onClick={() => onPick({ type: 'setYaw', deg })}
              title={`Face ${deg}°`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">{deg}°</span>
            </button>
          ))}
        </div>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Nudge 90°</p>
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, -90, 0] })}
            title="Yaw −90°"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Left</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 90, 0] })}
            title="Yaw +90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Right</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 180, 0] })}
            title="Yaw 180°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">180</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [90, 0, 0] })}
            title="Pitch +90° (tilt)"
          >
            <span className="text-[10px] leading-none">Pitch +</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [-90, 0, 0] })}
            title="Pitch −90°"
          >
            <span className="text-[10px] leading-none">Pitch −</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 0, 90] })}
            title="Roll +90°"
          >
            <span className="text-[10px] leading-none">Roll</span>
          </button>
        </div>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Flip</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'y' })}
            title="Flip horizontal (180° around up)"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Horiz</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'x' })}
            title="Flip vertical (180° around right)"
          >
            <FlipVertical className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Vert</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'z' })}
            title="Flip side (180° around forward)"
          >
            <FlipHorizontal className="w-3.5 h-3.5 rotate-90" />
            <span className="text-[10px] leading-none">Side</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

export default MapEditor;
