/**
 * Deathrun floating course — pads with clear gaps (platformer read),
 * not a continuous tunnel floor.
 */
import { PlatformState } from '../schema/RoomState.js';
import { WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';

export interface PlatformBlueprint {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  kind?: PlatformState['kind'];
}

export const DEATHRUN_PLATFORMS: PlatformBlueprint[] = [
  // Spawn circle-ish pad
  { x: 2.2, y: WORLD_HEIGHT / 2, z: 0, width: 4.2, depth: 4.2 },
  // Stepping stones
  { x: 6.0, y: WORLD_HEIGHT / 2, z: 0, width: 2.6, depth: 2.6 },
  { x: 9.2, y: WORLD_HEIGHT / 2 - 1.6, z: 0.35, width: 2.4, depth: 2.4 },
  { x: 9.2, y: WORLD_HEIGHT / 2 + 1.6, z: 0.35, width: 2.4, depth: 2.4 },
  // Gap
  { x: 12.6, y: WORLD_HEIGHT / 2, z: 0.1, width: 2.8, depth: 3.0 },
  // Rising discs
  { x: 15.8, y: WORLD_HEIGHT / 2, z: 0.55, width: 2.5, depth: 2.5 },
  { x: 18.6, y: WORLD_HEIGHT / 2 + 0.4, z: 1.05, width: 2.3, depth: 2.3 },
  { x: 21.4, y: WORLD_HEIGHT / 2 - 0.3, z: 1.55, width: 2.3, depth: 2.3 },
  // Narrow beam
  { x: 24.8, y: WORLD_HEIGHT / 2, z: 1.35, width: 3.6, depth: 1.35 },
  // Split choice
  { x: 28.4, y: 2.6, z: 0.9, width: 2.6, depth: 2.6 },
  { x: 28.4, y: 7.4, z: 0.9, width: 2.6, depth: 2.6 },
  // Drop pad
  { x: 32.0, y: WORLD_HEIGHT / 2, z: 0.15, width: 3.2, depth: 3.4 },
  // Bridge stretch
  { x: 35.6, y: WORLD_HEIGHT / 2, z: 0.4, width: 3.4, depth: 2.8 },
  { x: 39.0, y: WORLD_HEIGHT / 2, z: 0.25, width: 3.0, depth: 3.0 },
  { x: 42.4, y: WORLD_HEIGHT / 2, z: 0, width: 3.2, depth: 3.6 },
  // Finish
  { x: WORLD_WIDTH - 1.6, y: WORLD_HEIGHT / 2, z: 0, width: 3.4, depth: 4.0 },
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
    return platform;
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
