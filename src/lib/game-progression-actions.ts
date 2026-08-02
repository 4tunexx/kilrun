'use server';

/**
 * IN-GAME leveling & power upgrades — separate system from the website's
 * account level/XP (`src/lib/progression-actions.ts`, `User.xpProgress`).
 * Do not wire this into anything that touches `xpProgress` or the web
 * leveling curve; that system is off-limits per product decision.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isTrustedServerContext } from '@/lib/trusted-server';
import {
  ABILITY_DEFINITIONS,
  ABILITY_KEYS,
  arePrerequisitesMet,
  type AbilityKey,
  type AbilityLevels,
  getGameLevelProgress,
  parseAbilityLevels,
  skillPointsForLevel,
  type PowerDefinitionRecord,
  STATIC_FALLBACK_POWERS,
} from '@shared/ability-progression';
import { loadPowerDefinitions } from '@/lib/power-definitions';
import { writeAuditLog } from '@/lib/audit';

async function requireAdminStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const staff = await prisma.user.findUnique({ where: { steamId } });
  if (!staff || staff.isBanned || staff.role !== 'admin') throw new Error('Admin only');
  return staff;
}

async function requireUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Banned');
  return user;
}

async function assertCanMutateUser(userId: string) {
  if (isTrustedServerContext()) return;
  const user = await requireUser();
  if (user.id === userId) return;
  throw new Error('Forbidden');
}

export type GameProgressionSnapshot = {
  gameXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
  skillPoints: number;
  abilities: AbilityLevels;
};

function buildSnapshot(user: { gameXp: number; gameSkillPoints: number; gameAbilities: unknown }): GameProgressionSnapshot {
  const progress = getGameLevelProgress(user.gameXp ?? 0);
  return {
    gameXp: user.gameXp ?? 0,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    percent: progress.percent,
    skillPoints: Math.max(0, user.gameSkillPoints ?? 0),
    abilities: parseAbilityLevels(user.gameAbilities),
  };
}

/** Fetch a player's in-game progression (own profile or public read). */
export async function getGameProgression(userId: string): Promise<GameProgressionSnapshot | null> {
  // force: true — see getPowerDefinitionsForMenu below: this rebuilds the
  // ABILITY_DEFINITIONS shim (icons included) that GameProgressionCard
  // reads, and must not serve a stale per-instance cache after an admin edit.
  await loadPowerDefinitions({ force: true }).catch(() => null);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return buildSnapshot(user);
}

/** Serializable power list (functions can't cross the server-action boundary
 * — the client re-derives cost/effect labels with the pure helpers exported
 * from `shared/power-definitions.ts`). Falls back to the static 12 on error. */
export async function getPowerDefinitionsForMenu(): Promise<PowerDefinitionRecord[]> {
  // force: true — this is called once per menu open (not a hot path), and
  // admin icon/stat edits need to show up immediately. Without `force`,
  // this can serve up to CACHE_TTL_MS of stale data, and on serverless
  // (each invocation may land on a different instance with its own
  // in-memory cache) a request can stay stale well past that TTL since
  // invalidatePowerDefinitionsCache() only clears the instance that
  // handled the admin save.
  return loadPowerDefinitions({ force: true }).catch(() => STATIC_FALLBACK_POWERS);
}

/**
 * Award in-game XP (called from match-rewards.ts when a match ends).
 * Awarding a level-up grants Skill Points; never touches `xpProgress`.
 */
export async function grantGameXp(userId: string, amount: number): Promise<GameProgressionSnapshot | null> {
  if (amount <= 0) return null;
  await assertCanMutateUser(userId);
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return null;

  const prevProgress = getGameLevelProgress(before.gameXp ?? 0);
  const nextXp = (before.gameXp ?? 0) + Math.floor(amount);
  const nextProgress = getGameLevelProgress(nextXp);
  const pointsGained =
    skillPointsForLevel(nextProgress.level) - skillPointsForLevel(prevProgress.level);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gameXp: nextXp,
      gameSkillPoints: { increment: Math.max(0, pointsGained) },
    },
  });

  return buildSnapshot(updated);
}

