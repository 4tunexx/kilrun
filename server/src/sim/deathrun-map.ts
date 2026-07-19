import { ObstacleState } from '../schema/RoomState.js';
import { WORLD_HEIGHT } from './constants.js';

interface ObstacleBlueprint {
  kind: ObstacleState['kind'];
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  intervalMs: number;
  activeMs: number;
}

/**
 * Hazards sit on / above platforms. Heights (z) match the platform course so
 * runners must time jumps AND dodge active traps.
 */
export const DEATHRUN_TRACK: ObstacleBlueprint[] = [
  { kind: 'spike', x: 7, y: WORLD_HEIGHT / 2, z: 0, width: 1.6, height: 3.5, intervalMs: 2000, activeMs: 900 },
  { kind: 'saw', x: 14, y: WORLD_HEIGHT / 2, z: 0.6, width: 1.5, height: 1.5, intervalMs: 1500, activeMs: 1500 },
  { kind: 'laser', x: 20.2, y: WORLD_HEIGHT / 2, z: 1.2, width: 0.5, height: 3.2, intervalMs: 2800, activeMs: 1200 },
  { kind: 'crusher', x: 23, y: WORLD_HEIGHT / 2, z: 2.4, width: 2.4, height: 1.6, intervalMs: 2400, activeMs: 900 },
  { kind: 'saw', x: 26.5, y: WORLD_HEIGHT / 2, z: 2.0, width: 1.3, height: 1.3, intervalMs: 1700, activeMs: 1700 },
  { kind: 'spike', x: 30.5, y: 2.8, z: 1.0, width: 1.4, height: 2.4, intervalMs: 1900, activeMs: 850 },
  { kind: 'spike', x: 30.5, y: 7.2, z: 1.0, width: 1.4, height: 2.4, intervalMs: 2100, activeMs: 850 },
  { kind: 'laser', x: 34.5, y: WORLD_HEIGHT / 2, z: 0.2, width: 0.5, height: 4, intervalMs: 2300, activeMs: 1100 },
  { kind: 'crusher', x: 38.5, y: WORLD_HEIGHT / 2, z: 1.2, width: 2.6, height: 1.8, intervalMs: 2200, activeMs: 950 },
  { kind: 'saw', x: 42.5, y: WORLD_HEIGHT / 2, z: 0.7, width: 1.4, height: 1.4, intervalMs: 1600, activeMs: 1600 },
];

export function createDeathrunObstacles(): ObstacleState[] {
  return DEATHRUN_TRACK.map((bp, index) => {
    const obstacle = new ObstacleState();
    obstacle.id = `obstacle_${index}`;
    obstacle.kind = bp.kind;
    obstacle.x = bp.x;
    obstacle.y = bp.y;
    obstacle.z = bp.z;
    obstacle.width = bp.width;
    obstacle.height = bp.height;
    obstacle.intervalMs = bp.intervalMs;
    obstacle.activeMs = bp.activeMs;
    obstacle.active = false;
    return obstacle;
  });
}
