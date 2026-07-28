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
