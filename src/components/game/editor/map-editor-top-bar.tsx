'use client';

import type { ChangeEvent, Ref } from 'react';
import {
  Download,
  HelpCircle,
  Navigation,
  Play,
  Redo2,
  Save,
  Undo2,
  Upload,
  EyeOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shortcutTitle } from './editor-shortcuts';
import type { KilrunModeInfo } from '@/lib/game-modes';
import type { MapListItem } from './map-storage';

export function MapEditorTopBar({
  variant,
  modeInfo,
  mapName,
  onMapName,
  mapId,
  maps,
  gameMode,
  onSwitchMap,
  onPlayTest,
  onLiveTest,
  isLiveHere,
  cloudActive,
  liveMismatch,
  onPublish,
  dirty,
  bakingAllMesh,
  onFixCollision,
  isMobile,
  freeFly,
  onToggleFreeFly,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleHelp,
  onHideUi,
  onSave,
  onExport,
  onImportClick,
  fileRef,
  onImportFile,
  onClose,
}: {
  variant?: 'engine' | 'overlay' | string;
  modeInfo: Pick<KilrunModeInfo, 'badgeClass' | 'editorBlurb' | 'shortTitle'>;
  mapName: string;
  onMapName: (name: string) => void;
  mapId: string;
  maps: MapListItem[];
  gameMode: string;
  onSwitchMap: (id: string) => void;
  onPlayTest: () => void;
  onLiveTest: () => void;
  isLiveHere: boolean;
  cloudActive: boolean;
  liveMismatch: string;
  onPublish: () => void;
  dirty: boolean;
  bakingAllMesh: boolean;
  onFixCollision: () => void;
  isMobile: boolean;
  freeFly: boolean;
  onToggleFreeFly: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleHelp: () => void;
  onHideUi: () => void;
  onSave: () => void;
  onExport: () => void;
  onImportClick: () => void;
  fileRef: Ref<HTMLInputElement>;
  onImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`h-12 border-b flex items-center gap-2 px-3 overflow-x-auto shrink-0 ${
        variant === 'engine'
          ? 'border-red-500/20 bg-[#0c1018] relative z-10'
          : 'border-white/10 bg-[#121a24] relative z-[60]'
      }`}
    >
      <span
        className={`text-xs font-bold tracking-widest uppercase shrink-0 ${
          variant === 'engine' ? 'text-red-300/90' : 'text-cyan-300/90'
        }`}
      >
        {variant === 'engine' ? 'Map' : 'Map Editor'}
      </span>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0 ${modeInfo.badgeClass}`}
        title={modeInfo.editorBlurb}
      >
        {modeInfo.shortTitle}
      </span>
      <input
        className="ml-2 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm w-40 sm:w-56 shrink-0"
        value={mapName}
        onChange={(e) => onMapName(e.target.value)}
      />
      <select
        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm shrink-0"
        value={mapId}
        onChange={(e) => onSwitchMap(e.target.value)}
      >
        {maps
          .filter((m) => (m.gameMode ?? 'deathrun') === gameMode)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.corrupt ? `${m.name} (corrupted)` : m.name}
            </option>
          ))}
      </select>

      <Button
        size="sm"
        className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 font-semibold shadow-sm"
        title="Instant Play Test (F5) — Test play with full physics and AAA HUD"
        onClick={onPlayTest}
      >
        <Play className="w-4 h-4 mr-1 fill-white" /> Play Test{' '}
        <span className="ml-1 text-[10px] opacity-75 font-mono">F5</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="ml-1.5 border-amber-500/60 text-amber-300 hover:bg-amber-500/10 shrink-0 font-medium"
        title="Play Test (Live) (Shift+F5) — Real practice room with live Colyseus game server"
        onClick={onLiveTest}
      >
        <Play className="w-4 h-4 mr-1 text-amber-400" /> Live Test
      </Button>
      {variant !== 'engine' ? (
        <Button
          size="sm"
          variant="secondary"
          className={`shrink-0 ml-1.5 ${isLiveHere ? 'border border-emerald-400/50 text-emerald-200' : ''}`}
          onClick={onPublish}
          title={
            isLiveHere
              ? 'This is the cloud Active/MAIN map live matches load'
              : cloudActive
                ? liveMismatch
                : 'Publish this map as the live match map for this mode'
          }
        >
          {isLiveHere ? 'MAIN map ✓' : 'Set as MAIN map'}
        </Button>
      ) : (
        <span
          className={`ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
            isLiveHere
              ? 'border border-red-400/50 text-red-200 bg-red-500/15'
              : 'text-slate-400 bg-white/5'
          }`}
        >
          {isLiveHere ? 'MAIN' : dirty ? 'Unsaved' : 'Draft'}
        </span>
      )}

      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={bakingAllMesh}
        onClick={onFixCollision}
        title="Re-fit collision to the real mesh shape for every Solid prop, including ones with an existing bake — use this to pick up a fixed voxelizer/collision algorithm on props baked before the fix."
      >
        {bakingAllMesh ? 'Fitting collision…' : 'Fix Solid Collision'}
      </Button>

      {!isMobile && (
        <Button
          size="sm"
          variant={freeFly ? 'default' : 'secondary'}
          className={`shrink-0 ${freeFly ? 'bg-amber-600 hover:bg-amber-500' : ''}`}
          onClick={onToggleFreeFly}
          title="Toggle free fly — WASD move, mouse look, Space up, C down. Click again to exit."
        >
          <Navigation className="w-4 h-4 mr-1" /> {freeFly ? 'Free Fly ON' : 'Free Fly'}
        </Button>
      )}

      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0"
        onClick={onToggleHelp}
        title="Quick tips overlay"
      >
        <HelpCircle className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 border border-cyan-400/40 text-cyan-100"
        onClick={onHideUi}
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
            onClick={onSave}
            title={dirty ? 'Unsaved changes — click to save' : 'Saved'}
          >
            <Save className="w-4 h-4 mr-1" /> {dirty ? 'Save •' : 'Save'}
          </Button>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={onExport}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={onImportClick}>
            <Upload className="w-4 h-4 mr-1" /> Import
          </Button>
        </>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFile}
      />
      <Button
        size="sm"
        variant="destructive"
        className="shrink-0"
        onClick={onClose}
        title={variant === 'engine' ? 'Back to projects (Esc)' : 'Exit (Esc)'}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
