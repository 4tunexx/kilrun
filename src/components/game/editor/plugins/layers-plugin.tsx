'use client';

import { Eye, EyeOff, Focus, Layers, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MapEditorBrains } from '../engine/types';
import type { MapEditorPlugin } from '../engine/types';

export function LayersPluginPanel({ brains }: { brains: MapEditorBrains }) {
  const {
    doc,
    sortedLayers,
    activeLayerId,
    setActiveLayerId,
    showAllLayers,
    addBuildLevel,
    setLayerFlag,
    soloLayer,
    deleteBuildLevel,
    selectedId,
    selectedIds,
    moveSelectionToLayer,
  } = brains;

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">Build by level</p>
        <p className="text-[10px] text-white/45 leading-snug">
          Paint floors on <b className="text-white/70">Level 0 / Floor</b>, then switch to Level 1
          for props, traps, etc. Tap the eye to hide a level and check the layout. Active layer
          (cyan) is where new pieces go.
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
          <Button type="button" size="sm" className="flex-1 text-[10px] h-8" onClick={addBuildLevel}>
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
                  isActive ? 'bg-cyan-500/40 text-cyan-50' : 'bg-white/10 text-white/70 hover:bg-white/15'
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
              <span className="text-[10px] tabular-nums text-white/35 shrink-0">{count}</span>
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
                {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => soloLayer(layer.id)}
                className="w-9 h-8 rounded-md flex items-center justify-center border border-white/10 text-white/55 hover:bg-white/5"
                title="Solo — hide every other level"
              >
                <Focus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => deleteBuildLevel(layer.id)}
                disabled={sortedLayers.length <= 1}
                className="w-9 h-8 rounded-md flex items-center justify-center border border-white/10 text-white/35 hover:bg-rose-500/15 hover:text-rose-200 hover:border-rose-400/30 disabled:opacity-30 disabled:hover:bg-transparent"
                title={
                  sortedLayers.length <= 1
                    ? 'Keep at least one level'
                    : 'Delete this level (objects move to the previous level)'
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
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
  );
}

export const layersPlugin: MapEditorPlugin = {
  id: 'layers',
  slot: 'sidebar',
  label: 'Layers',
  icon: Layers,
  order: 20,
  render: (brains) => <LayersPluginPanel brains={brains} />,
};
