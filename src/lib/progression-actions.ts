'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getLevelFromXp, getLevelProgress, getRankForLevel } from '@/lib/progression';
import { canAccessAdmin } from '@/lib/roles';

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

async function notify(
  userId: string,
  title: string,
  body: string,
  type: string
) {
  await prisma.notification.create({
    data: { userId, title, body, type },
  });
}

/** Grant XP, update rank, notify on level-up. */
export async function grantXp(userId: string, amount: number, reason?: string) {
  if (amount <= 0) return null;
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
  const rank = getRankForLevel(nextLevel);
  if (rank !== updated.currentRank) {
    await prisma.user.update({
      where: { id: userId },
      data: { currentRank: rank },
    });
  }

  if (nextLevel > prevLevel) {
    await notify(
      userId,
      `Level up! Level ${nextLevel}`,
      reason
        ? `You reached level ${nextLevel}. (${reason})`
        : `You reached level ${nextLevel}. Keep climbing!`,
      'level_up'
    );
  }

  return { xpProgress: updated.xpProgress, level: nextLevel, prevLevel };
}

/** Assign active missions from templates the player doesn't already have. */
export async function ensurePlayerMissions(userId: string) {
  const templates = await prisma.missionTemplate.findMany({
    where: { isActive: true },
  });
  const existing = await prisma.activeMission.findMany({
    where: { userId },
    select: { templateKey: true },
  });
  const have = new Set(existing.map((e) => e.templateKey).filter(Boolean));

  for (const t of templates) {
    if (have.has(t.key)) continue;
    await prisma.activeMission.create({
      data: {
        userId,
        templateKey: t.key,
        title: t.title,
        description: t.description,
        rewardXp: t.rewardXp,
        targetCount: t.targetCount,
        metric: t.metric,
        currentCount: 0,
        isCompleted: false,
        iconImageUrl: t.iconImageUrl,
      },
    });
  }
}

/** Increment missions matching a metric; complete + reward when target hit. */
export async function progressMissions(
  userId: string,
  metric: string,
  amount = 1
) {
  const missions = await prisma.activeMission.findMany({
    where: { userId, metric, isCompleted: false },
  });

  for (const m of missions) {
    const next = Math.min(m.targetCount, m.currentCount + amount);
    const completed = next >= m.targetCount;
    await prisma.activeMission.update({
      where: { id: m.id },
      data: { currentCount: next, isCompleted: completed },
    });
    if (completed && !m.isCompleted) {
      await grantXp(userId, m.rewardXp, `Mission: ${m.title}`);
      await notify(
        userId,
        'Mission complete',
        `${m.title} — +${m.rewardXp} XP`,
        'mission'
      );
      await tryUnlockAchievement(userId, 'missions_completed', 1);
      await tryUnlockBadge(userId, 'missions_completed', 1);
    }
  }
}

