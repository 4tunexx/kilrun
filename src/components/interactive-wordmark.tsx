'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Kilrun wordmark: slides in from the left on mount, then gently
 * tilts under the pointer while hovered / tapped. No glow.
 */
export function InteractiveWordmark({
  src,
  alt = 'Kilrun',
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [entered, setEntered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, rot: 0 });
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const slideX = entered ? 0 : -64;
  const tx = slideX + (hovering ? tilt.x : 0);
  const ty = hovering ? tilt.y : 0;
  const rot = hovering ? tilt.rot : 0;

  return (
    <div
      className={cn(
        'inline-block origin-left will-change-transform cursor-pointer',
        entered ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg)`,
        transition: hovering
          ? 'transform 80ms ease-out, opacity 700ms ease-out'
          : 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out',
      }}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => {
        setHovering(false);
        setTilt({ x: 0, y: 0, rot: 0 });
      }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        setTilt({
          x: nx * 5,
          y: ny * 3,
          rot: nx * 2.5,
        });
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn('select-none pointer-events-none object-contain', className)}
      />
    </div>
  );
}
