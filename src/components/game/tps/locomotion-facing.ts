/**
 * 3rd-person body facing from camera-relative WASD.
 *
 * - W / A / D (and diagonals): face travel direction on XZ
 * - S alone while already facing look: walk backwards, no turn
 * - S alone while facing sideways (e.g. after D): turn to face the camera ("into me")
 */

export function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t;
}

/**
 * @param cameraYaw Three/look yaw (0 = +Z)
 * @param wishFwd +1 = W (into look), -1 = S
 * @param wishStrafe +1 = D (screen right), -1 = A
 * @param currentBodyYaw current mesh rotation.y
 */
export function computeLocomotionFacingYaw(
  cameraYaw: number,
  wishFwd: number,
  wishStrafe: number,
  currentBodyYaw: number
): number {
  const mag = Math.hypot(wishFwd, wishStrafe);
  if (mag < 0.12) return currentBodyYaw;

  const nf = wishFwd / mag;
  const ns = wishStrafe / mag;
  const pureBack = nf < -0.55 && Math.abs(ns) < 0.35;

  if (pureBack) {
    const alignedWithLook = Math.abs(shortestAngleDelta(currentBodyYaw, cameraYaw)) < 0.55;
    if (alignedWithLook) {
      // Backpedal — keep facing look direction
      return currentBodyYaw;
    }
    // Was strafing / facing aside — turn to face the camera ("into me")
    return cameraYaw + Math.PI;
  }

  // Face travel direction (Three XZ). Matches camera-relative move basis:
  // threeX = wishFwd*sin - wishStrafe*cos
  // threeZ = wishFwd*cos + wishStrafe*sin
  const c = Math.cos(cameraYaw);
  const s = Math.sin(cameraYaw);
  const threeX = wishFwd * s - wishStrafe * c;
  const threeZ = wishFwd * c + wishStrafe * s;
  if (threeX * threeX + threeZ * threeZ < 1e-6) return currentBodyYaw;
  return Math.atan2(threeX, threeZ);
}

/** Smoothly turn body toward target yaw. */
export function stepBodyYaw(
  current: number,
  target: number,
  dt: number,
  turnSpeed = 14
): number {
  const t = 1 - Math.pow(0.001, dt * turnSpeed);
  return lerpAngle(current, target, Math.min(1, t));
}
