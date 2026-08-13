/**
 * Deathrun floating course — pads with clear gaps (platformer read),
 * not a continuous tunnel floor.
 */
import { ObstacleState, PlatformState } from '../schema/RoomState.js';
import {
  COLLISION_SKIN,
  LAND_STEP_CLIMB,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants.js';

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
    obstacle.height = bp.height;
    obstacle.intervalMs = bp.intervalMs ?? 500;
    obstacle.activeMs = bp.activeMs ?? 999999;
    obstacle.damage = bp.instantKill ? 999 : bp.damage ?? 25;
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

/** World XY → pad-local XY (rotYaw around Z-up sim). */
function toPadLocal(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rotYaw: number
): { lx: number; ly: number } {
  const dx = x - cx;
  const dy = y - cy;
  if (!rotYaw) return { lx: dx, ly: dy };
  const c = Math.cos(-rotYaw);
  const s = Math.sin(-rotYaw);
  return { lx: dx * c - dy * s, ly: dx * s + dy * c };
}

function fromPadLocal(
  lx: number,
  ly: number,
  cx: number,
  cy: number,
  rotYaw: number
): { x: number; y: number } {
  if (!rotYaw) return { x: cx + lx, y: cy + ly };
  const c = Math.cos(rotYaw);
  const s = Math.sin(rotYaw);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

export function findSupportPlatform(
  x: number,
  y: number,
  z: number,
  platforms: Iterable<PlatformState>,
  radius: number,
  maxSnapDown = 0.35
): PlatformHit | null {
  // Prefer highest pad at/under feet; only climb onto a higher overlapping
  // step when nothing underfoot remains (avoids ramp "highest wins" hops).
  let bestBelow: PlatformHit | null = null;
  let bestClimb: PlatformHit | null = null;
  for (const platform of platforms) {
    if (platform.doorControlled && platform.open) continue;
    const halfW = platform.width / 2;
    const halfD = platform.depth / 2;
    const { lx, ly } = toPadLocal(x, y, platform.x, platform.y, platform.rotYaw || 0);
    if (lx < -halfW - radius || lx > halfW + radius) continue;
    if (ly < -halfD - radius || ly > halfD + radius) continue;
    // True continuous ramp support: dz per unit of local x/y, so standing
    // height is mathematically exact everywhere on the surface instead of
    // snapped to the nearest of many small flat shelves (which reads as
    // "walking up/down stairs" no matter how many shelves you add).
    const topZ = platform.z + (platform.slopeGradX || 0) * lx + (platform.slopeGradY || 0) * ly;
    if (z < topZ - maxSnapDown || z > topZ + 0.55) continue;
    if (topZ <= z + 0.05) {
      if (!bestBelow || topZ > bestBelow.topZ) bestBelow = { platform, topZ };
    } else if (!bestClimb || topZ < bestClimb.topZ) {
      bestClimb = { platform, topZ };
    }
  }
  return bestBelow ?? bestClimb;
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
export interface SolidCollisionResult {
  x: number;
  y: number;
  z: number;
  touchingWall: boolean;
  wallNormalX: number;
  wallNormalY: number;
}

export function resolveSolidCollisions(
  pos: { x: number; y: number; z: number },
  platforms: Iterable<PlatformState>,
  radius = PLAYER_RADIUS,
  height = PLAYER_HEIGHT,
  isGrounded = false
): SolidCollisionResult {
  let { x, y } = pos;
  let z = pos.z;
  let touchingWall = false;
  let wallNormalX = 0;
  let wallNormalY = 0;

  for (const platform of platforms) {
    if (platform.doorControlled && platform.open) continue;
    // Walk-over pads (floors, stair/ramp treads, jump pads, ice/conveyor/
    // sand) never block sideways — that's what makes them walkable at all.
    if (platform.topOnly) continue;
    const boxH = platform.height > 0 ? platform.height : 0.2;
    const topZ = platform.z;
    const bottomZ = topZ - boxH;

    // Horizontal footprint test up front — used by both the auto-step and
    // the wall-block branches below.
    const halfW = platform.width / 2 + radius;
    const halfD = platform.depth / 2 + radius;
    const yaw = platform.rotYaw || 0;
    const { lx, ly } = toPadLocal(x, y, platform.x, platform.y, yaw);
    if (Math.abs(lx) >= halfW || Math.abs(ly) >= halfD) continue;

    // Auto-step: a solid short enough to count as a curb/step (<=
    // LAND_STEP_CLIMB, the same threshold the sim already uses for
    // climbing/landing) AND whose top the player's feet are already within
    // climbing range of gets walked straight up onto instead of forcing a
    // jump — ordinary step-up behavior for a slab, a low crate, a knee-high
    // block. Lifting z directly here (not just skipping the block and
    // waiting for findSupportPlatform to notice) matters because that
    // function prefers whatever's already "at/under feet" — when a floor
    // platform extends underneath the step (a block sitting ON a floor,
    // the normal case), it would keep tracking that lower floor forever and
    // the player would slide straight through the step's body at floor
    // height instead of climbing it. Gated on isGrounded so this only ever
    // fires for grounded, walking-into-it contact — airborne jump arcs /
    // landings are untouched. Mirrors the same duplicated logic in
    // src/lib/platformer-sim.ts (Map Play Test).
    if (isGrounded && boxH <= LAND_STEP_CLIMB && z >= topZ - LAND_STEP_CLIMB) {
      if (z < topZ) z = topZ;
      continue;
    }

    const playerBottom = z;
    const playerTop = z + height;
    // Vertical overlap with skin
    if (playerTop <= bottomZ + COLLISION_SKIN || playerBottom >= topZ - COLLISION_SKIN) {
      continue;
    }

    // Push out along the shallowest local axis, then rotate back to world.
    const pushX = halfW - Math.abs(lx);
    const pushY = halfD - Math.abs(ly);
    touchingWall = true;
    let outLx = lx;
    let outLy = ly;
    let nLx = 0;
    let nLy = 0;
    if (pushX < pushY) {
      const sign = Math.sign(lx || 1);
      outLx = sign * halfW;
      nLx = sign;
    } else {
      const sign = Math.sign(ly || 1);
      outLy = sign * halfD;
      nLy = sign;
    }
    const world = fromPadLocal(outLx, outLy, platform.x, platform.y, yaw);
    x = world.x;
    y = world.y;
    const nWorld = fromPadLocal(nLx, nLy, 0, 0, yaw);
    wallNormalX = nWorld.x;
    wallNormalY = nWorld.y;
  }

  return { x, y, z, touchingWall, wallNormalX, wallNormalY };
}
