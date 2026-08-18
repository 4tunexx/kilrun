/**
 * Ping-pong moving platform helpers shared by Colyseus rooms and Play Test.
 * Triangle wave 0→1→0 over periodMs; position = home + amp * u.
 */

export type MovingPlatformHome = {
  homeX: number;
  homeY: number;
  homeZ: number;
  ampX: number;
  ampY: number;
  ampZ: number;
  periodMs: number;
  phaseMs: number;
};

/** u in [0,1] along A→B→A (ping-pong). */
export function movingPlatformU(elapsedMs: number, periodMs: number, phaseMs = 0): number {
  const period = Math.max(200, periodMs);
  const t = ((elapsedMs + phaseMs) % period) / period;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

export function movingPlatformPos(
  home: MovingPlatformHome,
  elapsedMs: number
): { x: number; y: number; z: number } {
  const u = movingPlatformU(elapsedMs, home.periodMs, home.phaseMs);
  return {
    x: home.homeX + home.ampX * u,
    y: home.homeY + home.ampY * u,
    z: home.homeZ + home.ampZ * u,
  };
}

export function hasMovingAmp(home: Pick<MovingPlatformHome, 'ampX' | 'ampY' | 'ampZ'>): boolean {
  return (
    Math.abs(home.ampX) > 1e-4 || Math.abs(home.ampY) > 1e-4 || Math.abs(home.ampZ) > 1e-4
  );
}

/** A sim pad carrying optional moving-platform authoring fields. */
export interface MovingPad {
  x: number;
  y: number;
  z: number;
  id?: string;
  homeX?: number;
  homeY?: number;
  homeZ?: number;
  motionPeriodMs?: number;
  motionPhaseMs?: number;
  motionAmpX?: number;
  motionAmpY?: number;
  motionAmpZ?: number;
}

export interface PadMotionDelta {
  id: string;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Move every animated pad to where it belongs at `elapsedMs` and report how far
 * each one travelled, so a grounded body standing on one can be carried along.
 *
 * Position is a pure function of the elapsed clock rather than an accumulation
 * of per-frame steps, so a client running this against the server's synced
 * clock lands on exactly the server's pad positions no matter its frame rate.
 */
export function advanceMovingPads<T extends MovingPad>(
  pads: Iterable<T>,
  elapsedMs: number
): PadMotionDelta[] {
  const deltas: PadMotionDelta[] = [];
  for (const pad of pads) {
    const ampX = pad.motionAmpX ?? 0;
    const ampY = pad.motionAmpY ?? 0;
    const ampZ = pad.motionAmpZ ?? 0;
    if (!hasMovingAmp({ ampX, ampY, ampZ })) continue;
    const next = movingPlatformPos(
      {
        homeX: pad.homeX ?? pad.x,
        homeY: pad.homeY ?? pad.y,
        homeZ: pad.homeZ ?? pad.z,
        ampX,
        ampY,
        ampZ,
        periodMs: pad.motionPeriodMs || 4000,
        phaseMs: pad.motionPhaseMs || 0,
      },
      elapsedMs
    );
    const dx = next.x - pad.x;
    const dy = next.y - pad.y;
    const dz = next.z - pad.z;
    pad.x = next.x;
    pad.y = next.y;
    pad.z = next.z;
    if (pad.id && (Math.abs(dx) > 1e-8 || Math.abs(dy) > 1e-8 || Math.abs(dz) > 1e-8)) {
      deltas.push({ id: pad.id, dx, dy, dz });
    }
  }
  return deltas;
}

/** Carry a grounded body along with the pad it is standing on. */
export function applyPadCarry(
  body: { x: number; y: number; z: number; isGrounded: boolean },
  supportPadId: string | null | undefined,
  deltas: PadMotionDelta[]
): void {
  if (!body.isGrounded || !supportPadId || !deltas.length) return;
  const d = deltas.find((x) => x.id === supportPadId);
  if (!d) return;
  body.x += d.dx;
  body.y += d.dy;
  body.z += d.dz;
}
