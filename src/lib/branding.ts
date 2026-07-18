/**
 * Fallback assets only when admin left the SiteSettings field empty.
 * Any non-empty admin value (upload path or URL) always wins.
 */
export const DEFAULT_MARK_LOGO = '/K2.png';
export const DEFAULT_HEADER_LOGO = '/kilrun.png';
export const DEFAULT_HOME_HERO =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80';
export const DEFAULT_HUB_BACKGROUND =
  'https://i.postimg.cc/tJgX2XgN/bg.png';

/** Prefer admin-saved URL; fall back only when blank. */
export function resolveMarkLogo(url?: string | null) {
  const v = url?.trim();
  return v || DEFAULT_MARK_LOGO;
}

export function resolveHeaderLogo(url?: string | null) {
  const v = url?.trim();
  return v || DEFAULT_HEADER_LOGO;
}

export function resolveHomeHeroImage(url?: string | null) {
  const v = url?.trim();
  return v || DEFAULT_HOME_HERO;
}

export function resolveHubBackground(url?: string | null) {
  const v = url?.trim();
  return v || DEFAULT_HUB_BACKGROUND;
}

export function resolveLandingHeroImage(url?: string | null) {
  return url?.trim() || '';
}

/** True when the game is disabled and any scheduled re-enable time is still in the future. */
export function resolveGameDisabled(settings: {
  gameDisabled?: boolean | null;
  gameDisabledUntil?: Date | string | null;
}): boolean {
  if (!settings.gameDisabled) return false;
  if (settings.gameDisabledUntil) {
    const until = new Date(settings.gameDisabledUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() <= Date.now()) {
      return false;
    }
  }
  return true;
}
