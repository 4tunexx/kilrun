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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import type { EditorEntity, FloorPreset, MapDocument, SkyPreset } from './map-document';
import {
  ensureAnimation,
  ensureEnvironment,
  ensureHazard,
  ensureHealthFloor,
  ensureJumpPad,
  ensureLight,
  ensureMonsterSpawn,
  ensureRedZone,
  ensureRevive,
  ensureSurface,
  ensureTeleport,
  ensureWaveAnchor,
  entityExportsAsPlatform,
  entityKindLabel,
  entityKindsForMode,
  findPlayerEntity,
  generateId,
  getMapGameMode,
} from './map-document';
import { KILRUN_MODE_INFO } from '@/lib/game-modes';
import { PROTOTYPE_MODELS, previewUrl } from './prototype-catalog';
import {
  ensureStarterMap,
  exportJson,
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
  type EditorViewportApi,
  type TransformMode,
} from './editor-viewport';
import { MapPlayPreview } from './map-play-preview';
import { PlayerModelStudio } from './player-model-studio';
import { ModelSkinEditor } from './model-skin-editor';
import { ensureMapPlayerEntity } from './player-avatar';
import type { SkinAttachment } from '@/lib/player-skins';
import { adminUpsertStoreItem } from '@/lib/social-actions';
import { adminSyncDatabaseSchema } from '@/lib/admin-db-sync';
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
  bakeStairsToPads,
  deletePrefab,
  getActivePlayMapIdForMode,
  instantiatePrefab,
  listPrefabs,
  savePrefab,
  setActivePlayMapIdForMode,
  type PrefabStamp,
} from './prefab-storage';
import { formatValidationSummary, validateMapForPublish } from './map-validate';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';

