/**
 * Shared hitscan burst helpers (pellets + ADS cone) for Horde / Competitive.
 */

import type { PlayerState } from '../schema/RoomState.js';
import { isHitByShot } from './collision.js';

export function effectiveWeaponCone(player: PlayerState, aimHeld: boolean): number {
  const base = player.weaponConeRadians > 0 ? player.weaponConeRadians : 0.18;
  const ads = player.weaponAdsConeScale > 0 ? player.weaponAdsConeScale : 0.85;
  const hip = player.weaponHipfireConeScale > 0 ? player.weaponHipfireConeScale : 1;
  const scale = aimHeld ? ads : hip;
  return Math.max(0.015, Math.min(0.9, base * scale));
}

export function weaponPelletCount(player: PlayerState): number {
  const n = Math.floor(player.weaponPellets || 1);
  return Math.max(1, Math.min(16, Number.isFinite(n) ? n : 1));
}

/** Damage dealt by one pellet (shop damage is per-pellet for multi-pellet weapons). */
export function weaponPelletDamage(player: PlayerState): number {
  const base = player.weaponDamage > 0 ? player.weaponDamage : 25;
  if (player.weaponKind === 'melee') {
    return base * (player.abilityPunchDamageMult || 1);
  }
  return base;
}

/**
 * Sample pellet aim offsets inside the weapon cone.
 * Single-pellet weapons return [[0,0]] (no jitter).
 */
export function pelletAimOffsets(
  pellets: number,
  cone: number
): Array<{ yaw: number; pitch: number }> {
  if (pellets <= 1) return [{ yaw: 0, pitch: 0 }];
  const out: Array<{ yaw: number; pitch: number }> = [];
  for (let i = 0; i < pellets; i++) {
    out.push({
      yaw: (Math.random() - 0.5) * 2 * cone,
      pitch: (Math.random() - 0.5) * cone,
    });
  }
  return out;
}

export function isTargetHitByPellet(
  shooter: PlayerState,
  target: { x: number; y: number; z: number },
  range: number,
  cone: number,
  yawOffset: number,
  pitchOffset: number,
  extras?: { targetHeight?: number; targetRadius?: number }
): boolean {
  return isHitByShot(
    shooter.x,
    shooter.y,
    shooter.aimAngle + yawOffset,
    target.x,
    target.y,
    range,
    cone,
    {
      shooterZ: shooter.z,
      aimPitch: (shooter.aimPitch || 0) + pitchOffset,
      targetZ: target.z,
      targetHeight: extras?.targetHeight,
      targetRadius: extras?.targetRadius,
    }
  );
}
