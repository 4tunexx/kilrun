'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  DAILY_MISSION_SEEDS,
  isDailyMissionCategory,
  isSameLocalDay,
  missionPeriodKey,
  startOfLocalDay,
} from '@/lib/daily-missions';
import { getLevelFromXp, getLevelProgress } from '@/lib/progression';
import { getRankForKp, KP_DEFAULT, clampKp } from '@/lib/kp';
import { canAccessAdmin, isAdminRole } from '@/lib/roles';
import { isTrustedServerContext } from '@/lib/trusted-server';

export type WebsiteActionMetric =
  | 'friends'
  | 'messages'
  | 'forum'
  | 'forum_replies'
  | 'purchases'
  | 'email'
  | 'chat'
  | 'vip'
  | 'logins'
  | 'support_tickets'
  | 'daily_login'
  | 'daily_chat'
  | 'daily_forum'
  | 'daily_runs'
  | 'daily_horde'
  | 'daily_competitive'
  | 'daily_leaderboard'
  | 'cosmetics_equipped'
  | 'cosmetics_deleted'
  | 'cosmetics_resold'
  | 'cosmetic_owned'
  | 'banner_owned'
  | 'frame_owned'
  | 'nickname_owned'
  | 'reputation';

async function requireUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Banned');
  return user;
}

async function requireStaff() {
  const user = await requireUser();
  if (!canAccessAdmin(user.role)) throw new Error('Forbidden');
  return user;
}

async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) throw new Error('Forbidden');
  return user;
}

async function assertCanMutateUser(userId: string) {
  if (isTrustedServerContext()) return;
  const user = await requireUser();
  if (user.id === userId) return;
  if (isAdminRole(user.role)) return;
  throw new Error('Forbidden');
}

/** Bell badge / list — DMs & mass mail belong in Messages, not here. */
const BELL_EXCLUDED_TYPES = ['message', 'announcement'] as const;

async function notify(
  userId: string,
  title: string,
  body: string,
  type: string,
  dedupeKey?: string
) {
  const key = dedupeKey?.trim() || undefined;
  if (key) {
    const existing = await prisma.notification.findFirst({
      where: { userId, dedupeKey: key },
    });
    if (existing) return;
  }
  try {
    await prisma.notification.create({
      data: { userId, title, body, type, dedupeKey: key },
    });
  } catch (err) {
    // Soft race: another request inserted the same key first.
    if (key) {
      const raced = await prisma.notification.findFirst({
        where: { userId, dedupeKey: key },
      });
      if (raced) return;
    }
    throw err;
  }
}

/** Grant XP and notify on level-up. Rank is driven by KP, not XP level. */
export async function grantXp(userId: string, amount: number, reason?: string) {
  if (amount <= 0) return null;
  await assertCanMutateUser(userId);
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return null;

  const prevLevel = getLevelFromXp(before.xpProgress);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      xpProgress: { increment: amount },
    },
  });
  const nextLevel = getLevelFromXp(updated.xpProgress);

  if (nextLevel > prevLevel) {
    await notify(
      userId,
      `Level up! Level ${nextLevel}`,
      reason
        ? `You reached level ${nextLevel}. (${reason})`
        : `You reached level ${nextLevel}. Keep climbing!`,
      'level_up',
      `level_up:${nextLevel}`
    );
  }

  return { xpProgress: updated.xpProgress, level: nextLevel, prevLevel };
}

/**
 * Apply a KP delta, sync `currentRank` from the new KP, and optionally notify
 * on rank-up / rank-down.
 */
const KP_RANK_ORDER = [
  'Unranked',
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Immortal',
];

export async function applyKpDelta(
  userId: string,
  delta: number,
  reason?: string
): Promise<{ kp: number; rank: string; prevRank: string; delta: number } | null> {
  if (!delta) return null;
  await assertCanMutateUser(userId);
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return null;

  const prevKp = typeof (before as { kp?: number }).kp === 'number' ? (before as { kp: number }).kp : KP_DEFAULT;
  const nextKp = clampKp(prevKp + delta);
  const prevRank = before.currentRank || getRankForKp(prevKp);
  const nextRank = getRankForKp(nextKp);

  const prevPeakKp =
    typeof (before as { peakKp?: number }).peakKp === 'number'
      ? (before as { peakKp: number }).peakKp
      : prevKp;
  const peakKp = Math.max(prevPeakKp, nextKp);
  const peakRank = getRankForKp(peakKp);

  await prisma.user.update({
    where: { id: userId },
    data: {
      kp: nextKp,
      currentRank: nextRank,
      peakKp,
      peakRank,
    },
  });

  if (nextRank !== prevRank) {
    const up = KP_RANK_ORDER.indexOf(nextRank) > KP_RANK_ORDER.indexOf(prevRank);
    await notify(
      userId,
      up ? `Rank up — ${nextRank}` : `Rank dropped — ${nextRank}`,
      reason
        ? `${delta > 0 ? '+' : ''}${delta} KP → ${nextRank}. (${reason})`
        : `${delta > 0 ? '+' : ''}${delta} KP → ${nextRank}.`,
      'rank_change'
    );
  }

  return { kp: nextKp, rank: nextRank, prevRank, delta };
}

/** Ensure user.kp exists and currentRank matches KP (migration / backfill). */
export async function syncRankFromKp(userId: string) {
  await assertCanMutateUser(userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const kp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;
  const rank = getRankForKp(kp);
  const prevPeak =
    typeof (user as { peakKp?: number }).peakKp === 'number'
      ? (user as { peakKp: number }).peakKp
      : kp;
  const peakKp = Math.max(prevPeak, kp);
  const peakRank = getRankForKp(peakKp);
  if (
    user.currentRank !== rank ||
    (user as { kp?: number }).kp == null ||
    (user as { peakKp?: number }).peakKp !== peakKp ||
    (user as { peakRank?: string }).peakRank !== peakRank
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: { kp, currentRank: rank, peakKp, peakRank },
    });
  }
  return { kp, rank, peakKp, peakRank };
}

/** Ensure the built-in daily templates exist (won't overwrite admin edits). */
export async function ensureDailyMissionTemplates() {
  for (const m of DAILY_MISSION_SEEDS) {
    const existing = await prisma.missionTemplate.findUnique({
      where: { key: m.key },
    });
    if (!existing) {
      await prisma.missionTemplate.create({
        data: { ...m, isActive: true },
      });
    }
  }
}

function templateCategory(t: { category: string; key: string }): string {
  if (isDailyMissionCategory(t.category) || t.key.startsWith('daily_')) {
    return 'daily';
  }
  if (t.category === 'website' || t.key.startsWith('web_')) return 'website';
  return t.category === 'game' ? 'game' : t.category || 'game';
}

