/**
 * Global 3rd-person view tuning — camera boom, crosshair, player framing.
 * Stored in localStorage so Play Test + live matches share one feel.
 * Each mode (Deathrun / Horde / Competitive) can have its own `MapDocument.tpsView`,
 * which overrides the global settings for that mode only. Deathrun's is used
 * as a fallback default only for modes that haven't authored their own.
 */

export const TPS_VIEW_STORAGE_KEY = 'kilrun.tpsView.v1';

export interface TpsCameraSettings {
  /** Spring-arm length (meters behind head). */
  boomDistance: number;
  /** Pivot height above feet. */
  lookHeight: number;
  /** Positive = over right shoulder. */
  shoulder: number;
  /** Idle look pitch (radians, up positive). */
  defaultPitch: number;
  pitchMin: number;
  pitchMax: number;
  fov: number;
  /** Higher = snappier follow (used as exp lerp rate). */
  followSharpness: number;
  /** Mouse look degrees per pixel (Foundry default 0.1). */
  mouseSensDeg: number;
}

export interface TpsCrosshairSettings {
  size: number;
  gap: number;
  thickness: number;
  opacity: number;
  color: string;
  showDot: boolean;
  showLines: boolean;
  /** Soft outer ring for readability. */
  showRing: boolean;
}

export interface TpsPlayerViewSettings {
  scale: number;
  offsetY: number;
  /** Extra yaw on the mesh (degrees). */
  yawOffsetDeg: number;
  /** Hide body when boom is closer than hideDistance. */
  hideWhenClose: boolean;
  hideDistance: number;
}

export interface TpsViewSettings {
  version: 1;
  camera: TpsCameraSettings;
  crosshair: TpsCrosshairSettings;
  player: TpsPlayerViewSettings;
}

export const DEFAULT_TPS_VIEW: TpsViewSettings = {
  version: 1,
  camera: {
    boomDistance: 5.2,
    lookHeight: 1.5,
    shoulder: 0,
    defaultPitch: -0.22,
    pitchMin: -1.05,
    pitchMax: 0.72,
    fov: 75,
    followSharpness: 32,
    mouseSensDeg: 0.1,
  },
  crosshair: {
    size: 8,
    gap: 4,
    thickness: 1,
    opacity: 0.92,
    color: '#ffffff',
    showDot: true,
    showLines: true,
    showRing: false,
  },
  player: {
    scale: 1,
    offsetY: 0,
    yawOffsetDeg: 0,
    hideWhenClose: false,
    hideDistance: 1.2,
  },
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ---------------------------------------------------------------------------
// Admin-tunable GLOBAL default (SiteSettings.defaultTpsViewJson) — a DB-backed
// override for the hardcoded `DEFAULT_TPS_VIEW` safety net below. Mutated in
// place by `applyDynamicDefaultTpsView()` (called once the admin config has
// loaded), mirroring the Powers/Weapons dynamic-definition pattern elsewhere
// in the codebase. Full precedence chain, highest wins:
//   per-map tpsView > Deathrun MAIN fallback > this DB global default >
//   hardcoded DEFAULT_TPS_VIEW > (per-browser localStorage still applies
//   ABOVE the DB default whenever the player has set one — see
//   `loadTpsViewSettings()` below; that's an intentionally separate,
//   lower-priority personal override, not part of this admin chain).
// ---------------------------------------------------------------------------

let dynamicDefaultTpsView: TpsViewSettings | null = null;

/** Hot-swap the effective baseline default (called after loading from the
 * admin-editable SiteSettings.defaultTpsViewJson config). */
export function applyDynamicDefaultTpsView(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Object.keys(raw as object).length === 0) return;
  dynamicDefaultTpsView = sanitizeTpsViewAgainst(raw, DEFAULT_TPS_VIEW);
}

export function resetToStaticDefaultTpsView(): void {
  dynamicDefaultTpsView = null;
}

/** The baseline used to fill in missing fields — the admin-set DB default if
 * loaded, else the hardcoded safety net. Never throws. */
function currentDefaultBase(): TpsViewSettings {
  return dynamicDefaultTpsView ?? DEFAULT_TPS_VIEW;
}

export function getEffectiveDefaultTpsView(): TpsViewSettings {
  return structuredClone(currentDefaultBase());
}

let tpsDefaultHydrated = false;

/**
 * Client-side bridge: fetch the admin-tunable global TPS default (public
 * server action read, no auth) and hot-swap `currentDefaultBase()`. Safe to
 * call from any client component (game boot) — silently keeps the hardcoded
 * `DEFAULT_TPS_VIEW` on any network/DB failure. Idempotent per page load.
 * Returns true if a new dynamic default was actually applied.
 */
export async function hydrateDefaultTpsViewFromApi(): Promise<boolean> {
  if (tpsDefaultHydrated) return false;
  try {
    const { getSiteSettings } = await import('@/lib/progression-actions');
    const settings = await getSiteSettings();
    const raw = (settings as { defaultTpsViewJson?: string })?.defaultTpsViewJson ?? '{}';
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      applyDynamicDefaultTpsView(parsed);
      tpsDefaultHydrated = true;
      return true;
    }
  } catch {
    // Keep the hardcoded DEFAULT_TPS_VIEW — never let this break gameplay.
  }
  return false;
}

