import { ObstacleState, PlayerState } from '../schema/RoomState.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './constants.js';
import { isPlayerOverlappingObstacle } from '../../../shared/obstacle-hit.js';

export { isHitByShot } from '../../../shared/hitscan.js';

/** Circle (player XY) vs AABB hazard, only while active and overlapping in height. */
export function isPlayerHitByObstacle(player: PlayerState, obstacle: ObstacleState): boolean {
  return isPlayerOverlappingObstacle(player, obstacle, PLAYER_RADIUS, PLAYER_HEIGHT);
}