/** Assign / refresh active missions. Daily board resets each calendar day. */
export async function ensurePlayerMissions(userId: string) {
  await assertCanMutateUser(userId);
  await ensureDailyMissionTemplates();
  const today = missionPeriodKey();
  const templates = await prisma.missionTemplate.findMany({
    where: { isActive: true },
  });
  const existing = await prisma.activeMission.findMany({ where: { userId } });
  // Collapse accidental duplicate rows (pre-unique index / concurrent creates).
  const byKey = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const prev = byKey.get(row.templateKey);
    if (!prev) {
      byKey.set(row.templateKey, row);
      continue;
    }
    // Keep the most progressed / newest; drop the other.
    const keep =
      row.isCompleted && !prev.isCompleted
        ? row
        : !row.isCompleted && prev.isCompleted
          ? prev
          : row.currentCount >= prev.currentCount
            ? row
            : prev;
    const drop = keep.id === row.id ? prev : row;
    byKey.set(row.templateKey, keep);
    await prisma.activeMission.delete({ where: { id: drop.id } }).catch(() => {});
  }

  for (const t of templates) {
    const category = templateCategory(t);
    const isDaily = category === 'daily';
    const current = byKey.get(t.key);

    if (isDaily) {
      if (!current) {
        try {
          await prisma.activeMission.create({
            data: {
              userId,
              templateKey: t.key,
              title: t.title,
              description: t.description,
              rewardXp: t.rewardXp,
              targetCount: t.targetCount,
              metric: t.metric,
              category: 'daily',
              periodKey: today,
              currentCount: 0,
              isCompleted: false,
              iconImageUrl: t.iconImageUrl,
            },
          });
        } catch {
          // Unique race with another tab — ignore.
        }
      } else if (current.periodKey !== today) {
        await prisma.activeMission.update({
          where: { id: current.id },
          data: {
            title: t.title,
            description: t.description,
            rewardXp: t.rewardXp,
            targetCount: t.targetCount,
            metric: t.metric,
            category: 'daily',
            periodKey: today,
            currentCount: 0,
            isCompleted: false,
            iconImageUrl: t.iconImageUrl,
          },
        });
      } else if (current.category !== 'daily') {
        await prisma.activeMission.update({
          where: { id: current.id },
          data: { category: 'daily', periodKey: today },
        });
      }
      continue;
    }

    if (!current) {
      try {
        await prisma.activeMission.create({
          data: {
            userId,
            templateKey: t.key,
            title: t.title,
            description: t.description,
            rewardXp: t.rewardXp,
            targetCount: t.targetCount,
            metric: t.metric,
            category,
            periodKey: '',
            currentCount: 0,
            isCompleted: false,
            iconImageUrl: t.iconImageUrl,
          },
        });
      } catch {
        // Unique race with another tab — ignore.
      }
    } else if (current.category !== category) {
      await prisma.activeMission.update({
        where: { id: current.id },
        data: { category, periodKey: '' },
      });
    }
  }
}

/** Increment missions matching a metric; complete + reward when target hit. */
export async function progressMissions(
  userId: string,
  metric: string,
  amount = 1
) {
  await assertCanMutateUser(userId);
  const missions = await prisma.activeMission.findMany({
    where: { userId, metric, isCompleted: false },
  });

  for (const m of missions) {
    const next = Math.min(m.targetCount, m.currentCount + amount);
    const completed = next >= m.targetCount;
    if (completed) {
      // Atomic claim — only one concurrent bootstrap wins the reward + notify.
      const claimed = await prisma.activeMission.updateMany({
        where: { id: m.id, isCompleted: false },
        data: { currentCount: next, isCompleted: true },
      });
      if (claimed.count !== 1) continue;
      await grantXp(userId, m.rewardXp, `Mission: ${m.title}`);
      await notify(
        userId,
        'Mission complete',
        `${m.title} — +${m.rewardXp} XP`,
        'mission',
        `mission:${m.templateKey}:${m.periodKey || 'main'}`
      );
      await tryUnlockAchievement(userId, 'missions_completed', 1);
      await tryUnlockBadge(userId, 'missions_completed', 1);
    } else if (next !== m.currentCount) {
      await prisma.activeMission.updateMany({
        where: { id: m.id, isCompleted: false },
        data: { currentCount: next },
      });
    }
  }
}

