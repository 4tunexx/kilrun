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
        entered ? 'opacity-[0.88]' : 'opacity-0'
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

const MARK_SIZE = 'h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20';
const WORDMARK_SIZE = 'h-12 sm:h-16 md:h-20 w-auto max-w-[min(100%,22rem)]';

/**
 * Wordmark + mark pair. When `markRevealed` (left nav collapsed), the small K
 * slides out from behind the wordmark and sits beside it at the same height.
 * When the nav is expanded, the mark tucks back under the wordmark.
 */
export function BrandLogoPair({
  wordmarkSrc,
  markSrc,
  markRevealed,
}: {
  wordmarkSrc: string;
  markSrc: string;
  /** true when left nav is collapsed — mark sits beside the wordmark */
  markRevealed: boolean;
}) {
  return (
    <div className="relative flex items-center">
      {/* Reserves space so the wordmark shifts right as the mark slides out */}
      <div
        className={cn(
          'shrink-0 transition-[width,margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          markRevealed ? 'w-12 sm:w-16 md:w-20 mr-2 sm:mr-3' : 'w-0 mr-0'
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={markSrc}
        alt=""
        draggable={false}
        aria-hidden
        className={cn(
          MARK_SIZE,
          'absolute top-1/2 -translate-y-1/2 object-contain select-none pointer-events-none',
          'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          markRevealed
            ? 'left-0 z-0 opacity-[0.88]'
            : 'left-10 sm:left-14 md:left-16 z-0 opacity-0 scale-90'
        )}
      />
      <div className="relative z-10 min-w-0">
        <InteractiveWordmark src={wordmarkSrc} className={WORDMARK_SIZE} />
      </div>
    </div>
  );
}
