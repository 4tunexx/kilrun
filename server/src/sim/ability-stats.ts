import { PlayerState } from '../schema/RoomState.js';
import { MAX_ENERGY } from './constants.js';

const BASE_MAX_HEALTH = 100;

/** Effective max health for this player, including the Health power upgrade. */
export function getMaxHealth(player: PlayerState): number {
  return BASE_MAX_HEALTH + (player.abilityMaxHealthBonus || 0);
}

/** Effective max energy for this player, including the Energy power upgrade. */
export function getMaxEnergyFor(player: PlayerState): number {
  return MAX_ENERGY + (player.abilityMaxEnergyBonus || 0);
}

export interface TrustedAbilityStatBonuses {
  maxHealthBonus?: number;
  speedMultiplier?: number;
  jumpMultiplier?: number;
  maxEnergyBonus?: number;
  punchDamageMultiplier?: number;
}

/** Apply fetched account power-upgrade bonuses to a freshly-joined player (neutral if omitted/failed). */
export function applyAbilityStatsToPlayer(
  player: PlayerState,
  bonuses: TrustedAbilityStatBonuses | null | undefined
): void {
  player.abilityMaxHealthBonus = bonuses?.maxHealthBonus ?? 0;
  player.abilitySpeedMult = bonuses?.speedMultiplier ?? 1;
  player.abilityJumpMult = bonuses?.jumpMultiplier ?? 1;
  player.abilityMaxEnergyBonus = bonuses?.maxEnergyBonus ?? 0;
  player.abilityPunchDamageMult = bonuses?.punchDamageMultiplier ?? 1;
}