async function metricCount(userId: string, metric: string): Promise<number> {
  switch (metric) {
    case 'runs':
      return prisma.matchResult.count({ where: { userId, mode: 'deathrun' } });
    case 'wins':
      return prisma.matchResult.count({
        where: {
          userId,
          mode: 'deathrun',
          outcome: { in: ['win', 'survived'] },
        },
      });
    case 'horde_runs':
      return prisma.matchResult.count({ where: { userId, mode: 'horde' } });
    case 'horde_wins':
      return prisma.matchResult.count({
        where: { userId, mode: 'horde', outcome: { in: ['win', 'survived'] } },
      });
    case 'horde_waves': {
      const rows = await prisma.matchResult.findMany({
        where: { userId, mode: 'horde' },
        select: { stats: true },
      });
      return rows.reduce((sum, r) => {
        const s = r.stats as { wavesCleared?: number } | null;
        return sum + (typeof s?.wavesCleared === 'number' ? s.wavesCleared : 0);
      }, 0);
    }
    case 'horde_kills': {
      const rows = await prisma.matchResult.findMany({
        where: { userId, mode: 'horde' },
        select: { stats: true },
      });
      return rows.reduce((sum, r) => {
        const s = r.stats as { kills?: number } | null;
        return sum + (typeof s?.kills === 'number' ? s.kills : 0);
      }, 0);
    }
    case 'competitive_runs':
      return prisma.matchResult.count({
        where: { userId, mode: { in: ['competitive', 'competitive_ranked'] } },
      });
    case 'competitive_wins':
      return prisma.matchResult.count({
        where: {
          userId,
          mode: { in: ['competitive', 'competitive_ranked'] },
          outcome: 'win',
        },
      });
    case 'kp': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return typeof (u as { kp?: number } | null)?.kp === 'number'
        ? (u as { kp: number }).kp
        : KP_DEFAULT;
    }
    case 'distance': {
      const stats = await prisma.matchStat.findMany({ where: { userId } });
      return stats.reduce((s, r) => s + r.distance, 0);
    }
    case 'score': {
      const stats = await prisma.matchStat.findMany({ where: { userId } });
      return stats.reduce((s, r) => Math.max(s, r.score), 0);
    }
    case 'friends':
      return prisma.friendship.count({
        where: {
          status: 'accepted',
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      });
    case 'messages':
      return prisma.message.count({ where: { senderId: userId } });
    case 'forum':
      return prisma.forumPost.count({ where: { authorId: userId } });
    case 'purchases':
      return prisma.purchase.count({ where: { userId } });
    case 'email': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.emailVerified ? 1 : 0;
    }
    case 'level': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u ? getLevelFromXp(u.xpProgress) : 0;
    }
    case 'vip': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.isVip ? 1 : 0;
    }
    case 'chat':
      return prisma.globalChatMessage.count({ where: { userId } });
    case 'logins':
      return 1;
    case 'missions_completed':
      return prisma.activeMission.count({
        where: { userId, isCompleted: true },
      });
    case 'forum_replies':
      return prisma.forumReply.count({ where: { authorId: userId } });
    case 'vp_spent': {
      const purchases = await prisma.purchase.findMany({ where: { userId } });
      return purchases.reduce((sum, p) => sum + p.vpSpent, 0);
    }
    case 'reputation': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return Math.max(0, u?.reputation ?? 0);
    }
    case 'daily_login_streak': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.loginStreak ?? 0;
    }
    case 'trapper_wins':
      return prisma.matchResult.count({
        where: { userId, role: 'trapper', outcome: 'win' },
      });
    case 'runner_survives':
      return prisma.matchResult.count({
        where: { userId, role: 'runner', outcome: 'survived' },
      });
    case 'losses':
      return prisma.matchResult.count({ where: { userId, outcome: 'loss' } });
    case 'eliminated':
      return prisma.matchResult.count({ where: { userId, outcome: 'eliminated' } });
    case 'badges_earned':
      return prisma.userBadge.count({ where: { userId } });
    case 'achievements_unlocked':
      return prisma.userAchievement.count({ where: { userId } });
    case 'support_tickets':
      return prisma.supportTicket.count({ where: { userId } });
    case 'cosmetic_owned':
      return prisma.inventoryItem.count({
        where: { userId, cosmeticSlot: { not: null } },
      });
    case 'banner_owned':
      return prisma.inventoryItem.count({
        where: { userId, cosmeticSlot: 'banner' },
      });
    case 'frame_owned':
      return prisma.inventoryItem.count({
        where: { userId, cosmeticSlot: 'frame' },
      });
    case 'nickname_owned':
      return prisma.inventoryItem.count({
        where: { userId, cosmeticSlot: 'nickname' },
      });
    case 'cosmetics_equipped': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.cosmeticEquipCount ?? 0;
    }
    case 'cosmetics_deleted': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.cosmeticDeleteCount ?? 0;
    }
    case 'cosmetics_resold': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return u?.cosmeticResellCount ?? 0;
    }
    case 'daily_login': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return isSameLocalDay(u?.lastLoginAt) ? 1 : 0;
    }
    case 'daily_chat':
      return prisma.globalChatMessage.count({
        where: { userId, createdAt: { gte: startOfLocalDay() } },
      });
    case 'daily_forum': {
      const since = startOfLocalDay();
      const [posts, replies] = await Promise.all([
        prisma.forumPost.count({
          where: { authorId: userId, createdAt: { gte: since } },
        }),
        prisma.forumReply.count({
          where: { authorId: userId, createdAt: { gte: since } },
        }),
      ]);
      return posts + replies;
    }
    case 'daily_runs':
      return prisma.matchResult.count({
        where: {
          userId,
          mode: 'deathrun',
          playedAt: { gte: startOfLocalDay() },
        },
      });
    case 'daily_horde':
      return prisma.matchResult.count({
        where: {
          userId,
          mode: 'horde',
          playedAt: { gte: startOfLocalDay() },
        },
      });
    case 'daily_competitive':
      return prisma.matchResult.count({
        where: {
          userId,
          mode: { in: ['competitive', 'competitive_ranked'] },
          playedAt: { gte: startOfLocalDay() },
        },
      });
    case 'daily_leaderboard': {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      return isSameLocalDay(u?.lastLeaderboardAt) ? 1 : 0;
    }
    default:
      return 0;
  }
}

/**
 * Advances the player's consecutive-day login streak. Call once per hub
 * bootstrap (idempotent per calendar day): same-day repeat visits are a
 * no-op, a visit on the following day increments the streak, and a gap of
 * 2+ days resets it back to 1.
 */
export async function updateLoginStreak(userId: string) {
  await assertCanMutateUser(userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const now = new Date();
  const today = startOfLocalDay(now);
  if (isSameLocalDay(user.lastLoginAt, now)) {
    return; // already counted today (UTC day)
  }

  const last = user.lastLoginAt ? startOfLocalDay(user.lastLoginAt) : null;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const isConsecutive = last && today.getTime() - last.getTime() <= oneDayMs;
  const nextStreak = isConsecutive ? user.loginStreak + 1 : 1;

  // Atomic claim for today — prevents double-increment across tabs/callbacks.
  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: today } }],
    },
    data: { loginStreak: nextStreak, lastLoginAt: now },
  });
  if (claimed.count === 0) return;

  await tryUnlockAchievement(userId, 'daily_login_streak');
  await tryUnlockBadge(userId, 'daily_login_streak');
}

export async function tryUnlockAchievement(
  userId: string,
  metric: string,
  _delta = 1
) {
  await assertCanMutateUser(userId);
  const defs = await prisma.achievementDefinition.findMany({
    where: { isActive: true, metric },
  });
  let unlockedAny = false;
  for (const def of defs) {
    const existing = await prisma.userAchievement.findFirst({
      where: { userId, achievementId: def.id },
    });
    if (existing) continue;
    const count = await metricCount(userId, def.metric);
    if (count < def.targetCount) continue;

    await prisma.userAchievement.create({
      data: { userId, achievementId: def.id },
    });
    unlockedAny = true;
    if (def.xpReward > 0) {
      await grantXp(userId, def.xpReward, `Achievement: ${def.title}`);
    }
    await notify(
      userId,
      'Achievement unlocked',
      `${def.title} — ${def.description}`,
      'achievement'
    );
  }
  // Meta-progress: re-check "N achievements unlocked" style unlocks. The
  // metric guard means this can only ever create a *different* definition,
  // so it terminates instead of recursing forever.
  if (unlockedAny && metric !== 'achievements_unlocked') {
    await tryUnlockAchievement(userId, 'achievements_unlocked');
  }
}

export async function tryUnlockBadge(userId: string, metric: string, _delta = 1) {
  await assertCanMutateUser(userId);
  const defs = await prisma.badgeDefinition.findMany({
    where: { isActive: true, metric },
  });
  let unlockedAny = false;
  for (const def of defs) {
    const existing = await prisma.userBadge.findFirst({
      where: { userId, badgeId: def.id },
    });
    if (existing) continue;
    const count = await metricCount(userId, def.metric);
    if (count < def.targetCount) continue;

    await prisma.userBadge.create({
      data: { userId, badgeId: def.id },
    });
    unlockedAny = true;
    await notify(
      userId,
      'Badge earned',
      `${def.title} — ${def.description}`,
      'badge'
    );
  }
  // Meta-progress: re-check "N badges earned" style unlocks (guarded so it
  // can only ever create a *different* badge, never recurse forever).
  if (unlockedAny && metric !== 'badges_earned') {
    await tryUnlockBadge(userId, 'badges_earned');
  }
}

