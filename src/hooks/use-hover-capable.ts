'use client';

import { useEffect, useState } from 'react';

/** True on desktop/trackpad devices that support real `:hover`; false on touch. */
export function useHoverCapable(): boolean {
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
    setHoverCapable(mql.matches);
    const onChange = () => setHoverCapable(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return hoverCapable;
}
