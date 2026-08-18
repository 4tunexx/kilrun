/**
 * Deathrun floating course — pads with clear gaps (platformer read),
 * not a continuous tunnel floor.
 */
import { ObstacleState, PlatformState } from '../schema/RoomState.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';
import {
  findSupportPad,
  resolveSolidPads,
  type CoreSolidResult,
} from '../../../shared/sim-core.js';

export interface PlatformBlueprint {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  kind?: PlatformState['kind'];
  /** True for pads meant to be walked over, never blocked against sideways
   * — see the matching field/comment on PlatformState. */
  topOnly?: boolean;
  boost?: number;
  /** Vertical thickness below top. */
  height?: number;
  conveyorSpeed?: number;
  conveyorDirX?: number;
  conveyorDirY?: number;
  motionPeriodMs?: number;
  motionPhaseMs?: number;
  motionAmpX?: number;
  motionAmpY?: number;
  motionAmpZ?: number;
  /** Yaw in radians (sim XY). Enables OBB support/side collision. */
  rotYaw?: number;
  /** True analytic ramp slope — see PlatformState.slopeGradX/Y. */
  slopeGradX?: number;
  slopeGradY?: number;
  entityId?: string;
  /** True for a Solid door wired to a Button — starts closed, opens on activation. */
  doorControlled?: boolean;
}

export interface ObstacleBlueprint {
  id?: string;
  kind?: 'saw' | 'laser' | 'crusher' | 'spike' | 'damage';
  x: number;
  y: number;
  z: number;
  width: number;
  /** Sim Y extent. When omitted, `width` is used for both axes. */
  depth?: number;
  height: number;
  intervalMs?: number;
  activeMs?: number;
  damage?: number;
  alwaysActive?: boolean;
  buttonControlled?: boolean;
  instantKill?: boolean;
}