function sanitizeTpsViewAgainst(raw: unknown, baseSettings: TpsViewSettings): TpsViewSettings {
  const base = structuredClone(baseSettings);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<TpsViewSettings>;
  const cam = (o.camera ?? {}) as Partial<TpsCameraSettings>;
  const xh = (o.crosshair ?? {}) as Partial<TpsCrosshairSettings>;
  const pl = (o.player ?? {}) as Partial<TpsPlayerViewSettings>;

  return {
    version: 1,
    camera: {
      boomDistance: clamp(Number(cam.boomDistance ?? base.camera.boomDistance), 1.5, 14),
      lookHeight: clamp(Number(cam.lookHeight ?? base.camera.lookHeight), 0.4, 2.8),
      shoulder: clamp(Number(cam.shoulder ?? base.camera.shoulder), -2, 2),
      defaultPitch: clamp(Number(cam.defaultPitch ?? base.camera.defaultPitch), -1.2, 0.8),
      pitchMin: clamp(Number(cam.pitchMin ?? base.camera.pitchMin), -1.4, 0),
      pitchMax: clamp(Number(cam.pitchMax ?? base.camera.pitchMax), 0, 1.2),
      fov: clamp(Number(cam.fov ?? base.camera.fov), 40, 100),
      followSharpness: clamp(Number(cam.followSharpness ?? base.camera.followSharpness), 4, 80),
      mouseSensDeg: clamp(Number(cam.mouseSensDeg ?? base.camera.mouseSensDeg), 0.02, 0.5),
    },
    crosshair: {
      size: clamp(Number(xh.size ?? base.crosshair.size), 2, 28),
      gap: clamp(Number(xh.gap ?? base.crosshair.gap), 0, 24),
      thickness: clamp(Number(xh.thickness ?? base.crosshair.thickness), 1, 6),
      opacity: clamp(Number(xh.opacity ?? base.crosshair.opacity), 0.15, 1),
      color: typeof xh.color === 'string' && xh.color ? xh.color : base.crosshair.color,
      showDot: xh.showDot !== false,
      showLines: xh.showLines !== false,
      showRing: !!xh.showRing,
    },
    player: {
      scale: clamp(Number(pl.scale ?? base.player.scale), 0.5, 2),
      offsetY: clamp(Number(pl.offsetY ?? base.player.offsetY), -1, 1.5),
      yawOffsetDeg: clamp(Number(pl.yawOffsetDeg ?? base.player.yawOffsetDeg), -180, 180),
      hideWhenClose: !!pl.hideWhenClose,
      hideDistance: clamp(Number(pl.hideDistance ?? base.player.hideDistance), 0.5, 4),
    },
  };
}

/** Sanitize an arbitrary (possibly partial) settings object against the
 * CURRENT effective baseline — the admin-set DB default if loaded, else the
 * hardcoded `DEFAULT_TPS_VIEW`. Missing fields fall back to that baseline,
 * so per-map records authored before the DB default existed still pick up
 * the platform default for anything they didn't explicitly override. */
export function sanitizeTpsView(raw: unknown): TpsViewSettings {
  return sanitizeTpsViewAgainst(raw, currentDefaultBase());
}

export function loadTpsViewSettings(): TpsViewSettings {
  if (typeof window === 'undefined') return getEffectiveDefaultTpsView();
  try {
    const raw = localStorage.getItem(TPS_VIEW_STORAGE_KEY);
    if (!raw) return getEffectiveDefaultTpsView();
    return sanitizeTpsView(JSON.parse(raw));
  } catch {
    return getEffectiveDefaultTpsView();
  }
}

export function saveTpsViewSettings(settings: TpsViewSettings): void {
  if (typeof window === 'undefined') return;
  const clean = sanitizeTpsView(settings);
  localStorage.setItem(TPS_VIEW_STORAGE_KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent('kilrun:tps-view', { detail: clean }));
}

export function mouseSensRadians(settings: TpsViewSettings): number {
  return (settings.camera.mouseSensDeg * Math.PI) / 180;
}

/**
 * Resolve TPS for a single map. When the map has `tpsView`, it fully replaces
 * global localStorage (no field-level merge leftovers from other modes).
 */
export function resolveTpsView(mapOverride?: unknown | null): TpsViewSettings {
  if (mapOverride && typeof mapOverride === 'object') {
    return sanitizeTpsView(mapOverride);
  }
  return loadTpsViewSettings();
}

/**
 * Platform-wide camera for any match mode. Each mode uses its OWN map's
 * tpsView if authored — that's the whole point of being able to copy one
 * mode's settings and paste them into another instead of them all being
 * forced to match Deathrun's. Deathrun's is used only as a fallback
 * default for a mode that hasn't authored its own yet, then global
 * localStorage as the last resort.
 */
export function resolvePlatformTpsView(opts?: {
  /** Active map for the mode being played (Horde / Comp / Deathrun). */
  modeMapOverride?: unknown | null;
  /** Deathrun MAIN map `tpsView` — used only if no mode-specific setting. */
  deathrunMapOverride?: unknown | null;
}): TpsViewSettings {
  const modeOverride = opts?.modeMapOverride;
  if (modeOverride && typeof modeOverride === 'object') {
    return sanitizeTpsView(modeOverride);
  }
  const deathrun = opts?.deathrunMapOverride;
  if (deathrun && typeof deathrun === 'object') {
    return sanitizeTpsView(deathrun);
  }
  return loadTpsViewSettings();
}
