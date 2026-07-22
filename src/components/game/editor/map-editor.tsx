'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Layers,
  ListTree,
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
  CloudSun,
  Navigation,
  User,
  CircleDot,
  Undo2,
  Redo2,
  HelpCircle,
  Stamp,
  Crosshair,
  Skull,
  Zap,
  Ruler,
  Menu,
  EyeOff,
  Eye,
  Lock,
  Unlock,
  Focus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Rocket,
  FlagTriangleRight,
  PersonStanding,
  Home,
  Shirt,
  Heart,
  HeartPulse,
  Bug,
  MousePointer2,
  Paintbrush,
  Magnet,
  PaintBucket,
  Settings2,
  Hammer,
  LayoutGrid,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import type { EditorEntity, EntityCollideMaterial, FloorPreset, MapDocument, SkyPreset } from './map-document';
import {
  HAMMER_SOLID_MODEL,
  ensureAnimation,
  ensureCompetitiveSettings,
  ensureDeathrunSettings,
  ensureEnvironment,
  ensureHazard,
  ensureHealthFloor,
  ensureHordeSettings,
  ensureInteract,
  ensureJumpPad,
  ensureLight,
  ensureMonsterSpawn,
  ensureRedZone,
  ensureRevive,
  ensureSurface,
  ensureTeleport,
  ensureWaveAnchor,
  entityExportsAsPlatform,
  entityKindHint,
  entityKindLabel,
  entityKindsForMode,
  entityShowsGameplayMaterial,
  entityShowsModelPicker,
  findPlayerEntity,
  generateId,
  getMapGameMode,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
  isPlatformPlayerKind,
  patchCollideMaterial,
  resolveCollideMaterial,
} from './map-document';
import { TextureAtlasPicker } from './texture-atlas-picker';
import { KILRUN_MODE_INFO } from '@/lib/game-modes';
import { PROTOTYPE_MODELS, previewUrl } from './prototype-catalog';
import {
  ensureStarterMap,
  exportJson,
  getMapThumbnail,
  importJson,
  listMaps,
  loadMap,
  MOOD_PRESETS,
  saveMap,
} from './map-storage';
import {
  createEditorViewport,
  type EditTool,
  type EditorCameraState,
  type EditorViewLayout,
  type EditorViewportApi,
  type TransformMode,
} from './editor-viewport';
import { MapPlayPreview } from './map-play-preview';
import { PlayerModelStudio } from './player-model-studio';
import { ModelSkinEditor } from './model-skin-editor';
import { TpsViewStudio } from './tps-view-studio';
import { ensureMapPlayerEntity } from './player-avatar';
import type { TpsViewSettings } from '../tps/tps-view-settings';
import { sanitizeTpsView } from '../tps/tps-view-settings';
import type { SkinAttachment } from '@/lib/player-skins';
import { adminUpsertStoreItem } from '@/lib/social-actions';
import { adminSyncDatabaseSchema } from '@/lib/admin-db-sync';
import { publishCloudMap } from '@/lib/game-map-actions';
import {
  BUILTIN_TEXTURES,
  deleteCustomTexture,
  listCustomTextures,
  saveCustomTexture,
  type CustomTexture,
} from './texture-library';
import { AnimationPropsPanel } from './animation-props-panel';
import {
  EditorTutorial,
  HelpTabPanel,
  resetTutorialFlag,
  type TutorialStep,
} from './editor-help';
import {
  deletePrefab,
  getActivePlayMapIdForMode,
  instantiatePrefab,
  listPrefabs,
  savePrefab,
  setActivePlayMapIdForMode,
  stripLegacyBakedStairPads,
  type PrefabStamp,
} from './prefab-storage';
import { formatValidationSummary, validateMapForPublish } from './map-validate';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';

type SidebarTab = 'assets' | 'layers' | 'outliner' | 'world' | 'textures' | 'prefabs' | 'settings' | 'help';

function snapshotMapDoc(d: MapDocument) {
  return JSON.stringify(d);
}

