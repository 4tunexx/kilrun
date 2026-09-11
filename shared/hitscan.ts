/**
 * Hitscan cone vs upright capsule — used by the match server and client
 * combat prediction so a predicted hit uses the same math as damage.
 */
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './sim-constants.js';

/**
 * Hitscan cone aimed with yaw (+ optional pitch).
 * Uses a 3D aim-ray vs upright capsule when heights are provided; falls back to XY cone.
 */
export function isHitByShot(
  shooterX: number,
  shooterY: number,
  aimAngle: number,
  targetX: number,
  targetY: number,
  range: number,
  toleranceRadians = 0.18,
  extras?: {
    shooterZ?: number;
    aimPitch?: number;
    targetZ?: number;
    targetHeight?: number;
    targetRadius?: number;
  }
): boolean {
  const aimPitch = extras?.aimPitch ?? 0;
  const shooterZ = extras?.shooterZ;
  const targetZ = extras?.targetZ;
  const targetHeight = extras?.targetHeight ?? PLAYER_HEIGHT;
  const targetRadius = extras?.targetRadius ?? PLAYER_RADIUS;

  // Flat 2D path (legacy / no height data)
  if (shooterZ === undefined || targetZ === undefined) {
    const dx = targetX - shooterX;
    const dy = targetY - shooterY;
    const distance = Math.hypot(dx, dy);
    if (distance > range) return false;
    const angleToTarget = Math.atan2(dy, dx);
    const angleDiff = Math.atan2(
      Math.sin(angleToTarget - aimAngle),
      Math.cos(angleToTarget - aimAngle)
    );
    return Math.abs(angleDiff) <= toleranceRadians;
  }

  const eyeZ = shooterZ + PLAYER_HEIGHT * 0.78;
  const cosPitch = Math.cos(aimPitch);
  const sinPitch = Math.sin(aimPitch);
  const dirX = cosPitch * Math.cos(aimAngle);
  const dirY = cosPitch * Math.sin(aimAngle);
  const dirZ = sinPitch;

  // Sample capsule axis (feet / torso / head) — hit if aim ray passes near any
  const samples = [0.15, 0.5, 0.85].map((t) => targetZ + targetHeight * t);
  let best = Infinity;
  for (const sampleZ of samples) {
    const vx = targetX - shooterX;
    const vy = targetY - shooterY;
    const vz = sampleZ - eyeZ;
    const dist = Math.hypot(vx, vy, vz);
    if (dist > range + targetRadius) continue;

    // Project sample onto aim ray (clamped to [0, range])
    const along = vx * dirX + vy * dirY + vz * dirZ;
    if (along < -targetRadius || along > range + targetRadius) continue;
    const t = clamp(along, 0, range);
    const cx = dirX * t;
    const cy = dirY * t;
    const cz = dirZ * t;
    const perp = Math.hypot(vx - cx, vy - cy, vz - cz);

    // Angular gate: widen slightly by body radius so close-range feels fair
    const angSlack = Math.atan2(targetRadius * 1.25, Math.max(dist, 0.35));
    const invDist = dist > 1e-6 ? 1 / dist : 0;
    const nx = vx * invDist;
    const ny = vy * invDist;
    const nz = vz * invDist;
    const dot = clamp(nx * dirX + ny * dirY + nz * dirZ, -1, 1);
    const ang = Math.acos(dot);
    if (ang > toleranceRadians + angSlack) continue;

    best = Math.min(best, perp);
  }

  return best <= targetRadius * 1.35;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Same ADS / hipfire cone the match rooms use for pellet fire. */
export function effectiveWeaponCone(opts: {
  coneRadians?: number;
  aimHeld?: boolean;
  adsConeScale?: number;
  hipfireConeScale?: number;
}): number {
  const base = opts.coneRadians && opts.coneRadians > 0 ? opts.coneRadians : 0.18;
  const ads = opts.adsConeScale && opts.adsConeScale > 0 ? opts.adsConeScale : 0.85;
  const hip = opts.hipfireConeScale && opts.hipfireConeScale > 0 ? opts.hipfireConeScale : 1;
  const scale = opts.aimHeld ? ads : hip;
  return Math.max(0.015, Math.min(0.9, base * scale));
}
