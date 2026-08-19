import {
  DEFAULT_KEY_BINDINGS,
  normalizeBindings,
  type KeyBindAction,
} from '@shared/key-bindings';

const STORAGE_KEY = 'kilrun.engine.keyBindings.v1';

function readLocal() {
  if (typeof window === 'undefined') return normalizeBindings(DEFAULT_KEY_BINDINGS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeBindings(DEFAULT_KEY_BINDINGS);
    return normalizeBindings(JSON.parse(raw));
  } catch {
    return normalizeBindings(DEFAULT_KEY_BINDINGS);
  }
}

export async function getKeyBindings() {
  return readLocal();
}

export async function updateKeyBindings(next: Partial<Record<KeyBindAction, string>>) {
  const merged = normalizeBindings({ ...readLocal(), ...next });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* quota */
  }
  return merged;
}
