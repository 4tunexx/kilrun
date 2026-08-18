'use client';

import { Eye, EyeOff, ListTree, Lock, Unlock } from 'lucide-react';
import { getEntityWarnings, isPlatformPlayerKind } from '../map-document';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

function OutlinerPanel({ brains }: { brains: MapEditorBrains }) {
  const {
    doc,
    selectedId,
    selectedIds,
    setSelectedId,
    setSelectedIds,
    apiRef,
    patchEntityById,
    openPlayerStudio,
  } = brains;

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {doc.entities
        .filter((e) => !isPlatformPlayerKind(e.kind))
        .map((e) => {
          const warnings = getEntityWarnings(e, doc.entities);
          return (
        <div
          key={e.id}
          className={`flex items-center gap-0.5 rounded ${
            selectedId === e.id || selectedIds.includes(e.id)
              ? 'bg-cyan-500/20 text-cyan-100'
              : 'hover:bg-white/5'
          }`}
        >
          <button
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
                // select() expands groups in the viewport
                apiRef.current?.setSelectedId(e.id);
              }
            }}
            className="flex-1 text-left px-2 py-1.5 text-sm truncate min-w-0"
            title={warnings.length ? warnings.join(' ') : undefined}
          >
            {warnings.length > 0 && (
              <span className="text-amber-400 mr-1" title={warnings.join(' ')}>
                ⚠
              </span>
            )}
            <span className="text-white/40 text-[10px] mr-1">{e.kind}</span>
            {e.name}
            {e.groupId ? (
              <span className="ml-1 text-[9px] text-sky-300/80">grp</span>
            ) : null}
          </button>
          <button
            type="button"
            className="w-7 h-7 shrink-0 rounded flex items-center justify-center text-white/50 hover:bg-white/10"
            title={e.visible === false ? 'Show' : 'Hide'}
            onClick={(ev) => {
              ev.stopPropagation();
              patchEntityById(e.id, { visible: e.visible === false });
            }}
          >
            {e.visible === false ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-emerald-300/80" />
            )}
          </button>
          <button
            type="button"
            className="w-7 h-7 shrink-0 rounded flex items-center justify-center text-white/50 hover:bg-white/10"
            title={e.locked ? 'Unlock' : 'Lock'}
            onClick={(ev) => {
              ev.stopPropagation();
              patchEntityById(e.id, { locked: !e.locked });
            }}
          >
            {e.locked ? (
              <Lock className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <Unlock className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
          );
        })}
      <button
        type="button"
        className="w-full text-left px-2 py-1.5 rounded text-sm border border-sky-500/30 bg-sky-500/10 text-sky-100 mt-2"
        onClick={() => openPlayerStudio()}
      >
        <span className="text-sky-300/70 text-[10px] mr-1">platform</span>
        Player Model settings…
      </button>
    </div>
  );
}

export const outlinerPlugin: MapEditorPlugin = {
  id: 'outliner',
  slot: 'sidebar',
  label: 'Outliner',
  icon: ListTree,
  order: 30,
  render: (brains) => <OutlinerPanel brains={brains} />,
};