/** After a match: XP already granted separately; progress game missions + achievements. */
export async function processMatchProgression(input: {
  userId: string;
  mode?: 'deathrun' | 'horde' | 'competitive';
  outcome: string;
  role?: 'trapper' | 'runner' | 'survivor' | 'team_a' | 'team_b';
  score?: number;
  distance?: number;
  wavesCleared?: number;
  kills?: number;
}) {
  await assertCanMutateUser(input.userId);
  const mode = input.mode ?? 'deathrun';
  await ensurePlayerMissions(input.userId);

  if (mode === 'deathrun') {
    await progressMissions(input.userId, 'runs', 1);
    await processWebsiteAction(input.userId, 'daily_runs');
    if (input.outcome === 'win' || input.outcome === 'survived') {
      await progressMissions(input.userId, 'wins', 1);
    }
    if (input.role === 'trapper' && input.outcome === 'win') {
      await progressMissions(input.userId, 'trapper_wins', 1);
    }
    if (input.role === 'runner' && input.outcome === 'survived') {
      await progressMissions(input.userId, 'runner_survives', 1);
    }
  } else if (mode === 'horde') {
    await progressMissions(input.userId, 'horde_runs', 1);
    await processWebsiteAction(input.userId, 'daily_horde');
    if (input.outcome === 'win' || input.outcome === 'survived') {
      await progressMissions(input.userId, 'horde_wins', 1);
    }
    if (input.wavesCleared && input.wavesCleared > 0) {
      await progressMissions(input.userId, 'horde_waves', input.wavesCleared);
    }
    if (input.kills && input.kills > 0) {
      await progressMissions(input.userId, 'horde_kills', input.kills);
    }
  } else if (mode === 'competitive') {
    await progressMissions(input.userId, 'competitive_runs', 1);
    await processWebsiteAction(input.userId, 'daily_competitive');
    if (input.outcome === 'win') {
      await progressMissions(input.userId, 'competitive_wins', 1);
    }
    await tryUnlockAchievement(input.userId, 'kp');
    await tryUnlockBadge(input.userId, 'kp');
  }

  if (input.outcome === 'loss') {
    await progressMissions(input.userId, 'losses', 1);
  }
  if (input.outcome === 'eliminated') {
    await progressMissions(input.userId, 'eliminated', 1);
  }
  if (input.distance && input.distance > 0) {
    await progressMissions(input.userId, 'distance', input.distance);
  }
  if (input.score && input.score > 0) {
    // score missions use "best/high score" style — set progress to max(current, score)
    const scoreMissions = await prisma.activeMission.findMany({
      where: { userId: input.userId, metric: 'score', isCompleted: false },
    });
    for (const m of scoreMissions) {
      const next = Math.max(m.currentCount, input.score);
      const completed = next >= m.targetCount;
      if (completed) {
        const claimed = await prisma.activeMission.updateMany({
          where: { id: m.id, isCompleted: false },
          data: { currentCount: next, isCompleted: true },
        });
        if (claimed.count !== 1) continue;
        await grantXp(input.userId, m.rewardXp, `Mission: ${m.title}`);
        await notify(
          input.userId,
          'Mission complete',
          `${m.title} — +${m.rewardXp} XP`,
          'mission',
          `mission:${m.templateKey}:${m.periodKey || 'main'}`
        );
        await tryUnlockAchievement(input.userId, 'missions_completed', 1);
        await tryUnlockBadge(input.userId, 'missions_completed', 1);
      } else if (next !== m.currentCount) {
        await prisma.activeMission.updateMany({
          where: { id: m.id, isCompleted: false },
          data: { currentCount: next },
        });
      }
    }
  }

  await tryUnlockAchievement(input.userId, 'runs');
  await tryUnlockAchievement(input.userId, 'wins');
  await tryUnlockAchievement(input.userId, 'distance');
  await tryUnlockAchievement(input.userId, 'score');
  await tryUnlockAchievement(input.userId, 'level');
  await tryUnlockAchievement(input.userId, 'trapper_wins');
  await tryUnlockAchievement(input.userId, 'runner_survives');
  await tryUnlockAchievement(input.userId, 'losses');
  await tryUnlockAchievement(input.userId, 'eliminated');
  await tryUnlockAchievement(input.userId, 'horde_runs');
  await tryUnlockAchievement(input.userId, 'horde_wins');
  await tryUnlockAchievement(input.userId, 'horde_waves');
  await tryUnlockAchievement(input.userId, 'horde_kills');
  await tryUnlockAchievement(input.userId, 'competitive_runs');
  await tryUnlockAchievement(input.userId, 'competitive_wins');
  await tryUnlockBadge(input.userId, 'runs');
  await tryUnlockBadge(input.userId, 'wins');
  await tryUnlockBadge(input.userId, 'level');
  await tryUnlockBadge(input.userId, 'trapper_wins');
  await tryUnlockBadge(input.userId, 'runner_survives');
  await tryUnlockBadge(input.userId, 'horde_runs');
  await tryUnlockBadge(input.userId, 'horde_wins');
  await tryUnlockBadge(input.userId, 'horde_waves');
  await tryUnlockBadge(input.userId, 'competitive_runs');
  await tryUnlockBadge(input.userId, 'competitive_wins');
  await tryUnlockBadge(input.userId, 'kp');
}

const SYNC_FROM_TOTAL_METRICS = new Set<WebsiteActionMetric>([
  'email',
  'vip',
  'friends',
  'cosmetic_owned',
  'banner_owned',
  'frame_owned',
  'nickname_owned',
  'cosmetics_equipped',
  'cosmetics_deleted',
  'cosmetics_resold',
  'daily_login',
  'daily_chat',
  'daily_forum',
  'daily_runs',
  'daily_horde',
  'daily_competitive',
  'daily_leaderboard',
  'reputation',
]);

async function syncMissionProgressFromCount(userId: string, metric: string) {
  const count = await metricCount(userId, metric);
  const missions = await prisma.activeMission.findMany({
    where: { userId, metric, isCompleted: false },
  });
  for (const m of missions) {
    const next = Math.min(m.targetCount, count);
    const completed = next >= m.targetCount;
    if (completed) {
      const claimed = await prisma.activeMission.updateMany({
        where: { id: m.id, isCompleted: false },
        data: { currentCount: next, isCompleted: true },
      });
      if (claimed.count !== 1) continue;
      await grantXp(userId, m.rewardXp, `Mission: ${m.title}`);
      await notify(
        userId,
        'Mission complete',
        `${m.title} — +${m.rewardXp} XP`,
        'mission',
        `mission:${m.templateKey}:${m.periodKey || 'main'}`
      );
      await tryUnlockAchievement(userId, 'missions_completed', 1);
      await tryUnlockBadge(userId, 'missions_completed', 1);
    } else if (next !== m.currentCount) {
      await prisma.activeMission.updateMany({
        where: { id: m.id, isCompleted: false },
        data: { currentCount: next },
      });
    }
  }
}

