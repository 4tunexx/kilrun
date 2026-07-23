'use server';

import { prisma } from '@/lib/prisma';
import {
  parseAnnouncementCarouselConfig,
  serializeAnnouncementCarouselConfig,
  type AnnouncementCarouselConfig,
  type AnnouncementType,
} from '@/lib/announcement-carousel-config';
import { auth } from '@/auth';
import { isAdminRole } from '@/lib/roles';

export type AnnouncementItem = {
  id: string;
  type: AnnouncementType;
  label: string;
  /** Optional user attached to the event. */
  user?: {
    id: string;
    username: string;
    avatarUrl: string;
    role: string;
    isVip: boolean;
    equippedNicknameConfig: unknown | null;
  } | null;
  /** Short text describing the event. */
  detail: string;
  createdAt: string;
};

/** Max items fetched per type to avoid overloading the carousel. */
const PER_TYPE_LIMIT = 5;

export async function getAnnouncementCarouselItems(): Promise<{
  config: AnnouncementCarouselConfig;
  items: AnnouncementItem[];
}> {
  // Load config from SiteSettings
  let raw: Record<string, unknown> = {};
  try {
    const settings = (await prisma.$runCommandRaw({
      find: 'SiteSettings',
      filter: { singletonKey: 'default' },
      limit: 1,
    })) as { cursor?: { firstBatch?: Array<Record<string, unknown>> } };
    raw = settings?.cursor?.firstBatch?.[0] ?? {};
  } catch {
    /* ignore */
  }

  const config = parseAnnouncementCarouselConfig(
    typeof raw.announcementCarouselJson === 'string' ? raw.announcementCarouselJson : '{}'
  );

  if (!config.enabled || config.types.length === 0) {
    return { config, items: [] };
  }

  const items: AnnouncementItem[] = [];

  const userSelect = {
    id: true,
    username: true,
    avatarUrl: true,
    role: true,
    isVip: true,
    equippedNicknameConfig: true,
  };

  const now = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // last 7 days

  await Promise.all(
    config.types.map(async (type) => {
      try {
        switch (type) {
          case 'firesale': {
            const firesaleItems = await prisma.storeItem.findMany({
              where: {
                fireSalePercent: { gt: 0 },
                isAvailable: true,
                OR: [
                  { fireSaleEndsAt: null },
                  { fireSaleEndsAt: { gt: now } },
                ],
              },
              take: PER_TYPE_LIMIT,
              orderBy: { fireSalePercent: 'desc' },
            });
            for (const item of firesaleItems) {
              items.push({
                id: `firesale-${item.id}`,
                type: 'firesale',
                label: 'Fire Sale',
                user: null,
                detail: `${item.itemName} is −${item.fireSalePercent}% off!`,
                createdAt: item.createdAt.toISOString(),
              });
            }
            break;
          }

          case 'user_earn_vp': {
            const results = await prisma.matchResult.findMany({
              where: { vpEarned: { gt: 0 }, playedAt: { gt: cutoff } },
              orderBy: [{ vpEarned: 'desc' }, { playedAt: 'desc' }],
              take: PER_TYPE_LIMIT,
              include: { user: { select: userSelect } },
            });
            for (const r of results) {
              items.push({
                id: `earn_vp-${r.id}`,
                type: 'user_earn_vp',
                label: 'VP Earned',
                user: r.user,
                detail: `earned ${r.vpEarned} VP in ${r.mode}`,
                createdAt: r.playedAt.toISOString(),
              });
            }
            break;
          }

          case 'user_won_match': {
            const results = await prisma.matchResult.findMany({
              where: { outcome: 'win', playedAt: { gt: cutoff } },
              orderBy: { playedAt: 'desc' },
              take: PER_TYPE_LIMIT,
              include: { user: { select: userSelect } },
            });
            for (const r of results) {
              items.push({
                id: `won_match-${r.id}`,
                type: 'user_won_match',
                label: 'Won Match',
                user: r.user,
                detail: `won a ${r.mode} match`,
                createdAt: r.playedAt.toISOString(),
              });
            }
            break;
          }

          case 'user_registered': {
            const users = await prisma.user.findMany({
              where: { createdAt: { gt: cutoff } },
              orderBy: { createdAt: 'desc' },
              take: PER_TYPE_LIMIT,
              select: { ...userSelect, createdAt: true },
            });
            for (const u of users) {
              items.push({
                id: `registered-${u.id}`,
                type: 'user_registered',
                label: 'New Member',
                user: u,
                detail: 'just joined Kilrun!',
                createdAt: u.createdAt.toISOString(),
              });
            }
            break;
          }

          case 'user_is_premium': {
            const purchases = await prisma.purchase.findMany({
              where: {
                itemSku: { startsWith: 'premium' },
                createdAt: { gt: cutoff },
              },
              orderBy: { createdAt: 'desc' },
              take: PER_TYPE_LIMIT,
              include: { user: { select: userSelect } },
            });
            for (const p of purchases) {
              items.push({
                id: `premium-${p.id}`,
                type: 'user_is_premium',
                label: 'Premium',
                user: p.user,
                detail: 'unlocked Kilrun Premium',
                createdAt: p.createdAt.toISOString(),
              });
            }
            break;
          }

          case 'user_got_vip': {
            const users = await prisma.user.findMany({
              where: { isVip: true, createdAt: { gt: cutoff } },
              orderBy: { createdAt: 'desc' },
              take: PER_TYPE_LIMIT,
              select: { ...userSelect, createdAt: true },
            });
            for (const u of users) {
              items.push({
                id: `vip-${u.id}`,
                type: 'user_got_vip',
                label: 'VIP',
                user: u,
                detail: 'became a VIP member',
                createdAt: u.createdAt.toISOString(),
              });
            }
            break;
          }

          case 'user_got_badge': {
            const userBadges = await prisma.userBadge.findMany({
              where: { earnedAt: { gt: cutoff } },
              orderBy: { earnedAt: 'desc' },
              take: PER_TYPE_LIMIT,
              include: {
                user: { select: userSelect },
                badge: { select: { title: true } },
              },
            });
            for (const ub of userBadges) {
              items.push({
                id: `badge-${ub.id}`,
                type: 'user_got_badge',
                label: 'Badge',
                user: ub.user,
                detail: `earned the "${ub.badge.title}" badge`,
                createdAt: ub.earnedAt.toISOString(),
              });
            }
            break;
          }

          case 'user_earn_achievement': {
            const userAchievements = await prisma.userAchievement.findMany({
              where: { unlockedAt: { gt: cutoff } },
              orderBy: { unlockedAt: 'desc' },
              take: PER_TYPE_LIMIT,
              include: {
                user: { select: userSelect },
                achievement: { select: { title: true } },
              },
            });
            for (const ua of userAchievements) {
              items.push({
                id: `achievement-${ua.id}`,
                type: 'user_earn_achievement',
                label: 'Achievement',
                user: ua.user,
                detail: `unlocked "${ua.achievement.title}"`,
                createdAt: ua.unlockedAt.toISOString(),
              });
            }
            break;
          }

          case 'news': {
            const posts = await prisma.newsPost.findMany({
              where: { published: true },
              orderBy: { createdAt: 'desc' },
              take: PER_TYPE_LIMIT,
              select: { id: true, title: true, summary: true, createdAt: true },
            });
            for (const post of posts) {
              items.push({
                id: `news-${post.id}`,
                type: 'news',
                label: 'News',
                user: null,
                detail: post.title,
                createdAt: post.createdAt.toISOString(),
              });
            }
            break;
          }
        }
      } catch {
        /* per-type failures are non-fatal */
      }
    })
  );

  // Shuffle so types are interleaved
  items.sort(() => Math.random() - 0.5);

  return { config, items };
}

export async function updateAnnouncementCarouselConfig(
  cfg: AnnouncementCarouselConfig
): Promise<void> {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || !isAdminRole(user.role)) throw new Error('Forbidden');

  const json = serializeAnnouncementCarouselConfig(cfg);

  try {
    await prisma.siteSettings.update({
      where: { singletonKey: 'default' },
      data: { announcementCarouselJson: json } as Parameters<
        typeof prisma.siteSettings.update
      >[0]['data'],
    });
  } catch {
    // Raw fallback for stale Prisma client
    await prisma.$runCommandRaw({
      update: 'SiteSettings',
      updates: [
        {
          q: { singletonKey: 'default' },
          u: { $set: { announcementCarouselJson: json } },
        },
      ],
    });
  }
}
