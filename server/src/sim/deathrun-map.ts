import { ObstacleState } from '../schema/RoomState.js';
import { WORLD_HEIGHT } from './constants.js';

interface ObstacleBlueprint {
  kind: ObstacleState['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
  intervalMs: number;
  activeMs: number;
}

/**
 * The default Deathrun track: a straight corridor from x=0 (spawn) to
 * FINISH_X, seeded with automatic hazards that toggle on/off on their own
 * timers -- independent of anything the Trapper does. Later maps can add
 * more blueprints/layouts without touching room logic.
 */
export const DEATHRUN_TRACK: ObstacleBlueprint[] = [
  { kind: 'spike', x: 6, y: WORLD_HEIGHT / 2, width: 2, height: WORLD_HEIGHT, intervalMs: 2200, activeMs: 1100 },
  { kind: 'saw', x: 11, y: 3, width: 1.4, height: 1.4, intervalMs: 1600, activeMs: 1600 },
  { kind: 'laser', x: 15, y: WORLD_HEIGHT / 2, width: 0.6, height: WORLD_HEIGHT, intervalMs: 3000, activeMs: 1400 },
  { kind: 'crusher', x: 20, y: 4, width: 3, height: 2.2, intervalMs: 2600, activeMs: 1000 },
  { kind: 'saw', x: 20, y: 9, width: 1.4, height: 1.4, intervalMs: 1800, activeMs: 1800 },
  { kind: 'spike', x: 25, y: WORLD_HEIGHT / 2, width: 2, height: WORLD_HEIGHT, intervalMs: 2000, activeMs: 900 },
  { kind: 'laser', x: 30, y: WORLD_HEIGHT / 2, width: 0.6, height: WORLD_HEIGHT, intervalMs: 2400, activeMs: 1200 },
  { kind: 'crusher', x: 34, y: 6, width: 3, height: 2.2, intervalMs: 2200, activeMs: 1000 },
];

export function createDeathrunObstacles(): ObstacleState[] {
  return DEATHRUN_TRACK.map((bp, index) => {
    const obstacle = new ObstacleState();
    obstacle.id = `obstacle_${index}`;
    obstacle.kind = bp.kind;
    obstacle.x = bp.x;
    obstacle.y = bp.y;
    obstacle.width = bp.width;
    obstacle.height = bp.height;
    obstacle.intervalMs = bp.intervalMs;
    obstacle.activeMs = bp.activeMs;
    obstacle.active = false;
    return obstacle;
  });
}
