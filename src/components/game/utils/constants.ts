/** Mirrors server/src/sim/constants.ts world bounds. */
export const WORLD_WIDTH = 48;
export const WORLD_HEIGHT = 10;
export const FINISH_X = WORLD_WIDTH - 2;
export const SPAWN_X = 2;

export const MATCH_DURATION_MS = 180_000;
export const MIN_PLAYERS_TO_START = 1;

export const NETWORK_SEND_HZ = 30;
export const NETWORK_SEND_INTERVAL_MS = 1000 / NETWORK_SEND_HZ;

export const CAMERA_FOLLOW_LERP = 0.14;
export const CAMERA_YAW_KEY_SPEED = 1.8; // rad/s for Q/E
export const CAMERA_YAW_MOUSE_SENS = 0.0042;
export const CAMERA_YAW_STICK_SENS = 2.0;

export const MOBILE_LOOK_OFFSET_MAX = 4.5;
export const MOBILE_LOOK_SENSITIVITY = 0.12;
export const MOBILE_CROSSHAIR_REACH = 90;

export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
