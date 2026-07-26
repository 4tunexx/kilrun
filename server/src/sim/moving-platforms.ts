/**
 * Tick kinematic moving platforms and return per-platform deltas for carry.
 */
import type { PlatformState } from '../schema/RoomState.js';
import {
  hasMovingAmp,
  movingPlatformPos,
  type MovingPlatformHome,
} from '../../../shared/moving-platform.js';

export type PlatformMotionState = MovingPlatformHome & {
  /** Last sim position after tick (for delta). */
  lastX: number;
  lastY: number;
  lastZ: number;
};

export function buildMotionStateFromPlatform(p: PlatformState): PlatformMotionState | null {
  if (!p.motionEnabled) return null;
  const home: MovingPlatformHome = {
    homeX: p.motionHomeX,
    homeY: p.motionHomeY,
    homeZ: p.motionHomeZ,
    ampX: p.motionAmpX,
    ampY: p.motionAmpY,
    ampZ: p.motionAmpZ,
    periodMs: p.motionPeriodMs || 4000,
    phaseMs: p.motionPhaseMs || 0,
  };
  if (!hasMovingAmp(home)) return null;
  return {
    ...home,
    lastX: p.x,
    lastY: p.y,
    lastZ: p.z,
  };
}

export type PlatformDelta = { id: string; dx: number; dy: number; dz: number };

/**
 * Advance all moving platforms. Mutates PlatformState x/y/z.
 * Returns deltas keyed for carrying grounded players.
 */
export function tickMovingPlatforms(
  platforms: Iterable<PlatformState>,
  motionById: Map<string, PlatformMotionState>,
  elapsedMs: number
): PlatformDelta[] {
  const deltas: PlatformDelta[] = [];
  for (const p of platforms) {
    let st = motionById.get(p.id);
    if (!st) {
      const built = buildMotionStateFromPlatform(p);
      if (!built) continue;
      motionById.set(p.id, built);
      st = built;
    }
    const next = movingPlatformPos(st, elapsedMs);
    const dx = next.x - st.lastX;
    const dy = next.y - st.lastY;
    const dz = next.z - st.lastZ;
    st.lastX = next.x;
    st.lastY = next.y;
    st.lastZ = next.z;
    p.x = next.x;
    p.y = next.y;
    p.z = next.z;
    if (Math.abs(dx) > 1e-8 || Math.abs(dy) > 1e-8 || Math.abs(dz) > 1e-8) {
      deltas.push({ id: p.id, dx, dy, dz });
    }
  }
  return deltas;
}

/** Apply carry to a player standing on a moving pad (by platform id). */
export function applyPlatformCarry(
  player: { x: number; y: number; z: number; isGrounded: boolean },
  supportPlatformId: string | null | undefined,
  deltas: PlatformDelta[]
) {
  if (!player.isGrounded || !supportPlatformId || !deltas.length) return;
  const d = deltas.find((x) => x.id === supportPlatformId);
  if (!d) return;
  player.x += d.dx;
  player.y += d.dy;
  player.z += d.dz;
}
