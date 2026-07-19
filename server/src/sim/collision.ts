import { ObstacleState, PlayerState } from '../schema/RoomState.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './constants.js';

/** Circle (player XY) vs AABB hazard, only while active and overlapping in height. */
export function isPlayerHitByObstacle(player: PlayerState, obstacle: ObstacleState): boolean {
  if (!obstacle.active) return false;

  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  const closestX = clamp(player.x, obstacle.x - halfWidth, obstacle.x + halfWidth);
  const closestY = clamp(player.y, obstacle.y - halfHeight, obstacle.y + halfHeight);

  const dx = player.x - closestX;
  const dy = player.y - closestY;
  if (dx * dx + dy * dy >= PLAYER_RADIUS * PLAYER_RADIUS) return false;

  // Vertical overlap: player capsule [z, z+PLAYER_HEIGHT] vs hazard band around obstacle.z
  const playerBottom = player.z;
  const playerTop = player.z + PLAYER_HEIGHT;
  const hazBottom = obstacle.z - 0.2;
  const hazTop = obstacle.z + Math.max(obstacle.height, 1.2);
  return playerTop >= hazBottom && playerBottom <= hazTop;
}

/** Simple 2D hitscan cone in XY (trapper). */
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
