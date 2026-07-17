import type { Vector2 } from '../types';

/**
 * Projects the authoritative 2D world (x = distance down the track, y =
 * lateral lane position) into the angled "2.5D" screen space -- a runner
 * camera looking down the corridor from slightly above and behind the
 * local player, similar to Subway Surfers/Crossy Road rather than a true
 * top-down or a diamond-grid isometric projection (which doesn't suit a
 * linear corridor track).
 */

const BASE_SCALE = 34; // pixels per world unit at the camera's focus depth
const DEPTH_TILT = 0.55; // vertical screen displacement per unit of depth-from-camera -- this is what creates the "angled" look
const PERSPECTIVE_STRENGTH = 0.015; // objects further ahead shrink slightly, approximating perspective without true 3D
const HORIZON_Y_RATIO = 0.62; // where the camera's focus point sits vertically on screen

export interface IsoCamera {
  focusX: number;
  focusY: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
  depth: number;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  camera: IsoCamera,
  screenWidth: number,
  screenHeight: number
): ScreenPoint {
  const depth = worldX - camera.focusX;
  const scale = BASE_SCALE / (1 + Math.max(0, depth) * PERSPECTIVE_STRENGTH);
  const x = screenWidth / 2 + (worldY - camera.focusY) * scale;
  const y = screenHeight * HORIZON_Y_RATIO - depth * scale * DEPTH_TILT;
  return { x, y, scale, depth };
}

/** Draw order: farthest-ahead entities first (lower zIndex), nearest last (higher zIndex) so near objects occlude far ones. */
export function depthZIndex(worldX: number): number {
  return -worldX;
}

export interface ScreenExtent extends ScreenPoint {
  halfWidth: number; // screen-space half-extent along the lateral (worldY) axis
  halfHeight: number; // screen-space half-extent along the depth (worldX) axis
}

/** Like `worldToScreen`, but also converts a world-space bounding box half-size into screen-space, for drawing rectangular obstacles. */
export function worldExtentToScreen(
  worldX: number,
  worldY: number,
  halfExtentX: number,
  halfExtentY: number,
  camera: IsoCamera,
  screenWidth: number,
  screenHeight: number
): ScreenExtent {
  const point = worldToScreen(worldX, worldY, camera, screenWidth, screenHeight);
  return {
    ...point,
    halfWidth: halfExtentY * point.scale,
    halfHeight: halfExtentX * point.scale * DEPTH_TILT,
  };
}

/** Converts a screen-space direction (e.g. from a joystick/cursor) back into world-space movement intent for this camera. */
export function screenDirectionToWorld(screenDir: Vector2): Vector2 {
  // Screen-right maps to +worldY (lane position); screen-up maps to +worldX (forward, toward the finish).
  return { x: -screenDir.y, y: screenDir.x };
}

/** Inverse of `screenDirectionToWorld`, for drawing a world-space aim angle (radians) as a screen-space angle. */
export function worldAngleToScreenAngle(worldAngleRadians: number): number {
  const worldDir = { x: Math.cos(worldAngleRadians), y: Math.sin(worldAngleRadians) };
  const screenDir = { x: worldDir.y, y: -worldDir.x };
  return Math.atan2(screenDir.y, screenDir.x);
}
