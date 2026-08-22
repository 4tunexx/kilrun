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
  type AbilityKey,
  getGameLevelProgress,
  skillPointsForLevel,
  type PowerDefinitionRecord,
} from '@shared/ability-progression';
import { writeAuditLog } from '@/lib/audit';
import {
  buildGameProgressionSnapshot,
  grantGameXpToUser,
  loadGameProgressionForUser,
  loadPowerDefinitionsForMenu,
  reconcileUnspentSkillPoints,
  upgradeGameAbilityForUser,
  type GameProgressionSnapshot,
} from '@/lib/game-progression-core';

export type { GameProgressionSnapshot };

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

/** Fetch a player's in-game progression (own profile or public read). */
export async function getGameProgression(userId: string): Promise<GameProgressionSnapshot | null> {
  let reconcile = false;
  try {
    await assertCanMutateUser(userId);
    reconcile = true;
  } catch {
    // Public profile reads must not mutate another player's points.
  }
  return loadGameProgressionForUser(userId, { reconcile });
}

/** Serializable power list (functions can't cross the server-action boundary
 * — the client re-derives cost/effect labels with the pure helpers exported
 * from `shared/power-definitions.ts`). Falls back to the static 12 on error. */
export async function getPowerDefinitionsForMenu(): Promise<PowerDefinitionRecord[]> {
  return loadPowerDefinitionsForMenu();
}

/**
 * Award in-game XP (called from match-rewards.ts when a match ends).
 * Awarding a level-up grants Skill Points; never touches `xpProgress`.
 */
export async function grantGameXp(userId: string, amount: number): Promise<GameProgressionSnapshot | null> {
  if (amount <= 0) return null;
  await assertCanMutateUser(userId);
  return grantGameXpToUser(userId, amount);
}

/** Spend one Skill Point to raise an ability by one level. */
export async function upgradeGameAbility(
  userId: string,
  ability: AbilityKey
): Promise<GameProgressionSnapshot> {
  await assertCanMutateUser(userId);
  return upgradeGameAbilityForUser(userId, ability);
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

  return buildGameProgressionSnapshot(await reconcileUnspentSkillPoints(updated));
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

  return buildGameProgressionSnapshot(updated);
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

  return buildGameProgressionSnapshot(updated);
}
