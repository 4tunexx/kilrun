import { PLAYER_HEIGHT, PLAYER_RADIUS, VOID_Z } from '@shared/sim-constants';
import { isPlayerOverlappingObstacle } from '@shared/obstacle-hit';

export type ImpactFireKind = 'melee' | 'hitscan' | 'cosmetic' | string;

/** After a swing/shot, pick the follow-up cue once we know if flesh or world was hit. */
export function pendingImpactCue(opts: {
  fireKind: ImpactFireKind;
  hitConfirmed: boolean;
  metalHit: boolean;
}): 'melee_miss' | 'hit_metal' | null {
  if (opts.hitConfirmed) return null;
  if (opts.fireKind === 'melee') return 'melee_miss';
  if (opts.fireKind === 'hitscan' && opts.metalHit) return 'hit_metal';
  return null;
}

const FLY_HINT = /fly|wing|insect|bat|drone|wasp|hornet|mosquito|moth|bird/;

export function monsterLocomotionSfx(hint: string | null | undefined): 'monster_fly' | 'monster_footstep' {
  return FLY_HINT.test((hint ?? '').toLowerCase()) ? 'monster_fly' : 'monster_footstep';
}

export function overlappingHazard<T extends {
  id?: string;
  kind?: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth?: number;
  active?: boolean;
  alwaysActive?: boolean;
}>(
  player: { x: number; y: number; z: number },
  obstacles: Iterable<T>
): T | null {
  for (const o of obstacles) {
    if (o.id?.startsWith('mon_')) continue;
    const armed = o.active !== false || o.alwaysActive;
    if (!armed) continue;
    if (
      isPlayerOverlappingObstacle(
        player,
        { ...o, active: true },
        PLAYER_RADIUS,
        PLAYER_HEIGHT
      )
    ) {
      return o;
    }
  }
  return null;
}

export function overlappingPadOfKind(
  player: { x: number; y: number; z: number },
  pads: Array<{
    id?: string;
    kind?: string;
    x: number;
    y: number;
    z: number;
    width: number;
    depth?: number;
  }>,
  kind: string
): string | null {
  for (const pad of pads) {
    if (pad.kind !== kind) continue;
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = (pad.depth ?? pad.width) / 2 + PLAYER_RADIUS;
    if (
      Math.abs(player.x - pad.x) <= halfW &&
      Math.abs(player.y - pad.y) <= halfD &&
      player.z >= pad.z - 0.4 &&
      player.z <= pad.z + 0.6
    ) {
      return pad.id ?? kind;
    }
  }
  return null;
}

export function inHorizontalRadius(
  player: { x: number; y: number; z: number },
  zone: { x: number; y: number; z: number; radius: number }
): boolean {
  const dx = player.x - zone.x;
  const dy = player.y - zone.y;
  return Math.hypot(dx, dy) <= zone.radius + PLAYER_RADIUS && Math.abs(player.z - zone.z) <= 2.2;
}

export function isVoidFall(z: number | null | undefined): boolean {
  return (z ?? 0) < VOID_Z;
}

export const AFK_WARNING_MS = 30_000;
export const AFK_TIMEOUT_MS = 50_000;
