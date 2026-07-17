'use client';

import React from 'react';

/**
 * Always visible on desktop; on mobile it only appears while the aim
 * joystick is actively held (`visible` is driven by `InputManager.isAiming()`).
 */
export const Crosshair: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-difference z-[120]">
      <div className="w-1.5 h-1.5 bg-white rounded-full" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-4 w-[2px] h-3 bg-white" />
      <div className="absolute left-1/2 -translate-x-1/2 top-4 w-[2px] h-3 bg-white" />
      <div className="absolute top-1/2 -translate-y-1/2 -left-4 h-[2px] w-3 bg-white" />
      <div className="absolute top-1/2 -translate-y-1/2 left-4 h-[2px] w-3 bg-white" />
    </div>
  );
};
