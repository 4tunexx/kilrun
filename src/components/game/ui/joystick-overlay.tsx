'use client';

import React, { useEffect, useRef } from 'react';
import type { DualJoystick } from '../input/dual-joystick';

const BASE_SIZE = 110;
const KNOB_SIZE = 48;

/**
 * Draws the floating virtual sticks that spawn under each finger on mobile.
 * Updates via rAF from the live DualJoystick state (no React re-render spam).
 */
export function JoystickOverlay({
  joystickRef,
  enabled,
}: {
  joystickRef: React.RefObject<DualJoystick | null>;
  enabled: boolean;
}) {
  const leftBaseRef = useRef<HTMLDivElement>(null);
  const leftKnobRef = useRef<HTMLDivElement>(null);
  const rightBaseRef = useRef<HTMLDivElement>(null);
  const rightKnobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    const paint = (
      baseEl: HTMLDivElement | null,
      knobEl: HTMLDivElement | null,
      stick: { active: boolean; start: { x: number; y: number }; current: { x: number; y: number } }
    ) => {
      if (!baseEl || !knobEl) return;
      if (!stick.active) {
        baseEl.style.opacity = '0';
        knobEl.style.opacity = '0';
        return;
      }
      baseEl.style.opacity = '1';
      knobEl.style.opacity = '1';
      baseEl.style.transform = `translate(${stick.start.x - BASE_SIZE / 2}px, ${stick.start.y - BASE_SIZE / 2}px)`;
      knobEl.style.transform = `translate(${stick.current.x - KNOB_SIZE / 2}px, ${stick.current.y - KNOB_SIZE / 2}px)`;
    };

    const tick = () => {
      const joy = joystickRef.current;
      if (joy) {
        paint(leftBaseRef.current, leftKnobRef.current, joy.aimStick);
        paint(rightBaseRef.current, rightKnobRef.current, joy.moveStick);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, joystickRef]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[115] overflow-hidden">
      {/* Left = aim / look */}
      <div
        ref={leftBaseRef}
        className="absolute top-0 left-0 rounded-full border-2 border-white/35 bg-white/10 transition-opacity duration-75"
        style={{ width: BASE_SIZE, height: BASE_SIZE, opacity: 0 }}
      />
      <div
        ref={leftKnobRef}
        className="absolute top-0 left-0 rounded-full border-2 border-primary/80 bg-primary/50 shadow-[0_0_20px_rgba(239,68,68,0.45)] transition-opacity duration-75"
        style={{ width: KNOB_SIZE, height: KNOB_SIZE, opacity: 0 }}
      />
      {/* Right = move */}
      <div
        ref={rightBaseRef}
        className="absolute top-0 left-0 rounded-full border-2 border-white/35 bg-white/10 transition-opacity duration-75"
        style={{ width: BASE_SIZE, height: BASE_SIZE, opacity: 0 }}
      />
      <div
        ref={rightKnobRef}
        className="absolute top-0 left-0 rounded-full border-2 border-sky-400/80 bg-sky-400/45 shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-opacity duration-75"
        style={{ width: KNOB_SIZE, height: KNOB_SIZE, opacity: 0 }}
      />

      <div className="absolute bottom-3 left-3 right-3 flex justify-between text-[10px] sm:text-xs uppercase tracking-wider text-white/50 font-semibold pointer-events-none">
        <span>Hold left · aim / look</span>
        <span>Hold right · move</span>
      </div>
    </div>
  );
}
