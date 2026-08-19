const PREF_KEY = 'kilrun.engine.launchPref';

export type EngineLaunchPref = 'auto' | 'browser';

export function getEngineLaunchPref(): EngineLaunchPref {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    return raw === 'browser' ? 'browser' : 'auto';
  } catch {
    return 'auto';
  }
}

export function setEngineLaunchPref(pref: EngineLaunchPref): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* quota */
  }
}

export function shouldOfferEngineLaunch(opts: {
  isWindows: boolean;
  isDesktopEngine: boolean;
}): boolean {
  if (opts.isDesktopEngine) return false;
  if (!opts.isWindows) return false;
  return getEngineLaunchPref() === 'auto';
}
