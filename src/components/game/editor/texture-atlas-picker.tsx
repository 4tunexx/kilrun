'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Normalized atlas region in image space (origin top-left, 0–1). */
export interface TextureAtlasRegion {
  /** Left edge (0–1). */
  u: number;
  /** Top edge (0–1). */
  v: number;
  /** Width (0–1). */
  w: number;
  /** Height (0–1). */
  h: number;
}

export function regionToUv(region: TextureAtlasRegion): {
  repeat: [number, number];
  offset: [number, number];
} {
  // Three.js UV origin is bottom-left; image picker uses top-left.
  return {
    repeat: [Math.max(0.001, region.w), Math.max(0.001, region.h)],
    offset: [region.u, Math.max(0, 1 - region.v - region.h)],
  };
}

export function uvToRegion(
  repeat?: [number, number] | null,
  offset?: [number, number] | null
): TextureAtlasRegion {
  const w = Math.min(1, Math.max(0.001, repeat?.[0] ?? 1));
  const h = Math.min(1, Math.max(0.001, repeat?.[1] ?? 1));
  const u = Math.min(1 - w, Math.max(0, offset?.[0] ?? 0));
  const vBottom = offset?.[1] ?? 0;
  const v = Math.min(1 - h, Math.max(0, 1 - vBottom - h));
  return { u, v, w, h };
}

type Props = {
  imageUrl: string;
  repeat?: [number, number];
  offset?: [number, number];
  onChange: (uv: { repeat: [number, number]; offset: [number, number] }) => void;
  className?: string;
};

/**
 * Drag-select a sub-rectangle on a texture atlas (Unity/Godot-style).
 * Writes Three.js-compatible repeat + offset onto the selected entity.
 */
export function TextureAtlasPicker({
  imageUrl,
  repeat,
  offset,
  onChange,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [region, setRegion] = useState<TextureAtlasRegion>(() => uvToRegion(repeat, offset));
  const dragRef = useRef<{
    x0: number;
    y0: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    setRegion(uvToRegion(repeat, offset));
  }, [imageUrl, repeat?.[0], repeat?.[1], offset?.[0], offset?.[1]]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    // Dim outside selection
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, h);
    const rx = region.u * w;
    const ry = region.v * h;
    const rw = region.w * w;
    const rh = region.h * h;
    ctx.clearRect(rx, ry, rw, rh);
    ctx.drawImage(img, region.u * img.naturalWidth, region.v * img.naturalHeight, region.w * img.naturalWidth, region.h * img.naturalHeight, rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(34,211,238,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
  }, [region]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        const max = 280;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(64, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(64, Math.round(img.naturalHeight * scale));
      }
      draw();
    };
    img.src = imageUrl;
  }, [imageUrl, draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  const toNorm = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { u: 0, v: 0 };
    const rect = canvas.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { u, v };
  };

  const commit = (next: TextureAtlasRegion) => {
    setRegion(next);
    onChange(regionToUv(next));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toNorm(e.clientX, e.clientY);
    dragRef.current = { x0: p.u, y0: p.v, dragging: true };
    commit({ u: p.u, v: p.v, w: 0.02, h: 0.02 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    const p = toNorm(e.clientX, e.clientY);
    const u = Math.min(drag.x0, p.u);
    const v = Math.min(drag.y0, p.v);
    const w = Math.max(0.02, Math.abs(p.u - drag.x0));
    const h = Math.max(0.02, Math.abs(p.v - drag.y0));
    commit({ u, v, w: Math.min(w, 1 - u), h: Math.min(h, 1 - v) });
  };

  const onPointerUp = () => {
    if (dragRef.current) dragRef.current.dragging = false;
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-[10px] text-white/50 uppercase tracking-wide">Texture region</p>
      <p className="text-[10px] text-white/40 leading-snug">
        Drag on the image to select a tile from an atlas. Applies UV offset + scale to the selection.
      </p>
      <canvas
        ref={canvasRef}
        className="w-full max-w-[280px] rounded border border-cyan-400/40 cursor-crosshair touch-none bg-black/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="flex gap-1">
        <button
          type="button"
          className="flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10"
          onClick={() => commit({ u: 0, v: 0, w: 1, h: 1 })}
        >
          Full image
        </button>
      </div>
    </div>
  );
}
