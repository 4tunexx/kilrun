/**
 * Browser / Engine client for in-game progression. Hits live HTTP APIs so
 * the Windows app is not stuck on the fake Vite server-action stub.
 */

import type { AbilityKey, GameProgressionSnapshot } from '@shared/ability-progression';
import {
  applyDynamicPowerDefinitions,
  STATIC_FALLBACK_POWERS,
  type PowerDefinitionRecord,
} from '@shared/power-definitions';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';
import { engineFetch, enginePlatformOrigin, hasEngineSession } from '@/lib/engine/platform-client';

export type { GameProgressionSnapshot };
export const PROGRESSION_CHANGED_EVENT = 'kilrun-progression-changed';

export function notifyProgressionChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROGRESSION_CHANGED_EVENT));
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* ignore */
  }
  return `Progression request failed (${res.status})`;
}

async function progressionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (isKilrunEngineDesktop()) {
    if (!hasEngineSession()) {
      throw new Error('Link live game first (Build → Link live game)');
    }
    return engineFetch(path, init);
  }
  return fetch(path, { ...init, credentials: 'include' });
}

export async function fetchGameProgression(): Promise<GameProgressionSnapshot | null> {
  // Always the signed-in caller's own progression — the server resolves
  // identity from the session/bearer token, never from a query param.
  const res = await progressionFetch('/api/game/progression', { cache: 'no-store' });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    ok?: boolean;
    progression?: GameProgressionSnapshot | null;
    powers?: PowerDefinitionRecord[];
  };
  if (Array.isArray(data.powers) && data.powers.length > 0) {
    applyDynamicPowerDefinitions(data.powers);
  }
  return data.progression ?? null;
}

export async function fetchPowerDefinitionsForMenu(): Promise<PowerDefinitionRecord[]> {
  try {
    const origin = isKilrunEngineDesktop() ? enginePlatformOrigin() : '';
    const res = await fetch(`${origin}/api/game/power-definitions`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return STATIC_FALLBACK_POWERS;
    const data = (await res.json()) as { powers?: PowerDefinitionRecord[] };
    const list = Array.isArray(data.powers) && data.powers.length > 0 ? data.powers : STATIC_FALLBACK_POWERS;
    applyDynamicPowerDefinitions(list);
    return list;
  } catch {
    return STATIC_FALLBACK_POWERS;
  }
}

export async function upgradeGameAbilityClient(
  _userId: string,
  ability: AbilityKey
): Promise<GameProgressionSnapshot> {
  const res = await progressionFetch('/api/game/progression', {
    method: 'POST',
    body: JSON.stringify({ ability }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    ok?: boolean;
    progression?: GameProgressionSnapshot;
    error?: string;
  };
  if (!data.progression) throw new Error(data.error || 'Upgrade failed');
  notifyProgressionChanged();
  return data.progression;
}