/** Spend one Skill Point to raise an ability by one level. */
export async function upgradeGameAbility(
  userId: string,
  ability: AbilityKey
): Promise<GameProgressionSnapshot> {
  await assertCanMutateUser(userId);
  await loadPowerDefinitions().catch(() => null);
  if (!ABILITY_KEYS.includes(ability)) throw new Error('Unknown ability');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const levels = parseAbilityLevels(user.gameAbilities);
  const def = ABILITY_DEFINITIONS[ability];
  const currentLevel = levels[ability];
  if (currentLevel >= def.maxLevel) throw new Error('Ability already at max level');

  const accountLevel = getGameLevelProgress(user.gameXp ?? 0).level;
  if (accountLevel < def.unlockLevel) {
    throw new Error(`${def.name} unlocks at level ${def.unlockLevel}`);
  }

  if (!arePrerequisitesMet(def, levels)) {
    const missing = def.prerequisites.find((p) => (levels[p.key] ?? 0) < p.level);
    const reqName = missing ? ABILITY_DEFINITIONS[missing.key]?.name ?? missing.key : 'a prerequisite power';
    throw new Error(`${def.name} requires ${reqName} at level ${missing?.level ?? '?'}`);
  }

  const cost = def.costForLevel(currentLevel);
  const skillPoints = Math.max(0, user.gameSkillPoints ?? 0);
  if (skillPoints < cost) throw new Error('Not enough Skill Points');

  const nextLevels: AbilityLevels = { ...levels, [ability]: currentLevel + 1 };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gameSkillPoints: { decrement: cost },
      gameAbilities: nextLevels,
    },
  });

  return buildSnapshot(updated);
}

/**
 * Admin-only: grant or deduct in-game XP (never touches website `xpProgress`).
 * Awarding enough XP to cross a level boundary grants the matching Skill Points,
 * same as a normal match-end award.
 */
export async function adminGrantGameXp(
  userId: string,
  amount: number
): Promise<GameProgressionSnapshot> {
  const staff = await requireAdminStaff();
  const delta = Math.trunc(amount);
  if (!delta) throw new Error('Amount required');
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  const prevProgress = getGameLevelProgress(target.gameXp ?? 0);
  const nextXp = Math.max(0, (target.gameXp ?? 0) + delta);
  const nextProgress = getGameLevelProgress(nextXp);
  const pointsGained =
    skillPointsForLevel(nextProgress.level) - skillPointsForLevel(prevProgress.level);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gameXp: nextXp,
      gameSkillPoints: { increment: Math.max(0, pointsGained) },
    },
  });

  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: delta > 0 ? 'admin_grant_game_xp' : 'admin_remove_game_xp',
    targetUserId: userId,
    targetUsername: target.username,
    detail: `${delta > 0 ? '+' : ''}${delta} in-game XP → ${nextXp}`,
  });

  return buildSnapshot(updated);
}

/** Admin-only: directly grant/remove unspent in-game Skill Points. */
export async function adminAdjustGameSkillPoints(
  userId: string,
  delta: number
): Promise<GameProgressionSnapshot> {
  const staff = await requireAdminStaff();
  const amount = Math.trunc(delta);
  if (!amount) throw new Error('Amount required');
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');
  const next = Math.max(0, (target.gameSkillPoints ?? 0) + amount);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { gameSkillPoints: next },
  });

  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: amount > 0 ? 'admin_grant_skill_points' : 'admin_remove_skill_points',
    targetUserId: userId,
    targetUsername: target.username,
    detail: `${amount > 0 ? '+' : ''}${amount} Skill Points → ${next}`,
  });

  return buildSnapshot(updated);
}

/**
 * Admin-only: full ability respec for a player — clears every power level and
 * refunds the entire Skill Point pool earned at their current in-game level.
 */
export async function adminResetGameAbilities(
  userId: string
): Promise<GameProgressionSnapshot> {
  const staff = await requireAdminStaff();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  const level = getGameLevelProgress(target.gameXp ?? 0).level;
  const fullPool = skillPointsForLevel(level);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      gameAbilities: {},
      gameSkillPoints: fullPool,
    },
  });

  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'admin_reset_game_abilities',
    targetUserId: userId,
    targetUsername: target.username,
    detail: `Abilities cleared, Skill Points refunded to ${fullPool}`,
  });

  return buildSnapshot(updated);
}
