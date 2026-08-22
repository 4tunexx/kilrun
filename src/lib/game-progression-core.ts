/**
 * Privileged in-game XP / skill-point helpers. Callers MUST already have
 * authorized the user (session, engine staff token, or trusted match-result).
 * Do not import this from client components except as `import type`.
 */

import { prisma } from '@/lib/prisma';
import {
  ABILITY_DEFINITIONS,
  ABILITY_KEYS,
  arePrerequisitesMet,
  type AbilityKey,
  type AbilityLevels,
  expectedUnspentSkillPoints,
  getGameLevelProgress,
  parseAbilityLevels,
  skillPointsForLevel,
  STATIC_FALLBACK_POWERS,
  type GameProgressionSnapshot,
  type PowerDefinitionRecord,
} from '@shared/ability-progression';
import { loadPowerDefinitions } from '@/lib/power-definitions';

export type { GameProgressionSnapshot };

export function buildGameProgressionSnapshot(user: {
  gameXp: number;
  gameSkillPoints: number;
  gameAbilities: unknown;
}): GameProgressionSnapshot {
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

export async function reconcileUnspentSkillPoints(user: {
  id: string;
  gameXp: number;
  gameSkillPoints: number;
  gameAbilities: unknown;
}) {
  await loadPowerDefinitions().catch(() => null);
  const expected = expectedUnspentSkillPoints(
    getGameLevelProgress(user.gameXp ?? 0).level,
    parseAbilityLevels(user.gameAbilities)
  );
  const current = Math.max(0, user.gameSkillPoints ?? 0);
  if (current >= expected) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: { gameSkillPoints: expected },
  });
}

export async function loadPowerDefinitionsForMenu(): Promise<PowerDefinitionRecord[]> {
  return loadPowerDefinitions({ force: true }).catch(() => STATIC_FALLBACK_POWERS);
}

export async function loadGameProgressionForUser(
  userId: string,
  opts: { reconcile?: boolean } = {}
): Promise<GameProgressionSnapshot | null> {
  await loadPowerDefinitions({ force: true }).catch(() => null);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const next = opts.reconcile === false ? user : await reconcileUnspentSkillPoints(user);
  return buildGameProgressionSnapshot(next);
}

export async function grantGameXpToUser(
  userId: string,
  amount: number
): Promise<GameProgressionSnapshot | null> {
  if (amount <= 0) return loadGameProgressionForUser(userId);
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

  return buildGameProgressionSnapshot(await reconcileUnspentSkillPoints(updated));
}

export async function upgradeGameAbilityForUser(
  userId: string,
  ability: AbilityKey
): Promise<GameProgressionSnapshot> {
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

  return buildGameProgressionSnapshot(updated);
}
