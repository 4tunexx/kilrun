import type { PlayerState } from '../schema/RoomState.js';
import {
  getTimedBuffStatsByKey,
  getBurstEffectStatsByKey,
  parseAbilityLevels,
  type AbilityLevels,
} from '../../../shared/ability-progression.js';

export type ActiveAbilityKey = 'visibility' | 'fly' | 'hook' | 'berserk' | 'bullet' | 'thunder';

export function applyAbilityLevelsToPlayer(
  player: PlayerState,
  levels: AbilityLevels | Record<string, number> | null | undefined
): void {
  player.abilityLevelsJson = JSON.stringify(parseAbilityLevels(levels ?? null));
}

export function getPlayerAbilityLevels(player: PlayerState): AbilityLevels {
  try {
    const parsed = JSON.parse(player.abilityLevelsJson || '{}');
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
        player.abilityVisibilityEndsAt = now + timedBuff.durationMs;
        player.isInvisible = true;
        return true;
      case 'fly':
        player.abilityFlyEndsAt = now + timedBuff.durationMs;
        return true;
      case 'berserk':
        player.abilityBerserkEndsAt = now + timedBuff.durationMs;
        return true;
      case 'unlimited_ammo':
        player.abilityBulletEndsAt = now + timedBuff.durationMs;
        return true;
      default:
        return false;
    }
  }

  const burst = getBurstEffectStatsByKey(abilityKey, level);
  if (burst.kind === 'range_pull') {
    if (!burst.rangeMeters || !burst.pullDurationMs) return false;
    player.abilityHookEndsAt = now + burst.pullDurationMs;
    const pushX = Math.cos(player.aimAngle || 0) * burst.rangeMeters;
    const pushY = Math.sin(player.aimAngle || 0) * burst.rangeMeters;
    player.x += pushX;
    player.y += pushY;
    player.vz = Math.max(player.vz, 0.35);
    return true;
  }
  if (burst.kind === 'radius_damage') {
    if (!burst.radiusMeters || !burst.damage) return false;
    player.abilityThunderEndsAt = now + 250;
    return true;
  }

  return false;
}

export function tickActiveAbilityTimers(player: PlayerState, now: number): void {
  if (player.abilityVisibilityEndsAt > 0 && now >= player.abilityVisibilityEndsAt) {
    player.abilityVisibilityEndsAt = 0;
    player.isInvisible = false;
  }
  if (player.abilityFlyEndsAt > 0 && now >= player.abilityFlyEndsAt) {
    player.abilityFlyEndsAt = 0;
  }
  if (player.abilityHookEndsAt > 0 && now >= player.abilityHookEndsAt) {
    player.abilityHookEndsAt = 0;
  }
  if (player.abilityBerserkEndsAt > 0 && now >= player.abilityBerserkEndsAt) {
    player.abilityBerserkEndsAt = 0;
  }
  if (player.abilityBulletEndsAt > 0 && now >= player.abilityBulletEndsAt) {
    player.abilityBulletEndsAt = 0;
  }
  if (player.abilityThunderEndsAt > 0 && now >= player.abilityThunderEndsAt) {
    player.abilityThunderEndsAt = 0;
  }
}

export function isUnlimitedAmmoActive(player: PlayerState, now: number): boolean {
  return player.abilityBulletEndsAt > 0 && now < player.abilityBulletEndsAt;
}

export function isBerserkActive(player: PlayerState, now: number): boolean {
  return player.abilityBerserkEndsAt > 0 && now < player.abilityBerserkEndsAt;
}

export function isFlyActive(player: PlayerState, now: number): boolean {
  return player.abilityFlyEndsAt > 0 && now < player.abilityFlyEndsAt;
}

export function isInvisibleActive(player: PlayerState, now: number): boolean {
  return player.abilityVisibilityEndsAt > 0 && now < player.abilityVisibilityEndsAt;
}
