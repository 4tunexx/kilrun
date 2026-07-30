/**
 * Client-side movement prediction helpers (Phase 6).
 * Local player can step with `stepPlatformer` between server patches, then
 * reconcile when authoritative state arrives.
 *
 * Full wiring in kilrun-engine is incremental — use soft snap for now.
 */

import type { SimBody } from '@/lib/platformer-sim';

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
