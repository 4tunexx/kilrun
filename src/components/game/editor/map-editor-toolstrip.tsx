'use client';

import {
  Box,
  CircleDot,
  Copy,
  Crosshair,
  Flag,
  FlagTriangleRight,
  Grid3x3,
  Hammer,
  Heart,
  HeartPulse,
  Home,
  LayoutGrid,
  Lightbulb,
  Magnet,
  Maximize2,
  MousePointer2,
  Move3d,
  Package,
  Paintbrush,
  PaintBucket,
  Palette,
  Play,
  Rocket,
  RotateCcw,
  Route,
  Ruler,
  Skull,
  Square,
  Trash2,
  Zap,
  Fan,
  Bug,
} from 'lucide-react';
import { ToolBtn, RotatePresetPicker } from './map-editor-chrome';
import { MapEditorCollisionToolbar } from './map-editor-collision-toolbar';
import { SNAP_FACE_LABELS, SnapFacePicker } from './snap-face-picker';
import { HAMMER_PRIMITIVES } from './hammer-shapes';
import { HAMMER_SOLID_MODEL, type EditorEntity, type HammerPrimitive, type MapDocument } from './map-document';
import { activateExtensionTool, listExtensionTools } from '@/lib/engine/plugin-sdk';
import type { EditTool, EditorViewLayout, PivotMode, SnapTarget, TransformMode, TransformSpace } from './editor-viewport';
import type { EditorViewportApi } from './editor-viewport';
import type { useToast } from '@/hooks/use-toast';

export type MapEditorToolstripProps = {
  editTool: EditTool;
  setEditTool: (tool: EditTool) => void;
  pendingPlaceKind: EditorEntity['kind'] | null;
  setPendingPlaceKind: (kind: EditorEntity['kind'] | null) => void;
  extensionToolId: string | null;
  setExtensionToolId: (id: string | null) => void;
  apiRef: { current: EditorViewportApi | null };
  brush: string | null;
  setBrush: (model: string | null) => void;
  selected: EditorEntity | null;
  selectedIds: string[];
  freeFly: boolean;
  mode: TransformMode;
  setMode: (mode: TransformMode) => void;
  hammerShape: HammerPrimitive;
  setHammerShape: (shape: HammerPrimitive) => void;
  selectLibraryTab: (id: string) => void;
  viewLayout: EditorViewLayout;
  setViewLayout: (layout: EditorViewLayout) => void;
  rotateMenuBtnRef: { current: HTMLButtonElement | null };
  rotateMenuOpen: boolean;
  setRotateMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  rotateMenuAnchorRect: DOMRect | null;
  setRotateMenuAnchorRect: (rect: DOMRect | null) => void;
  toast: ReturnType<typeof useToast>['toast'];
  gridSnap: boolean;
  setGridSnap: (v: boolean | ((prev: boolean) => boolean)) => void;
  snapY: boolean;
  setSnapY: (v: boolean | ((prev: boolean) => boolean)) => void;
  snapMagnetBtnRef: { current: HTMLButtonElement | null };
  snapFaceMenuOpen: boolean;
  setSnapFaceMenuOpen: (open: boolean) => void;
  snapFaceAnchorRect: DOMRect | null;
  applyMagnetSnap: () => void;
  measureMode: boolean;
  setMeasureMode: (v: boolean) => void;
  showAllCollisionGizmos: boolean;
  setShowAllCollisionGizmos: (v: boolean) => void;
  doc: MapDocument;
  setDoc: (doc: MapDocument) => void;
  docRef: { current: MapDocument };
  setDirty: (v: boolean) => void;
  scheduleHistory: () => void;
  bakingAllMesh: boolean;
  bakeMismatchedSolidCollision: () => void | Promise<void>;
  snapTarget: SnapTarget;
  setSnapTarget: (v: SnapTarget) => void;
  pivotMode: PivotMode;
  setPivotMode: (v: PivotMode) => void;
  transformSpace: TransformSpace;
  setTransformSpace: (v: TransformSpace) => void;
  gameMode: string;
  armPlaceSpawn: (kind: Parameters<NonNullable<EditorViewportApi['placeSpawn']>>[0]) => void;
  armPlaceEntity: (kind: EditorEntity['kind'], model?: string) => void;
  allAnimStopped: boolean;
  setAllAnimStopped: (v: boolean) => void;
  setStoppedAnimIds: (ids: Set<string>) => void;
};

export function MapEditorToolstrip(p: MapEditorToolstripProps) {
  const {
    editTool, setEditTool, pendingPlaceKind, setPendingPlaceKind,
    extensionToolId, setExtensionToolId, apiRef, brush, setBrush, selected, selectedIds,
    freeFly, mode, setMode, hammerShape, setHammerShape, selectLibraryTab,
    viewLayout, setViewLayout, rotateMenuBtnRef, rotateMenuOpen, setRotateMenuOpen,
    rotateMenuAnchorRect, setRotateMenuAnchorRect, toast, gridSnap, setGridSnap,
    snapY, setSnapY, snapMagnetBtnRef, snapFaceMenuOpen, setSnapFaceMenuOpen,
    snapFaceAnchorRect, applyMagnetSnap, measureMode, setMeasureMode,
    showAllCollisionGizmos, setShowAllCollisionGizmos, doc, setDoc, docRef, setDirty,
    scheduleHistory, bakingAllMesh, bakeMismatchedSolidCollision, snapTarget, setSnapTarget,
    pivotMode, setPivotMode, transformSpace, setTransformSpace, gameMode,
    armPlaceSpawn, armPlaceEntity, allAnimStopped, setAllAnimStopped, setStoppedAnimIds,
  } = p;
  return (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 border border-white/15 rounded-xl px-2 py-1.5 backdrop-blur z-[90] max-w-[calc(100vw-7rem)] overflow-x-auto">
            <ToolBtn
              active={editTool === 'select' && !pendingPlaceKind}
              onClick={() => {
                setExtensionToolId(null);
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
                setExtensionToolId(null);
                setEditTool('paint');
                if (freeFly) apiRef.current?.setFreeFly(false);
                selectLibraryTab('textures');
              }}
              title="Texture brush — tap objects to apply selected texture + UV tile"
            >
              <Palette className="w-4 h-4 text-sky-300" />
            </ToolBtn>
            {listExtensionTools().map((tool) => (
              <ToolBtn
                key={`${tool.moduleId}:${tool.id}`}
                active={extensionToolId === `${tool.moduleId}:${tool.id}`}
                onClick={() => {
                  setEditTool('select');
                  setExtensionToolId(`${tool.moduleId}:${tool.id}`);
                  activateExtensionTool(tool.moduleId, tool.id);
                }}
                title={`${tool.label} — extension tool`}
              >
                <span className="text-[8px] font-bold leading-none px-0.5">{tool.label}</span>
              </ToolBtn>
            ))}
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
            <MapEditorCollisionToolbar
              showAll={showAllCollisionGizmos}
              doc={doc}
              baking={bakingAllMesh}
              onBakeMismatched={() => void bakeMismatchedSolidCollision()}
              onToggle={() => {
                const next = !showAllCollisionGizmos;
                setShowAllCollisionGizmos(next);
                apiRef.current?.setShowAllCollisionGizmos(next);
              }}
            />
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
  );
}
