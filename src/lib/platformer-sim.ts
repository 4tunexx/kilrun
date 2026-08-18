/**
 * Plain (non-Colyseus) platformer step used by Map Play Test and by live
 * client-side prediction.
 *
 * Physics lives in `shared/sim-core.ts` — this file is a thin adapter that
 * spatial-indexes pads and calls `stepSim`. The authoritative server
 * (`server/src/sim/movement.ts`) calls the same core, so Play Test cannot
 * disagree with a live match about where the player ends up.
 */

import { MAX_ENERGY } from '@shared/sim-constants';
import type { CustomMoveDef } from '@shared/custom-moves';
import { PadSpatialIndex } from '@shared/platform-spatial';
import {
  createCoreScratch,
  stepSim,
  type CoreBody,
  type CoreBounds,
  type CoreGameplayPad,
  type CoreInput,
  type CorePhysOpts,
  type CoreScratch,
} from '@shared/sim-core';

/**
 * Geometry is inherited from `CoreGameplayPad` so the shared collision core
 * and this sim can never disagree on pad shape. Only client-side identity
 * aliases (entityId) live here, and they already exist on the core type.
 */
export interface SimPad extends CoreGameplayPad {
  kind?: 'solid' | 'checkpoint' | 'jumpPad' | 'finish' | 'ice' | 'conveyor' | 'water' | 'sand';
  /** Moving platform (optional). */
  homeX?: number;
  homeY?: number;
  homeZ?: number;
  motionPeriodMs?: number;
  motionPhaseMs?: number;
  motionAmpX?: number;
  motionAmpY?: number;
  motionAmpZ?: number;
}

export type SimBounds = CoreBounds;
export type SimBody = CoreBody;
export type SimScratch = CoreScratch;
export type SimInput = CoreInput;

export interface SimPhysicsOpts extends CorePhysOpts {
  customMoves?: CustomMoveDef[];
}

export function createSimScratch(): SimScratch {
  return createCoreScratch();
}

const SPATIAL_PAD_THRESHOLD = 40;
let padSpatialCache: { pads: SimPad[]; index: PadSpatialIndex<SimPad> } | null = null;

/**
 * Drop the cached broadphase index.
 *
 * The cache is keyed on array identity, so mutating pad positions in place —
 * which is exactly what moving platforms do — leaves buckets pointing at stale
 * cells and a moved pad can stop being reported as nearby. Callers that animate
 * pads must invalidate after doing so; the authoritative server rebuilds its
 * own index every tick for the same reason.
 */
export function invalidatePadSpatialCache(): void {
  padSpatialCache = null;
}

function padsNear(pads: SimPad[], x: number, y: number): SimPad[] {
  if (pads.length < SPATIAL_PAD_THRESHOLD) return pads;
  if (!padSpatialCache || padSpatialCache.pads !== pads) {
    padSpatialCache = { pads, index: new PadSpatialIndex<SimPad>().rebuild(pads) };
  }
  return padSpatialCache.index.nearby(x, y);
}

export function stepPlatformer(
  body: SimBody,
  input: SimInput,
  dt: number,
  pads: SimPad[],
  scratch: SimScratch,
  bounds: SimBounds,
  physOpts?: SimPhysicsOpts
): SimBody {
  const near = padsNear(pads, body.x, body.y);
  return stepSim(body, input, dt, near, scratch, bounds, {
    maxEnergy: MAX_ENERGY,
    nowMs: physOpts?.nowMs ?? Date.now(),
    slowUntil: physOpts?.slowUntil ?? scratch.slowUntil,
    ...physOpts,
  });
}

/** Editor Three (x,y,z) → sim */
export function threeToSim(x: number, y: number, z: number) {
  return { x: z, y: x, z: y };
}

/** Sim → Three */
export function simToThree(x: number, y: number, z: number): [number, number, number] {
  return [y, z, x];
}
