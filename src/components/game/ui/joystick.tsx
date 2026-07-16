'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface JoystickProps {
  onMove?: (data: { x: number; y: number }) => void;
  onEnd?: () => void;
  label?: string;
  side?: 'left' | 'right';
  className?: string;
}

export const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd, label, className }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if ('button' in e && e.button !== 0) return;
    setIsDragging(true);
  }, []);

  const handleMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    if (e.type === 'touchmove') {
      e.preventDefault();
    }

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = rect.width / 2;

    const limitedDistance = Math.min(distance, maxDistance);
    const angle = Math.atan2(dy, dx);

    const x = Math.cos(angle) * limitedDistance;
    const y = Math.sin(angle) * limitedDistance;

    setPosition({ x, y });

    if (onMove) {
      onMove({
        x: x / maxDistance,
        y: y / maxDistance,
      });
    }
  }, [isDragging, onMove]);

  const handleEnd = useCallback(() => {
    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    if (onEnd) onEnd();
  }, [onEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  return (
    <div className={cn(
      "flex flex-col items-center gap-2 select-none pointer-events-auto transition-opacity duration-300",
      isDragging ? "opacity-100" : "opacity-0",
      className
    )}>
      <div
        ref={containerRef}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        className="w-32 h-32 rounded-full bg-slate-900/60 backdrop-blur-md border-2 border-slate-700/50 flex items-center justify-center touch-none relative shadow-xl"
      >
        <div
          className="w-14 h-14 rounded-full bg-primary shadow-lg border-2 border-white/20 absolute"
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
        />
      </div>
      {label && <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] drop-shadow-md">{label}</span>}
    </div>
  );
};