export function MapEditor({
  onClose,
  initialMapId,
}: {
  onClose: () => void;
  isAdmin?: boolean;
  initialMapId?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EditorViewportApi | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const texFileRef = useRef<HTMLInputElement>(null);
  const propTexFileRef = useRef<HTMLInputElement>(null);
  const skyFileRef = useRef<HTMLInputElement>(null);

  const starter = useMemo(() => {
    if (initialMapId) {
      const loaded = loadMap(initialMapId);
      if (loaded) return { id: initialMapId, doc: stripLegacyBakedStairPads(loaded) };
    }
    const fresh = ensureStarterMap();
    return { id: fresh.id, doc: stripLegacyBakedStairPads(fresh.doc) };
  }, [initialMapId]);
  const [mapId, setMapId] = useState(starter.id);
  const [doc, setDoc] = useState<MapDocument>(() => ({
    ...starter.doc,
    environment: ensureEnvironment(starter.doc),
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SidebarTab>('assets');
  /** Active placeable model (kept while in Select so Brush can resume). */
  const [brush, setBrush] = useState<string | null>('floor-square');
  /** Select = pick objects; Brush = paint/place. Defaults to Select so clicks don't stack. */
  const [editTool, setEditTool] = useState<EditTool>('select');
  const [paintTextureUrl, setPaintTextureUrl] = useState<string | null>(null);
  /** Armed click-to-place kind (spawn flag, light, etc.) — cleared by Select / Escape / place-once. */
  const [pendingPlaceKind, setPendingPlaceKind] = useState<EditorEntity['kind'] | null>(null);
  const [viewLayout, setViewLayout] = useState<EditorViewLayout>('single');
  const [paintRepeat, setPaintRepeat] = useState<[number, number]>([2, 2]);
  const [mode, setMode] = useState<TransformMode>('translate');
  const [gridSnap, setGridSnap] = useState(true);
  const [query, setQuery] = useState('');
  const [activeLayerId, setActiveLayerId] = useState(starter.doc.layers[0]?.id ?? '');
  const [freeFly, setFreeFly] = useState(false);
  const [playTest, setPlayTest] = useState(false);
  const [customTextures, setCustomTextures] = useState<CustomTexture[]>([]);
  const [snapY, setSnapY] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();
  const mobileFirst =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || detectTouchDevice());
  const [showHelp, setShowHelp] = useState(!mobileFirst);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefabs, setPrefabs] = useState<PrefabStamp[]>([]);
  const [prefabName, setPrefabName] = useState('My Prefab');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [activePlayId, setActivePlayId] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureDist, setMeasureDist] = useState<number | null>(null);
  /** Master hide: collapses top bar, side menus, tools, and properties for a clear canvas. */
  const [uiCollapsed, setUiCollapsed] = useState(mobileFirst);
  /** Mobile left asset/library drawer (overlay). Desktop keeps the panel in-flow. */
  const [sidebarOpen, setSidebarOpen] = useState(!mobileFirst);
  /** Mobile/desktop properties inspector visibility when something is selected. */
  const [propsOpen, setPropsOpen] = useState(!mobileFirst);
  /** Bottom transform/place toolbar. */
  const [toolsOpen, setToolsOpen] = useState(true);
  const [playerStudioOpen, setPlayerStudioOpen] = useState(false);
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [tpsViewOpen, setTpsViewOpen] = useState(false);
  const [showAllCollisionGizmos, setShowAllCollisionGizmos] = useState(false);
  const lastLockedToastAt = useRef(0);
  const cameraBeforePlayRef = useRef<EditorCameraState | null>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const touchLayerRef = useRef<HTMLDivElement>(null);

  const docRef = useRef(doc);
  const undoStack = useRef<MapDocument[]>([]);
  const redoStack = useRef<MapDocument[]>([]);
  const skipHistory = useRef(false);
  const lastSavedRef = useRef(
    snapshotMapDoc({
      ...starter.doc,
      environment: ensureEnvironment(starter.doc),
    })
  );
  docRef.current = doc;

  const selected = doc.entities.find((e) => e.id === selectedId) ?? null;
  const env = ensureEnvironment(doc);
  const [mapListTick, setMapListTick] = useState(0);
  const maps = useMemo(() => {
    void mapListTick;
    return listMaps();
  }, [mapListTick]);

  const historyAnchor = useRef<MapDocument | null>(null);
  const historyTimer = useRef<number | null>(null);
  const scheduleHistory = () => {
    if (skipHistory.current) return;
    if (!historyAnchor.current) historyAnchor.current = structuredClone(docRef.current);
    if (historyTimer.current) window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(() => {
      if (historyAnchor.current) {
        undoStack.current.push(historyAnchor.current);
        if (undoStack.current.length > 60) undoStack.current.shift();
        historyAnchor.current = null;
        redoStack.current = [];
        setCanUndo(true);
        setCanRedo(false);
      }
    }, 400);
  };

  const undo = () => {
    const prev = undoStack.current.pop();
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
    const next = redoStack.current.pop();
    if (!next) return;
    const current = structuredClone(apiRef.current?.getDoc() ?? docRef.current);
    undoStack.current.push(current);
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
  }, []);

  const gameMode = getMapGameMode(doc);
  const modeInfo = KILRUN_MODE_INFO[gameMode];
  const kindOptions = entityKindsForMode(gameMode);

  // Mobile: start with menus tucked away so the viewport is usable for placing.
  useEffect(() => {
    if (!isMobile) {
      setUiCollapsed(false);
      setSidebarOpen(true);
      setPropsOpen(true);
      setToolsOpen(true);
      return;
    }
    setUiCollapsed(true);
    setSidebarOpen(false);
    setToolsOpen(false);
    setPropsOpen(false);
    setShowHelp(false);
  }, [isMobile]);

  // Re-open properties when selection changes (unless chrome is fully hidden).
  useEffect(() => {
    if (selectedId && !uiCollapsed) setPropsOpen(true);
  }, [selectedId, uiCollapsed]);

  const collapseAllMenus = () => {
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const api = createEditorViewport(host, doc, {
      onSelect: setSelectedId,
      onSelectionChange: setSelectedIds,
      onDocChange: (next) => {
        scheduleHistory();
        const merged = { ...next, environment: ensureEnvironment(next) };
        docRef.current = merged;
        setDoc(merged);
        setDirty(true);
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
            title: 'Build level locked',
            description: `“${layerName ?? 'This level'}” is locked — unlock it in Layers, or Build here on another level.`,
            variant: 'destructive',
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
    });
    apiRef.current = api;
    api.setBrush(brush);
    api.setEditTool(editTool);
    api.setActiveLayerId(activeLayerId);
    if (detectTouchDevice()) {
      // Mobile defaults to free-fly so joysticks control look + move immediately
      api.setFreeFly(true);
    }
    return () => {
      api.destroy();
      apiRef.current = null;
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
    if (step.tab) setTab(step.tab);
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
    persist();
    setActivePlayMapIdForMode(gameMode, mapId);
    setActivePlayId(mapId);
    const published = workingDoc();
    void publishCloudMap({
      localId: mapId,
      name: published.name,
      mode: gameMode,
      document: published,
      thumbnailDataUrl: getMapThumbnail(mapId),
      setActive: true,
    })
      .then(() => {
        toast({
          title: `“${published.name}” is Active ${modeInfo.shortTitle} map`,
          description: 'Published to cloud for all players. Rejoin lobby to reload.',
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
    redoStack.current = [];
    historyAnchor.current = null;
    setCanUndo(false);
    setCanRedo(false);
  };

  const markClean = (next: MapDocument) => {
    lastSavedRef.current = snapshotMapDoc(next);
    setDirty(false);
  };

  const persist = (opts?: { quiet?: boolean }) => {
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
      // Keep cloud draft in sync so other devices see the same map.
      void publishCloudMap({
        localId: mapId,
        name: next.name,
        mode: gameMode,
        document: next,
        thumbnailDataUrl: liveThumb ?? getMapThumbnail(mapId),
        setActive: false,
      }).catch((err) => {
        console.warn('[map persist cloud]', err);
      });
      if (!opts?.quiet) {
        toast({
          title: 'Map saved',
          description: `“${next.name}” saved locally and synced to cloud.`,
        });
      }
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
      if (playTest) return;
      if (snapshotMapDoc(workingDoc()) === lastSavedRef.current) return;
      persist({ quiet: true });
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, playTest]);

  useEffect(() => {
    apiRef.current?.setBrush(brush);
  }, [brush]);
  useEffect(() => {
    apiRef.current?.setEditTool(editTool);
  }, [editTool]);
  useEffect(() => {
    apiRef.current?.setPaintTexture(paintTextureUrl);
  }, [paintTextureUrl]);
  useEffect(() => {
    apiRef.current?.setPaintUv({ repeat: paintRepeat });
  }, [paintRepeat]);
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
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (playTest) return;

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        persist();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (apiRef.current?.getPendingPlaceKind()) {
          apiRef.current.clearPendingPlace();
          setPendingPlaceKind(null);
          toast({ title: 'Placement cancelled', description: 'Back to Select.' });
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

      if (e.key === 'w' || e.key === 'W') setMode('translate');
      if (e.key === 'e' || e.key === 'E') setMode('rotate');
      if (e.key === 'r' || e.key === 'R') setMode('scale');
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
        setEditTool('hammer');
        setMode('scale');
        if (freeFly) apiRef.current?.setFreeFly(false);
      }
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
        const ids =
          selectedIds.length >= 2
            ? selectedIds
            : selectedId
              ? [selectedId, ...selectedIds.filter((id) => id !== selectedId)]
              : [];
        const ok = apiRef.current?.snapSelectedTogether(ids);
        if (ok) {
          toast({
            title: 'Snapped together',
            description: 'Edge-to-edge in a line, shared bottom height.',
          });
        }
      }
      if (e.key === 'g' || e.key === 'G') setGridSnap((v) => !v);
      if (e.key === 'f' || e.key === 'F') apiRef.current?.focusSelected();
      if (e.key === 'Delete' || e.key === 'Backspace') apiRef.current?.deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const axis = e.shiftKey ? 'z' : 'x';
        apiRef.current?.duplicateSelected(axis);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, selectedId, selectedIds, freeFly, playTest, mapId, brush]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROTOTYPE_MODELS.filter((n) => !q || n.includes(q));
  }, [query]);

  const doExport = () => {
    const blob = new Blob([exportJson(apiRef.current?.getDoc() ?? doc)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
  };

  const patchSelected = (patch: Partial<EditorEntity>) => {
    apiRef.current?.updateSelected(patch);
    setDoc((d) => ({
      ...d,
      entities: d.entities.map((e) => (e.id === selectedId ? { ...e, ...patch } : e)),
    }));
  };

  const patchEntityById = (id: string, patch: Partial<EditorEntity>) => {
    scheduleHistory();
    setDoc((d) => {
      const entities = d.entities.map((e) => (e.id === id ? { ...e, ...patch } : e));
      const next = { ...d, entities };
      apiRef.current?.setDoc(next);
      return next;
    });
    if (id === selectedId) {
      apiRef.current?.updateSelected(patch);
    }
  };

  const sortedLayers = useMemo(
    () => (doc.layers ?? []).slice().sort((a, b) => a.order - b.order),
    [doc.layers]
  );
  const activeLayer = doc.layers.find((l) => l.id === activeLayerId) ?? sortedLayers[0] ?? null;

  const applyDocLayers = (
    layersOrFn: typeof doc.layers | ((prev: typeof doc.layers) => typeof doc.layers)
  ) => {
    scheduleHistory();
    setDoc((d) => {
      const layers = typeof layersOrFn === 'function' ? layersOrFn(d.layers) : layersOrFn;
      const next = { ...d, layers };
      apiRef.current?.setDoc(next);
      return next;
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
    scheduleHistory();
    setDoc((d) => {
      const entities = d.entities.map((e) =>
        ids.includes(e.id) ? { ...e, layerId } : e
      );
      const next = { ...d, entities };
      apiRef.current?.setDoc(next);
      return next;
    });
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

  const openPlayerStudio = () => {
    const ensured = ensureMapPlayerEntity(docRef.current);
    if (ensured.created) {
      scheduleHistory();
      setDoc(ensured.doc);
      docRef.current = ensured.doc;
      apiRef.current?.setDoc(ensured.doc);
    }
    // Do not select / focus avatar on the map — Player Model is platform settings.
    setSelectedId(null);
    apiRef.current?.setSelectedId(null);
    setSelectedIds([]);
    setModelEditorOpen(false);
    setTpsViewOpen(false);
    setPlayerStudioOpen(true);
    setUiCollapsed(false);
    setPropsOpen(false);
    setSidebarOpen(false);
    setToolsOpen(false);
  };

  const openModelEditor = () => {
    const ensured = ensureMapPlayerEntity(docRef.current);
    if (ensured.created) {
      scheduleHistory();
      setDoc(ensured.doc);
      docRef.current = ensured.doc;
      apiRef.current?.setDoc(ensured.doc);
    }
    setSelectedId(null);
    apiRef.current?.setSelectedId(null);
    setSelectedIds([]);
    setPlayerStudioOpen(false);
    setTpsViewOpen(false);
    setModelEditorOpen(true);
    setUiCollapsed(false);
    setPropsOpen(false);
    setSidebarOpen(false);
    setToolsOpen(false);
  };

  const applySkinsToPlayer = (attachments: SkinAttachment[]) => {
    const player = findPlayerEntity(docRef.current);
    if (!player) return;
    scheduleHistory();
    setDoc((d) => {
      const playerSkins = attachments.length > 0 ? attachments : undefined;
      const entities = d.entities.map((e) =>
        e.id === player.id ? { ...e, playerSkins } : e
      );
      const next = { ...d, entities };
      docRef.current = next;
      apiRef.current?.setDoc(next);
      return next;
    });
    toast({
      title: attachments.length > 0 ? 'Skins applied to player avatar' : 'Skins removed from player avatar',
    });
  };

  const playerAvatar = findPlayerEntity(doc);

  const wireTrapToButton = (trapId: string, buttonId: string) => {
    scheduleHistory();
    setDoc((d) => {
      const entities = d.entities.map((e) => {
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
      });
      const next = { ...d, entities };
      apiRef.current?.setDoc(next);
      return next;
    });
  };

  const patchEnv = (partial: Partial<typeof env>) => {
    const next = { ...env, ...partial };
    setDoc((d) => ({ ...d, environment: next }));
    apiRef.current?.applyEnvironment(next);
  };

  const openTpsViewStudio = () => {
    // Avatar is optional — Play Test / 3rd View use default mannequin if missing.
    const player = findPlayerEntity(docRef.current);
    if (player) {
      setSelectedId(player.id);
      apiRef.current?.setSelectedId(player.id);
    }
    setPlayerStudioOpen(false);
    setModelEditorOpen(false);
    setTpsViewOpen(true);
    setUiCollapsed(false);
    setPropsOpen(false);
    setSidebarOpen(false);
    setToolsOpen(false);
  };

  const saveTpsToMap = (settings: TpsViewSettings) => {
    const clean = sanitizeTpsView(settings);
    scheduleHistory();
    setDoc((d) => {
      const next = { ...d, tpsView: clean };
      docRef.current = next;
      apiRef.current?.setDoc(next);
      return next;
    });
    setDirty(true);
    toast({
      title: '3rd View saved to map',
      description: 'Also saved globally for Play Test & matches.',
    });
  };

  const startPlay = () => {
    if (freeFly) apiRef.current?.setFreeFly(false);
    // Snapshot camera so Exit restores the exact map view you left
    cameraBeforePlayRef.current = apiRef.current?.getCameraState() ?? null;
    apiRef.current?.setPaused(true);
    // Do NOT auto-insert Player Avatar into the map — Play Test uses default
    // mannequin / existing avatar, and invents Start on a floor if needed.
    persist();
    setPlayTest(true);
  };

  const exitPlayTest = () => {
    setPlayTest(false);
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#0d121a] text-white flex flex-col">
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

      {/* Restored when chrome is hidden — one tap brings menus back */}
      {uiCollapsed && (
        <div className="fixed top-3 left-3 z-[140] flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={expandMenus}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/70 bg-cyan-500/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            title="Show editor menus"
          >
            <Menu className="w-4 h-4" />
            Menus
          </button>
          <button
            type="button"
            onClick={() => persist()}
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

      {/* Desktop: reopen library when collapsed */}
      {!uiCollapsed && !isMobile && !sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed top-16 left-0 z-[140] flex h-12 w-7 items-center justify-center rounded-r-lg border border-l-0 border-white/20 bg-[#121a24] text-white/80 shadow-lg hover:bg-cyan-500/20 hover:text-cyan-200"
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
          title="Reset camera to edit location"
          aria-label="Reset camera to edit location"
        >
          <Home className="w-4 h-4" />
        </button>
      )}

      {/* Top bar */}
      {!uiCollapsed && (
      <div className="h-12 border-b border-white/10 flex items-center gap-2 px-3 bg-[#121a24] relative z-[60] overflow-x-auto shrink-0">
        <span className="text-xs font-bold tracking-widest text-cyan-300/90 uppercase shrink-0">Map Editor</span>
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
            setDoc((d) => ({ ...d, name: e.target.value }));
            setDirty(true);
          }}
        />
        <select
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm shrink-0"
          value={mapId}
          onChange={(e) => {
            const id = e.target.value;
            const loaded = loadMap(id);
            if (!loaded) return;
            if (isDirty()) {
              const ok = confirm(
                'You have unsaved changes on this map.\n\nOK = discard and switch\nCancel = stay'
              );
              if (!ok) return;
            }
            const cleaned = stripLegacyBakedStairPads(loaded);
            const withEnv = { ...cleaned, environment: ensureEnvironment(cleaned) };
            setMapId(id);
            setDoc(withEnv);
            docRef.current = withEnv;
            markClean(withEnv);
            clearHistory();
            apiRef.current?.setDoc(withEnv);
            setActivePlayId(getActivePlayMapIdForMode(getMapGameMode(withEnv)));
            if (cleaned.entities.length !== loaded.entities.length) {
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
              {m.name}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          onClick={startPlay}
        >
          <Play className="w-4 h-4 mr-1" /> Play Test
        </Button>
        <Button
          size="sm"
          variant={tpsViewOpen ? 'default' : 'secondary'}
          className={`shrink-0 ${tpsViewOpen ? 'bg-violet-600 hover:bg-violet-500 text-white' : ''}`}
          onClick={() => (tpsViewOpen ? setTpsViewOpen(false) : openTpsViewStudio())}
          title="3rd View — in-game camera, crosshair & framing (how players see the match)"
        >
          <Eye className="w-4 h-4 mr-1" />
          {isMobile ? '3rd' : '3rd View'}
        </Button>
        <Button
          size="sm"
          variant={playerStudioOpen ? 'default' : 'secondary'}
          className={`shrink-0 ${playerStudioOpen ? 'bg-sky-600 hover:bg-sky-500 text-white' : ''}`}
          onClick={() => (playerStudioOpen ? setPlayerStudioOpen(false) : openPlayerStudio())}
          title="Player Model — platform-wide avatar look & animations (not placed on the map)"
        >
          <PersonStanding className="w-4 h-4 mr-1" />
          {isMobile ? 'Avatar' : 'Player Model'}
        </Button>
        <Button
          size="sm"
          variant={modelEditorOpen ? 'default' : 'secondary'}
          className={`shrink-0 ${modelEditorOpen ? 'bg-amber-600 hover:bg-amber-500 text-white' : ''}`}
          onClick={() => (modelEditorOpen ? setModelEditorOpen(false) : openModelEditor())}
          title="Model Editor — skins, hats, pants, weapons for shop"
        >
          <Shirt className="w-4 h-4 mr-1" />
          {isMobile ? 'Skins' : 'Model Editor'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={`shrink-0 ${activePlayId === mapId ? 'border border-emerald-400/50 text-emerald-200' : ''}`}
          onClick={publishToMatch}
          title="Use this map in Deathrun matches"
        >
          {activePlayId === mapId ? 'MAIN map ✓' : 'Set as MAIN map'}
        </Button>

        {!isMobile && (
          <Button
            size="sm"
            variant={freeFly ? 'default' : 'secondary'}
            className={`shrink-0 ${freeFly ? 'bg-amber-600 hover:bg-amber-500' : ''}`}
            onClick={() => apiRef.current?.setFreeFly(!freeFly)}
            title="Toggle free fly (Ctrl)"
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
        <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setShowHelp((v) => !v)} title="Tips">
          <HelpCircle className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 border border-cyan-400/40 text-cyan-100"
          onClick={collapseAllMenus}
          title="Hide all menus for placing"
        >
          <EyeOff className="w-4 h-4 mr-1" /> Hide UI
        </Button>

        <div className="flex-1 min-w-2" />
        <Button
          size="sm"
          variant="secondary"
          className={`shrink-0 ${dirty ? 'border border-amber-400/60 text-amber-100 bg-amber-500/15' : ''}`}
          onClick={() => persist()}
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
              const id = `map_${Date.now().toString(36)}`;
              saveMap(id, withEnv);
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
        <Button size="sm" variant="destructive" className="shrink-0" onClick={requestClose} title="Exit (Esc)">
          <X className="w-4 h-4" />
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

        {!uiCollapsed && sidebarOpen && (
        <div
          className={`border-r border-white/10 bg-[#0f1620] flex flex-col items-center py-2 gap-1 z-[70] ${
            isMobile
              ? 'absolute left-0 top-0 bottom-0 w-10 shadow-xl'
              : 'w-10 relative'
          }`}
        >
          {(
            [
              ['assets', Box],
              ['layers', Layers],
              ['outliner', ListTree],
              ['prefabs', Stamp],
              ['world', CloudSun],
              ['textures', Palette],
              ['settings', Settings2],
              ['help', HelpCircle],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              type="button"
              title={id}
              className={`w-8 h-8 rounded flex items-center justify-center ${
                tab === id ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/50 hover:text-white'
              }`}
              onClick={() => {
                setTab(id);
                setSidebarOpen(true);
              }}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <button
            type="button"
            title="Collapse library"
            className="mt-auto w-8 h-8 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse model panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        )}

        {!uiCollapsed && sidebarOpen && (
        <div
          className={`border-r border-white/10 bg-[#121a24] flex flex-col min-h-0 z-[70] relative ${
            isMobile
              ? 'absolute left-10 top-0 bottom-0 w-[min(18rem,calc(100vw-2.5rem))] shadow-2xl'
              : 'w-72 relative'
          }`}
        >
          {/* Edge arrow to collapse the model / library panel */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute -right-3 top-1/2 z-[80] flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-white/25 bg-[#1a2433] text-white/85 shadow-md hover:bg-cyan-500/25 hover:text-cyan-100 active:scale-95"
            title="Collapse model panel"
            aria-label="Collapse model panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {tab === 'assets' && (
            <>
              <div className="p-2 border-b border-white/10 space-y-1">
                <input
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                  placeholder="Search models…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    className={`text-xs px-2 py-1.5 rounded border flex items-center justify-center gap-1 ${
                      editTool === 'select' && !pendingPlaceKind
                        ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                        : 'border-white/10 text-white/50'
                    }`}
                    onClick={() => {
                      setEditTool('select');
                      apiRef.current?.clearPendingPlace();
                      setPendingPlaceKind(null);
                    }}
                    title="Select objects (V) — cancels spawn placement"
                  >
                    <MousePointer2 className="w-3 h-3" />
                    Select
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1.5 rounded border flex items-center justify-center gap-1 ${
                      editTool === 'brush'
                        ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10'
                        : 'border-white/10 text-white/50'
                    }`}
                    onClick={() => {
                      setEditTool('brush');
                      if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
                    }}
                    title="Brush (B) — click once to place"
                  >
                    <Paintbrush className="w-3 h-3" />
                    Brush
                  </button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1.5 rounded border flex items-center justify-center gap-1 ${
                      editTool === 'bucket'
                        ? 'border-fuchsia-400 text-fuchsia-200 bg-fuchsia-500/10'
                        : 'border-white/10 text-white/50'
                    }`}
                    onClick={() => {
                      // If a scene object is selected, paint that model; else keep library brush.
                      const selModel = selected?.model;
                      if (selModel && selModel !== HAMMER_SOLID_MODEL) setBrush(selModel);
                      else if (!brush || brush === HAMMER_SOLID_MODEL) setBrush('floor-square');
                      setEditTool('bucket');
                      if (freeFly) apiRef.current?.setFreeFly(false);
                    }}
                    title="Paint Bucket (P) — hold+drag paints; camera locked"
                  >
                    <PaintBucket className="w-3 h-3" />
                    Bucket
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setBrush(name);
                      // Keep Bucket if already painting; Hammer++ / Select return to Brush.
                      setEditTool((t) => (t === 'bucket' ? 'bucket' : 'brush'));
                      // Free the canvas after picking a brush on mobile.
                      if (isMobile) {
                        setSidebarOpen(false);
                        setUiCollapsed(true);
                      }
                    }}
                    className={`rounded border p-1 text-left ${
                      brush === name &&
                      (editTool === 'brush' || editTool === 'bucket')
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : brush === name
                          ? 'border-white/30 bg-white/5'
                          : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl(name)}
                      alt={name}
                      className="w-full aspect-square object-contain bg-black/30 rounded"
                    />
                    <p className="text-[10px] mt-1 truncate text-white/80">{name}</p>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/40 p-2 border-t border-white/10">
                {editTool === 'bucket'
                  ? 'Paint Bucket: camera locked — hold and drag to paint the selected model along a path.'
                  : editTool === 'brush'
                    ? 'Brush: click ground to place. Same model cell selects it. Alt+click stacks.'
                    : editTool === 'hammer'
                      ? 'Hammer++: place/drag solid boxes. Use Scale (R) to resize. Catalog Brush/Bucket unchanged.'
                      : 'Select: click objects to pick them. Pick a model, then Brush or Bucket.'}{' '}
                Orbit drag = move view. Ctrl = free fly.
              </p>
            </>
          )}

          {tab === 'layers' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                  Build by level
                </p>
                <p className="text-[10px] text-white/45 leading-snug">
                  Paint floors on <b className="text-white/70">Level 0 / Floor</b>, then switch to
                  Level 1 for props, traps, etc. Tap the eye to hide a level and check the layout.
                  Active layer (cyan) is where new pieces go.
                </p>
                <div className="flex gap-1.5 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1 text-[10px] h-8"
                    onClick={showAllLayers}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> Show all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 text-[10px] h-8"
                    onClick={addBuildLevel}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add level
                  </Button>
                </div>
              </div>

              {sortedLayers.map((layer, index) => {
                const count = doc.entities.filter((e) => e.layerId === layer.id).length;
                const isActive = activeLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    className={`rounded-xl border p-2.5 space-y-2 ${
                      isActive
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : layer.visible
                          ? 'border-white/10 bg-black/20'
                          : 'border-white/5 bg-black/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveLayerId(layer.id)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          isActive
                            ? 'bg-cyan-500/40 text-cyan-50'
                            : 'bg-white/10 text-white/70 hover:bg-white/15'
                        }`}
                        title={`Build on level ${index}`}
                      >
                        {index}
                      </button>
                      <input
                        className="min-w-0 flex-1 bg-transparent border-b border-transparent focus:border-white/20 text-sm font-semibold text-white outline-none py-0.5"
                        value={layer.name}
                        onChange={(e) => setLayerFlag(layer.id, { name: e.target.value })}
                        onFocus={() => setActiveLayerId(layer.id)}
                        aria-label={`Rename level ${index}`}
                      />
                      <span className="text-[10px] tabular-nums text-white/35 shrink-0">
                        {count}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveLayerId(layer.id)}
                        className={`flex-1 min-w-[4.5rem] px-2 py-1.5 rounded-md text-[10px] font-bold uppercase border ${
                          isActive
                            ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-50'
                            : 'border-white/10 text-white/55 hover:bg-white/5'
                        }`}
                      >
                        Build here
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayerFlag(layer.id, { visible: !layer.visible })}
                        className={`w-9 h-8 rounded-md flex items-center justify-center border ${
                          layer.visible
                            ? 'border-white/15 text-emerald-300 hover:bg-white/5'
                            : 'border-white/10 text-white/35 hover:bg-white/5'
                        }`}
                        title={layer.visible ? 'Hide this level' : 'Show this level'}
                      >
                        {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayerFlag(layer.id, { locked: !layer.locked })}
                        className={`w-9 h-8 rounded-md flex items-center justify-center border ${
                          layer.locked
                            ? 'border-amber-400/40 text-amber-200 bg-amber-500/10'
                            : 'border-white/10 text-white/35 hover:bg-white/5'
                        }`}
                        title={layer.locked ? 'Unlock (allow place/edit)' : 'Lock (no place/edit)'}
                      >
                        {layer.locked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => soloLayer(layer.id)}
                        className="w-9 h-8 rounded-md flex items-center justify-center border border-white/10 text-white/55 hover:bg-white/5"
                        title="Solo — hide every other level"
                      >
                        <Focus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {(selectedId || selectedIds.length > 0) && (
                      <button
                        type="button"
                        onClick={() => moveSelectionToLayer(layer.id)}
                        className="w-full text-[10px] py-1 rounded-md border border-white/10 text-white/50 hover:bg-white/5 hover:text-white/80"
                      >
                        Move selection → this level
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'outliner' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {doc.entities
                .filter((e) => !isPlatformPlayerKind(e.kind))
                .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={(ev) => {
                    if (ev.shiftKey) {
                      const next = selectedIds.includes(e.id)
                        ? selectedIds.filter((id) => id !== e.id)
                        : [...(selectedIds.length ? selectedIds : selectedId ? [selectedId] : []), e.id];
                      setSelectedIds(next);
                      setSelectedId(next[next.length - 1] ?? null);
                      apiRef.current?.setSelectedIds(next);
                    } else {
                      setSelectedId(e.id);
                      setSelectedIds([e.id]);
                      apiRef.current?.setSelectedId(e.id);
                    }
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm truncate ${
                    selectedId === e.id || selectedIds.includes(e.id)
                      ? 'bg-cyan-500/20 text-cyan-100'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <span className="text-white/40 text-[10px] mr-1">{e.kind}</span>
                  {e.name}
                </button>
              ))}
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded text-sm border border-sky-500/30 bg-sky-500/10 text-sky-100 mt-2"
                onClick={() => openPlayerStudio()}
              >
                <span className="text-sky-300/70 text-[10px] mr-1">platform</span>
                Player Model settings…
              </button>
            </div>
          )}

          {tab === 'prefabs' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Prefabs / Stamps</p>
              <p className="text-[11px] text-white/55 leading-relaxed">
                Shift+click to multi-select ({selectedIds.length || (selectedId ? 1 : 0)} selected).
                With 2+ selected, press the magnet Snap icon — each piece joins the closest face
                (side or stack on top).
                at the same bottom height (first click is the anchor).
              </p>
              {selectedIds.length >= 2 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    const ok = apiRef.current?.snapSelectedTogether(selectedIds);
                    if (ok) {
                      toast({
                        title: 'Snapped together',
                        description: 'Edge-to-edge in a line, shared bottom height.',
                      });
                    } else {
                      toast({
                        title: 'Select 2 objects first',
                        description: 'Shift+click two objects, then Snap.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <Magnet className="w-4 h-4 mr-1" /> Snap together
                </Button>
              )}
              <input
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                value={prefabName}
                onChange={(e) => setPrefabName(e.target.value)}
                placeholder="Prefab name"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!(selectedIds.length || selectedId)}
                onClick={() => {
                  const ids = selectedIds.length
                    ? selectedIds
                    : selectedId
                      ? [selectedId]
                      : [];
                  const ents = doc.entities.filter((e) => ids.includes(e.id));
                  if (!ents.length) return;
                  try {
                    savePrefab(prefabName.trim() || 'Prefab', ents);
                    setPrefabs(listPrefabs());
                    toast({ title: 'Prefab saved', description: prefabName.trim() || 'Prefab' });
                  } catch (err) {
                    toast({
                      title: 'Prefab failed',
                      description: err instanceof Error ? err.message : 'Could not save prefab',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                <Stamp className="w-4 h-4 mr-1" /> Save selection as prefab
              </Button>
              <div className="space-y-1">
                {prefabs.length === 0 && (
                  <p className="text-[11px] text-white/40">No prefabs yet.</p>
                )}
                {prefabs.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 rounded border border-white/10 bg-black/30 p-2"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left text-xs hover:text-cyan-200"
                      onClick={() => {
                        const ents = instantiatePrefab(p, [0, 0, 0], activeLayerId);
                        apiRef.current?.stampEntities(ents);
                        if (isMobile) {
                          setSidebarOpen(false);
                          setUiCollapsed(true);
                        }
                      }}
                      title="Click ground to stamp"
                    >
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-white/40 block">{p.entities.length} pieces</span>
                    </button>
                    <button
                      type="button"
                      className="text-red-300/80 hover:text-red-200 p-1"
                      onClick={() => {
                        deletePrefab(p.id);
                        setPrefabs(listPrefabs());
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'help' && (
            <HelpTabPanel
              onStartTutorial={() => {
                resetTutorialFlag();
                setTutorialOpen(true);
              }}
            />
          )}

          {tab === 'world' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Mood presets</p>
              <div className="flex flex-wrap gap-1">
                {MOOD_PRESETS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-white/15 hover:border-cyan-400/50 hover:bg-cyan-500/10"
                    onClick={() => patchEnv(m.env)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Sky / Surroundings</p>
              <label className="block text-xs text-white/60">
                Sky preset
                <select
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5"
                  value={env.sky}
                  onChange={(e) => patchEnv({ sky: e.target.value as SkyPreset })}
                >
                  <option value="cavern">Cavern</option>
                  <option value="dusk">Dusk</option>
                  <option value="bright">Bright</option>
                  <option value="void">Void</option>
                  <option value="custom">Custom color</option>
                </select>
              </label>
              <label className="block text-xs text-white/60">
                Sky color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.skyColor}
                  onChange={(e) => patchEnv({ sky: 'custom', skyColor: e.target.value })}
                />
              </label>
              <div className="space-y-1.5">
                <p className="text-xs text-white/60">Sky texture / background</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => skyFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" /> Upload sky image
                </Button>
                <input
                  ref={skyFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      patchEnv({
                        sky: 'custom',
                        skyTextureUrl: String(reader.result),
                      });
                    };
                    reader.readAsDataURL(f);
                    e.target.value = '';
                  }}
                />
                {env.skyTextureUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs text-red-300"
                    onClick={() => patchEnv({ skyTextureUrl: undefined })}
                  >
                    Clear sky texture
                  </Button>
                )}
                <p className="text-[10px] text-white/35">
                  Panorama / equirectangular works best. JPG/PNG under ~2 MB.
                </p>
              </div>
              <label className="block text-xs text-white/60">
                Horizon / ground tint
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.horizonColor || env.fogColor}
                  onChange={(e) => patchEnv({ horizonColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Fog color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.fogColor}
                  onChange={(e) => patchEnv({ fogColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Fog density ({env.fogDensity.toFixed(3)})
                <input
                  type="range"
                  min={0}
                  max={0.08}
                  step={0.002}
                  className="w-full"
                  value={env.fogDensity}
                  onChange={(e) => patchEnv({ fogDensity: Number(e.target.value) })}
                />
              </label>
              <p className="text-[10px] tracking-widest text-white/50 uppercase pt-1">Lighting</p>
              <label className="block text-xs text-white/60">
                Ambient ({(env.ambientIntensity ?? 0.55).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  className="w-full"
                  value={env.ambientIntensity ?? 0.55}
                  onChange={(e) => patchEnv({ ambientIntensity: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Sun intensity ({(env.sunIntensity ?? 1.15).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.05}
                  className="w-full"
                  value={env.sunIntensity ?? 1.15}
                  onChange={(e) => patchEnv({ sunIntensity: Number(e.target.value) })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Sun color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.sunColor || '#fff4e0'}
                  onChange={(e) => patchEnv({ sunColor: e.target.value })}
                />
              </label>
              <p className="text-[10px] tracking-widest text-white/50 uppercase pt-2">Floor type</p>
              <select
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5"
                value={env.floor}
                onChange={(e) => patchEnv({ floor: e.target.value as FloorPreset })}
              >
                <option value="grid">Grid</option>
                <option value="solid">Solid</option>
                <option value="water">Water</option>
                <option value="void">Void (none)</option>
              </select>
              <label className="block text-xs text-white/60">
                Floor color
                <input
                  type="color"
                  className="mt-1 w-full h-9 bg-transparent"
                  value={env.floorColor}
                  onChange={(e) => patchEnv({ floorColor: e.target.value })}
                />
              </label>
              <label className="block text-xs text-white/60">
                Floor texture tile ({env.floorTextureScale ?? 40})
                <input
                  type="range"
                  min={4}
                  max={120}
                  step={1}
                  className="w-full"
                  value={env.floorTextureScale ?? 40}
                  onChange={(e) => patchEnv({ floorTextureScale: Number(e.target.value) })}
                />
              </label>
            </div>
          )}

          {tab === 'textures' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              <Button size="sm" className="w-full" onClick={() => texFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Upload texture
              </Button>
              <Button
                size="sm"
                variant={editTool === 'paint' ? 'default' : 'outline'}
                className={`w-full ${editTool === 'paint' ? 'bg-fuchsia-600 hover:bg-fuchsia-500' : ''}`}
                onClick={() => {
                  const url =
                    paintTextureUrl ||
                    selected?.textureUrl ||
                    env.defaultTextureUrl ||
                    BUILTIN_TEXTURES[0]?.url ||
                    null;
                  setPaintTextureUrl(url);
                  apiRef.current?.setPaintTexture(url);
                  setEditTool('paint');
                }}
              >
                <PaintBucket className="w-4 h-4 mr-1" /> Paint brush (release to paint)
              </Button>
              <p className="text-[10px] text-white/45 leading-snug">
                Pick a texture, drag a region on the atlas editor (if an object is selected), then
                paint or apply. Atlas selection sets UV offset + tile for multi-tile sheets.
              </p>
              {(paintTextureUrl ||
                selected?.textureUrl ||
                env.defaultTextureUrl ||
                BUILTIN_TEXTURES[0]?.url) && (
                <TextureAtlasPicker
                  imageUrl={
                    paintTextureUrl ||
                    selected?.textureUrl ||
                    env.defaultTextureUrl ||
                    BUILTIN_TEXTURES[0].url
                  }
                  repeat={selected?.textureRepeat ?? paintRepeat}
                  offset={selected?.textureOffset}
                  onChange={(uv) => {
                    setPaintRepeat(uv.repeat);
                    apiRef.current?.setPaintUv({
                      repeat: uv.repeat,
                      offset: uv.offset,
                    });
                    if (selected) {
                      patchSelected({
                        textureUrl:
                          selected.textureUrl ||
                          paintTextureUrl ||
                          env.defaultTextureUrl ||
                          undefined,
                        textureRepeat: uv.repeat,
                        textureOffset: uv.offset,
                      });
                    }
                  }}
                />
              )}
              <label className="block text-[10px] text-white/55">
                Paint UV tile ({paintRepeat[0].toFixed(1)} × {paintRepeat[1].toFixed(1)})
                <input
                  type="range"
                  min={0.25}
                  max={16}
                  step={0.25}
                  className="w-full"
                  value={paintRepeat[0]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setPaintRepeat([n, n]);
                    apiRef.current?.setPaintUv({ repeat: [n, n] });
                  }}
                />
              </label>
              <input
                ref={texFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = String(reader.result);
                    saveCustomTexture(f.name, dataUrl);
                    setCustomTextures(listCustomTextures());
                  };
                  reader.readAsDataURL(f);
                }}
              />
              <p className="text-[10px] text-white/40">Built-in</p>
              <div className="grid grid-cols-2 gap-2">
                {BUILTIN_TEXTURES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`rounded border p-1 hover:border-cyan-400 ${
                      paintTextureUrl === t.url && editTool === 'paint'
                        ? 'border-fuchsia-400'
                        : 'border-white/10'
                    }`}
                    onClick={() => {
                      setPaintTextureUrl(t.url);
                      apiRef.current?.setPaintTexture(t.url);
                      setEditTool('paint');
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (selected) patchSelected({ textureUrl: t.url });
                      else patchEnv({ defaultTextureUrl: t.url });
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.url} alt={t.name} className="w-full aspect-square object-cover rounded" />
                    <p className="text-[10px] mt-1 truncate">{t.name}</p>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/40">Uploaded</p>
              <div className="grid grid-cols-2 gap-2">
                {customTextures.map((t) => (
                  <div key={t.id} className="rounded border border-white/10 p-1 relative">
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => {
                        setPaintTextureUrl(t.dataUrl);
                        apiRef.current?.setPaintTexture(t.dataUrl);
                        setEditTool('paint');
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.dataUrl} alt={t.name} className="w-full aspect-square object-cover rounded" />
                      <p className="text-[10px] mt-1 truncate">{t.name}</p>
                    </button>
                    <button
                      type="button"
                      className="absolute top-1 right-1 w-5 h-5 rounded bg-black/70 text-red-300 text-xs"
                      onClick={() => {
                        deleteCustomTexture(t.id);
                        setCustomTextures(listCustomTextures());
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/40">
                Left-click texture = paint brush (release on model). Right-click = apply to selection /
                world default.
              </p>
            </div>
          )}

          {tab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <p className="text-xs font-bold text-cyan-300 tracking-wide uppercase">
                  {modeInfo.shortTitle} settings
                </p>
                <p className="text-[10px] text-white/45 mt-1 leading-snug">
                  Match timings for this map. Place mode entities from the bottom toolbar — they stay
                  invisible in Play Test / game.
                </p>
              </div>

              {gameMode === 'deathrun' && (
                <div className="space-y-3">
                  {(() => {
                    const s = ensureDeathrunSettings(doc);
                    const patch = (partial: Partial<typeof s>) => {
                      scheduleHistory();
                      setDoc((d) => {
                        const next = {
                          ...d,
                          modeSettings: {
                            ...d.modeSettings,
                            deathrun: { ...ensureDeathrunSettings(d), ...partial },
                          },
                        };
                        docRef.current = next;
                        apiRef.current?.setDoc(next);
                        return next;
                      });
                    };
                    return (
                      <>
                        <label className="block text-xs text-white/60">
                          Warmup ({s.warmupSec}s)
                          <input type="range" min={0} max={60} className="w-full" value={s.warmupSec}
                            onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Round time ({s.roundTimeSec}s)
                          <input type="range" min={30} max={600} step={10} className="w-full" value={s.roundTimeSec}
                            onChange={(e) => patch({ roundTimeSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Max runners ({s.maxRunners}) — place that many Runner Spawns
                          <input type="range" min={1} max={8} className="w-full" value={s.maxRunners}
                            onChange={(e) => patch({ maxRunners: Number(e.target.value) })} />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-white/70">
                          <input type="checkbox" checked={s.trapperEnabled}
                            onChange={(e) => patch({ trapperEnabled: e.target.checked })} />
                          Trapper enabled
                        </label>
                        <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2">
                          Entities: Runner Spawn ×{s.maxRunners}, Trapper, Light, Button, Trap, Death,
                          Door, Jump pad, Finish, Action
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}

              {gameMode === 'horde' && (
                <div className="space-y-3">
                  {(() => {
                    const s = ensureHordeSettings(doc);
                    const patch = (partial: Partial<typeof s>) => {
                      scheduleHistory();
                      setDoc((d) => {
                        const next = {
                          ...d,
                          modeSettings: {
                            ...d.modeSettings,
                            horde: { ...ensureHordeSettings(d), ...partial },
                          },
                        };
                        docRef.current = next;
                        apiRef.current?.setDoc(next);
                        return next;
                      });
                    };
                    return (
                      <>
                        <label className="block text-xs text-white/60">
                          Warmup ({s.warmupSec}s)
                          <input type="range" min={0} max={60} className="w-full" value={s.warmupSec}
                            onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Wave time ({s.waveTimeSec}s)
                          <input type="range" min={30} max={300} step={5} className="w-full" value={s.waveTimeSec}
                            onChange={(e) => patch({ waveTimeSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Intermission ({s.intermissionSec}s)
                          <input type="range" min={5} max={60} className="w-full" value={s.intermissionSec}
                            onChange={(e) => patch({ intermissionSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Max players ({s.maxPlayers})
                          <input type="range" min={1} max={4} className="w-full" value={s.maxPlayers}
                            onChange={(e) => patch({ maxPlayers: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Starting wave ({s.startingWave})
                          <input type="range" min={1} max={20} className="w-full" value={s.startingWave}
                            onChange={(e) => patch({ startingWave: Number(e.target.value) })} />
                        </label>
                        <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2">
                          Entities: Player Spawn ×{s.maxPlayers}, Enemy Spawn, Death, Light, Door
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}

              {gameMode === 'competitive' && (
                <div className="space-y-3">
                  {(() => {
                    const s = ensureCompetitiveSettings(doc);
                    const patch = (partial: Partial<typeof s>) => {
                      scheduleHistory();
                      setDoc((d) => {
                        const next = {
                          ...d,
                          modeSettings: {
                            ...d.modeSettings,
                            competitive: { ...ensureCompetitiveSettings(d), ...partial },
                          },
                        };
                        docRef.current = next;
                        apiRef.current?.setDoc(next);
                        return next;
                      });
                    };
                    return (
                      <>
                        <label className="block text-xs text-white/60">
                          Warmup ({s.warmupSec}s)
                          <input type="range" min={0} max={60} className="w-full" value={s.warmupSec}
                            onChange={(e) => patch({ warmupSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Buy / shop time ({s.buyTimeSec}s)
                          <input type="range" min={5} max={60} className="w-full" value={s.buyTimeSec}
                            onChange={(e) => patch({ buyTimeSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Round time ({s.roundTimeSec}s)
                          <input type="range" min={30} max={300} step={5} className="w-full" value={s.roundTimeSec}
                            onChange={(e) => patch({ roundTimeSec: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Rounds ({s.roundCount})
                          <input type="range" min={1} max={12} className="w-full" value={s.roundCount}
                            onChange={(e) => patch({ roundCount: Number(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-white/60">
                          Overtime ({s.overtimeSec}s)
                          <input type="range" min={0} max={120} step={5} className="w-full" value={s.overtimeSec}
                            onChange={(e) => patch({ overtimeSec: Number(e.target.value) })} />
                        </label>
                        <p className="text-[10px] text-white/45 leading-snug rounded-lg border border-white/10 bg-black/30 p-2">
                          Entities: Player A Spawn, Player B Spawn, Light, Door, Death
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
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
                  <p>· <b className="text-white">Player Model</b> = platform avatar (not map spawn)</p>
                  <p>· <b className="text-white">Hammer (H)</b> solids: Material + size in Properties</p>
                  <p>· <b className="text-white">Textures</b> tab: drag atlas region · paint brush</p>
                  <p>· <b className="text-white">Ctrl</b> free fly · <b className="text-white">G</b> snap · <b className="text-white">W/E/R</b> gizmo</p>
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
                        setTab('layers');
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
              title="Hammer++ (H) — place resizable solid boxes; hold-drag to paint; Scale to size"
            >
              <Hammer className="w-4 h-4 text-amber-300" />
            </ToolBtn>
            <ToolBtn
              active={editTool === 'paint'}
              onClick={() => {
                setEditTool('paint');
                if (freeFly) apiRef.current?.setFreeFly(false);
                setTab('textures');
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
            <ToolBtn active={mode === 'translate'} onClick={() => setMode('translate')} title="Move (W)">
              <Move3d className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={mode === 'rotate'} onClick={() => setMode('rotate')} title="Rotate (E)">
              <RotateCcw className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={mode === 'scale'} onClick={() => setMode('scale')} title="Scale (R)">
              <Maximize2 className="w-4 h-4" />
            </ToolBtn>
            <div className="w-px h-6 bg-white/15 mx-1" />
            <ToolBtn active={gridSnap} onClick={() => setGridSnap((v) => !v)} title="Grid snap XZ (G)">
              <Grid3x3 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={snapY} onClick={() => setSnapY((v) => !v)} title="Also snap Y height">
              <span className="text-[10px] font-bold">Y</span>
            </ToolBtn>
            <ToolBtn
              onClick={() => {
                const ok = apiRef.current?.snapSelectedToFloor(
                  selectedIds.length ? selectedIds : selectedId ? [selectedId] : undefined
                );
                toast({
                  title: ok ? 'Snapped to floor' : 'Select an object first',
                  description: ok
                    ? 'Object sits on the floor / surface under it (not below 0).'
                    : undefined,
                });
              }}
              title="Snap selection to floor top"
            >
              <Magnet className="w-4 h-4 text-emerald-300" />
            </ToolBtn>
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
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={doc.gridSize}
              className="w-14 bg-black/50 border border-white/10 rounded px-1 py-0.5 text-xs"
              onChange={(e) => {
                const n = Math.max(0.25, Number(e.target.value) || 1);
                setDoc((d) => ({ ...d, gridSize: n }));
                apiRef.current?.setGridSize(n);
              }}
            />
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
                  onClick={() => armPlaceEntity('red_zone')}
                  title="Death zone"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('health_floor')}
                  title="Health floor"
                >
                  <Heart className="w-4 h-4 text-emerald-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('revive_pad')}
                  title="Revive pad"
                >
                  <HeartPulse className="w-4 h-4 text-sky-400" />
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
                  <Flag className="w-4 h-4 text-orange-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('hazard')}
                  title="Death"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => armPlaceEntity('door')}
                  title="Door"
                >
                  <Box className="w-4 h-4 text-violet-200" />
                </ToolBtn>
              </>
            )}
            <ToolBtn
              active={tpsViewOpen}
              onClick={() => (tpsViewOpen ? setTpsViewOpen(false) : openTpsViewStudio())}
              title="3rd View — camera / crosshair / player"
            >
              <Eye className="w-4 h-4 text-violet-300" />
            </ToolBtn>
            <ToolBtn
              active={playerStudioOpen}
              onClick={() => (playerStudioOpen ? setPlayerStudioOpen(false) : openPlayerStudio())}
              title="Player Model studio"
            >
              <PersonStanding className="w-4 h-4 text-sky-300" />
            </ToolBtn>
            <ToolBtn
              active={modelEditorOpen}
              onClick={() => (modelEditorOpen ? setModelEditorOpen(false) : openModelEditor())}
              title="Model Editor — skins, hats, gear"
            >
              <Shirt className="w-4 h-4 text-amber-300" />
            </ToolBtn>
            <ToolBtn
              onClick={() => armPlaceEntity('light')}
              title="Light bulb"
            >
              <Lightbulb className="w-4 h-4 text-amber-200" />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.duplicateSelected()} title="Duplicate">
              <Copy className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              disabled={selectedIds.length < 2}
              onClick={() => {
                const ids =
                  selectedIds.length >= 2
                    ? selectedIds
                    : selectedId
                      ? [selectedId, ...selectedIds.filter((id) => id !== selectedId)]
                      : selectedIds;
                const ok = apiRef.current?.snapSelectedTogether(ids);
                if (ok) {
                  toast({
                    title: 'Snapped together',
                    description: 'Edge-to-edge in a line, shared bottom height.',
                  });
                } else {
                  toast({
                    title: 'Select 2 objects first',
                    description: 'Click one, then Shift+click another, then press magnet.',
                    variant: 'destructive',
                  });
                }
              }}
              title={
                selectedIds.length >= 2
                  ? 'Snap (magnet) — join closest faces (side or stack)'
                  : 'Snap (magnet) — Shift+click 2+ objects, then press'
              }
            >
              <Magnet
                className={`w-4 h-4 ${
                  selectedIds.length >= 2 ? 'text-emerald-300' : 'text-white/30'
                }`}
              />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.deleteSelected()} title="Delete">
              <Trash2 className="w-4 h-4 text-red-300" />
            </ToolBtn>
          </div>
          )}

          {!uiCollapsed && selected && !propsOpen && !playerStudioOpen && !modelEditorOpen && !tpsViewOpen && (
            <button
              type="button"
              onClick={() => setPropsOpen(true)}
              className="absolute top-3 right-3 z-[80] flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/30 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            >
              Props
            </button>
          )}

          {!uiCollapsed && selected && propsOpen && !playerStudioOpen && !modelEditorOpen && !tpsViewOpen && (
            <div
              className={`absolute z-[80] bg-black/80 border border-white/15 rounded-xl p-3 backdrop-blur space-y-2 text-sm overflow-y-auto ${
                isMobile
                  ? 'left-3 right-3 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] top-auto max-h-[42vh] w-auto overscroll-contain'
                  : 'top-3 right-3 w-72 max-h-[calc(100%-6rem)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">Properties</p>
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

              {/* Type label — never a confusing Kind dropdown for hammer / markers / player */}
              {isHammerSolidEntity(selected) ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Hammer solid
                  </p>
                  <p className="text-[10px] text-white/55 leading-snug">
                    Solid brush block — set Material + size. No model upload.
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
                  <label className="block text-xs text-white/60">
                    Upload animated GLB
                    <input
                      type="file"
                      accept=".glb,.gltf,model/gltf-binary"
                      className="mt-0.5 w-full text-[10px]"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          patchSelected({
                            customModelUrl: String(reader.result),
                            model: undefined,
                            name: selected.name || f.name.replace(/\.(glb|gltf)$/i, ''),
                          });
                        };
                        reader.readAsDataURL(f);
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
                  onWireTrap={wireTrapToButton}
                  onOpenPlayerStudio={openPlayerStudio}
                />
              )}

              {/* Interaction: anim / damage / push on props, traps, doors — not hammer / markers */}
              {!isHammerSolidEntity(selected) &&
                (selected.kind === 'prop' ||
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
                        patchSelected({
                          ...patchCollideMaterial(selected, material),
                          ...(material === 'walkthrough'
                            ? { jumpPad: { ...ensureJumpPad(selected), enabled: false } }
                            : {}),
                        });
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

                  {isHammerSolidEntity(selected) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200">
                        Solid size
                      </p>
                      <p className="text-[10px] text-white/55">
                        Or use Scale (R) in the viewport. Collision matches these dimensions.
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {(['W', 'H', 'D'] as const).map((axis, i) => (
                          <label key={axis} className="text-[9px] text-white/50">
                            {axis}
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              className="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-xs"
                              value={Number(
                                (selected.collisionSize?.[i] ?? [2, 0.25, 2][i]).toFixed(2)
                              )}
                              onChange={(e) => {
                                const next: [number, number, number] = [
                                  ...(selected.collisionSize ?? [2, 0.25, 2]),
                                ] as [number, number, number];
                                next[i] = Math.max(0.1, Number(e.target.value) || 0.1);
                                patchSelected({ collisionSize: next, scale: [1, 1, 1] });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isHammerSolidEntity(selected) && (
                  <>
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
                  )}
                  </>
                  )}
                </div>
              )}

              {selected.kind === 'spawn_monster' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-rose-300/80 uppercase">
                    Monster spawn
                  </p>
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
                              | 'boss',
                          },
                        })
                      }
                    >
                      <option value="basic">Basic</option>
                      <option value="fast">Fast</option>
                      <option value="brute">Brute</option>
                      <option value="boss">Boss</option>
                    </select>
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
                    <Lightbulb className="w-3.5 h-3.5 text-amber-200" /> Light bulb
                  </p>
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
                  <p className="text-[10px] text-white/40">
                    Lights are visual in editor + match overlay (client-side).
                  </p>
                </div>
              )}

              {/* Death / trap damage — not for spawn markers, lights, player, hammer solids */}
              {!isInvisibleMarkerKind(selected.kind) &&
                !isPlatformPlayerKind(selected.kind) &&
                !isHammerSolidEntity(selected) &&
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
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  className="w-full"
                  value={selected.opacity ?? 1}
                  onChange={(e) => patchSelected({ opacity: Number(e.target.value) })}
                />
              </label>
              )}
              <label className="block text-xs text-white/60">
                Color
                <input
                  type="color"
                  className="mt-0.5 w-full h-8 bg-transparent"
                  value={selected.color ?? '#ffffff'}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                />
              </label>
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
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = String(reader.result);
                      saveCustomTexture(f.name, dataUrl);
                      setCustomTextures(listCustomTextures());
                      patchSelected({ textureUrl: dataUrl });
                      toast({ title: 'Texture applied to object' });
                    };
                    reader.readAsDataURL(f);
                    e.target.value = '';
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
                  Texture tile X ({(selected.textureRepeat?.[0] ?? 1).toFixed(2)})
                  <input
                    type="range"
                    min={0.25}
                    max={16}
                    step={0.25}
                    className="w-full"
                    value={selected.textureRepeat?.[0] ?? 1}
                    onChange={(e) => {
                      const x = Number(e.target.value);
                      const y = selected.textureRepeat?.[1] ?? x;
                      patchSelected({ textureRepeat: [x, y] });
                    }}
                  />
                </label>
                <label className="block text-[10px] text-white/55">
                  Texture tile Y ({(selected.textureRepeat?.[1] ?? 1).toFixed(2)})
                  <input
                    type="range"
                    min={0.25}
                    max={16}
                    step={0.25}
                    className="w-full"
                    value={selected.textureRepeat?.[1] ?? 1}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      const x = selected.textureRepeat?.[0] ?? y;
                      patchSelected({ textureRepeat: [x, y] });
                    }}
                  />
                </label>
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

          {tpsViewOpen && (
            <TpsViewStudio
              isMobile={isMobile}
              onClose={() => setTpsViewOpen(false)}
              onPlayTest={() => {
                setTpsViewOpen(false);
                startPlay();
              }}
              mapDoc={doc}
              mapOverride={doc.tpsView ? sanitizeTpsView(doc.tpsView) : null}
              onSaveToMap={saveTpsToMap}
              playerEntity={playerAvatar}
              onChangePlayer={(patch) => {
                if (!playerAvatar) {
                  openPlayerStudio();
                  return;
                }
                patchEntityById(playerAvatar.id, patch);
              }}
              onOpenFullPlayerStudio={() => {
                setTpsViewOpen(false);
                openPlayerStudio();
              }}
            />
          )}
          {playerStudioOpen && playerAvatar && (
            <PlayerModelStudio
              entity={playerAvatar}
              isMobile={isMobile}
              onClose={() => setPlayerStudioOpen(false)}
              onChange={(patch) => patchEntityById(playerAvatar.id, patch)}
            />
          )}
          {modelEditorOpen && playerAvatar && (
            <ModelSkinEditor
              entity={playerAvatar}
              isMobile={isMobile}
              onClose={() => setModelEditorOpen(false)}
              onApplyToPlayer={applySkinsToPlayer}
              onPublishToShop={async (payload) => {
                try {
                  // Ensure Mongo has skin fields before first publish
                  await adminSyncDatabaseSchema().catch(() => null);
                  await adminUpsertStoreItem({
                    itemName: payload.itemName,
                    itemCategory: payload.itemCategory,
                    itemSku: payload.itemSku,
                    vpPrice: payload.vpPrice,
                    imageUrl: payload.imageUrl,
                    cosmeticSlot: payload.cosmeticSlot,
                    cosmeticConfig: payload.cosmeticConfig,
                  });
                  toast({
                    title: 'Skin published to shop',
                    description: `${payload.itemName} is now in Skins.`,
                  });
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : 'Publish failed';
                  toast({ title: msg, variant: 'destructive' });
                }
              }}
            />
          )}
        </div>
      </div>
      {playTest && (
        <div className="fixed inset-0 z-[10050]">
          <MapPlayPreview
            doc={apiRef.current?.getDoc() ?? doc}
            onClose={exitPlayTest}
          />
        </div>
      )}
    </div>,
    document.body
  );
}

function ToolBtn({
  children,
  active,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
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
}

export default MapEditor;
