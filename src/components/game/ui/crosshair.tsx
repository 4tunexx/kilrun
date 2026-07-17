'use client';

import React from 'react';

/**
 * Always visible on desktop; on mobile it only appears while the aim
 * joystick is actively held (`visible` is driven by `InputManager.isAiming()`).
 * Optional `offsetX`/`offsetY` shift the reticle with the left aim stick.
 */
export const Crosshair: React.FC<{
  visible: boolean;
  offsetX?: number;
  offsetY?: number;
}> = ({ visible, offsetX = 0, offsetY = 0 }) => {
  if (!visible) return null;

  return (
    <div
      className="absolute top-1/2 left-1/2 pointer-events-none mix-blend-difference z-[120]"
      style={{ transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))` }}
    >
      <div className="w-1.5 h-1.5 bg-white rounded-full" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-4 w-[2px] h-3 bg-white" />
      <div className="absolute left-1/2 -translate-x-1/2 top-4 w-[2px] h-3 bg-white" />
      <div className="absolute top-1/2 -translate-y-1/2 -left-4 h-[2px] w-3 bg-white" />
      <div className="absolute top-1/2 -translate-y-1/2 left-4 h-[2px] w-3 bg-white" />
    </div>
  );
};
