import { PlayerState } from '../schema/RoomState.js';
import { MAX_ENERGY } from './constants.js';

const BASE_MAX_HEALTH = 100;

/** Effective max health for this player, including the Health power upgrade. */
export function getMaxHealth(player: PlayerState): number {
  return BASE_MAX_HEALTH + (player.ability.maxHealthBonus || 0);
}

/** Effective max energy for this player, including the Energy power upgrade. */
export function getMaxEnergyFor(player: PlayerState): number {
  return MAX_ENERGY + (player.ability.maxEnergyBonus || 0);
}

export interface TrustedAbilityStatBonuses {
  maxHealthBonus?: number;
  speedMultiplier?: number;
  jumpMultiplier?: number;
  maxEnergyBonus?: number;
  punchDamageMultiplier?: number;
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Apply fetched account power-upgrade bonuses to a freshly-joined player (neutral if omitted/failed).
 *  Bonus amounts ultimately trace back to admin-configured PowerDefinition
 *  `perLevel` values (shared/power-definitions.ts), which are intentionally
 *  open-ended for game-balance flexibility — so these bounds are deliberately
 *  generous, not tight game-balance limits. What they DO close: unlike the
 *  sibling parseAbilityLevels (shared/ability-progression.ts), this never
 *  validated at all — a malformed/corrupted trusted-loadout API response
 *  fed straight into movement.ts's effWalkSpeed/effJumpVel multipliers with
 *  no Number.isFinite check, and since collision is discrete (not swept),
 *  an unbounded multiplier is a wall-tunneling / no-clip vector, not just a
 *  NaN risk. */
export function applyAbilityStatsToPlayer(
  player: PlayerState,
  bonuses: TrustedAbilityStatBonuses | null | undefined
): void {
  player.ability.maxHealthBonus = clampFinite(bonuses?.maxHealthBonus, 0, 0, 5000);
  player.ability.speedMult = clampFinite(bonuses?.speedMultiplier, 1, 0.1, 10);
  player.ability.jumpMult = clampFinite(bonuses?.jumpMultiplier, 1, 0.1, 10);
  player.ability.maxEnergyBonus = clampFinite(bonuses?.maxEnergyBonus, 0, 0, 5000);
  player.ability.punchDamageMult = clampFinite(bonuses?.punchDamageMultiplier, 1, 0.1, 20);
}
