'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

export type ServiceStatus = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /** When true, admin can toggle from the dashboard. */
  toggleable?: boolean;
  toggledOn?: boolean;
};

export type AdminDashboardOverview = {
  stats: {
    players: number;
    banned: number;
    muted: number;
    vip: number;
    emailVerified: number;
    newPlayers7d: number;
    openTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
    forumPosts: number;
    forumReplies: number;
    purchases: number;
    vpSpent: number;
    matches: number;
    matchesToday: number;
    chatMessages: number;
    missions: number;
    achievements: number;
    badges: number;
    storeItems: number;
    newsPosts: number;
    guides: number;
    inventoryItems: number;
    auditLast24h: number;
    friendships: number;
  };
  services: ServiceStatus[];
  recentAudit: Array<{
    id: string;
    action: string;
    actorUsername: string;
    targetUsername: string | null;
    detail: string;
    createdAt: Date;
  }>;
  recentTickets: Array<{
    id: string;
    subject: string;
    status: string;
    username: string;
    createdAt: Date;
  }>;
  site: {
    gameDisabled: boolean;
    gameDisabledMsg: string;
    chatEnabled: boolean;
    headerTitle: string;
  };
};

export async function adminGetDashboardOverview(): Promise<AdminDashboardOverview> {
  await requireStaff();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [
    players,
    banned,
    muted,
    vip,
    emailVerified,
    newPlayers7d,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    forumPosts,
    forumReplies,
    purchases,
    purchaseAgg,
    matches,
    matchesToday,
    chatMessages,
    missions,
    achievements,
    badges,
    storeItems,
    newsPosts,
    guides,
    inventoryItems,
    auditLast24h,
    friendships,
    recentAudit,
    recentTickets,
    settings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.user.count({ where: { isMuted: true } }),
    prisma.user.count({ where: { isVip: true } }),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.supportTicket.count({ where: { status: 'open' } }),
    prisma.supportTicket.count({ where: { status: 'in_progress' } }),
    prisma.supportTicket.count({ where: { status: 'resolved' } }),
    prisma.forumPost.count(),
    prisma.forumReply.count(),
    prisma.purchase.count(),
    prisma.purchase.aggregate({ _sum: { vpSpent: true } }),
    prisma.matchResult.count(),
    prisma.matchResult.count({ where: { playedAt: { gte: startOfToday } } }),
    prisma.globalChatMessage.count(),
    prisma.missionTemplate.count(),
    prisma.achievementDefinition.count(),
    prisma.badgeDefinition.count(),
    prisma.storeItem.count(),
    prisma.newsPost.count(),
    prisma.guide.count(),
    prisma.inventoryItem.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.friendship.count({ where: { status: 'accepted' } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { username: true } } },
    }),
    prisma.siteSettings.findUnique({ where: { singletonKey: 'default' } }),
  ]);

  // Mongo ping
  let mongoOk = true;
  let mongoDetail = 'Connected';
  try {
    await prisma.$runCommandRaw({ ping: 1 });
  } catch {
    mongoOk = false;
    mongoDetail = 'Ping failed';
  }

  const gameServerUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';
  const clerkOk = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  );
  const blobOk = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const authOk = Boolean(process.env.AUTH_SECRET && process.env.STEAM_API_KEY);

  const gameDisabled = Boolean(settings?.gameDisabled);
  const chatEnabled = settings?.chatEnabled !== false;

  const services: ServiceStatus[] = [
    {
      id: 'mongodb',
      label: 'MongoDB',
      ok: mongoOk,
      detail: mongoDetail,
    },
    {
      id: 'auth',
      label: 'Steam / Auth',
      ok: authOk,
      detail: authOk ? 'Keys configured' : 'Missing AUTH_SECRET or STEAM_API_KEY',
    },
    {
      id: 'clerk',
      label: 'Clerk (email OTP)',
      ok: clerkOk,
      detail: clerkOk ? 'Keys configured' : 'Missing Clerk keys',
    },
    {
      id: 'blob',
      label: 'Vercel Blob',
      ok: blobOk,
      detail: blobOk ? 'Upload token set' : 'Not set — using fallback storage',
    },
    {
      id: 'game_server',
      label: 'Game server',
      ok: Boolean(gameServerUrl),
      detail: gameServerUrl || 'NEXT_PUBLIC_GAME_SERVER_URL unset',
    },
    {
      id: 'chat',
      label: 'Live chat',
      ok: chatEnabled,
      detail: chatEnabled ? 'Enabled for players' : 'Disabled',
      toggleable: true,
      toggledOn: chatEnabled,
    },
    {
      id: 'game',
      label: 'Deathrun play',
      ok: !gameDisabled,
      detail: gameDisabled
        ? settings?.gameDisabledMsg || 'Maintenance mode'
        : 'Open for players',
      toggleable: true,
      toggledOn: !gameDisabled,
    },
  ];

  return {
    stats: {
      players,
      banned,
      muted,
      vip,
      emailVerified,
      newPlayers7d,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      forumPosts,
      forumReplies,
      purchases,
      vpSpent: purchaseAgg._sum.vpSpent ?? 0,
      matches,
      matchesToday,
      chatMessages,
      missions,
      achievements,
      badges,
      storeItems,
      newsPosts,
      guides,
      inventoryItems,
      auditLast24h,
      friendships,
    },
    services,
    recentAudit: recentAudit.map((l) => ({
      id: l.id,
      action: l.action,
      actorUsername: l.actorUsername,
      targetUsername: l.targetUsername,
      detail: l.detail,
      createdAt: l.createdAt,
    })),
    recentTickets: recentTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      username: t.user.username,
      createdAt: t.createdAt,
    })),
    site: {
      gameDisabled,
      gameDisabledMsg: settings?.gameDisabledMsg ?? '',
      chatEnabled,
      headerTitle: settings?.headerTitle ?? 'Kilrun',
    },
  };
}

