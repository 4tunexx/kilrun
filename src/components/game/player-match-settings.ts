/** Local in-match pause settings (graphics / audio / look). Not saved on the map. */

export type PlayerMatchSettings = {
  bloom: boolean;
  masterVolume: number;
  mouseSensMult: number;
};

export const DEFAULT_PLAYER_MATCH_SETTINGS: PlayerMatchSettings = {
  bloom: true,
  masterVolume: 1,
  mouseSensMult: 1,
};

const KEY = 'kilrun.playerMatchSettings.v1';

export function loadPlayerMatchSettings(): PlayerMatchSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_PLAYER_MATCH_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLAYER_MATCH_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PlayerMatchSettings>;
    return sanitizePlayerMatchSettings(parsed);
  } catch {
    return { ...DEFAULT_PLAYER_MATCH_SETTINGS };
  }
}

export function savePlayerMatchSettings(next: PlayerMatchSettings): PlayerMatchSettings {
  const sanitized = sanitizePlayerMatchSettings(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sanitized));
  } catch {
    /* ignore quota */
  }
  return sanitized;
}

export function sanitizePlayerMatchSettings(
  raw: Partial<PlayerMatchSettings> | null | undefined
): PlayerMatchSettings {
  const vol = Number(raw?.masterVolume);
  const sens = Number(raw?.mouseSensMult);
  return {
    bloom: raw?.bloom !== false,
    masterVolume: Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1,
    mouseSensMult: Number.isFinite(sens) ? Math.max(0.25, Math.min(2.5, sens)) : 1,
  };
}
