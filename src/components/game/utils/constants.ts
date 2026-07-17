/** Mirrors server/src/sim/constants.ts world bounds -- kept in sync manually until the two packages share a common types package. */
export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 12;
export const FINISH_X = WORLD_WIDTH - 2;
export const SPAWN_X = 2;

export const MATCH_DURATION_MS = 120_000;
export const MIN_PLAYERS_TO_START = 1;

export const NETWORK_SEND_HZ = 25;
export const NETWORK_SEND_INTERVAL_MS = 1000 / NETWORK_SEND_HZ;

export const CAMERA_FOLLOW_LERP = 0.12;
/** How far (world units) the left aim stick can pull the camera/look offset. */
export const MOBILE_LOOK_OFFSET_MAX = 4.5;
export const MOBILE_LOOK_SENSITIVITY = 0.12;
/** Screen-pixel offset for the crosshair while aiming on mobile. */
export const MOBILE_CROSSHAIR_REACH = 90;

export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
