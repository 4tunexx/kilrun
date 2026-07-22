'use client';

import { bootstrapHubProgression } from '@/lib/progression-actions';

/**
 * Deduplicate StrictMode / multi-mount hub boots in the same browser tab.
 * Home and the hub shell both need post-login daily mission sync; sharing one
 * flight avoids racing two bootstraps before ActiveMission rows settle.
 */
let hubBootstrapClientFlight: ReturnType<typeof bootstrapHubProgression> | null =
  null;

export function bootstrapHubOnce() {
  if (!hubBootstrapClientFlight) {
    hubBootstrapClientFlight = bootstrapHubProgression().finally(() => {
      hubBootstrapClientFlight = null;
    });
  }
  return hubBootstrapClientFlight;
}
