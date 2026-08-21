'use server';

/**
 * Aggregates every map-authored custom move (Player Model Studio → Moves)
 * across all published maps into Sound Board catalog entries.
 */

import { getCustomMoveSoundEvents as loadCustomMoveSoundEvents } from '@/lib/custom-move-sound-events-core';

export async function getCustomMoveSoundEvents() {
  return loadCustomMoveSoundEvents();
}
