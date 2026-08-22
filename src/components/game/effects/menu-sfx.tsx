'use client';

import React, { useEffect, useRef } from 'react';
import { playSound, playMenuMusic, stopMenuMusic, preloadSoundboard } from './soundboard';

const INTERACTIVE = 'button, a[href], [role="button"], [role="menuitem"], select, summary';

function interactiveEl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest(INTERACTIVE);
}

/**
 * Capture-phase click/hover SFX for editor chrome and in-game menus.
 * Opt out with data-no-menu-sfx on an ancestor.
 */
export function MenuSfxRoot({
  children,
  className,
  music,
}: {
  children: React.ReactNode;
  className?: string;
  music?: 'menu' | 'none';
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadSoundboard();
    if (music === 'menu') playMenuMusic();
    return () => {
      if (music === 'menu') stopMenuMusic();
    };
  }, [music]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const el = interactiveEl(e.target);
      if (!el || !root.contains(el) || el.closest('[data-no-menu-sfx]')) return;
      if (el.closest('[data-menu-sfx-root]') !== root) return;
      playSound('ui_click');
    };
    const onOver = (e: PointerEvent) => {
      const el = interactiveEl(e.target);
      if (!el || !root.contains(el) || el.closest('[data-no-menu-sfx]')) return;
      if (el.closest('[data-menu-sfx-root]') !== root) return;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      const from = interactiveEl(e.relatedTarget);
      if (from === el) return;
      playSound('ui_hover');
    };

    root.addEventListener('click', onClick, true);
    root.addEventListener('pointerover', onOver, true);
    return () => {
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('pointerover', onOver, true);
    };
  }, []);

  return (
    <div ref={rootRef} className={className} data-menu-sfx-root="">
      {children}
    </div>
  );
}
