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
  type AbilityKey,
  type AbilityLevels,
  getGameLevelProgress,
  parseAbilityLevels,
  skillPointsForLevel,
} from '@shared/ability-progression';

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
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return buildSnapshot(user);
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
  if (!ABILITY_KEYS.includes(ability)) throw new Error('Unknown ability');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const levels = parseAbilityLevels(user.gameAbilities);
  const def = ABILITY_DEFINITIONS[ability];
  const currentLevel = levels[ability];
  if (currentLevel >= def.maxLevel) throw new Error('Ability already at max level');

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
