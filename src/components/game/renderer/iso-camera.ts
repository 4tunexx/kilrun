import type { Vector2 } from '../types';

/**
 * Projects the authoritative 3-axis world (x = forward, y = lateral, z = height)
 * into an angled runner camera. Camera yaw lets the player orbit look left/right.
 */

const BASE_SCALE = 36;
const DEPTH_TILT = 0.55;
const HEIGHT_LIFT = 0.92;
const PERSPECTIVE_STRENGTH = 0.015;
const HORIZON_Y_RATIO = 0.64;

export interface IsoCamera {
  focusX: number;
  focusY: number;
  focusZ: number;
  /** Radians — rotates view around the vertical axis. */
  yaw: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
  depth: number;
}

function toCameraSpace(worldX: number, worldY: number, camera: IsoCamera) {
  const dx = worldX - camera.focusX;
  const dy = worldY - camera.focusY;
  const cos = Math.cos(camera.yaw);
  const sin = Math.sin(camera.yaw);
  // Rotate so +localDepth is "ahead" of the camera.
  const localDepth = dx * cos + dy * sin;
  const localSide = -dx * sin + dy * cos;
  return { localDepth, localSide };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  camera: IsoCamera,
  screenWidth: number,
  screenHeight: number,
  worldZ = 0
): ScreenPoint {
  const { localDepth, localSide } = toCameraSpace(worldX, worldY, camera);
  const height = worldZ - (camera.focusZ || 0);
  const scale = BASE_SCALE / (1 + Math.max(0, localDepth) * PERSPECTIVE_STRENGTH);
  const x = screenWidth / 2 + localSide * scale;
  const y =
    screenHeight * HORIZON_Y_RATIO -
    localDepth * scale * DEPTH_TILT -
    height * scale * HEIGHT_LIFT;
  return { x, y, scale, depth: localDepth };
}

export function depthZIndex(worldX: number, worldZ = 0): number {
  return -worldX * 10 - worldZ;
}

export interface ScreenExtent extends ScreenPoint {
  halfWidth: number;
  halfHeight: number;
}

export function worldExtentToScreen(
  worldX: number,
  worldY: number,
  halfExtentX: number,
  halfExtentY: number,
  camera: IsoCamera,
  screenWidth: number,
  screenHeight: number,
  worldZ = 0
): ScreenExtent {
  const point = worldToScreen(worldX, worldY, camera, screenWidth, screenHeight, worldZ);
  return {
    ...point,
    halfWidth: halfExtentY * point.scale,
    halfHeight: halfExtentX * point.scale * DEPTH_TILT,
  };
}

/** Screen stick/WASD → world intent, then rotate by camera yaw. */
export function screenDirectionToWorld(screenDir: Vector2, cameraYaw = 0): Vector2 {
  // Screen-right → +lateral side; screen-up → +forward
  const forward = -screenDir.y;
  const side = screenDir.x;
  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);
  return {
    x: forward * cos - side * sin,
    y: forward * sin + side * cos,
  };
}

export function worldAngleToScreenAngle(worldAngleRadians: number, cameraYaw = 0): number {
  const adjusted = worldAngleRadians - cameraYaw;
  const worldDir = { x: Math.cos(adjusted), y: Math.sin(adjusted) };
  const screenDir = { x: worldDir.y, y: -worldDir.x };
  return Math.atan2(screenDir.y, screenDir.x);
}
