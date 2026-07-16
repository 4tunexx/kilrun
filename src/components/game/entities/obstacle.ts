
import { ObstacleData, Vector3 } from '../types';

let obstacleSequence = 0;

/** Builds a single obstacle entity at a given world position. */
export function createObstacle(position: Vector3, overrides: Partial<ObstacleData> = {}): ObstacleData {
  obstacleSequence += 1;
  return {
    id: `obs_${Date.now()}_${obstacleSequence}`,
    type: 'static',
    position,
    size: { x: 2, y: 6, z: 2 },
    color: '#3b82f6',
    hit: false,
    ...overrides,
  };
}

/**
 * Rolls a randomized obstacle archetype (laser wall, pillar, or side wall)
 * for procedural track generation at the given forward (`z`) position.
 */
export function spawnRandomObstacle(z: number): ObstacleData {
  const roll = Math.random();
  const position: Vector3 = { x: (Math.random() - 0.5) * 20, y: 0, z };

  if (roll > 0.8) {
    return createObstacle({ ...position, y: 3 }, {
      type: 'laser',
      size: { x: 10, y: 0.5, z: 0.5 },
      color: '#ef4444',
    });
  }

  if (roll > 0.5) {
    return createObstacle(position, {
      type: 'static',
      size: { x: 2, y: 6, z: 2 },
      color: '#3b82f6',
    });
  }

  return createObstacle({ ...position, x: Math.random() > 0.5 ? 10 : -10 }, {
    type: 'static',
    size: { x: 4, y: 8, z: 4 },
    color: '#1e293b',
  });
}
