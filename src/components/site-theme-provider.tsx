'use client';

import { useEffect } from 'react';
import { getSiteSettings } from '@/lib/progression-actions';
import { onSiteSettingsUpdated } from '@/lib/site-branding-events';
import { applyThemePalette, parseThemePalette } from '@/lib/theme-palette';

export function SiteThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    let settingsChanged = false;
    const unsubscribe = onSiteSettingsUpdated((settings) => {
      if (typeof settings.themePaletteJson !== 'string') return;
      settingsChanged = true;
      applyThemePalette(parseThemePalette(settings.themePaletteJson), document.documentElement);
    });

    getSiteSettings()
      .then((settings) => {
        if (cancelled || settingsChanged) return;
        applyThemePalette(parseThemePalette(settings.themePaletteJson), document.documentElement);
      })
      .catch((error: unknown) => {
        console.error('[site-theme] failed to load saved palette', error);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return children;
}
