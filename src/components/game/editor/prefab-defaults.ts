/**
 * Remembers the last scale a mapper used for each prefab model, so placing
 * the same prefab again starts at the size it was last resized to instead
 * of always resetting to [1,1,1]. Persisted per-browser (localStorage) —
 * intentionally not part of the map document, since this is an authoring
 * convenience, not map data.
 */

const STORAGE_KEY = 'kilrun.lastPrefabScale';

type ScaleTuple = [number, number, number];
type Store = Record<string, ScaleTuple>;

function readStore(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function getLastPrefabScale(model: string | undefined | null): ScaleTuple | null {
  if (!model) return null;
  const v = readStore()[model];
  return Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n)) ? v : null;
}

export function setLastPrefabScale(model: string | undefined | null, scale: ScaleTuple): void {
  if (!model || typeof window === 'undefined') return;
  if (!scale.every((n) => Number.isFinite(n) && n !== 0)) return;
  const store = readStore();
  store[model] = scale;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full/unavailable — remembering the last size is a nice-to-have.
  }
}
