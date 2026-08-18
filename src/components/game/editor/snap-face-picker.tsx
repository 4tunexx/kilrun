'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
} from 'lucide-react';

export type SnapFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export const SNAP_FACE_LABELS: Record<SnapFace, string> = {
  '+x': 'right side',
  '-x': 'left side',
  '+y': 'top (stack on)',
  '-y': 'bottom (hang under)',
  '+z': 'front side',
  '-z': 'back side',
};

/**
 * Magnet tool popover — lets the user explicitly pick WHICH face of the
 * anchor (first-selected object) the rest of the selection snaps onto,
 * instead of auto-guessing the nearest face. Auto-guessing was the source
 * of "it just snaps wherever" — two objects close on multiple axes could
 * get glued on the wrong side entirely.
 */
export function SnapFacePicker({
  anchorRect,
  onPick,
  onSnapTogether,
  onClose,
}: {
  anchorRect: DOMRect | null;
  onPick: (face: SnapFace, opts: { alignRotation: boolean }) => void;
  /** Lay the selection out in a row on a shared bottom, edge to edge. */
  onSnapTogether?: () => void;
  onClose: () => void;
}) {
  const [alignRotation, setAlignRotation] = useState(false);
  const btnCls =
    'flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-white/85 hover:bg-emerald-500/20 hover:border-emerald-400/40 hover:text-emerald-200 active:scale-95 transition-colors';
  // Rendered via portal to document.body and positioned `fixed` from the
  // trigger button's screen rect — the toolbar this opens from scrolls
  // horizontally (overflow-x-auto), and per the CSS overflow spec setting
  // overflow-x to anything but visible silently forces overflow-y to `auto`
  // too, clipping any `absolute`-positioned popup inside it. Escaping to a
  // body-level portal sidesteps that entirely instead of fighting it.
  const width = 256; // w-64
  const left = anchorRect ? Math.min(Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2), window.innerWidth - width - 8) : 8;
  const bottom = anchorRect ? Math.max(8, window.innerHeight - anchorRect.top + 8) : 8;
  return createPortal(
    <>
      {/* Click-outside catcher */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] w-64 rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur p-3 shadow-2xl"
        style={{ left, bottom }}
      >
        <p className="text-[10px] uppercase tracking-widest text-white/50 mb-2 text-center">
          Snap selection to…
        </p>
        <p className="text-[10px] text-white/40 mb-2.5 text-center leading-relaxed">
          First-selected object stays put. Others join the side you pick, flush and centered.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <div />
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('+y', { alignRotation })}
            title="Stack on top of anchor"
          >
            <ArrowUpToLine className="w-4 h-4" />
            <span className="text-[10px] leading-none">Top</span>
          </button>
          <div />

          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('-x', { alignRotation })}
            title="Join left side of anchor"
          >
            <ArrowLeftToLine className="w-4 h-4" />
            <span className="text-[10px] leading-none">Left</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('+z', { alignRotation })}
            title="Join front side of anchor"
          >
            <ArrowUp className="w-4 h-4" />
            <span className="text-[10px] leading-none">Front</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('+x', { alignRotation })}
            title="Join right side of anchor"
          >
            <ArrowRightToLine className="w-4 h-4" />
            <span className="text-[10px] leading-none">Right</span>
          </button>

          <div />
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('-z', { alignRotation })}
            title="Join back side of anchor"
          >
            <ArrowDown className="w-4 h-4" />
            <span className="text-[10px] leading-none">Back</span>
          </button>
          <div />

          <div />
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick('-y', { alignRotation })}
            title="Hang underneath anchor"
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span className="text-[10px] leading-none">Bottom</span>
          </button>
          <div />
        </div>
        <label className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-white/65 cursor-pointer select-none">
          <span>Match the anchor&apos;s angle</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-emerald-400"
            checked={alignRotation}
            onChange={(e) => setAlignRotation(e.target.checked)}
          />
        </label>
        <p className="text-[10px] text-white/35 leading-snug">
          Off, pieces land flush but keep their own rotation. On, they turn to sit parallel to the
          anchor face.
        </p>
        {onSnapTogether && (
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
            onClick={onSnapTogether}
            title="Shared bottom, edge to edge along X"
          >
            Line up in a row
          </button>
        )}
      </div>
    </>,
    document.body
  );
}