export async function processWebsiteAction(
  userId: string,
  metric: WebsiteActionMetric
) {
  await assertCanMutateUser(userId);
  await ensurePlayerMissions(userId);
  if (SYNC_FROM_TOTAL_METRICS.has(metric)) {
    await syncMissionProgressFromCount(userId, metric);
  } else {
    await progressMissions(userId, metric, 1);
  }
  await tryUnlockAchievement(userId, metric);
  await tryUnlockBadge(userId, metric);
  if (metric === 'email' || metric === 'vip') {
    await tryUnlockAchievement(userId, 'level');
    await tryUnlockBadge(userId, 'level');
  }
}

/** Record a leaderboard page visit for the daily mission. */
export async function recordLeaderboardVisit() {
  const user = await requireUser();
  await ensurePlayerMissions(user.id);
  if (!isSameLocalDay(user.lastLeaderboardAt)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLeaderboardAt: new Date() },
    });
  }
  await processWebsiteAction(user.id, 'daily_leaderboard');
  return { ok: true as const };
}

/** Called when hub loads: missions + login progression + live unlocks. */
export async function bootstrapHubProgression() {
  const user = await requireUser();
  await ensurePlayerMissions(user.id);
  await processWebsiteAction(user.id, 'logins');
  await updateLoginStreak(user.id);
  // Daily login uses lastLoginAt (updated by streak) — sync after streak write.
  await processWebsiteAction(user.id, 'daily_login');
  if (user.emailVerified) {
    await processWebsiteAction(user.id, 'email');
  }
  if (user.isVip) {
    await processWebsiteAction(user.id, 'vip');
  }
  return getLivePlayerState(user.id);
}

/** Polling payload for right-rail XP/VP/rank. */
export async function getLivePlayerState(userId?: string) {
  let sessionUser: Awaited<ReturnType<typeof requireUser>> | null = null;

  if (!isTrustedServerContext()) {
    sessionUser = await requireUser();
    if (userId && userId !== sessionUser.id && !canAccessAdmin(sessionUser.role)) {
      throw new Error('Forbidden');
    }
  } else if (userId) {
    // Trusted server path may resolve by id; session optional.
    try {
      sessionUser = await requireUser();
    } catch {
      sessionUser = null;
    }
  } else {
    throw new Error('Not authenticated');
  }

  const user =
    userId && (!sessionUser || userId !== sessionUser.id)
      ? await prisma.user.findUnique({ where: { id: userId } })
      : sessionUser;
  if (!user) throw new Error('User not found');

  // Refresh today's board before counting (self / admin / trusted can mutate).
  if (
    isTrustedServerContext() ||
    !sessionUser ||
    sessionUser.id === user.id ||
    isAdminRole(sessionUser.role)
  ) {
    await ensurePlayerMissions(user.id);
  }

  // Heartbeat presence when the authenticated player is polling their own state.
  if (sessionUser && sessionUser.id === user.id) {
    await prisma.user
      .update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});
  }

  const [unread, unreadMessages] = await Promise.all([
    prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
        NOT: { type: { in: [...BELL_EXCLUDED_TYPES] } },
      },
    }),
    prisma.message.count({
      where: { receiverId: user.id, readAt: null },
    }),
  ]);
  const progress = getLevelProgress(user.xpProgress);
  const userKp =
    typeof (user as { kp?: number }).kp === 'number'
      ? (user as { kp: number }).kp
      : KP_DEFAULT;
  // Keep profile rank aligned with KP (ranks are competitive, not XP level).
  const kpRank = getRankForKp(userKp);
  const prevPeakKp =
    typeof (user as { peakKp?: number }).peakKp === 'number'
      ? (user as { peakKp: number }).peakKp
      : userKp;
  const peakKp = Math.max(prevPeakKp, userKp);
  const peakRank =
    (user as { peakRank?: string }).peakRank &&
    prevPeakKp >= userKp
      ? (user as { peakRank: string }).peakRank
      : getRankForKp(peakKp);
  if (
    user.currentRank !== kpRank ||
    (user as { kp?: number }).kp == null ||
    (user as { peakKp?: number }).peakKp !== peakKp
  ) {
    await prisma.user
      .update({
        where: { id: user.id },
        data: { kp: userKp, currentRank: kpRank, peakKp, peakRank },
      })
      .catch(() => {});
  }

  const today = missionPeriodKey();
  const dailyBoard = await prisma.activeMission.findMany({
    where: {
      userId: user.id,
      OR: [{ category: 'daily' }, { templateKey: { startsWith: 'daily_' } }],
      periodKey: today,
    },
  });
  const dailyCompleted = dailyBoard.filter((m) => m.isCompleted).length;
  const dailyTotal =
    dailyBoard.length > 0 ? dailyBoard.length : DAILY_MISSION_SEEDS.length;

  const { isPremiumActive, canAccessRankedCompetitive } = await import('@/lib/premium');
  const { parsePremiumConfig, isFreeRankedWeekActive } = await import('@/lib/premium-config');
  const premiumExpiresAt = (user as { premiumExpiresAt?: Date | null }).premiumExpiresAt ?? null;
  const premiumActive = isPremiumActive({
    isVip: user.isVip,
    premiumExpiresAt,
  });
  const settings = await getSiteSettings();
  const premiumConfig = parsePremiumConfig(
    (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
  );
  const freeRankedWeek = isFreeRankedWeekActive(premiumConfig);
  const rankedAccess = canAccessRankedCompetitive({
    isPremium: premiumActive,
    config: premiumConfig,
  });

  return {
    id: user.id,
    xpProgress: user.xpProgress,
    vpCurrency: user.vpCurrency,
    kp: userKp,
    peakKp,
    peakRank,
    currentRank: premiumActive ? kpRank : 'Go Premium',
    role: user.role,
    isVip: user.isVip,
    isPremium: premiumActive,
    rankedAccess,
    freeRankedWeek,
    premiumExpiresAt: premiumExpiresAt ? new Date(premiumExpiresAt).toISOString() : null,
    premiumConfig,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    username: user.username,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    unreadNotifications: unread,
    unreadMessages,
    dailyMissionsCompleted: dailyCompleted,
    dailyMissionsTotal: dailyTotal,
  };
}

export async function getPlayerAchievements(userId: string) {
  const [defs, unlocked] = await Promise.all([
    prisma.achievementDefinition.findMany({
      where: { isActive: true },
      orderBy: { category: 'asc' },
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true },
    }),
  ]);
  const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
  return defs.map((d) => ({
    ...d,
    unlocked: unlockedMap.has(d.id),
    unlockedAt: unlockedMap.get(d.id) ?? null,
  }));
}