async function metricCount(userId: string, metric: string): Promise<number> {
  switch (metric) {
    case 'runs':
      return prisma.matchResult.count({ where: { userId } });
    case 'wins':
      return prisma.matchResult.count({
        where: { userId, outcome: { in: ['win', 'survived'] } },
      });
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
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last = user.lastLoginAt
    ? new Date(
        user.lastLoginAt.getFullYear(),
        user.lastLoginAt.getMonth(),
        user.lastLoginAt.getDate()
      )
    : null;

  if (last && last.getTime() === today.getTime()) {
    return; // already counted today
  }

  const oneDayMs = 24 * 60 * 60 * 1000;
  const isConsecutive = last && today.getTime() - last.getTime() <= oneDayMs;
  const nextStreak = isConsecutive ? user.loginStreak + 1 : 1;

  await prisma.user.update({
    where: { id: userId },
    data: { loginStreak: nextStreak, lastLoginAt: now },
  });

  await tryUnlockAchievement(userId, 'daily_login_streak');
  await tryUnlockBadge(userId, 'daily_login_streak');
}

export async function tryUnlockAchievement(
  userId: string,
  metric: string,
  _delta = 1
) {
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
  outcome: string;
  role?: 'trapper' | 'runner';
  score?: number;
  distance?: number;
}) {
  await ensurePlayerMissions(input.userId);
  await progressMissions(input.userId, 'runs', 1);
  if (input.outcome === 'win' || input.outcome === 'survived') {
    await progressMissions(input.userId, 'wins', 1);
  }
  if (input.role === 'trapper' && input.outcome === 'win') {
    await progressMissions(input.userId, 'trapper_wins', 1);
  }
  if (input.role === 'runner' && input.outcome === 'survived') {
    await progressMissions(input.userId, 'runner_survives', 1);
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
      await prisma.activeMission.update({
        where: { id: m.id },
        data: { currentCount: next, isCompleted: completed },
      });
      if (completed && !m.isCompleted) {
        await grantXp(input.userId, m.rewardXp, `Mission: ${m.title}`);
        await notify(
          input.userId,
          'Mission complete',
          `${m.title} — +${m.rewardXp} XP`,
          'mission'
        );
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
  await tryUnlockBadge(input.userId, 'runs');
  await tryUnlockBadge(input.userId, 'wins');
  await tryUnlockBadge(input.userId, 'level');
  await tryUnlockBadge(input.userId, 'trapper_wins');
  await tryUnlockBadge(input.userId, 'runner_survives');
}

export async function processWebsiteAction(
  userId: string,
  metric:
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
) {
  await ensurePlayerMissions(userId);
  // For threshold-style metrics (email/vip/friends count), sync from DB totals
  // by setting mission progress to metricCount rather than blindly +1.
  if (metric === 'email' || metric === 'vip' || metric === 'friends') {
    const count = await metricCount(userId, metric);
    const missions = await prisma.activeMission.findMany({
      where: { userId, metric, isCompleted: false },
    });
    for (const m of missions) {
      const next = Math.min(m.targetCount, count);
      const completed = next >= m.targetCount;
      await prisma.activeMission.update({
        where: { id: m.id },
        data: { currentCount: next, isCompleted: completed },
      });
      if (completed && !m.isCompleted) {
        await grantXp(userId, m.rewardXp, `Mission: ${m.title}`);
        await notify(
          userId,
          'Mission complete',
          `${m.title} — +${m.rewardXp} XP`,
          'mission'
        );
      }
    }
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

/** Called when hub loads: missions + login progression + live unlocks. */
export async function bootstrapHubProgression() {
  const user = await requireUser();
  await ensurePlayerMissions(user.id);
  await processWebsiteAction(user.id, 'logins');
  await updateLoginStreak(user.id);
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
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await requireUser();
  if (!user) throw new Error('User not found');
  const unread = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
  const progress = getLevelProgress(user.xpProgress);
  return {
    id: user.id,
    xpProgress: user.xpProgress,
    vpCurrency: user.vpCurrency,
    currentRank: user.currentRank,
    role: user.role,
    isVip: user.isVip,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    username: user.username,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelProgressPercent: progress.percent,
    unreadNotifications: unread,
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
  return settings;
}

export async function updateSiteSettings(data: {
  logoUrl?: string;
  backgroundUrl?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  landingHeroImage?: string;
  gameDisabled?: boolean;
  gameDisabledMsg?: string;
  chatEnabled?: boolean;
}) {
  await requireStaff();
  await getSiteSettings();
  return prisma.siteSettings.update({
    where: { singletonKey: 'default' },
    data,
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
  await processWebsiteAction(user.id, 'chat');
  return msg;
}

/** Moderator tool: wipe the hub's live global chat history. */
export async function adminClearGlobalChat() {
  await requireStaff();
  await prisma.globalChatMessage.deleteMany({});
  return { ok: true };
}

export async function getUnreadNotificationCount() {
  const user = await requireUser();
  return prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
}

export async function adminAwardXp(userId: string, amount: number) {
  await requireStaff();
  await grantXp(userId, amount, 'Admin award');
  await notify(userId, 'Admin award', `Staff granted you +${amount} XP.`, 'admin');
  return { ok: true };
}

export async function adminAwardVp(userId: string, amount: number) {
  await requireStaff();
  await prisma.user.update({
    where: { id: userId },
    data: { vpCurrency: { increment: amount } },
  });
  await notify(userId, 'Admin award', `Staff granted you +${amount} VP.`, 'admin');
  return { ok: true };
}

export async function adminAwardBadge(userId: string, badgeKey: string) {
  await requireStaff();
  const badge = await prisma.badgeDefinition.findUnique({ where: { key: badgeKey } });
  if (!badge) throw new Error('Badge not found');
  const existing = await prisma.userBadge.findFirst({
    where: { userId, badgeId: badge.id },
  });
  if (existing) return { ok: true, already: true };
  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  await notify(userId, 'Badge awarded', `Staff awarded you: ${badge.title}`, 'badge');
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