type SidebarTab = 'assets' | 'layers' | 'outliner' | 'world' | 'textures' | 'prefabs' | 'help';

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

  const starter = useMemo(() => {
    if (initialMapId) {
      const loaded = loadMap(initialMapId);
      if (loaded) return { id: initialMapId, doc: loaded };
    }
    return ensureStarterMap();
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
  const [toolsOpen, setToolsOpen] = useState(!mobileFirst);
  const [playerStudioOpen, setPlayerStudioOpen] = useState(false);
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [showAllCollisionGizmos, setShowAllCollisionGizmos] = useState(false);
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
  const maps = listMaps();

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
      },
      onFreeFlyChange: setFreeFly,
      onMeasureChange: setMeasureDist,
      onPlaceResult: (result, layerName) => {
        if (result === 'locked') {
          toast({
            title: 'Build level locked',
            description: `“${layerName ?? 'This level'}” is locked — unlock it in Layers, or Build here on another level.`,
            variant: 'destructive',
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
    toast({
      title: `“${doc.name}” is Active ${modeInfo.shortTitle} map`,
      description:
        gameMode === 'deathrun'
          ? 'Rejoin Deathrun lobby/countdown so platforms reload for the match.'
          : `${modeInfo.title} will load this map when that mode goes live.`,
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
  const dirty = isDirty();

  const clearHistory = () => {
    undoStack.current = [];
    redoStack.current = [];
    historyAnchor.current = null;
    setCanUndo(false);
    setCanRedo(false);
  };

  const markClean = (next: MapDocument) => {
    lastSavedRef.current = snapshotMapDoc(next);
  };

  const persist = (opts?: { quiet?: boolean }) => {
    try {
      const next = workingDoc();
      const liveThumb = apiRef.current?.captureThumbnail() ?? null;
      saveMap(mapId, next, { thumbnailDataUrl: liveThumb });
      setDoc(next);
      docRef.current = next;
      markClean(next);
      void import('./map-thumbnail').then(({ ensureMapThumbnail }) =>
        ensureMapThumbnail(mapId, { force: true })
      );
      if (!opts?.quiet) {
        toast({ title: 'Map saved', description: `“${next.name}” stored in this browser.` });
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

      if (e.key === 'w' || e.key === 'W') {
        if (!freeFly) setMode('translate');
      }
      if ((e.key === 'e' || e.key === 'E') && !freeFly) setMode('rotate');
      if ((e.key === 'r' || e.key === 'R') && !freeFly) setMode('scale');
      if ((e.key === 'v' || e.key === 'V') && !freeFly) setEditTool('select');
      if ((e.key === 'b' || e.key === 'B') && !freeFly) {
        setEditTool('brush');
        if (!brush) setBrush('floor-square');
      }
      if (e.key === 'g' || e.key === 'G') setGridSnap((v) => !v);
      if (e.key === 'f' || e.key === 'F') apiRef.current?.focusSelected();
      if (e.key === 'Delete' || e.key === 'Backspace') apiRef.current?.deleteSelected();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const axis = e.shiftKey ? 'z' : 'x';
        apiRef.current?.duplicateSelected(axis);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
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
    () => doc.layers.slice().sort((a, b) => a.order - b.order),
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

  const openPlayerStudio = () => {
    const ensured = ensureMapPlayerEntity(docRef.current);
    if (ensured.created) {
      scheduleHistory();
      setDoc(ensured.doc);
      docRef.current = ensured.doc;
      apiRef.current?.setDoc(ensured.doc);
      toast({
        title: 'Player avatar added',
        description: 'Configure model and animations in the studio panel.',
      });
    }
    setSelectedId(ensured.entity.id);
    apiRef.current?.setSelectedId(ensured.entity.id);
    setModelEditorOpen(false);
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
    setSelectedId(ensured.entity.id);
    apiRef.current?.setSelectedId(ensured.entity.id);
    setPlayerStudioOpen(false);
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
      const entities = d.entities.map((e) =>
        e.id === player.id ? { ...e, playerSkins: attachments } : e
      );
      const next = { ...d, entities };
      docRef.current = next;
      apiRef.current?.setDoc(next);
      return next;
    });
    toast({ title: 'Skins applied to player avatar' });
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

  const startPlay = () => {
    if (freeFly) apiRef.current?.setFreeFly(false);
    // Snapshot camera so Exit restores the exact map view you left
    cameraBeforePlayRef.current = apiRef.current?.getCameraState() ?? null;
    apiRef.current?.setPaused(true);
    // Ensure a player avatar exists so Play Test can show 3rd-person character
    const ensured = ensureMapPlayerEntity(docRef.current);
    if (ensured.created) {
      setDoc(ensured.doc);
      docRef.current = ensured.doc;
      apiRef.current?.setDoc(ensured.doc);
    }
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
          <div
            ref={touchLayerRef}
            className="fixed inset-0 z-[50] touch-none"
            style={{ pointerEvents: freeFly ? 'auto' : 'none' }}
          />
          <div className="fixed inset-0 z-[51] pointer-events-none">
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
                onClick={() => apiRef.current?.placeSpawn('start')}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-400/60 bg-emerald-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
              >
                <Flag className="w-4 h-4" />
                Start
              </button>
              {gameMode === 'deathrun' && (
                <button
                  type="button"
                  onClick={() => apiRef.current?.placeSpawn('finish')}
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
                    onClick={() => apiRef.current?.placeSpawn('spawn_team_a')}
                    className="flex items-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-500/35 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95 min-h-11"
                  >
                    <Flag className="w-4 h-4" />
                    Team A
                  </button>
                  <button
                    type="button"
                    onClick={() => apiRef.current?.placeSpawn('spawn_team_b')}
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
                  onClick={() => apiRef.current?.placeSpawn('spawn_monster')}
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
              apiRef.current?.placeSpawn('start');
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
                apiRef.current?.placeSpawn('finish');
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
          onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
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
            const withEnv = { ...loaded, environment: ensureEnvironment(loaded) };
            setMapId(id);
            setDoc(withEnv);
            docRef.current = withEnv;
            markClean(withEnv);
            clearHistory();
            apiRef.current?.setDoc(withEnv);
            setActivePlayId(getActivePlayMapIdForMode(getMapGameMode(withEnv)));
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
          variant={playerStudioOpen ? 'default' : 'secondary'}
          className={`shrink-0 ${playerStudioOpen ? 'bg-sky-600 hover:bg-sky-500 text-white' : ''}`}
          onClick={() => (playerStudioOpen ? setPlayerStudioOpen(false) : openPlayerStudio())}
          title="Player Model studio — inspect avatar & bind animations"
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
              const withEnv = { ...parsed, environment: ensureEnvironment(parsed) };
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
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className={`text-xs px-2 py-1.5 rounded border flex items-center justify-center gap-1 ${
                      editTool === 'select'
                        ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                        : 'border-white/10 text-white/50'
                    }`}
                    onClick={() => setEditTool('select')}
                    title="Select objects (V) — click without placing"
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
                      if (!brush) setBrush('floor-square');
                    }}
                    title="Brush paint (B) — click ground to place"
                  >
                    <Paintbrush className="w-3 h-3" />
                    Brush
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
                      setEditTool('brush');
                      // Free the canvas after picking a brush on mobile.
                      if (isMobile) {
                        setSidebarOpen(false);
                        setUiCollapsed(true);
                      }
                    }}
                    className={`rounded border p-1 text-left ${
                      brush === name && editTool === 'brush'
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
                {editTool === 'brush'
                  ? 'Brush: click ground to paint. Click same model to select it. Alt+click stacks on top (Alt+drag = box select).'
                  : 'Select: click objects to pick them. Pick a model or Brush to paint.'}{' '}
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
              {doc.entities.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(e.id);
                    apiRef.current?.setSelectedId(e.id);
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
            </div>
          )}

          {tab === 'prefabs' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              <p className="text-[10px] tracking-widest text-white/50 uppercase">Prefabs / Stamps</p>
              <p className="text-[11px] text-white/55 leading-relaxed">
                Shift+click to multi-select ({selectedIds.length || (selectedId ? 1 : 0)} selected),
                save as a stamp, then click ground to place copies.
              </p>
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
            </div>
          )}

          {tab === 'textures' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              <Button size="sm" className="w-full" onClick={() => texFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Upload texture
              </Button>
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
                    className="rounded border border-white/10 p-1 hover:border-cyan-400"
                    onClick={() => {
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
                        if (selected) patchSelected({ textureUrl: t.dataUrl });
                        else patchEnv({ defaultTextureUrl: t.dataUrl });
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
                With a selection: applies to that prop. No selection: sets world default texture.
              </p>
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

          {showHelp && !freeFly && !uiCollapsed && (
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
                  <p>· <b className="text-white">Select (V)</b> picks objects · <b className="text-white">Brush (B)</b> paints</p>
                  <p>· Build by <b className="text-white">Level</b>: Floor 0 → Props 1; eye toggles visibility</p>
                  <p>· Pick a model to arm Brush, click ground to place (drag = orbit)</p>
                  <p>· Same model click selects it · <b className="text-white">Alt+click</b> stacks</p>
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
            {editTool === 'brush' && brush
              ? ` · brush: ${brush}`
              : editTool === 'brush'
                ? ' · brush (pick a model)'
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
              className={`absolute z-[80] flex items-center gap-1 max-w-[min(92vw,28rem)] overflow-x-auto rounded-xl border border-white/15 bg-black/75 px-1.5 py-1 backdrop-blur ${
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
            className="absolute bottom-3 left-3 z-[80] flex items-center gap-1 rounded-xl border border-white/20 bg-black/75 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur active:scale-95"
            title={toolsOpen ? 'Hide tool bar' : 'Show tool bar'}
          >
            {toolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            Tools
          </button>
          )}

          {!uiCollapsed && toolsOpen && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 border border-white/15 rounded-xl px-2 py-1.5 backdrop-blur z-[80] max-w-[calc(100vw-7rem)] overflow-x-auto">
            <ToolBtn
              active={editTool === 'select'}
              onClick={() => setEditTool('select')}
              title="Select (V) — click objects without placing"
            >
              <MousePointer2 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn
              active={editTool === 'brush'}
              onClick={() => {
                setEditTool('brush');
                if (!brush) setBrush('floor-square');
              }}
              title={
                brush
                  ? `Brush paint (B) — place ${brush}. Alt+click stacks on same model.`
                  : 'Brush paint (B) — pick a model in Assets'
              }
            >
              <Paintbrush className="w-4 h-4" />
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
            <ToolBtn onClick={() => apiRef.current?.placeSpawn('start')} title="Start (player spawn)">
              <Flag className="w-4 h-4 text-emerald-400" />
            </ToolBtn>
            {gameMode === 'deathrun' && (
              <>
                <ToolBtn onClick={() => apiRef.current?.placeSpawn('finish')} title="Finish (touch to win)">
                  <FlagTriangleRight className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn onClick={() => apiRef.current?.placeSpawn('spawn_trapper')} title="Trapper spawn">
                  <Flag className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('button', brush ?? undefined)}
                  title="Button entity"
                >
                  <CircleDot className="w-4 h-4 text-amber-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('trap', brush ?? 'target-a-square')}
                  title="Trap (link from button)"
                >
                  <Zap className="w-4 h-4 text-violet-300" />
                </ToolBtn>
                <ToolBtn
                  onClick={() =>
                    apiRef.current?.placeEntity('hazard', brush ?? 'floor-square')
                  }
                  title="Death zone"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
              </>
            )}
            {gameMode === 'horde' && (
              <>
                <ToolBtn
                  onClick={() => apiRef.current?.placeSpawn('spawn_monster')}
                  title="Monster spawn"
                >
                  <Bug className="w-4 h-4 text-rose-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('red_zone', brush ?? 'floor-square')}
                  title="Red zone"
                >
                  <Skull className="w-4 h-4 text-red-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('health_floor', brush ?? 'floor-square')}
                  title="Health floor"
                >
                  <Heart className="w-4 h-4 text-emerald-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('revive_pad', brush ?? 'floor-square')}
                  title="Revive pad"
                >
                  <HeartPulse className="w-4 h-4 text-sky-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeEntity('wave_anchor')}
                  title="Wave anchor"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                </ToolBtn>
              </>
            )}
            {gameMode === 'competitive' && (
              <>
                <ToolBtn
                  onClick={() => apiRef.current?.placeSpawn('spawn_team_a')}
                  title="Team A spawn"
                >
                  <Flag className="w-4 h-4 text-sky-400" />
                </ToolBtn>
                <ToolBtn
                  onClick={() => apiRef.current?.placeSpawn('spawn_team_b')}
                  title="Team B spawn"
                >
                  <Flag className="w-4 h-4 text-orange-400" />
                </ToolBtn>
              </>
            )}
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
              onClick={() => apiRef.current?.placeEntity('player', brush ?? 'figurine')}
              title="Place player entity in map"
            >
              <User className="w-4 h-4 text-sky-300" />
            </ToolBtn>
            <ToolBtn
              onClick={() => apiRef.current?.placeEntity('light')}
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
          </div>
          )}

          {!uiCollapsed && selected && !propsOpen && !playerStudioOpen && !modelEditorOpen && (
            <button
              type="button"
              onClick={() => setPropsOpen(true)}
              className="absolute top-3 right-3 z-[80] flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/30 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            >
              Props
            </button>
          )}

          {!uiCollapsed && selected && propsOpen && !playerStudioOpen && !modelEditorOpen && (
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
              <label className="block text-xs text-white/60">
                Kind
                <select
                  className="mt-0.5 w-full bg-black/40 border border-white/10 rounded px-2 py-1"
                  value={selected.kind}
                  onChange={(e) =>
                    patchSelected({ kind: e.target.value as EditorEntity['kind'] })
                  }
                >
                  {kindOptions.map((k) => (
                    <option key={k} value={k}>
                      {entityKindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>

              {selected.kind !== 'light' && (
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

              {selected.kind !== 'light' && (
                <AnimationPropsPanel
                  entity={selected}
                  allEntities={doc.entities}
                  onChange={patchSelected}
                  onPreview={(which) => apiRef.current?.previewAnim(which)}
                  onWireTrap={wireTrapToButton}
                  onOpenPlayerStudio={openPlayerStudio}
                />
              )}

              {/* Gameplay: solid / jump pad / damage */}
              {selected.kind !== 'light' &&
                selected.kind !== 'spawn_runner' &&
                selected.kind !== 'spawn_trapper' &&
                selected.kind !== 'start' && (
                <div className="space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] tracking-widest text-white/50 uppercase">
                    Gameplay
                  </p>
                  {selected.kind === 'finish' && (
                    <p className="text-[10px] text-amber-200/80">
                      Runners finish when they step on or touch this volume.
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={entityExportsAsPlatform(selected)}
                      onChange={(e) =>
                        patchSelected({
                          solid: e.target.checked,
                          ...(e.target.checked
                            ? {}
                            : { jumpPad: { ...ensureJumpPad(selected), enabled: false } }),
                        })
                      }
                    />
                    Solid (players can stand on it)
                  </label>
                  <p className="text-[10px] text-white/40">
                    Floors/checkpoints are thin top pads. Tall solids (walls/columns) also block
                    sideways. Turn on for crates/props you want walkable or blocking.
                  </p>

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={ensureJumpPad(selected).enabled}
                      onChange={(e) => {
                        const jp = ensureJumpPad(selected);
                        patchSelected({
                          jumpPad: { ...jp, enabled: e.target.checked },
                          solid: e.target.checked ? true : selected.solid,
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
                            solid: true,
                          })
                        }
                      />
                    </label>
                  )}

                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={!!ensureSurface(selected).ice}
                      onChange={(e) =>
                        patchSelected({
                          surface: { ...ensureSurface(selected), ice: e.target.checked },
                          solid: true,
                        })
                      }
                    />
                    Ice (slippery)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input
                      type="checkbox"
                      checked={!!ensureSurface(selected).conveyor}
                      onChange={(e) =>
                        patchSelected({
                          surface: { ...ensureSurface(selected), conveyor: e.target.checked },
                          solid: true,
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
                            solid: true,
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

                  {(selected.model?.includes('stair') || selected.model?.includes('ramp')) && (
                    <button
                      type="button"
                      className="w-full text-xs py-2 rounded-lg bg-violet-600/35 hover:bg-violet-500/45 font-semibold"
                      onClick={() => {
                        const pads = bakeStairsToPads(selected, 8);
                        scheduleHistory();
                        setDoc((d) => {
                          const next = { ...d, entities: [...d.entities, ...pads] };
                          apiRef.current?.setDoc(next);
                          return next;
                        });
                        toast({
                          title: `Baked ${pads.length} stair pads`,
                          description: 'Thin solid steps added for climbable collision.',
                        });
                      }}
                    >
                      Bake stairs → solid steps
                    </button>
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

              {selected.kind !== 'light' &&
                selected.kind !== 'start' &&
                selected.kind !== 'finish' &&
                selected.kind !== 'spawn_runner' &&
                selected.kind !== 'spawn_trapper' && (
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
              <label className="block text-xs text-white/60">
                Color
                <input
                  type="color"
                  className="mt-0.5 w-full h-8 bg-transparent"
                  value={selected.color ?? '#ffffff'}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                />
              </label>
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
              {selected.textureUrl && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => patchSelected({ textureUrl: undefined })}
                >
                  Clear texture override
                </Button>
              )}
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

          {playerStudioOpen && playerAvatar && (
            <PlayerModelStudio
              entity={playerAvatar}
              isMobile={isMobile}
              onClose={() => setPlayerStudioOpen(false)}
              onFocusInMap={() => {
                setSelectedId(playerAvatar.id);
                apiRef.current?.setSelectedId(playerAvatar.id);
                apiRef.current?.focusSelected();
              }}
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
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        active ? 'bg-cyan-500/30 text-cyan-200' : 'text-white/70 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export default MapEditor;