export async function getPlayerBadges(userId: string) {
  const [defs, unlocked] = await Promise.all([
    prisma.badgeDefinition.findMany({
      where: { isActive: true },
      orderBy: { rarity: 'asc' },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      select: { badgeId: true, earnedAt: true },
    }),
  ]);
  const unlockedMap = new Map(unlocked.map((u) => [u.badgeId, u.earnedAt]));
  return defs.map((d) => ({
    ...d,
    unlocked: unlockedMap.has(d.id),
    earnedAt: unlockedMap.get(d.id) ?? null,
  }));
}

export async function getSiteSettings() {
  let settings = await prisma.siteSettings.findUnique({
    where: { singletonKey: 'default' },
  });
  if (!settings) {
    settings = await prisma.siteSettings.create({
      data: { singletonKey: 'default' },
    });
  }

  // Merge raw Mongo fields so branding always reflects admin saves even if a
  // stale Prisma client omits newer columns (headerLogoUrl, homeHeroImage, …).
  try {
    const raw = (await prisma.$runCommandRaw({
      find: 'SiteSettings',
      filter: { singletonKey: 'default' },
      limit: 1,
    })) as { cursor?: { firstBatch?: Array<Record<string, unknown>> } };
    const doc = raw?.cursor?.firstBatch?.[0];
    if (doc) {
      return {
        ...settings,
        logoUrl: String(doc.logoUrl ?? settings.logoUrl ?? ''),
        headerLogoUrl: String(
          doc.headerLogoUrl ??
            (settings as { headerLogoUrl?: string }).headerLogoUrl ??
            ''
        ),
        headerLogoStyle: String(
          doc.headerLogoStyle ??
            (settings as { headerLogoStyle?: string }).headerLogoStyle ??
            ''
        ),
        backgroundUrl: String(doc.backgroundUrl ?? settings.backgroundUrl ?? ''),
        homeHeroImage: String(
          doc.homeHeroImage ??
            (settings as { homeHeroImage?: string }).homeHeroImage ??
            ''
        ),
        landingHeroImage: String(
          doc.landingHeroImage ?? settings.landingHeroImage ?? ''
        ),
        headerTitle: String(doc.headerTitle ?? settings.headerTitle ?? ''),
        headerSubtitle: String(
          doc.headerSubtitle ?? settings.headerSubtitle ?? ''
        ),
        gameDisabledMsg: String(
          doc.gameDisabledMsg ?? settings.gameDisabledMsg ?? ''
        ),
        landingHeroSlides: String(
          doc.landingHeroSlides ??
            (settings as { landingHeroSlides?: string }).landingHeroSlides ??
            '[]'
        ),
        gameDisabledUntil:
          (doc.gameDisabledUntil as Date | string | null | undefined) ??
          (settings as { gameDisabledUntil?: Date | null }).gameDisabledUntil ??
          null,
        gameDisabled: Boolean(doc.gameDisabled ?? settings.gameDisabled),
        chatEnabled: Boolean(doc.chatEnabled ?? settings.chatEnabled),
        hubPagesJson: String(
          doc.hubPagesJson ??
            (settings as { hubPagesJson?: string }).hubPagesJson ??
            '{}'
        ),
        hubNavJson: String(
          doc.hubNavJson ?? (settings as { hubNavJson?: string }).hubNavJson ?? '{}'
        ),
        hubChromeJson: String(
          doc.hubChromeJson ??
            (settings as { hubChromeJson?: string }).hubChromeJson ??
            '{}'
        ),
        premiumConfigJson: String(
          doc.premiumConfigJson ??
            (settings as { premiumConfigJson?: string }).premiumConfigJson ??
            '{}'
        ),
        rankConfigJson: String(
          doc.rankConfigJson ??
            (settings as { rankConfigJson?: string }).rankConfigJson ??
            '{}'
        ),
      };
    }
  } catch {
    // Raw merge is best-effort; Prisma row is still usable.
  }

  return {
    ...settings,
    headerLogoStyle: String(
      (settings as { headerLogoStyle?: string }).headerLogoStyle ?? ''
    ),
    landingHeroSlides: String(
      (settings as { landingHeroSlides?: string }).landingHeroSlides ?? '[]'
    ),
    gameDisabledUntil:
      (settings as { gameDisabledUntil?: Date | null }).gameDisabledUntil ?? null,
    hubPagesJson: String(
      (settings as { hubPagesJson?: string }).hubPagesJson ?? '{}'
    ),
    hubNavJson: String((settings as { hubNavJson?: string }).hubNavJson ?? '{}'),
    hubChromeJson: String(
      (settings as { hubChromeJson?: string }).hubChromeJson ?? '{}'
    ),
    premiumConfigJson: String(
      (settings as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
    ),
    rankConfigJson: String(
      (settings as { rankConfigJson?: string }).rankConfigJson ?? '{}'
    ),
  };
}

export async function updateSiteSettings(data: {
  logoUrl?: string;
  headerLogoUrl?: string;
  headerLogoStyle?: string;
  backgroundUrl?: string;
  homeHeroImage?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  landingHeroImage?: string;
  landingHeroSlides?: string;
  gameDisabled?: boolean;
  gameDisabledMsg?: string;
  gameDisabledUntil?: string | null;
  chatEnabled?: boolean;
  hubPagesJson?: string;
  hubNavJson?: string;
  hubChromeJson?: string;
  premiumConfigJson?: string;
  rankConfigJson?: string;
}) {
  const staff = await requireStaff();
  await getSiteSettings();

  // Drop a cached PrismaClient that may predate schema fields (headerLogoUrl, etc.).
  const { resetPrismaClient, withPrismaRetry } = await import('@/lib/prisma');
  await resetPrismaClient();

  const { persistSiteImage } = await import('@/lib/site-asset-upload');
  const { normalizeHeaderLogoStyle, serializeHeaderLogoStyle } = await import(
    '@/lib/logo-style'
  );
  const { normalizeLandingSlides } = await import('@/lib/cosmetics');
  const {
    parseHubPages,
    parseHubNav,
    parseHubChrome,
  } = await import('@/lib/hub-layout');
  const { serializePremiumConfig, parsePremiumConfig } = await import(
    '@/lib/premium-config'
  );
  const { serializeRankConfig, parseRankConfig } = await import('@/lib/rank-config');
  const payload: Record<string, string | boolean | Date | null> = {};

  if (typeof data.logoUrl === 'string') {
    payload.logoUrl = data.logoUrl
      ? await persistSiteImage(data.logoUrl, 'mark')
      : '';
  }
  if (typeof data.headerLogoUrl === 'string') {
    payload.headerLogoUrl = data.headerLogoUrl
      ? await persistSiteImage(data.headerLogoUrl, 'wordmark')
      : '';
  }
  if (typeof data.headerLogoStyle === 'string') {
    payload.headerLogoStyle = serializeHeaderLogoStyle(
      normalizeHeaderLogoStyle(data.headerLogoStyle)
    );
  }
  if (typeof data.backgroundUrl === 'string') {
    payload.backgroundUrl = data.backgroundUrl
      ? await persistSiteImage(data.backgroundUrl, 'bg')
      : '';
  }
  if (typeof data.homeHeroImage === 'string') {
    payload.homeHeroImage = data.homeHeroImage
      ? await persistSiteImage(data.homeHeroImage, 'hero')
      : '';
  }
  if (typeof data.landingHeroImage === 'string') {
    payload.landingHeroImage = data.landingHeroImage
      ? await persistSiteImage(data.landingHeroImage, 'hero')
      : '';
  }
  if (typeof data.landingHeroSlides === 'string') {
    const slides = normalizeLandingSlides(data.landingHeroSlides);
    const persisted = [];
    for (const slide of slides.slice(0, 8)) {
      persisted.push({
        ...slide,
        src: await persistSiteImage(slide.src, 'hero'),
      });
    }
    payload.landingHeroSlides = JSON.stringify(persisted);
    // Keep legacy single-image field in sync with the first slide.
    if (persisted[0]?.src) payload.landingHeroImage = persisted[0].src;
  }
  if (typeof data.headerTitle === 'string') payload.headerTitle = data.headerTitle;
  if (typeof data.headerSubtitle === 'string') {
    payload.headerSubtitle = data.headerSubtitle;
  }
  if (typeof data.gameDisabledMsg === 'string') {
    payload.gameDisabledMsg = data.gameDisabledMsg;
  }
  if (typeof data.gameDisabled === 'boolean') payload.gameDisabled = data.gameDisabled;
  if (data.gameDisabledUntil === null) {
    payload.gameDisabledUntil = null;
  } else if (typeof data.gameDisabledUntil === 'string') {
    const d = new Date(data.gameDisabledUntil);
    payload.gameDisabledUntil = Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof data.chatEnabled === 'boolean') payload.chatEnabled = data.chatEnabled;
  if (typeof data.hubPagesJson === 'string') {
    payload.hubPagesJson = JSON.stringify(parseHubPages(data.hubPagesJson));
  }
  if (typeof data.hubNavJson === 'string') {
    payload.hubNavJson = JSON.stringify(parseHubNav(data.hubNavJson));
  }
  if (typeof data.hubChromeJson === 'string') {
    payload.hubChromeJson = JSON.stringify(parseHubChrome(data.hubChromeJson));
  }
  if (typeof data.premiumConfigJson === 'string') {
    payload.premiumConfigJson = serializePremiumConfig(
      parsePremiumConfig(data.premiumConfigJson)
    );
  }
  if (typeof data.rankConfigJson === 'string') {
    payload.rankConfigJson = serializeRankConfig(parseRankConfig(data.rankConfigJson));
  }

  let saved;
  try {
    saved = await withPrismaRetry((client) =>
      client.siteSettings.update({
        where: { singletonKey: 'default' },
        // Cast: payload is built field-by-field from known SiteSettings keys.
        data: payload as Parameters<typeof client.siteSettings.update>[0]['data'],
      })
    );
  } catch (err: unknown) {
    // Fallback if a stale client still rejects new fields — raw Mongo update.
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (!msg.includes('Unknown argument') && !msg.includes('Unknown field')) {
      throw err;
    }
    console.warn(
      '[updateSiteSettings] Prisma client rejected fields; applying raw Mongo $set'
    );
    await withPrismaRetry((client) =>
      client.$runCommandRaw({
        update: 'SiteSettings',
        updates: [
          {
            q: { singletonKey: 'default' },
            u: { $set: payload },
          },
        ],
      })
    );
    // Fresh client after raw write so subsequent reads see new fields.
    await resetPrismaClient();
    saved = await getSiteSettings();
  }

  try {
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      actorId: staff.id,
      actorUsername: staff.username,
      action: 'site_settings',
      detail: `Updated: ${Object.keys(payload).join(', ') || 'settings'}`,
    });
  } catch {
    /* non-fatal */
  }

  return saved;
}

