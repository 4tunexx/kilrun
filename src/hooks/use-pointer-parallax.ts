'use client';

import { useCallback, useRef, useState } from 'react';

/** Normalized pointer offset in [-1, 1] for parallax / tilt effects. */
export function usePointerParallax(strength = 18) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const pending = useRef({ x: 0, y: 0 });

  const apply = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
    pending.current = {
      x: Math.max(-1, Math.min(1, nx)) * strength,
      y: Math.max(-1, Math.min(1, ny)) * strength,
    };
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setOffset({ ...pending.current });
    });
  }, [strength]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      apply(e.clientX, e.clientY);
    },
    [apply]
  );

  const onPointerLeave = useCallback(() => {
    pending.current = { x: 0, y: 0 };
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setOffset({ x: 0, y: 0 });
    });
  }, []);

  const mediaStyle: React.CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(1.12)`,
    transition: 'transform 120ms ease-out',
    willChange: 'transform',
  };

  return { ref, offset, onPointerMove, onPointerLeave, mediaStyle };
}
