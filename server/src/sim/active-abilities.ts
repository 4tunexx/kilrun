import type { PlayerState } from '../schema/RoomState.js';
import {
  getTimedBuffStatsByKey,
  getBurstEffectStatsByKey,
  parseAbilityLevels,
  type AbilityLevels,
} from '../../../shared/ability-progression.js';

export type ActiveAbilityKey =
  | 'visibility'
  | 'fly'
  | 'hook'
  | 'berserk'
  | 'bullet'
  | 'thunder'
  | 'backflip';

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

/**
 * Generic activation: dispatches on the power's EFFECT TEMPLATE (timed_buff
 * buffKind / burst_effect kind), not the literal ability key. This means a
 * brand-new custom power created in the Power Editor that reuses one of
 * these templates (e.g. "Ghost Step" wrapping invisibility with different
 * numbers) activates for real in matches, exactly like the original 6.
 */
export function activateAbility(player: PlayerState, abilityKey: string | null | undefined, now: number): boolean {
  if (!player.isAlive || player.hasFinished) return false;
  if (!abilityKey) return false;

  const levels = getPlayerAbilityLevels(player);
  const level = levels[abilityKey] ?? 0;
  if (level <= 0) return false;

  const timedBuff = getTimedBuffStatsByKey(abilityKey, level);
  if (timedBuff.buffKind) {
    if (!timedBuff.durationMs) return false;
    switch (timedBuff.buffKind) {
      case 'invisibility':
        player.ability.visibilityEndsAt = now + timedBuff.durationMs;
        player.isInvisible = true;
        return true;
      case 'fly':
        player.ability.flyEndsAt = now + timedBuff.durationMs;
        return true;
      case 'berserk':
        player.ability.berserkEndsAt = now + timedBuff.durationMs;
        return true;
      case 'unlimited_ammo':
        player.ability.bulletEndsAt = now + timedBuff.durationMs;
        return true;
      default:
        return false;
    }
  }

  const burst = getBurstEffectStatsByKey(abilityKey, level);
  if (burst.kind === 'range_pull') {
    if (!burst.rangeMeters || !burst.pullDurationMs) return false;
    player.ability.hookEndsAt = now + burst.pullDurationMs;
    const pushX = Math.cos(player.aimAngle || 0) * burst.rangeMeters;
    const pushY = Math.sin(player.aimAngle || 0) * burst.rangeMeters;
    player.x += pushX;
    player.y += pushY;
    player.vz = Math.max(player.vz, 0.35);
    return true;
  }
  if (burst.kind === 'range_dash') {
    // Same range/pullDuration numbers as range_pull (hook), reused as an
    // evasive dash — pushes AWAY from aim direction instead of toward it.
    if (!burst.rangeMeters || !burst.pullDurationMs) return false;
    player.ability.backflipEndsAt = now + burst.pullDurationMs;
    const pushX = -Math.cos(player.aimAngle || 0) * burst.rangeMeters;
    const pushY = -Math.sin(player.aimAngle || 0) * burst.rangeMeters;
    player.x += pushX;
    player.y += pushY;
    player.vz = Math.max(player.vz, 0.5);
    return true;
  }
  if (burst.kind === 'radius_damage') {
    if (!burst.radiusMeters || !burst.damage) return false;
    player.ability.thunderEndsAt = now + 250;
    return true;
  }

  return false;
}

export function tickActiveAbilityTimers(player: PlayerState, now: number): void {
  if (player.ability.visibilityEndsAt > 0 && now >= player.ability.visibilityEndsAt) {
    player.ability.visibilityEndsAt = 0;
    player.isInvisible = false;
  }
  if (player.ability.flyEndsAt > 0 && now >= player.ability.flyEndsAt) {
    player.ability.flyEndsAt = 0;
  }
  if (player.ability.hookEndsAt > 0 && now >= player.ability.hookEndsAt) {
    player.ability.hookEndsAt = 0;
  }
  if (player.ability.berserkEndsAt > 0 && now >= player.ability.berserkEndsAt) {
    player.ability.berserkEndsAt = 0;
  }
  if (player.ability.bulletEndsAt > 0 && now >= player.ability.bulletEndsAt) {
    player.ability.bulletEndsAt = 0;
  }
  if (player.ability.thunderEndsAt > 0 && now >= player.ability.thunderEndsAt) {
    player.ability.thunderEndsAt = 0;
  }
  if (player.ability.backflipEndsAt > 0 && now >= player.ability.backflipEndsAt) {
    player.ability.backflipEndsAt = 0;
  }
}

export function isUnlimitedAmmoActive(player: PlayerState, now: number): boolean {
  return player.ability.bulletEndsAt > 0 && now < player.ability.bulletEndsAt;
}

export function isBerserkActive(player: PlayerState, now: number): boolean {
  return player.ability.berserkEndsAt > 0 && now < player.ability.berserkEndsAt;
}

export function isFlyActive(player: PlayerState, now: number): boolean {
  return player.ability.flyEndsAt > 0 && now < player.ability.flyEndsAt;
}

export function isInvisibleActive(player: PlayerState, now: number): boolean {
  return player.ability.visibilityEndsAt > 0 && now < player.ability.visibilityEndsAt;
}
