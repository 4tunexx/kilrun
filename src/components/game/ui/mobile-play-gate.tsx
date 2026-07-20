'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Maximize2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectTouchDevice } from '../utils/constants';

function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(orientation: portrait)').matches || window.innerHeight > window.innerWidth;
}

async function requestGameFullscreen(target: HTMLElement) {
  const el = target as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) await el.msRequestFullscreen();
  } catch {
    // iOS Safari often blocks programmatic fullscreen — landscape prompt still helps.
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Not supported on most iPhones; ignore.
  }
}

/**
 * On phones/tablets: require landscape and nudge the player into fullscreen
 * before they can play. Desktop skips this gate entirely.
 */
export function MobilePlayGate({
  containerRef,
  children,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const isTouch = detectTouchDevice();
  const [portrait, setPortrait] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(true);

  useEffect(() => {
    if (!isTouch) return;
    const update = () => setPortrait(isPortrait());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [isTouch]);

  const enterPlay = useCallback(async () => {
    const node = containerRef.current;
    if (node) await requestGameFullscreen(node);
    setNeedsGesture(false);
  }, [containerRef]);

  if (!isTouch) return <>{children}</>;

  const blocked = portrait || needsGesture;

  return (
    <>
      {children}
      {blocked && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-950/95 px-6 pointer-events-auto">
          <div className="max-w-sm w-full text-center space-y-5 rounded-2xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl">
            {portrait ? (
              <>
                <Smartphone className="w-14 h-14 mx-auto text-primary rotate-90" />
                <h3 className="text-2xl font-black text-white">Tilt your phone</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Rotate to <span className="text-white font-semibold">landscape</span> (sideways)
                  for Deathrun. Joysticks need the wide screen.
                </p>
              </>
            ) : (
              <>
                <Maximize2 className="w-14 h-14 mx-auto text-primary" />
                <h3 className="text-2xl font-black text-white">Go fullscreen</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Tap below for fullscreen play. Then hold{' '}
                  <span className="text-white font-semibold">left</span> to move and{' '}
                  <span className="text-white font-semibold">right</span> to look.
                </p>
                <Button size="lg" className="w-full text-lg" onClick={enterPlay}>
                  Enter fullscreen & play
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
