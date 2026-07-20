/**
 * Deathrun floating course — pads with clear gaps (platformer read),
 * not a continuous tunnel floor.
 */
import { ObstacleState, PlatformState } from '../schema/RoomState.js';
import { COLLISION_SKIN, PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';

export interface PlatformBlueprint {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  kind?: PlatformState['kind'];
  boost?: number;
  /** Vertical thickness below top. */
  height?: number;
}

export interface ObstacleBlueprint {
  id?: string;
  kind?: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  intervalMs?: number;
  activeMs?: number;
  damage?: number;
  alwaysActive?: boolean;
  instantKill?: boolean;
}

export const DEATHRUN_PLATFORMS: PlatformBlueprint[] = [
  { x: 2.2, y: WORLD_HEIGHT / 2, z: 0, width: 4.2, depth: 4.2, height: 0.25 },
  { x: 6.0, y: WORLD_HEIGHT / 2, z: 0, width: 2.6, depth: 2.6, height: 0.25 },
  { x: 9.2, y: WORLD_HEIGHT / 2 - 1.6, z: 0.35, width: 2.4, depth: 2.4, height: 0.25 },
  { x: 9.2, y: WORLD_HEIGHT / 2 + 1.6, z: 0.35, width: 2.4, depth: 2.4, height: 0.25 },
  { x: 12.6, y: WORLD_HEIGHT / 2, z: 0.1, width: 2.8, depth: 3.0, height: 0.25 },
  { x: 15.8, y: WORLD_HEIGHT / 2, z: 0.55, width: 2.5, depth: 2.5, height: 0.25 },
  { x: 18.6, y: WORLD_HEIGHT / 2 + 0.4, z: 1.05, width: 2.3, depth: 2.3, height: 0.25 },
  { x: 21.4, y: WORLD_HEIGHT / 2 - 0.3, z: 1.55, width: 2.3, depth: 2.3, height: 0.25 },
  { x: 24.8, y: WORLD_HEIGHT / 2, z: 1.35, width: 3.6, depth: 1.35, height: 0.25 },
  { x: 28.4, y: 2.6, z: 0.9, width: 2.6, depth: 2.6, height: 0.25 },
  { x: 28.4, y: 7.4, z: 0.9, width: 2.6, depth: 2.6, height: 0.25 },
  { x: 32.0, y: WORLD_HEIGHT / 2, z: 0.15, width: 3.2, depth: 3.4, height: 0.25 },
  { x: 35.6, y: WORLD_HEIGHT / 2, z: 0.4, width: 3.4, depth: 2.8, height: 0.25 },
  { x: 39.0, y: WORLD_HEIGHT / 2, z: 0.25, width: 3.0, depth: 3.0, height: 0.25 },
  { x: 42.4, y: WORLD_HEIGHT / 2, z: 0, width: 3.2, depth: 3.6, height: 0.25 },
  { x: WORLD_WIDTH - 1.6, y: WORLD_HEIGHT / 2, z: 0, width: 3.4, depth: 4.0, height: 0.25 },
];

export function createFromBlueprints(blueprints: PlatformBlueprint[]): PlatformState[] {
  return blueprints.map((bp, index) => {
    const platform = new PlatformState();
    platform.id = `platform_${index}`;
    platform.kind = bp.kind ?? 'solid';
    platform.x = bp.x;
    platform.y = bp.y;
    platform.z = bp.z;
    platform.width = bp.width;
    platform.depth = bp.depth;
    platform.height = bp.height ?? 0.2;
    platform.boost = bp.boost ?? 0;
    return platform;
  });
}

export function createObstaclesFromBlueprints(blueprints: ObstacleBlueprint[]): ObstacleState[] {
  return blueprints.map((bp, index) => {
    const obstacle = new ObstacleState();
    obstacle.id = bp.id ?? `hazard_${index}`;
    obstacle.kind = bp.kind ?? 'damage';
    obstacle.x = bp.x;
    obstacle.y = bp.y;
    obstacle.z = bp.z;
    obstacle.width = bp.width;
    obstacle.height = bp.height;
    obstacle.intervalMs = bp.intervalMs ?? 500;
    obstacle.activeMs = bp.activeMs ?? 999999;
    obstacle.damage = bp.instantKill ? 999 : bp.damage ?? 25;
    obstacle.alwaysActive = bp.alwaysActive !== false;
    obstacle.active = obstacle.alwaysActive;
    return obstacle;
  });
}

export function createDeathrunPlatforms(): PlatformState[] {
  return createFromBlueprints(DEATHRUN_PLATFORMS);
}

export interface PlatformHit {
  platform: PlatformState;
  topZ: number;
}

export function findSupportPlatform(
  x: number,
  y: number,
  z: number,
  platforms: Iterable<PlatformState>,
  radius: number,
  maxSnapDown = 0.35
): PlatformHit | null {
  let best: PlatformHit | null = null;
  for (const platform of platforms) {
    const halfW = platform.width / 2;
    const halfD = platform.depth / 2;
    if (x < platform.x - halfW - radius || x > platform.x + halfW + radius) continue;
    if (y < platform.y - halfD - radius || y > platform.y + halfD + radius) continue;
    const topZ = platform.z;
    if (z >= topZ - maxSnapDown && z <= topZ + 0.55) {
      if (!best || topZ > best.topZ) best = { platform, topZ };
    }
  }
  return best;
}

/**
 * Push the player out of tall solid volumes (walls / thick props).
 * Thin pads (height ≤ 0.35) are top-only and skip side collision.
 */
export function resolveSolidCollisions(
  pos: { x: number; y: number; z: number },
  platforms: Iterable<PlatformState>,
  radius = PLAYER_RADIUS,
  height = PLAYER_HEIGHT
): { x: number; y: number } {
  let { x, y } = pos;
  const playerBottom = pos.z;
  const playerTop = pos.z + height;

  for (const platform of platforms) {
    const boxH = platform.height > 0 ? platform.height : 0.2;
    // Thin floors: no side collision
    if (boxH <= 0.35) continue;

    const topZ = platform.z;
    const bottomZ = topZ - boxH;
    // Vertical overlap with skin
    if (playerTop <= bottomZ + COLLISION_SKIN || playerBottom >= topZ - COLLISION_SKIN) {
      continue;
    }

    const halfW = platform.width / 2 + radius;
    const halfD = platform.depth / 2 + radius;
    const dx = x - platform.x;
    const dy = y - platform.y;
    if (Math.abs(dx) >= halfW || Math.abs(dy) >= halfD) continue;

    // Push out along the shallowest axis
    const pushX = halfW - Math.abs(dx);
    const pushY = halfD - Math.abs(dy);
    if (pushX < pushY) {
      x = platform.x + Math.sign(dx || 1) * halfW;
    } else {
      y = platform.y + Math.sign(dy || 1) * halfD;
    }
  }

  return { x, y };
}
