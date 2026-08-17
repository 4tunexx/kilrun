/**
 * Player vs hazard overlap — shared by the live sim and Map Play Test so
 * trap volume matches between preview and the match server.
 */

export function isPlayerOverlappingObstacle(
  player: { x: number; y: number; z: number },
  obstacle: {
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth?: number;
    active?: boolean;
  },
  playerRadius: number,
  playerHeight: number
): boolean {
  if (obstacle.active === false) return false;

  const halfW = Math.max(0.05, obstacle.width / 2);
  const halfD = Math.max(0.05, (obstacle.depth && obstacle.depth > 0 ? obstacle.depth : obstacle.width) / 2);
  const closestX = clamp(player.x, obstacle.x - halfW, obstacle.x + halfW);
  const closestY = clamp(player.y, obstacle.y - halfD, obstacle.y + halfD);
  const dx = player.x - closestX;
  const dy = player.y - closestY;
  if (dx * dx + dy * dy >= playerRadius * playerRadius) return false;

  const playerBottom = player.z;
  const playerTop = player.z + playerHeight;
  const hazBottom = obstacle.z - 0.2;
  const hazTop = obstacle.z + Math.max(obstacle.height, 1.2);
  return playerTop >= hazBottom && playerBottom <= hazTop;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
