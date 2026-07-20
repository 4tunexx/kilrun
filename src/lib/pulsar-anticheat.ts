/**
 * Client-side Pulsar anti-cheat activation (hub integrity signal).
 * Persists per browser so the right-rail Pulsar stays visible after refresh.
 */

const STORAGE_KEY = 'kilrun.pulsarAnticheat';

export function isPulsarActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPulsarActive(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}