/** Strip a solid plate behind the stored site logo (safe to call on hub boot). */
export async function ensureSiteLogoBackgroundStripped() {
  await requireStaff();
  const settings = await getSiteSettings();
  if (!settings.logoUrl) return settings;
  const { stripLogoBackground } = await import('@/lib/strip-logo-background');
  const logoUrl = await stripLogoBackground(settings.logoUrl);
  if (logoUrl === settings.logoUrl) return settings;
  return prisma.siteSettings.update({
    where: { singletonKey: 'default' },
    data: { logoUrl },
  });
}

export async function getGlobalChat(take = 40) {
  return prisma.globalChatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
          isVip: true,
          emailVerified: true,
          equippedFrameConfig: true,
          equippedNicknameConfig: true,
        },
      },
    },
  });
}

export async function sendGlobalChat(body: string) {
  const user = await requireUser();
  if (user.isMuted) throw new Error('You are muted and cannot chat right now');
  const settings = await getSiteSettings();
  if (!settings.chatEnabled) throw new Error('Chat disabled');
  const text = body.trim().slice(0, 300);
  if (!text) throw new Error('Empty');
  const msg = await prisma.globalChatMessage.create({
    data: { userId: user.id, body: text },
  });

  // @friend tags → private message to that friend only (friends only).
  if (text.includes('@')) {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: { select: { id: true, username: true } },
        userB: { select: { id: true, username: true } },
      },
    });
    const friends = friendships.map((f) =>
      f.userAId === user.id ? f.userB : f.userA
    );
    const lower = text.toLowerCase();
    const tagged = friends.filter((f) => {
      const name = f.username.toLowerCase();
      const compact = name.replace(/\s+/g, '');
      return lower.includes(`@${name}`) || (compact.length > 0 && lower.includes(`@${compact}`));
    });
    if (tagged.length > 0) {
      const snippet = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      await Promise.all(
        tagged.map((friend) =>
          prisma.message.create({
            data: {
              senderId: user.id,
              receiverId: friend.id,
              body: `${user.username} tagged you in chat: “${snippet}”`,
            },
          })
        )
      );
    }
  }

  await processWebsiteAction(user.id, 'chat');
  await processWebsiteAction(user.id, 'daily_chat');
  return msg;
}

/** Moderator tool: wipe the hub's live global chat history. */
export async function adminClearGlobalChat() {
  const staff = await requireStaff();
  const result = await prisma.globalChatMessage.deleteMany({});
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'clear_chat',
    detail: `Deleted ${result.count} messages`,
  });
  return { ok: true };
}

