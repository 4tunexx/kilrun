'use client';

import { Box, MousePointer2, PaintBucket, Package, Paintbrush, Trash2, Upload } from 'lucide-react';
import { HAMMER_SOLID_MODEL } from '../map-document';
import { previewUrl } from '../prototype-catalog';
import { adminDeletePrefabModel } from '@/lib/prefab-library-actions';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function AssetsPanel({ brains }: { brains: MapEditorBrains }) {
  const {
    query,
    setQuery,
    setUploadOpen,
    libraryCategories,
    libraryCategory,
    setLibraryCategory,
    editTool,
    setEditTool,
    pendingPlaceKind,
    setPendingPlaceKind,
    apiRef,
    brush,
    setBrush,
    selected,
    freeFly,
    filtered,
    filteredLibraryPrefabs,
    isMobile,
    setSidebarOpen,
    setUiCollapsed,
    reloadPrefabLibrary,
    toast,
  } = brains;

  return (
            <>
              <div className="p-2 border-b border-white/10 space-y-1">
                <div className="flex gap-1">
                  <input
                    className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm"
                    placeholder="Search models…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                    type="button"
                    className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded border border-emerald-500/40 text-emerald-300 text-xs hover:bg-emerald-500/10"
                    title="Upload a new prefab model into the library"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['all', 'built-in', ...libraryCategories].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLibraryCategory(cat)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${
                        libraryCategory === cat
                          ? 'border-cyan-400 text-cyan-200 bg-cyan-500/10'
                          : 'border-white/15 text-white/50 hover:border-white/30'
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat === 'built-in' ? 'Built-in' : cat}
                    </button>
                  ))}
                </div>
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
                {filteredLibraryPrefabs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setBrush(p.modelUrl);
                      setEditTool((t) => (t === 'bucket' ? 'bucket' : 'brush'));
                      if (isMobile) {
                        setSidebarOpen(false);
                        setUiCollapsed(true);
                      }
                    }}
                    className={`relative rounded border p-1 text-left ${
                      brush === p.modelUrl && (editTool === 'brush' || editTool === 'bucket')
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : brush === p.modelUrl
                          ? 'border-white/30 bg-white/5'
                          : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {p.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.previewUrl}
                        alt={p.name}
                        className="w-full aspect-square object-contain bg-black/30 rounded"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-black/30 rounded">
                        <Package className="w-6 h-6 text-white/30" />
                      </div>
                    )}
                    <p className="text-[10px] mt-1 truncate text-white/80">{p.name}</p>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Delete "${p.name}" from the library?`)) return;
                        try {
                          await adminDeletePrefabModel(p.id);
                          reloadPrefabLibrary();
                        } catch (err) {
                          toast({
                            title: err instanceof Error ? err.message : 'Delete failed',
                            variant: 'destructive',
                          });
                        }
                      }}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded p-0.5 text-white/50 hover:text-red-400"
                      title="Remove from library"
                    >
                      <Trash2 className="w-3 h-3" />
                    </span>
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
  );
}

export const assetsPlugin: MapEditorPlugin = {
  id: 'assets',
  slot: 'sidebar',
  label: 'Assets',
  icon: Box,
  order: 10,
  render: (brains) => <AssetsPanel brains={brains} />,
};