export const DEATHRUN_PLATFORMS: PlatformBlueprint[] = [
  { x: 2.2, y: WORLD_HEIGHT / 2, z: 0, width: 4.2, depth: 4.2, height: 0.25, topOnly: true },
  { x: 6.0, y: WORLD_HEIGHT / 2, z: 0, width: 2.6, depth: 2.6, height: 0.25, topOnly: true },
  { x: 9.2, y: WORLD_HEIGHT / 2 - 1.6, z: 0.35, width: 2.4, depth: 2.4, height: 0.25, topOnly: true },
  { x: 9.2, y: WORLD_HEIGHT / 2 + 1.6, z: 0.35, width: 2.4, depth: 2.4, height: 0.25, topOnly: true },
  { x: 12.6, y: WORLD_HEIGHT / 2, z: 0.1, width: 2.8, depth: 3.0, height: 0.25, topOnly: true },
  { x: 15.8, y: WORLD_HEIGHT / 2, z: 0.55, width: 2.5, depth: 2.5, height: 0.25, topOnly: true },
  { x: 18.6, y: WORLD_HEIGHT / 2 + 0.4, z: 1.05, width: 2.3, depth: 2.3, height: 0.25, topOnly: true },
  { x: 21.4, y: WORLD_HEIGHT / 2 - 0.3, z: 1.55, width: 2.3, depth: 2.3, height: 0.25, topOnly: true },
  { x: 24.8, y: WORLD_HEIGHT / 2, z: 1.35, width: 3.6, depth: 1.35, height: 0.25, topOnly: true },
  { x: 28.4, y: 2.6, z: 0.9, width: 2.6, depth: 2.6, height: 0.25, topOnly: true },
  { x: 28.4, y: 7.4, z: 0.9, width: 2.6, depth: 2.6, height: 0.25, topOnly: true },
  { x: 32.0, y: WORLD_HEIGHT / 2, z: 0.15, width: 3.2, depth: 3.4, height: 0.25, topOnly: true },
  { x: 35.6, y: WORLD_HEIGHT / 2, z: 0.4, width: 3.4, depth: 2.8, height: 0.25, topOnly: true },
  { x: 39.0, y: WORLD_HEIGHT / 2, z: 0.25, width: 3.0, depth: 3.0, height: 0.25, topOnly: true },
  { x: 42.4, y: WORLD_HEIGHT / 2, z: 0, width: 3.2, depth: 3.6, height: 0.25, topOnly: true },
  { x: WORLD_WIDTH - 1.6, y: WORLD_HEIGHT / 2, z: 0, width: 3.4, depth: 4.0, height: 0.25, topOnly: true },
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
    platform.conveyorSpeed = bp.conveyorSpeed ?? 0;
    platform.conveyorDirX = bp.conveyorDirX ?? 1;
    platform.conveyorDirY = bp.conveyorDirY ?? 0;
    const ampX = bp.motionAmpX ?? 0;
    const ampY = bp.motionAmpY ?? 0;
    const ampZ = bp.motionAmpZ ?? 0;
    const moving =
      Math.abs(ampX) > 1e-4 || Math.abs(ampY) > 1e-4 || Math.abs(ampZ) > 1e-4;
    platform.motionEnabled = moving;
    platform.motionPeriodMs = bp.motionPeriodMs ?? 4000;
    platform.motionPhaseMs = bp.motionPhaseMs ?? 0;
    platform.motionHomeX = bp.x;
    platform.motionHomeY = bp.y;
    platform.motionHomeZ = bp.z;
    platform.motionAmpX = ampX;
    platform.motionAmpY = ampY;
    platform.motionAmpZ = ampZ;
    platform.rotYaw = bp.rotYaw ?? 0;
    platform.slopeGradX = bp.slopeGradX ?? 0;
    platform.slopeGradY = bp.slopeGradY ?? 0;
    platform.entityId = bp.entityId ?? '';
    platform.doorControlled = !!bp.doorControlled;
    platform.open = false;
    platform.topOnly = !!bp.topOnly;
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
    obstacle.depth = bp.depth && bp.depth > 0 ? bp.depth : bp.width;
    obstacle.height = bp.height;
    obstacle.intervalMs = bp.intervalMs ?? 500;
    obstacle.activeMs = bp.activeMs ?? 999999;
    obstacle.instantKill = !!bp.instantKill;
    obstacle.damage = bp.instantKill ? 9999 : bp.damage ?? 25;
    obstacle.buttonControlled = !!bp.buttonControlled;
    obstacle.alwaysActive = bp.buttonControlled ? false : bp.alwaysActive !== false;
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

/**
 * Highest pad at/under the feet, else the lowest climbable overlapping step.
 * Delegates to `shared/sim-core.ts` so the client predictor cannot disagree
 * about standing height (notably on rotated ramps).
 */
export function findSupportPlatform(
  x: number,
  y: number,
  z: number,
  platforms: Iterable<PlatformState>,
  radius: number,
  maxSnapDown = 0.35
): PlatformHit | null {
  const hit = findSupportPad(x, y, z, platforms, radius, maxSnapDown);
  return hit ? { platform: hit.pad, topZ: hit.topZ } : null;
}

/**
 * Push the player out of tall solid volumes (walls / thick props).
 * Thin pads (height ≤ 0.35) are top-only and skip side collision.
 *
 * Also reports the normal of the last wall pushed against (for wall-slide /
 * wall-jump) — good enough for the narrow corridors this is aimed at; if a
 * player is wedged between two walls in the same tick, whichever is
 * processed last wins, same tradeoff most simple AABB pushers make.
 */
export type SolidCollisionResult = CoreSolidResult;

export function resolveSolidCollisions(
  pos: { x: number; y: number; z: number },
  platforms: Iterable<PlatformState>,
  radius = PLAYER_RADIUS,
  height = PLAYER_HEIGHT,
  isGrounded = false
): SolidCollisionResult {
  return resolveSolidPads(pos, platforms, radius, height, isGrounded);
}
