import type { PlayerState } from '../schema/RoomState.js';
import {
  getBerserkDurationMs,
  getFlyDurationMs,
  getHookStats,
  getThunderStats,
  getUnlimitedAmmoDurationMs,
  getVisibilityDurationMs,
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

export function activateAbility(player: PlayerState, abilityKey: string | null | undefined, now: number): boolean {
  if (!player.isAlive || player.hasFinished) return false;

  const levels = getPlayerAbilityLevels(player);
  const normalized = abilityKey as ActiveAbilityKey | null | undefined;
  if (normalized === 'visibility') {
    const level = levels.visibility;
    const duration = getVisibilityDurationMs(level);
    if (!duration) return false;
    player.abilityVisibilityEndsAt = now + duration;
    player.isInvisible = true;
    return true;
  }

  if (normalized === 'fly') {
    const level = levels.fly;
    const duration = getFlyDurationMs(level);
    if (!duration) return false;
    player.abilityFlyEndsAt = now + duration;
    return true;
  }

  if (normalized === 'hook') {
    const level = levels.hook;
    const stats = getHookStats(level);
    if (!stats.rangeMeters || !stats.pullDurationMs) return false;
    player.abilityHookEndsAt = now + stats.pullDurationMs;
    const pushX = Math.cos(player.aimAngle || 0) * stats.rangeMeters;
    const pushY = Math.sin(player.aimAngle || 0) * stats.rangeMeters;
    player.x += pushX;
    player.y += pushY;
    player.vz = Math.max(player.vz, 0.35);
    return true;
  }

  if (normalized === 'berserk') {
    const level = levels.berserk;
    const duration = getBerserkDurationMs(level);
    if (!duration) return false;
    player.abilityBerserkEndsAt = now + duration;
    return true;
  }

  if (normalized === 'bullet') {
    const level = levels.bullet;
    const duration = getUnlimitedAmmoDurationMs(level);
    if (!duration) return false;
    player.abilityBulletEndsAt = now + duration;
    return true;
  }

  if (normalized === 'thunder') {
    const level = levels.thunder;
    const stats = getThunderStats(level);
    if (!stats.radiusMeters || !stats.damage) return false;
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
