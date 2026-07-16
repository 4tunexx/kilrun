
import { ObstacleData } from '../types';
import { Player } from '../entities/player';

export interface CollisionResult {
  hitObstacles: ObstacleData[];
  damage: number;
}

/**
 * Pure AABB-style collision check between the player and the currently
 * active obstacles. Takes explicit `player`/`obstacles` entities (rather
 * than reaching into engine-level globals) so it can be unit tested or
 * reused against a different player's session.
 */
export function checkCollisions(player: Player, obstacles: ObstacleData[]): CollisionResult {
  const hitObstacles: ObstacleData[] = [];

  for (const obs of obstacles) {
    if (obs.hit) continue;

    const dz = Math.abs(obs.position.z - player.position.z);
    const dx = Math.abs(obs.position.x - player.position.x);
    const dy = Math.abs(obs.position.y - player.position.y);

    if (dz < 1.0 && dx < obs.size.x / 1.5 && dy < obs.size.y) {
      obs.hit = true;
      hitObstacles.push(obs);
    }
  }

  return { hitObstacles, damage: hitObstacles.length };
}
