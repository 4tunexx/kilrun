'use client';

import React from 'react';
import type { DualJoystick } from '../input/dual-joystick';

/** On-screen Jump / Sprint for mobile — wired into DualJoystick hold state. */
export function MobileActionButtons({
  joystickRef,
  enabled,
}: {
  joystickRef: React.RefObject<DualJoystick | null>;
  enabled: boolean;
}) {
  if (!enabled) return null;

  const bind = (setter: (held: boolean) => void) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setter(true);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setter(false);
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.preventDefault();
      setter(false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="absolute bottom-20 right-4 sm:bottom-24 sm:right-6 z-[120] flex flex-col gap-3 pointer-events-auto">
      <button
        type="button"
        className="w-16 h-16 rounded-full border-2 border-emerald-400/70 bg-emerald-500/35 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_24px_rgba(52,211,153,0.35)] active:scale-95 transition"
        {...bind((held) => joystickRef.current?.setJumpHeld(held))}
      >
        Jump
      </button>
      <button
        type="button"
        className="w-14 h-14 rounded-full border-2 border-sky-400/70 bg-sky-500/30 text-white font-black text-[10px] uppercase tracking-wider shadow-[0_0_20px_rgba(56,189,248,0.3)] active:scale-95 transition self-end"
        {...bind((held) => joystickRef.current?.setSprintHeld(held))}
      >
        Sprint
      </button>
    </div>
  );
}
