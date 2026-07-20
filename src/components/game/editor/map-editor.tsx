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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import type { EditorEntity, FloorPreset, MapDocument, SkyPreset } from './map-document';
import { ensureAnimation, ensureEnvironment, ensureHazard, generateId } from './map-document';
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
import { createEditorViewport, type EditorViewportApi, type TransformMode } from './editor-viewport';
import { MapPlayPreview } from './map-play-preview';
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
  getActivePlayMapId,
  instantiatePrefab,
  listPrefabs,
  savePrefab,
  setActivePlayMapId,
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
  const [brush, setBrush] = useState<string | null>('floor-square');
  const [mode, setMode] = useState<TransformMode>('translate');
  const [gridSnap, setGridSnap] = useState(true);
  const [query, setQuery] = useState('');
  const [activeLayerId, setActiveLayerId] = useState(starter.doc.layers[0]?.id ?? '');
  const [freeFly, setFreeFly] = useState(false);
  const [playTest, setPlayTest] = useState(false);
  const [customTextures, setCustomTextures] = useState<CustomTexture[]>([]);
  const [snapY, setSnapY] = useState(false);
  const isMobile = useIsMobile();
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
    setActivePlayId(getActivePlayMapId());
  }, []);

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
    });
    apiRef.current = api;
    api.setBrush(brush);
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
      alert(`Cannot publish:\n\n${formatValidationSummary(issues)}`);
      return;
    }
    if (issues.length) {
      const ok = confirm(
        `${formatValidationSummary(issues)}\n\nPublish anyway?`
      );
      if (!ok) return;
    }
    persist();
    setActivePlayMapId(mapId);
    setActivePlayId(mapId);
    alert(
      `“${doc.name}” is now the MAIN Deathrun map.\nPress Play → Deathrun and the match will load this map.`
    );
  };

  const workingDoc = () => {
    const latest = apiRef.current?.getDoc() ?? docRef.current;
    return {
      ...latest,
      name: docRef.current.name,
      environment: ensureEnvironment(latest),
    };
  };

  const isDirty = () => snapshotMapDoc(workingDoc()) !== lastSavedRef.current;

  const markClean = (next: MapDocument) => {
    lastSavedRef.current = snapshotMapDoc(next);
  };

  const persist = () => {
    const next = workingDoc();
    const liveThumb = apiRef.current?.captureThumbnail() ?? null;
    saveMap(mapId, next, { thumbnailDataUrl: liveThumb });
    setDoc(next);
    docRef.current = next;
    markClean(next);
    // Prefer a framed overview thumb for the library card
    void import('./map-thumbnail').then(({ ensureMapThumbnail }) =>
      ensureMapThumbnail(mapId, { force: true })
    );
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

  useEffect(() => {
    apiRef.current?.setBrush(brush);
  }, [brush]);
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
  }, [onClose, selectedId, selectedIds, freeFly, playTest, mapId]);

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
    persist();
    setPlayTest(true);
  };

  if (playTest) {
    return createPortal(
      <MapPlayPreview
        doc={apiRef.current?.getDoc() ?? doc}
        onClose={() => setPlayTest(false)}
      />,
      document.body
    );
  }

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
        </div>
      )}

      {/* Mobile quick access while chrome is visible */}
      {!uiCollapsed && isMobile && (
        <div className="fixed top-14 left-3 z-[140] flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-lg active:scale-95 ${
              sidebarOpen
                ? 'border-amber-400/60 bg-amber-500/30 text-white'
                : 'border-white/25 bg-black/75 text-white/90 backdrop-blur'
            }`}
            title={sidebarOpen ? 'Close library drawer' : 'Open library drawer'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Library
          </button>
        </div>
      )}

      {/* Top bar */}
      {!uiCollapsed && (
      <div className="h-12 border-b border-white/10 flex items-center gap-2 px-3 bg-[#121a24] relative z-[60] overflow-x-auto shrink-0">
        <span className="text-xs font-bold tracking-widest text-cyan-300/90 uppercase shrink-0">Map Editor</span>
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
            const withEnv = { ...loaded, environment: ensureEnvironment(loaded) };
            setMapId(id);
            setDoc(withEnv);
            docRef.current = withEnv;
            markClean(withEnv);
            apiRef.current?.setDoc(withEnv);
          }}
        >
          {maps.map((m) => (
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
        <Button size="sm" variant="secondary" className="shrink-0" onClick={persist}>
          <Save className="w-4 h-4 mr-1" /> Save
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
              const parsed = importJson(await f.text());
              const withEnv = { ...parsed, environment: ensureEnvironment(parsed) };
              const id = `map_${Date.now().toString(36)}`;
              saveMap(id, withEnv);
              setMapId(id);
              setDoc(withEnv);
              docRef.current = withEnv;
              markClean(withEnv);
              apiRef.current?.setDoc(withEnv);
            } catch (err) {
              console.error(err);
              alert('Invalid map JSON');
            }
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

        {!uiCollapsed && (!isMobile || sidebarOpen) && (
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
                if (isMobile) setSidebarOpen(true);
              }}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          {isMobile && (
            <button
              type="button"
              title="Close library"
              className="mt-auto w-8 h-8 rounded flex items-center justify-center text-white/60 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        )}

        {!uiCollapsed && (!isMobile || sidebarOpen) && (
        <div
          className={`border-r border-white/10 bg-[#121a24] flex flex-col min-h-0 z-[70] ${
            isMobile
              ? 'absolute left-10 top-0 bottom-0 w-[min(18rem,calc(100vw-2.5rem))] shadow-2xl'
              : 'w-72 relative'
          }`}
        >
          {tab === 'assets' && (
            <>
              <div className="p-2 border-b border-white/10 space-y-1">
                <input
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                  placeholder="Search models…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className={`text-xs px-2 py-1 rounded border w-full ${
                    brush === null ? 'border-amber-400 text-amber-200' : 'border-white/10 text-white/50'
                  }`}
                  onClick={() => setBrush(null)}
                >
                  Select only (no place)
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setBrush(name);
                      // Free the canvas after picking a brush on mobile.
                      if (isMobile) {
                        setSidebarOpen(false);
                        setUiCollapsed(true);
                      }
                    }}
                    className={`rounded border p-1 text-left ${
                      brush === name ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 hover:border-white/30'
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
                Click ground to place. Orbit drag = move view (won&apos;t place). Ctrl = free fly.
              </p>
            </>
          )}

          {tab === 'layers' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {doc.layers
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((layer) => (
                  <div
                    key={layer.id}
                    className={`rounded border p-2 ${
                      activeLayerId === layer.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left font-semibold text-sm"
                      onClick={() => setActiveLayerId(layer.id)}
                    >
                      {layer.name}
                    </button>
                    <div className="flex gap-2 mt-1 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={layer.visible}
                          onChange={(e) => {
                            const next = {
                              ...doc,
                              layers: doc.layers.map((l) =>
                                l.id === layer.id ? { ...l, visible: e.target.checked } : l
                              ),
                            };
                            setDoc(next);
                            apiRef.current?.setDoc(next);
                          }}
                        />
                        Visible
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={layer.locked}
                          onChange={(e) => {
                            const next = {
                              ...doc,
                              layers: doc.layers.map((l) =>
                                l.id === layer.id ? { ...l, locked: e.target.checked } : l
                              ),
                            };
                            setDoc(next);
                            apiRef.current?.setDoc(next);
                          }}
                        />
                        Locked
                      </label>
                    </div>
                  </div>
                ))}
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  const layer = {
                    id: generateId('layer'),
                    name: `Layer ${doc.layers.length + 1}`,
                    visible: true,
                    locked: false,
                    order: doc.layers.length,
                  };
                  const next = { ...doc, layers: [...doc.layers, layer] };
                  setDoc(next);
                  setActiveLayerId(layer.id);
                  apiRef.current?.setDoc(next);
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> New Layer
              </Button>
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
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Could not save prefab');
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

        {/* Viewport */}
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
                  <p>· <b className="text-white">Library</b> opens assets; pick a model then tap ground</p>
                  <p>· <b className="text-white">Fly</b> for joysticks · <b className="text-white">Edit</b> to place</p>
                  <p>· Set <b className="text-white">MAIN map</b> so Deathrun loads it</p>
                </>
              ) : (
                <>
                  <p>· Pick a model, click ground to place (drag = orbit, no place)</p>
                  <p>· <b className="text-white">Ctrl</b> free fly · look down + W flies down</p>
                  <p>· <b className="text-white">G</b> snap · <b className="text-white">F</b> focus · <b className="text-white">W/E/R</b> gizmo</p>
                  <p>· <b className="text-white">Ctrl+D</b> duplicate · <b className="text-white">Ctrl+Z</b> undo</p>
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
            {brush ? ` · brush: ${brush}` : ' · select only'}
            {selectedIds.length > 1
              ? ` · multi: ${selectedIds.length}`
              : selected
                ? ` · sel: ${selected.name}`
                : ''}
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
            <ToolBtn onClick={() => apiRef.current?.placeSpawn('spawn_runner')} title="Runner spawn">
              <Flag className="w-4 h-4 text-emerald-400" />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.placeSpawn('spawn_trapper')} title="Trapper spawn">
              <Flag className="w-4 h-4 text-red-400" />
            </ToolBtn>
            <ToolBtn
              onClick={() => apiRef.current?.placeEntity('player', brush ?? 'figurine')}
              title="Player entity"
            >
              <User className="w-4 h-4 text-sky-300" />
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
            <ToolBtn onClick={() => apiRef.current?.duplicateSelected()} title="Duplicate">
              <Copy className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => apiRef.current?.deleteSelected()} title="Delete">
              <Trash2 className="w-4 h-4 text-red-300" />
            </ToolBtn>
          </div>
          )}

          {!uiCollapsed && selected && !propsOpen && (
            <button
              type="button"
              onClick={() => setPropsOpen(true)}
              className="absolute top-3 right-3 z-[80] flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/30 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-lg active:scale-95"
            >
              Props
            </button>
          )}

          {!uiCollapsed && selected && propsOpen && (
            <div
              className={`absolute z-[80] bg-black/80 border border-white/15 rounded-xl p-3 backdrop-blur space-y-2 text-sm overflow-y-auto ${
                isMobile
                  ? 'left-3 right-3 bottom-16 top-auto max-h-[45vh] w-auto'
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
                  <option value="prop">Prop</option>
                  <option value="trap">Trap (activatable)</option>
                  <option value="hazard">Death zone</option>
                  <option value="player">Player</option>
                  <option value="button">Button</option>
                  <option value="spawn_runner">Spawn Runner</option>
                  <option value="spawn_trapper">Spawn Trapper</option>
                  <option value="checkpoint">Checkpoint</option>
                </select>
              </label>
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

              <AnimationPropsPanel
                entity={selected}
                allEntities={doc.entities}
                onChange={patchSelected}
                onPreview={(which) => apiRef.current?.previewAnim(which)}
                onWireTrap={wireTrapToButton}
              />

              <div className="space-y-2 border-t border-white/10 pt-2">
                <p className="text-[10px] tracking-widest text-white/50 uppercase">Death zone</p>
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={ensureHazard(selected).enabled || selected.kind === 'hazard'}
                    onChange={(e) => {
                      const hz = ensureHazard(selected);
                      patchSelected({
                        kind: e.target.checked && selected.kind === 'prop' ? 'hazard' : selected.kind,
                        hazard: { ...hz, enabled: e.target.checked },
                      });
                    }}
                  />
                  Damages player on touch
                </label>
                {(ensureHazard(selected).enabled || selected.kind === 'hazard') && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={ensureHazard(selected).instantKill}
                        onChange={(e) =>
                          patchSelected({
                            hazard: { ...ensureHazard(selected), instantKill: e.target.checked, enabled: true },
                          })
                        }
                      />
                      Instant kill
                    </label>
                    {!ensureHazard(selected).instantKill && (
                      <>
                        <label className="block text-xs text-white/60">
                          Damage per tick ({ensureHazard(selected).damage})
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
                        <label className="block text-xs text-white/60">
                          Interval ms ({ensureHazard(selected).intervalMs})
                          <input
                            type="range"
                            min={100}
                            max={2000}
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
                      </>
                    )}
                    <p className="text-[10px] text-white/40">
                      Test in Play Test (HP bar). In Deathrun match, instant-kill zones remove the runner.
                    </p>
                  </>
                )}
              </div>

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
            </div>
          )}
        </div>
      </div>
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
