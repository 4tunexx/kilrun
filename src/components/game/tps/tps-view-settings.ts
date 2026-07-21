/**
 * Global 3rd-person view tuning — camera boom, crosshair, player framing.
 * Stored in localStorage so Play Test + live matches share one feel.
 * Maps may optionally embed an override via `MapDocument.tpsView`.
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

export function sanitizeTpsView(raw: unknown): TpsViewSettings {
  const base = structuredClone(DEFAULT_TPS_VIEW);
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

export function loadTpsViewSettings(): TpsViewSettings {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_TPS_VIEW);
  try {
    const raw = localStorage.getItem(TPS_VIEW_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_TPS_VIEW);
    return sanitizeTpsView(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_TPS_VIEW);
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

/** Merge map override on top of global (map wins when present). */
export function resolveTpsView(mapOverride?: unknown | null): TpsViewSettings {
  const global = loadTpsViewSettings();
  if (!mapOverride || typeof mapOverride !== 'object') return global;
  const override = mapOverride as Partial<TpsViewSettings>;
  return sanitizeTpsView({
    ...global,
    ...override,
    camera: { ...global.camera, ...override.camera },
    crosshair: { ...global.crosshair, ...override.crosshair },
    player: { ...global.player, ...override.player },
  });
}
