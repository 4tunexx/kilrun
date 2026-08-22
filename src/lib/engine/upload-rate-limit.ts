/**
 * Lightweight in-memory sliding-window rate limit for the Engine staff
 * upload endpoints (models/images/meshes/sounds). These routes previously
 * had a per-request size cap but nothing stopping a rapid-fire loop (a
 * compromised staff token, a client retry-storm bug) from hammering them
 * indefinitely.
 *
 * Deliberately not a distributed limiter — this project has no Redis/KV
 * configured, and these are low-traffic staff-only routes, not a public
 * surface. Module-level state persists for the life of a warm serverless
 * instance, which is "good enough" backpressure for the actual threat here
 * without adding new infrastructure. A cold start just resets the window.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const MAX_TRACKED_KEYS = 5000;

const hits = new Map<string, number[]>();

export function checkUploadRateLimit(
  key: string,
  max: number = MAX_PER_WINDOW,
  windowMs: number = WINDOW_MS
): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    throw new Error('Too many uploads — slow down and try again in a minute.');
  }
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [trackedKey, timestamps] of hits) {
      if (!timestamps.some((t) => now - t < windowMs)) hits.delete(trackedKey);
    }
  }
}

/** Test-only: drop all tracked state so specs don't bleed into each other. */
export function resetUploadRateLimitForTests(): void {
  hits.clear();
}
