'use client';

import { useEffect, useState } from 'react';
import { listKilrunModes, type KilrunMode } from '@/lib/game-modes';

export function useKilrunModes(): KilrunMode[] {
  const [modes, setModes] = useState<KilrunMode[]>(() => listKilrunModes());
  useEffect(() => {
    const sync = () => setModes(listKilrunModes());
    window.addEventListener('kilrun-plugins-changed', sync);
    window.addEventListener('kilrun-plugin-modes-changed', sync);
    return () => {
      window.removeEventListener('kilrun-plugins-changed', sync);
      window.removeEventListener('kilrun-plugin-modes-changed', sync);
    };
  }, []);
  return modes;
}