/** Quick dashboard toggles for chat / game maintenance. */
export async function adminToggleService(
  service: 'chat' | 'game',
  enabled: boolean
) {
  await requireStaff();
  if (service === 'chat') {
    await prisma.siteSettings.update({
      where: { singletonKey: 'default' },
      data: { chatEnabled: enabled },
    });
  } else {
    await prisma.siteSettings.update({
      where: { singletonKey: 'default' },
      data: { gameDisabled: !enabled },
    });
  }
  return { ok: true as const };
}

/**
 * Ask the Colyseus game server to exit so its host restarts it.
 * Requires GAME_SERVER_ADMIN_SECRET on both Next.js and the game server,
 * plus NEXT_PUBLIC_GAME_SERVER_URL (ws/wss → http/https).
 */
export async function adminRestartColyseus(): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
}> {
  const actor = await requireStaff();
  if (actor.role !== 'admin') {
    throw new Error('Admin only');
  }

  const secret = process.env.GAME_SERVER_ADMIN_SECRET || '';
  if (!secret) {
    return {
      ok: false,
      error: 'GAME_SERVER_ADMIN_SECRET is not set on the web app',
    };
  }

  const wsUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || '';
  if (!wsUrl) {
    return {
      ok: false,
      error: 'NEXT_PUBLIC_GAME_SERVER_URL is not set',
    };
  }

  let httpUrl: string;
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = '/admin/restart';
    u.search = '';
    u.hash = '';
    httpUrl = u.toString();
  } catch {
    return { ok: false, error: 'Invalid NEXT_PUBLIC_GAME_SERVER_URL' };
  }

  try {
    const res = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret,
      },
      body: JSON.stringify({ secret }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      restarting?: boolean;
    };
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        error: body.error || `Game server returned ${res.status}`,
      };
    }

    try {
      await prisma.auditLog.create({
        data: {
          action: 'colyseus_restart',
          actorId: actor.id,
          actorUsername: actor.username,
          detail: `Restart requested via ${httpUrl}`,
        },
      });
    } catch {
      // Audit is best-effort
    }

    return {
      ok: true,
      detail: 'Restart signal sent — Colyseus should come back in a few seconds',
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to reach game server',
    };
  }
}
