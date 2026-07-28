/**
 * Client-side movement prediction helpers (Phase 6).
 * Local player can step with `stepPlatformer` between server patches, then
 * reconcile when authoritative state arrives.
 *
 * Full wiring in kilrun-engine is incremental — use soft snap for now.
 */

import type { SimBody } from '@/lib/platformer-sim';

const RECONCILE_SNAP = 0.35;
const RECONCILE_LERP = 0.35;

/** Pull predicted body toward server state without hard teleporting on small errors. */
export function reconcilePredictedBody(
  predicted: SimBody,
  server: { x: number; y: number; z: number; vz?: number; isGrounded?: boolean }
): void {
  const dx = server.x - predicted.x;
  const dy = server.y - predicted.y;
  const dz = server.z - predicted.z;
  const err = Math.hypot(dx, dy, dz);
  if (err > 2.5) {
    predicted.x = server.x;
    predicted.y = server.y;
    predicted.z = server.z;
  } else if (err > RECONCILE_SNAP) {
    predicted.x += dx * RECONCILE_LERP;
    predicted.y += dy * RECONCILE_LERP;
    predicted.z += dz * RECONCILE_LERP;
  } else {
    predicted.x = server.x;
    predicted.y = server.y;
    predicted.z = server.z;
  }
  if (typeof server.vz === 'number') predicted.vz = server.vz;
  if (typeof server.isGrounded === 'boolean') predicted.isGrounded = server.isGrounded;
}
