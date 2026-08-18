'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, ListTree, Lock, Unlock } from 'lucide-react';
import { getAllEntityWarnings, isPlatformPlayerKind } from '../map-document';
import type { MapEditorBrains, MapEditorPlugin } from '../engine/types';

/** Fixed row height in px — the 28px controls plus the 4px gap between rows. */
const ROW_H = 32;
/** Rows kept mounted beyond the visible window so scrolling doesn't flash. */
const OVERSCAN = 6;

/** Tracks the scroll offset and height of a scroll container. */
function useScrollWindow() {
  const ref = useRef<HTMLDivElement>(null);
  // Seeded with a plausible panel height so the first paint already fills the
  // list instead of rendering nothing until the effect measures.
  const [win, setWin] = useState({ top: 0, height: 640 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWin({ top: el.scrollTop, height: el.clientHeight });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, []);

  return { ref, win };
}

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

  const rows = useMemo(
    () => doc.entities.filter((e) => !isPlatformPlayerKind(e.kind)),
    [doc.entities]
  );
  // One linear pass per doc revision, rather than a per-entity scan on every
  // re-render of the parent.
  const warningsById = useMemo(() => getAllEntityWarnings(doc.entities), [doc.entities]);

  const { ref: scrollRef, win } = useScrollWindow();
  const first = Math.max(0, Math.floor(win.top / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((win.top + win.height) / ROW_H) + OVERSCAN);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
      <div className="relative" style={{ height: rows.length * ROW_H }}>
        {rows.slice(first, last).map((e, i) => {
          const warnings = warningsById.get(e.id);
          return (
            <div
              key={e.id}
              className={`absolute inset-x-0 flex items-center gap-0.5 rounded ${
                selectedId === e.id || selectedIds.includes(e.id)
                  ? 'bg-cyan-500/20 text-cyan-100'
                  : 'hover:bg-white/5'
              }`}
              style={{ top: (first + i) * ROW_H, height: ROW_H - 4 }}
            >
              <button
                type="button"
                onClick={(ev) => {
                  if (ev.shiftKey) {
                    const next = selectedIds.includes(e.id)
                      ? selectedIds.filter((id) => id !== e.id)
                      : [
                          ...(selectedIds.length ? selectedIds : selectedId ? [selectedId] : []),
                          e.id,
                        ];
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
                title={warnings?.join(' ')}
              >
                {warnings ? (
                  <span className="text-amber-400 mr-1" title={warnings.join(' ')}>
                    ⚠
                  </span>
                ) : null}
                <span className="text-white/40 text-[10px] mr-1">{e.kind}</span>
                {e.name}
                {e.groupId ? <span className="ml-1 text-[9px] text-sky-300/80">grp</span> : null}
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
      </div>
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
