/**
 * Client-side movement + combat prediction helpers.
 * Local player can step with `stepPlatformer` between server patches, then
 * reconcile when authoritative state arrives. Combat prediction uses the
 * same `isHitByShot` cone as the match server (feel only — damage stays
 * authoritative).
 */

import type { SimBody } from '@/lib/platformer-sim';
import { effectiveWeaponCone, isHitByShot } from '@shared/hitscan';

const RECONCILE_HARD_SNAP = 2.5;
/** Below this, error is imperceptible — don't correct at all (avoids
 * constant sub-pixel "breathing" every server tick). */
const RECONCILE_DEADZONE = 0.05;
const RECONCILE_LERP = 0.35;
/** Small residual errors between the deadzone and the old hard-snap
 * threshold pull in faster than large ones, but still smoothly — never an
 * instant position assignment. This was the main source of visible
 * per-tick "micro-jitter": the old code hard-snapped every small error
 * (the common case) instead of easing it out. */
const RECONCILE_LERP_SMALL = 0.6;
const RECONCILE_SMALL_THRESHOLD = 0.35;

/** Pull predicted body toward server state without hard teleporting on small errors. */
export function reconcilePredictedBody(
  predicted: SimBody,
  server: { x: number; y: number; z: number; vz?: number; isGrounded?: boolean }
): void {
  const dx = server.x - predicted.x;
  const dy = server.y - predicted.y;
  const dz = server.z - predicted.z;
  const err = Math.hypot(dx, dy, dz);
  if (err > RECONCILE_HARD_SNAP) {
    // Genuinely large desync (teleport, respawn, rubber-band after packet
    // loss) — only case where an instant snap is actually correct.
    predicted.x = server.x;
    predicted.y = server.y;
    predicted.z = server.z;
  } else if (err > RECONCILE_SMALL_THRESHOLD) {
    predicted.x += dx * RECONCILE_LERP;
    predicted.y += dy * RECONCILE_LERP;
    predicted.z += dz * RECONCILE_LERP;
  } else if (err > RECONCILE_DEADZONE) {
    predicted.x += dx * RECONCILE_LERP_SMALL;
    predicted.y += dy * RECONCILE_LERP_SMALL;
    predicted.z += dz * RECONCILE_LERP_SMALL;
  }
  // else: within deadzone, leave predicted position untouched this tick.
  if (typeof server.vz === 'number') predicted.vz = server.vz;
  if (typeof server.isGrounded === 'boolean') predicted.isGrounded = server.isGrounded;
}

export type CombatPredictTarget = {
  id: string;
  kind: 'player' | 'monster';
  x: number;
  y: number;
  z: number;
  role?: string;
  height?: number;
  radius?: number;
};

/** Drop targets the live room would never damage for this mode. */
export function filterCombatPredictTargets(opts: {
  mode: string;
  shooterRole?: string;
  targets: CombatPredictTarget[];
}): CombatPredictTarget[] {
  if (opts.mode === 'horde') {
    return opts.targets.filter((t) => t.kind === 'monster');
  }
  if (opts.mode === 'deathrun') {
    if (opts.shooterRole !== 'trapper') return [];
    return opts.targets.filter((t) => t.kind === 'player' && t.role === 'runner');
  }
  return opts.targets.filter((t) => t.kind === 'player');
}

export function predictCombatHit(opts: {
  shooterX: number;
  shooterY: number;
  shooterZ: number;
  aimAngle: number;
  aimPitch: number;
  range: number;
  cone?: number;
  aimHeld?: boolean;
  adsConeScale?: number;
  hipfireConeScale?: number;
  excludeId?: string;
  shooterRole?: string;
  friendlyFire?: boolean;
  mode?: string;
  targets: CombatPredictTarget[];
}): CombatPredictTarget | null {
  const targets = opts.mode
    ? filterCombatPredictTargets({
        mode: opts.mode,
        shooterRole: opts.shooterRole,
        targets: opts.targets,
      })
    : opts.targets;
  const cone = effectiveWeaponCone({
    coneRadians: opts.cone,
    aimHeld: opts.aimHeld,
    adsConeScale: opts.adsConeScale,
    hipfireConeScale: opts.hipfireConeScale,
  });
  const range = Math.max(0.4, opts.range);
  let best: CombatPredictTarget | null = null;
  let bestDist = Infinity;
  for (const target of targets) {
    if (target.id === opts.excludeId) continue;
    if (
      !opts.friendlyFire &&
      opts.shooterRole &&
      target.kind === 'player' &&
      target.role &&
      target.role === opts.shooterRole
    ) {
      continue;
    }
    const hit = isHitByShot(
      opts.shooterX,
      opts.shooterY,
      opts.aimAngle,
      target.x,
      target.y,
      range,
      cone,
      {
        shooterZ: opts.shooterZ,
        aimPitch: opts.aimPitch,
        targetZ: target.z,
        targetHeight: target.height,
        targetRadius: target.radius,
      }
    );
    if (!hit) continue;
    const dist = Math.hypot(target.x - opts.shooterX, target.y - opts.shooterY, target.z - opts.shooterZ);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}
