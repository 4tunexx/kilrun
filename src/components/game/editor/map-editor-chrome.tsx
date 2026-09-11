'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorTip } from './editor-tooltip';
import { DEFAULT_EDITOR_PERF_MODE, type EditorPerfMode } from './editor-viewport';
import type { SelectionTransformOp } from './selection-transform';

export function EditorGraphicsOverlay({
  open,
  perf,
  toolsOpen,
  onClose,
  onToggleTools,
  onTogglePerf,
  onRestorePerf,
  onOpenWorld,
  onOpenSettings,
}: {
  open: boolean;
  perf: EditorPerfMode;
  toolsOpen: boolean;
  onClose: () => void;
  onToggleTools: () => void;
  onTogglePerf: (key: keyof EditorPerfMode) => void;
  onRestorePerf: () => void;
  onOpenWorld: () => void;
  onOpenSettings: () => void;
}) {
  if (!open) return null;
  const rows: { key: keyof EditorPerfMode; label: string }[] = [
    { key: 'disableBloom', label: 'Disable bloom (biggest GPU saving)' },
    { key: 'capPixelRatio', label: 'Render at 1× pixel ratio' },
    { key: 'skipCollisionGizmos', label: 'Skip collision wireframes' },
    { key: 'hideFloor', label: 'Hide floor / void disc' },
    { key: 'hideSkyTexture', label: 'Hide sky texture (solid color)' },
    { key: 'hideVoidEffects', label: 'Hide void glow / shadow' },
    { key: 'hideFog', label: 'Hide fog' },
  ];
  const dirty = rows.some(({ key }) => perf[key] !== DEFAULT_EDITOR_PERF_MODE[key]);
  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-amber-400/30 bg-[#0f1724] p-4 shadow-2xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black tracking-wide text-white">Editor graphics</p>
          <button
            type="button"
            className="w-8 h-8 rounded-lg grid place-items-center text-white/70 hover:bg-white/10"
            onClick={onClose}
            aria-label="Close graphics"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-white/50 leading-snug">
          Cuts rendering work while editing. Play Test and live matches stay at full quality and
          these flags are not saved into the map.
        </p>
        <label className="flex items-center justify-between gap-3 text-xs text-white/80">
          <span>Show tool bar</span>
          <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={toolsOpen} onChange={onToggleTools} />
        </label>
        {rows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-xs text-white/80">
            <span>{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-400"
              checked={perf[key]}
              onChange={() => onTogglePerf(key)}
            />
          </label>
        ))}
        {dirty && (
          <Button size="sm" variant="ghost" className="w-full text-xs text-amber-200" onClick={onRestorePerf}>
            Restore all editor visuals
          </Button>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={onOpenWorld}>
            World panel
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={onOpenSettings}>
            Match settings
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ToolBtn({
  children,
  active,
  onClick,
  title,
  disabled,
  btnRef,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  btnRef?: React.Ref<HTMLButtonElement>;
}) {
  const btn = (
    <button
      ref={btnRef}
      type="button"
      aria-label={title}
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
  if (!title) return btn;
  return <EditorTip content={title}>{btn}</EditorTip>;
}

export function RotatePresetPicker({
  anchorRect,
  onPick,
  onClose,
}: {
  anchorRect: DOMRect | null;
  onPick: (op: SelectionTransformOp) => void;
  onClose: () => void;
}) {
  const btnCls =
    'flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-white/85 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:text-cyan-100 active:scale-95 transition-colors';
  const width = 288;
  const left = anchorRect
    ? Math.min(
        Math.max(8, anchorRect.left + anchorRect.width / 2 - width / 2),
        window.innerWidth - width - 8
      )
    : 8;
  const bottom = anchorRect ? Math.max(8, window.innerHeight - anchorRect.top + 8) : 8;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] w-72 rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur p-3 shadow-2xl"
        style={{ left, bottom }}
      >
        <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1 text-center">
          Easy rotate
        </p>
        <p className="text-[10px] text-white/40 mb-2.5 text-center leading-relaxed">
          Turns the whole selection around its center — groups stay together. Drag the rings in
          the viewport for free rotate.
        </p>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Yaw (turn)</p>
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {([0, 90, 180, 270] as const).map((deg) => (
            <button
              key={deg}
              type="button"
              className={btnCls}
              onClick={() => onPick({ type: 'setYaw', deg })}
              title={`Face ${deg}°`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[10px] leading-none">{deg}°</span>
            </button>
          ))}
        </div>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Nudge 90°</p>
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, -90, 0] })}
            title="Yaw −90°"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Left</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 90, 0] })}
            title="Yaw +90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Right</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 180, 0] })}
            title="Yaw 180°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">180</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [90, 0, 0] })}
            title="Pitch +90° (tilt)"
          >
            <span className="text-[10px] leading-none">Pitch +</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [-90, 0, 0] })}
            title="Pitch −90°"
          >
            <span className="text-[10px] leading-none">Pitch −</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'rotateDelta', deg: [0, 0, 90] })}
            title="Roll +90°"
          >
            <span className="text-[10px] leading-none">Roll</span>
          </button>
        </div>
        <p className="text-[9px] uppercase tracking-widest text-white/35 mb-1.5">Flip</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'y' })}
            title="Flip horizontal (180° around up)"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Horiz</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'x' })}
            title="Flip vertical (180° around right)"
          >
            <FlipVertical className="w-3.5 h-3.5" />
            <span className="text-[10px] leading-none">Vert</span>
          </button>
          <button
            type="button"
            className={btnCls}
            onClick={() => onPick({ type: 'flip', axis: 'z' })}
            title="Flip side (180° around forward)"
          >
            <FlipHorizontal className="w-3.5 h-3.5 rotate-90" />
            <span className="text-[10px] leading-none">Side</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