export async function getUnreadNotificationCount() {
  const user = await requireUser();
  return prisma.notification.count({
    where: {
      userId: user.id,
      isRead: false,
      NOT: { type: { in: [...BELL_EXCLUDED_TYPES] } },
    },
  });
}

async function staffAwardMessage(
  staffId: string,
  staffName: string,
  userId: string,
  body: string
) {
  if (staffId === userId) return;
  await prisma.message.create({
    data: { senderId: staffId, receiverId: userId, body },
  });
}

export async function adminAwardXp(userId: string, amount: number) {
  const staff = await requireAdmin();
  await grantXp(userId, amount, 'Admin award');
  // Awards land in the mail inbox only (not the bell).
  await staffAwardMessage(
    staff.id,
    staff.username,
    userId,
    `🎁 ${staff.username} awarded you +${amount} XP from the admin panel.`
  );
  const target = await prisma.user.findUnique({ where: { id: userId } });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'award_xp',
    targetUserId: userId,
    targetUsername: target?.username,
    detail: `+${amount} XP`,
  });
  return { ok: true };
}

export async function adminAwardVp(userId: string, amount: number) {
  const staff = await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { vpCurrency: { increment: amount } },
  });
  await staffAwardMessage(
    staff.id,
    staff.username,
    userId,
    `🎁 ${staff.username} awarded you +${amount} VP from the admin panel.`
  );
  const target = await prisma.user.findUnique({ where: { id: userId } });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'award_vp',
    targetUserId: userId,
    targetUsername: target?.username,
    detail: `+${amount} VP`,
  });
  return { ok: true };
}

export async function adminAwardBadge(userId: string, badgeKey: string) {
  const staff = await requireStaff();
  const badge = await prisma.badgeDefinition.findUnique({ where: { key: badgeKey } });
  if (!badge) throw new Error('Badge not found');
  const existing = await prisma.userBadge.findFirst({
    where: { userId, badgeId: badge.id },
  });
  if (existing) return { ok: true, already: true };
  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  await staffAwardMessage(
    staff.id,
    staff.username,
    userId,
    `🏅 ${staff.username} awarded you the badge “${badge.title}”.`
  );
  const target = await prisma.user.findUnique({ where: { id: userId } });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'award_badge',
    targetUserId: userId,
    targetUsername: target?.username,
    detail: badgeKey,
  });
  return { ok: true };
}

export async function adminListMissionTemplates() {
  await requireStaff();
  return prisma.missionTemplate.findMany({ orderBy: { category: 'asc' } });
}

export async function adminUpsertMissionTemplate(input: {
  id?: string;
  key: string;
  title: string;
  description: string;
  rewardXp: number;
  targetCount: number;
  metric: string;
  category: string;
  isActive?: boolean;
  iconImageUrl?: string;
}) {
  await requireStaff();
  if (input.id) {
    return prisma.missionTemplate.update({
      where: { id: input.id },
      data: {
        key: input.key,
        title: input.title,
        description: input.description,
        rewardXp: input.rewardXp,
        targetCount: input.targetCount,
        metric: input.metric,
        category: input.category,
        isActive: input.isActive ?? true,
        iconImageUrl: input.iconImageUrl || null,
      },
    });
  }
  return prisma.missionTemplate.create({
    data: {
      key: input.key,
      title: input.title,
      description: input.description,
      rewardXp: input.rewardXp,
      targetCount: input.targetCount,
      metric: input.metric,
      category: input.category,
      isActive: input.isActive ?? true,
      iconImageUrl: input.iconImageUrl || null,
    },
  });
}

export async function adminListAchievements() {
  await requireStaff();
  return prisma.achievementDefinition.findMany({ orderBy: { category: 'asc' } });
}

export async function adminUpsertAchievement(input: {
  id?: string;
  key: string;
  title: string;
  description: string;
  category: string;
  metric: string;
  targetCount: number;
  xpReward: number;
  icon?: string;
  iconImageUrl?: string;
  isActive?: boolean;
}) {
  await requireStaff();
  if (input.id) {
    const { id, ...data } = input;
    return prisma.achievementDefinition.update({
      where: { id },
      data: { ...data, isActive: input.isActive ?? true, iconImageUrl: input.iconImageUrl || null },
    });
  }
  return prisma.achievementDefinition.create({
    data: {
      key: input.key,
      title: input.title,
      description: input.description,
      category: input.category,
      metric: input.metric,
      targetCount: input.targetCount,
      xpReward: input.xpReward,
      icon: input.icon ?? 'trophy',
      iconImageUrl: input.iconImageUrl || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function adminListBadges() {
  await requireStaff();
  return prisma.badgeDefinition.findMany();
}

export async function adminUpsertBadge(input: {
  id?: string;
  key: string;
  title: string;
  description: string;
  rarity: string;
  icon?: string;
  iconImageUrl?: string;
  metric: string;
  targetCount: number;
  isActive?: boolean;
}) {
  await requireStaff();
  if (input.id) {
    const { id, ...data } = input;
    return prisma.badgeDefinition.update({
      where: { id },
      data: { ...data, isActive: input.isActive ?? true, iconImageUrl: input.iconImageUrl || null },
    });
  }
  return prisma.badgeDefinition.create({
    data: {
      key: input.key,
      title: input.title,
      description: input.description,
      rarity: input.rarity,
      icon: input.icon ?? 'award',
      iconImageUrl: input.iconImageUrl || null,
      metric: input.metric,
      targetCount: input.targetCount,
      isActive: input.isActive ?? true,
    },
  });
}

/**
 * One-tap seed from Admin (no local npm needed).
 * Upserts missions, achievements, badges, shop items, and site settings.
 */
export async function adminSeedProgression() {
  await requireStaff();
  const {
    missionTemplates,
    achievements,
    badges,
    shopItems,
  } = await import('@/lib/progression-seed-data');

  for (const m of missionTemplates) {
    await prisma.missionTemplate.upsert({
      where: { key: m.key },
      update: m,
      create: m,
    });
  }
  for (const a of achievements) {
    await prisma.achievementDefinition.upsert({
      where: { key: a.key },
      update: a,
      create: a,
    });
  }
  for (const b of badges) {
    await prisma.badgeDefinition.upsert({
      where: { key: b.key },
      update: b,
      create: b,
    });
  }
  for (const item of shopItems) {
    await prisma.storeItem.upsert({
      where: { itemSku: item.itemSku },
      update: {
        itemName: item.itemName,
        itemCategory: item.itemCategory,
        vpPrice: item.vpPrice,
        imageUrl: item.imageUrl,
        isAvailable: true,
      },
      create: item,
    });
  }
  await getSiteSettings();

  return {
    ok: true as const,
    missions: missionTemplates.length,
    achievements: achievements.length,
    badges: badges.length,
    shopItems: shopItems.length,
  };
}
