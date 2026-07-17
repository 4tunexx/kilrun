import { ObstacleState, PlayerState } from '../schema/RoomState.js';
import { PLAYER_RADIUS } from './constants.js';

/** Circle (player) vs axis-aligned rect (obstacle), only meaningful while the obstacle is toggled active. */
export function isPlayerHitByObstacle(player: PlayerState, obstacle: ObstacleState): boolean {
  if (!obstacle.active) return false;

  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  const closestX = clamp(player.x, obstacle.x - halfWidth, obstacle.x + halfWidth);
  const closestY = clamp(player.y, obstacle.y - halfHeight, obstacle.y + halfHeight);

  const dx = player.x - closestX;
  const dy = player.y - closestY;
  return dx * dx + dy * dy < PLAYER_RADIUS * PLAYER_RADIUS;
}

/** Simple 2D hitscan: is `target` within `range` and roughly along `shooter`'s aim direction (a forgiving cone, not a pixel-perfect ray). */
export function isHitByShot(
  shooterX: number,
  shooterY: number,
  aimAngle: number,
  targetX: number,
  targetY: number,
  range: number,
  toleranceRadians = 0.18
): boolean {
  const dx = targetX - shooterX;
  const dy = targetY - shooterY;
  const distance = Math.hypot(dx, dy);
  if (distance > range) return false;

  const angleToTarget = Math.atan2(dy, dx);
  const angleDiff = Math.atan2(Math.sin(angleToTarget - aimAngle), Math.cos(angleToTarget - aimAngle));
  return Math.abs(angleDiff) <= toleranceRadians;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
