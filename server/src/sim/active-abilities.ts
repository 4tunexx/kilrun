import type { PlayerState } from '../schema/RoomState.js';
import { parseAbilityLevels, type AbilityLevels } from '../../../shared/ability-progression.js';
import {
  activateAbility as activateAbilityGeneric,
  tickActiveAbilityTimers as tickActiveAbilityTimersGeneric,
  isUnlimitedAmmoActive as isUnlimitedAmmoActiveGeneric,
  isBerserkActive as isBerserkActiveGeneric,
  isFlyActive as isFlyActiveGeneric,
  isInvisibleActive as isInvisibleActiveGeneric,
  type ActiveAbilityKey,
} from '../../../shared/active-abilities.js';

export type { ActiveAbilityKey };

/**
 * Thin Colyseus-specific wrapper around shared/active-abilities.ts's
 * generic activation logic — PlayerState (the Colyseus schema class)
 * structurally satisfies the shared `AbilityHost` interface (plain getters/
 * setters for the same field names), so the exact same activate/tick/is*Active
 * logic runs for live matches AND Play Test (which builds a plain object
 * instead of a schema instance) with zero duplicated behavior to drift.
 */

export function applyAbilityLevelsToPlayer(
  player: PlayerState,
  levels: AbilityLevels | Record<string, number> | null | undefined
): void {
  player.ability.levelsJson = JSON.stringify(parseAbilityLevels(levels ?? null));
}

export function getPlayerAbilityLevels(player: PlayerState): AbilityLevels {
  try {
    const parsed = JSON.parse(player.ability.levelsJson || '{}');
    return parseAbilityLevels(parsed);
  } catch {
    return parseAbilityLevels({});
  }
}

export function activateAbility(player: PlayerState, abilityKey: string | null | undefined, now: number): boolean {
  const levels = getPlayerAbilityLevels(player);
  return activateAbilityGeneric(player, abilityKey, now, levels);
}

export function tickActiveAbilityTimers(player: PlayerState, now: number): void {
  tickActiveAbilityTimersGeneric(player, now);
  player.isInvisible = isInvisibleActiveGeneric(player, now);
}

export function isUnlimitedAmmoActive(player: PlayerState, now: number): boolean {
  return isUnlimitedAmmoActiveGeneric(player, now);
}

export function isBerserkActive(player: PlayerState, now: number): boolean {
  return isBerserkActiveGeneric(player, now);
}

export function isFlyActive(player: PlayerState, now: number): boolean {
  return isFlyActiveGeneric(player, now);
}

export function isInvisibleActive(player: PlayerState, now: number): boolean {
  return isInvisibleActiveGeneric(player, now);
}
