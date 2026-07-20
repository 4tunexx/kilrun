'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import type { BannerConfig } from '@/lib/banner';
import { INVENTORY_RESELL_RATE } from '@/lib/inventory-constants';
import {
  canAccessAdmin,
  steamIdsPromotedToAdmin,
  VIP_UNLOCK_VP_COST,
  type AccountRole,
  isAccountRole,
} from '@/lib/roles';
import { processWebsiteAction } from '@/lib/progression-actions';
import { normalizeForumCategory } from '@/lib/forum-categories';
import {
  PUBLIC_USER_CARD_SELECT,
  PUBLIC_USER_COSMETIC_SELECT,
  isSkinCosmeticSlot,
} from '@/lib/cosmetics';
import { flattenEquippedSkinsMap } from '@/lib/player-skins';
import type { SkinAttachment } from '@/lib/player-skins';

async function requireSessionUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Account banned');
  return user;
}

async function requireStaff() {
  const user = await requireSessionUser();
  if (!canAccessAdmin(user.role)) throw new Error('Forbidden');
  return user;
}

export async function getCurrentUserProfile() {
  return requireSessionUser();
}

export async function updateProfileBio(bio: string) {
  const user = await requireSessionUser();
  return prisma.user.update({
    where: { id: user.id },
    data: { bio: bio.slice(0, 500) },
  });
}

export async function updateProfileSettings(input: {
  bio?: string;
  countryCode?: string;
  statusMessage?: string;
  notifyPush?: boolean;
  notifyEmail?: boolean;
}) {
  const user = await requireSessionUser();
  const data: {
    bio?: string;
    countryCode?: string;
    statusMessage?: string;
    notifyPush?: boolean;
    notifyEmail?: boolean;
  } = {};

  if (typeof input.bio === 'string') {
    data.bio = input.bio.slice(0, 500);
  }
  if (typeof input.statusMessage === 'string') {
    data.statusMessage = input.statusMessage.slice(0, 80);
  }
  if (typeof input.countryCode === 'string') {
    const code = input.countryCode.trim().toLowerCase();
    data.countryCode = code === '' || /^[a-z]{2}$/.test(code) ? code : user.countryCode;
  }
  if (typeof input.notifyPush === 'boolean') data.notifyPush = input.notifyPush;
  if (typeof input.notifyEmail === 'boolean') data.notifyEmail = input.notifyEmail;

  return prisma.user.update({
    where: { id: user.id },
    data,
  });
}

/**
 * Admin-only: clear email verification on the current account so the same
 * address (e.g. testing Gmail) can be verified again. Best-effort deletes the
 * linked Clerk user so signUp.create() does not hit "email already exists".
 */
export async function deactivateOwnEmail() {
  const user = await requireSessionUser();
  if (user.role !== 'admin') {
    throw new Error('Only admins can deactivate email');
  }

  const previousEmail = user.email;
  const previousClerkId = user.clerkId;

  if (previousClerkId && process.env.CLERK_SECRET_KEY) {
    try {
      const { createClerkClient } = await import('@clerk/backend');
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      await clerk.users.deleteUser(previousClerkId);
    } catch (err) {
      console.warn('[deactivateOwnEmail] Clerk user delete failed (continuing):', err);
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: null,
      emailVerified: false,
      clerkId: null,
    },
  });

  try {
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      actorId: user.id,
      actorUsername: user.username,
      action: 'deactivate_email',
      targetUserId: user.id,
      targetUsername: user.username,
      detail: previousEmail ? `Cleared ${previousEmail}` : 'Cleared email verification',
    });
  } catch {
    // audit is best-effort
  }

  return updated;
}

/** Purchase history + forum posts + lifetime totals for the profile page. */
export async function getMyProfileActivity() {
  const user = await requireSessionUser();
  const [purchases, forumPosts, purchaseAgg, forumPostCount] = await Promise.all([
    prisma.purchase.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.forumPost.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        title: true,
        category: true,
        createdAt: true,
      },
    }),
    prisma.purchase.aggregate({
      where: { userId: user.id },
      _sum: { vpSpent: true },
      _count: true,
    }),
    prisma.forumPost.count({ where: { authorId: user.id } }),
  ]);

  return {
    purchases,
    forumPosts,
    totals: {
      totalXp: user.xpProgress,
      totalVp: user.vpCurrency,
      purchaseCount: purchaseAgg._count,
      vpSpent: purchaseAgg._sum.vpSpent ?? 0,
      forumPostCount,
    },
  };
}

/** Grant / equip VIP cosmetic perks (frame + banner + nickname). */
async function grantVipCosmetics(userId: string) {
  const vipFrame = {
    itemSku: 'vip-crown-frame',
    itemName: 'VIP Crown Frame',
    itemCategory: 'Avatar Frame',
    cosmeticSlot: 'frame',
    cosmeticConfig: {
      style: 'flame',
      color: '#f59e0b',
      secondaryColor: '#ea580c',
      thickness: 4,
      glow: true,
      animated: true,
    },
    vpValue: 0,
  };
  const vipBanner = {
    itemSku: 'vip-banner',
    itemName: 'VIP Banner',
    itemCategory: 'Profile Banner',
    cosmeticSlot: 'banner',
    bannerConfig: {
      colors: ['#78350f', '#f59e0b', '#ea580c'],
      angle: 135,
      animationStyle: 'shimmer',
      animated: true,
    },
    vpValue: 0,
  };
  const vipNick = {
    itemSku: 'vip-nickname',
    itemName: 'VIP Nickname',
    itemCategory: 'Nickname Effect',
    cosmeticSlot: 'nickname',
    cosmeticConfig: {
      effect: 'shimmer',
      color: '#f59e0b',
      intensity: 0.9,
    },
    vpValue: 0,
  };

  for (const item of [vipFrame, vipBanner, vipNick]) {
    const owned = await prisma.inventoryItem.findFirst({
      where: { userId, itemSku: item.itemSku },
    });
    if (!owned) {
      await prisma.inventoryItem.create({
        data: {
          userId,
          itemSku: item.itemSku,
          itemName: item.itemName,
          itemCategory: item.itemCategory,
          cosmeticSlot: item.cosmeticSlot,
          bannerConfig:
            'bannerConfig' in item
              ? (item.bannerConfig as unknown as Prisma.InputJsonValue)
              : undefined,
          cosmeticConfig:
            'cosmeticConfig' in item
              ? (item.cosmeticConfig as unknown as Prisma.InputJsonValue)
              : undefined,
          vpValue: item.vpValue,
        },
      });
    }
  }

  const frame = await prisma.inventoryItem.findFirst({
    where: { userId, itemSku: 'vip-crown-frame' },
  });
  const banner = await prisma.inventoryItem.findFirst({
    where: { userId, itemSku: 'vip-banner' },
  });
  const nick = await prisma.inventoryItem.findFirst({
    where: { userId, itemSku: 'vip-nickname' },
  });

  if (frame) {
    await prisma.inventoryItem.updateMany({
      where: { userId, cosmeticSlot: 'frame', isEquipped: true },
      data: { isEquipped: false },
    });
    await prisma.inventoryItem.update({
      where: { id: frame.id },
      data: { isEquipped: true },
    });
  }
  if (banner) {
    await prisma.inventoryItem.updateMany({
      where: { userId, cosmeticSlot: 'banner', isEquipped: true },
      data: { isEquipped: false },
    });
    await prisma.inventoryItem.update({
      where: { id: banner.id },
      data: { isEquipped: true },
    });
  }
  if (nick) {
    await prisma.inventoryItem.updateMany({
      where: { userId, cosmeticSlot: 'nickname', isEquipped: true },
      data: { isEquipped: false },
    });
    await prisma.inventoryItem.update({
      where: { id: nick.id },
      data: { isEquipped: true },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      equippedFrameItemName: frame?.itemName ?? 'VIP Crown Frame',
      equippedFrameConfig: (frame?.cosmeticConfig ??
        vipFrame.cosmeticConfig) as unknown as Prisma.InputJsonValue,
      equippedBannerItemName: banner?.itemName ?? 'VIP Banner',
      equippedBannerConfig: (banner?.bannerConfig ??
        vipBanner.bannerConfig) as unknown as Prisma.InputJsonValue,
      equippedNicknameItemName: nick?.itemName ?? 'VIP Nickname',
      equippedNicknameConfig: (nick?.cosmeticConfig ??
        vipNick.cosmeticConfig) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function unlockVipWithVp() {
  const user = await requireSessionUser();
  if (user.isVip || user.role === 'vip') {
    return { ok: true as const, already: true };
  }
  if (user.vpCurrency < VIP_UNLOCK_VP_COST) {
    return { ok: false as const, error: 'Not enough VP' };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      vpCurrency: { decrement: VIP_UNLOCK_VP_COST },
      isVip: true,
      role: user.role === 'player' ? 'vip' : user.role,
    },
  });
  try {
    await grantVipCosmetics(user.id);
  } catch {
    // Cosmetics are best-effort — VIP flag already applied.
  }
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'VIP unlocked',
      body: `Welcome to VIP! Orange name color, crown badge, exclusive banner, frame, and nickname effect are yours. More in-game VIP perks coming soon.`,
      type: 'vip',
    },
  });
  await processWebsiteAction(user.id, 'vip');
  return { ok: true as const, already: false };
}

/** Mongo: missing isBanned must still count as not banned (false filter skips unset). */
const NOT_BANNED = { NOT: { isBanned: true } } as const;

export type LeaderboardSort = 'xp' | 'vp' | 'stats';

export type LeaderboardRow = {
  id: string;
  username: string;
  avatarUrl: string;
  xpProgress: number;
  vpCurrency: number;
  currentRank: string;
  isVip: boolean;
  role: string;
  reputation: number;
  wins: number;
  losses: number;
  kills: number;
  kd: number;
  rank: number;
  equippedFrameConfig: unknown | null;
  equippedNicknameConfig: unknown | null;
};

/**
 * Podium (top 3) + paginated rest (10/page starting at #4).
 * sort: xp | vp | stats (wins → kd → kills).
 */
export async function getLeaderboard(opts?: {
  sort?: LeaderboardSort;
  page?: number;
  pageSize?: number;
}) {
  const sort: LeaderboardSort = opts?.sort ?? 'xp';
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.max(1, Math.min(50, opts?.pageSize ?? 10));

  const users = await prisma.user.findMany({
    where: NOT_BANNED,
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      xpProgress: true,
      vpCurrency: true,
      currentRank: true,
      isVip: true,
      role: true,
      reputation: true,
      ...PUBLIC_USER_COSMETIC_SELECT,
    },
  });

  const matchResults = await prisma.matchResult.findMany({
    select: { userId: true, role: true, outcome: true },
  });

  const statsByUser = new Map<
    string,
    { wins: number; losses: number; kills: number }
  >();
  for (const r of matchResults) {
    let s = statsByUser.get(r.userId);
    if (!s) {
      s = { wins: 0, losses: 0, kills: 0 };
      statsByUser.set(r.userId, s);
    }
    if (r.outcome === 'win' || r.outcome === 'survived') s.wins += 1;
    if (r.outcome === 'loss' || r.outcome === 'eliminated') s.losses += 1;
    // Trapper round wins count as eliminations / "kills" proxy
    if (r.role === 'trapper' && r.outcome === 'win') s.kills += 1;
  }

  const rows: LeaderboardRow[] = users.map((u) => {
    const s = statsByUser.get(u.id) ?? { wins: 0, losses: 0, kills: 0 };
    const kd = s.losses > 0 ? Math.round((s.kills / s.losses) * 100) / 100 : s.kills;
    return {
      id: u.id,
      username: u.username || 'Player',
      avatarUrl: u.avatarUrl || '',
      xpProgress: u.xpProgress ?? 0,
      vpCurrency: u.vpCurrency ?? 0,
      currentRank: u.currentRank || 'Unranked',
      isVip: !!u.isVip,
      role: u.role,
      reputation: u.reputation ?? 0,
      wins: s.wins,
      losses: s.losses,
      kills: s.kills,
      kd,
      rank: 0,
      equippedFrameConfig: u.equippedFrameConfig ?? null,
      equippedNicknameConfig: u.equippedNicknameConfig ?? null,
    };
  });

  rows.sort((a, b) => {
    if (sort === 'vp') {
      if (b.vpCurrency !== a.vpCurrency) return b.vpCurrency - a.vpCurrency;
      return b.xpProgress - a.xpProgress;
    }
    if (sort === 'stats') {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.kd !== a.kd) return b.kd - a.kd;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.xpProgress - a.xpProgress;
    }
    if (b.xpProgress !== a.xpProgress) return b.xpProgress - a.xpProgress;
    return b.vpCurrency - a.vpCurrency;
  });

  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const total = rows.length;
  const podium = rows.slice(0, 3);
  // Rest list: page 1 = ranks 4–13, page 2 = 14–23, ...
  const restStart = 3 + (page - 1) * pageSize;
  const rest = rows.slice(restStart, restStart + pageSize);
  const restTotal = Math.max(0, total - 3);
  const totalPages = Math.max(1, Math.ceil(restTotal / pageSize));

  return {
    sort,
    page,
    pageSize,
    total,
    totalPages,
    podium,
    rest,
  };
}

/** Public profile snippet for messaging / profile deep-links. */
export async function getUserBrief(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, ...NOT_BANNED },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      currentRank: true,
      xpProgress: true,
      isVip: true,
      role: true,
      ...PUBLIC_USER_COSMETIC_SELECT,
    },
  });
}

/** Presence window: hub polls every 30s — treat as online if seen within 2 minutes. */
const ONLINE_MS = 2 * 60 * 1000;

function withPresence<T extends { lastSeenAt?: Date | null }>(row: T) {
  const lastSeenAt = row.lastSeenAt ?? null;
  const isOnline = !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_MS;
  return { ...row, lastSeenAt, isOnline };
}

export async function getFriends() {
  const user = await requireSessionUser();
  const rows = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
      status: 'accepted',
    },
    include: {
      userA: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
          isVip: true,
          xpProgress: true,
          currentRank: true,
          lastSeenAt: true,
          ...PUBLIC_USER_COSMETIC_SELECT,
        },
      },
      userB: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          role: true,
          isVip: true,
          xpProgress: true,
          currentRank: true,
          lastSeenAt: true,
          ...PUBLIC_USER_COSMETIC_SELECT,
        },
      },
    },
  });
  return rows.map((f) => withPresence(f.userAId === user.id ? f.userB : f.userA));
}

/** Map of otherUserId → friendship UI status for the current user. */
export async function getMyFriendshipMap() {
  const user = await requireSessionUser();
  const rows = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    select: { userAId: true, userBId: true, status: true },
  });
  const map: Record<string, 'friends' | 'pending_out' | 'pending_in'> = {};
  for (const r of rows) {
    const otherId = r.userAId === user.id ? r.userBId : r.userAId;
    if (r.status === 'accepted') map[otherId] = 'friends';
    else if (r.userAId === user.id) map[otherId] = 'pending_out';
    else map[otherId] = 'pending_in';
  }
  return map;
}

export async function getFriendRequests() {
  const user = await requireSessionUser();
  return prisma.friendship.findMany({
    where: { userBId: user.id, status: 'pending' },
    include: {
      userA: { select: PUBLIC_USER_CARD_SELECT },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Outgoing pending friend requests (for UI “Pending” state). */
export async function getOutgoingFriendRequests() {
  const user = await requireSessionUser();
  return prisma.friendship.findMany({
    where: { userAId: user.id, status: 'pending' },
    select: { id: true, userBId: true },
  });
}

export async function sendFriendRequest(targetUserId: string) {
  const user = await requireSessionUser();
  if (user.id === targetUserId) {
    return { id: '', userAId: user.id, userBId: user.id, status: 'self' as const };
  }
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: user.id, userBId: targetUserId },
        { userAId: targetUserId, userBId: user.id },
      ],
    },
  });
  if (existing) return existing;
  const friendship = await prisma.friendship.create({
    data: { userAId: user.id, userBId: targetUserId, status: 'pending' },
  });
  await prisma.notification.create({
    data: {
      userId: targetUserId,
      title: 'Friend request',
      body: `${user.username} sent you a friend request.`,
      type: 'friend',
    },
  });
  return friendship;
}

export async function respondFriendRequest(friendshipId: string, accept: boolean) {
  const user = await requireSessionUser();
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || friendship.userBId !== user.id) throw new Error('Request not found');
  if (!accept) {
    await prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }
  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'accepted' },
  });
  // Inbox (mail), not bell — requester learns via private message.
  await prisma.message.create({
    data: {
      senderId: user.id,
      receiverId: friendship.userAId,
      body: `${user.username} accepted your friend request.`,
    },
  });
  await processWebsiteAction(user.id, 'friends');
  await processWebsiteAction(friendship.userAId, 'friends');
  return updated;
}

export async function removeFriend(friendUserId: string) {
  const user = await requireSessionUser();
  await prisma.friendship.deleteMany({
    where: {
      status: 'accepted',
      OR: [
        { userAId: user.id, userBId: friendUserId },
        { userAId: friendUserId, userBId: user.id },
      ],
    },
  });
  return { ok: true };
}

export async function getConversations() {
  const user = await requireSessionUser();
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: user.id }, { receiverId: user.id }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      sender: { select: PUBLIC_USER_CARD_SELECT },
      receiver: { select: PUBLIC_USER_CARD_SELECT },
    },
  });

  const byPeer = new Map<
    string,
    {
      peer: {
        id: string;
        username: string;
        avatarUrl: string;
        role: string;
        isVip: boolean;
        equippedFrameConfig: unknown | null;
        equippedNicknameConfig: unknown | null;
      };
      lastMessage: string;
      createdAt: Date;
      unread: number;
    }
  >();

  for (const msg of messages) {
    const peer = msg.senderId === user.id ? msg.receiver : msg.sender;
    const existing = byPeer.get(peer.id);
    if (!existing) {
      byPeer.set(peer.id, {
        peer,
        lastMessage: msg.body,
        createdAt: msg.createdAt,
        unread:
          msg.receiverId === user.id && !msg.readAt ? 1 : 0,
      });
    } else if (msg.receiverId === user.id && !msg.readAt) {
      existing.unread += 1;
    }
  }

  return Array.from(byPeer.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getThreadWith(peerId: string) {
  const user = await requireSessionUser();
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: user.id, receiverId: peerId },
        { senderId: peerId, receiverId: user.id },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  await prisma.message.updateMany({
    where: { senderId: peerId, receiverId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return messages;
}

export async function sendDirectMessage(receiverId: string, body: string) {
  const user = await requireSessionUser();
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error('Empty message');
  if (receiverId === user.id) throw new Error('Cannot message yourself');
  const message = await prisma.message.create({
    data: { senderId: user.id, receiverId, body: text },
  });
  // Private messages stay in the mail inbox only — not the bell.
  await processWebsiteAction(user.id, 'messages');
  return message;
}

export async function getUnreadMessageCount() {
  const user = await requireSessionUser();
  return prisma.message.count({
    where: { receiverId: user.id, readAt: null },
  });
}

/** Delete a single DM the current user sent or received. */
export async function deleteMessage(messageId: string) {
  const user = await requireSessionUser();
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || (msg.senderId !== user.id && msg.receiverId !== user.id)) {
    throw new Error('Message not found');
  }
  await prisma.message.delete({ where: { id: messageId } });
  return { ok: true as const };
}

/** Delete the whole conversation with a peer. */
export async function deleteConversation(peerId: string) {
  const user = await requireSessionUser();
  await prisma.message.deleteMany({
    where: {
      OR: [
        { senderId: user.id, receiverId: peerId },
        { senderId: peerId, receiverId: user.id },
      ],
    },
  });
  return { ok: true as const };
}

export async function getForumPosts(take = 30) {
  return prisma.forumPost.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      author: { select: PUBLIC_USER_CARD_SELECT },
      _count: { select: { replies: true } },
    },
  });
}

export async function createForumPost(input: {
  title: string;
  body: string;
  category?: string;
}) {
  const user = await requireSessionUser();
  if (user.isMuted) throw new Error('You are muted and cannot post right now');
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 5000);
  if (!title || !body) throw new Error('Title and body required');
  const post = await prisma.forumPost.create({
    data: {
      authorId: user.id,
      title,
      body: body.slice(0, 12000),
      category: normalizeForumCategory(input.category),
    },
  });
  await processWebsiteAction(user.id, 'forum');
  await processWebsiteAction(user.id, 'daily_forum');
  return post;
}

export async function getForumReplies(postId: string) {
  return prisma.forumReply.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: PUBLIC_USER_CARD_SELECT },
    },
  });
}

export async function createForumReply(postId: string, body: string) {
  const user = await requireSessionUser();
  if (user.isMuted) throw new Error('You are muted and cannot post right now');
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error('Empty reply');
  const post = await prisma.forumPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Thread not found');

  const reply = await prisma.forumReply.create({
    data: { postId, authorId: user.id, body: text },
  });
  if (post.authorId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: post.authorId,
        title: 'New reply',
        body: `${user.username} replied to "${post.title}".`,
        type: 'forum',
      },
    });
  }
  await processWebsiteAction(user.id, 'forum_replies');
  await processWebsiteAction(user.id, 'daily_forum');
  return reply;
}

export async function getNewsPosts() {
  return prisma.newsPost.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

/** Single published article for dashboard / community readers. */
export async function getNewsPost(id: string) {
  if (!id) return null;
  return prisma.newsPost.findFirst({
    where: { id, published: true },
  });
}

/** Staff: all news including drafts. */
export async function adminListNewsPosts() {
  await requireStaff();
  return prisma.newsPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function adminGetNewsPost(id: string) {
  await requireStaff();
  if (!id) return null;
  return prisma.newsPost.findUnique({ where: { id } });
}

export async function adminCreateNews(input: {
  title: string;
  summary: string;
  body: string;
  headerImageUrl?: string;
  published?: boolean;
}) {
  const staff = await requireStaff();
  const post = await prisma.newsPost.create({
    data: {
      title: input.title.trim().slice(0, 160),
      summary: input.summary.trim().slice(0, 400),
      body: input.body.trim().slice(0, 20000),
      headerImageUrl: input.headerImageUrl?.trim() || null,
      published: input.published !== false,
    },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'create_news',
    detail: `${post.published ? 'Published' : 'Draft'}: ${post.title}`,
  });
  return post;
}

export async function adminUpdateNews(
  id: string,
  input: {
    title: string;
    summary: string;
    body: string;
    headerImageUrl?: string | null;
    published?: boolean;
  }
) {
  const staff = await requireStaff();
  const existing = await prisma.newsPost.findUnique({ where: { id } });
  if (!existing) throw new Error('News post not found');

  const post = await prisma.newsPost.update({
    where: { id },
    data: {
      title: input.title.trim().slice(0, 160),
      summary: input.summary.trim().slice(0, 400),
      body: input.body.trim().slice(0, 20000),
      headerImageUrl:
        input.headerImageUrl === undefined
          ? undefined
          : input.headerImageUrl?.trim() || null,
      published: typeof input.published === 'boolean' ? input.published : undefined,
    },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'update_news',
    detail: post.title,
  });
  return post;
}

export async function adminDeleteNews(id: string) {
  const staff = await requireStaff();
  const existing = await prisma.newsPost.findUnique({ where: { id } });
  if (!existing) throw new Error('News post not found');
  await prisma.newsPost.delete({ where: { id } });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'delete_news',
    detail: existing.title,
  });
  return { ok: true as const };
}

export async function getGuides() {
  return prisma.guide.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
}

export async function createSupportTicket(input: {
  subject: string;
  category: string;
  body: string;
}) {
  const user = await requireSessionUser();
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      subject: input.subject.trim().slice(0, 120),
      category: input.category.trim().slice(0, 40),
      body: input.body.trim().slice(0, 5000),
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Support ticket opened',
      body: `We received “${ticket.subject}”. Staff will reply soon.`,
      type: 'support',
    },
  });
  await processWebsiteAction(user.id, 'support_tickets');
  return ticket;
}

export async function getMySupportTickets() {
  const user = await requireSessionUser();
  return prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}

/** Bell inbox — system alerts only (not DMs / mass mail / admin awards). */
const BELL_EXCLUDED_TYPES = ['message', 'announcement'] as const;

export async function getNotifications() {
  const user = await requireSessionUser();
  return prisma.notification.findMany({
    where: {
      userId: user.id,
      NOT: { type: { in: [...BELL_EXCLUDED_TYPES] } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markAllNotificationsRead() {
  const user = await requireSessionUser();
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      isRead: false,
      NOT: { type: { in: [...BELL_EXCLUDED_TYPES] } },
    },
    data: { isRead: true },
  });
  return { ok: true };
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireSessionUser();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true },
  });
  return { ok: true as const };
}

export async function deleteNotification(notificationId: string) {
  const user = await requireSessionUser();
  await prisma.notification.deleteMany({
    where: { id: notificationId, userId: user.id },
  });
  return { ok: true as const };
}

export async function deleteAllNotifications() {
  const user = await requireSessionUser();
  await prisma.notification.deleteMany({
    where: {
      userId: user.id,
      NOT: { type: { in: [...BELL_EXCLUDED_TYPES] } },
    },
  });
  return { ok: true as const };
}

export async function purchaseStoreItem(itemId: string) {
  const user = await requireSessionUser();
  const item = await prisma.storeItem.findUnique({ where: { id: itemId } });
  if (!item || !item.isAvailable) throw new Error('Item unavailable');

  const { getEffectiveVpPrice } = await import('@/lib/shop-catalog');
  const price = getEffectiveVpPrice(item);
  if (user.vpCurrency < price) return { ok: false as const, error: 'Not enough VP' };

  await prisma.user.update({
    where: { id: user.id },
    data: { vpCurrency: { decrement: price } },
  });
  await prisma.purchase.create({
    data: {
      userId: user.id,
      itemSku: item.itemSku,
      itemName: item.itemName,
      vpSpent: price,
    },
  });
  // Snapshot cosmetic data onto a personal inventory copy so later admin
  // edits to the shop catalog never retroactively change owned items.
  await prisma.inventoryItem.create({
    data: {
      userId: user.id,
      itemSku: item.itemSku,
      itemName: item.itemName,
      itemCategory: item.itemCategory,
      cosmeticSlot: item.cosmeticSlot ?? null,
      bannerConfig: item.bannerConfig ?? undefined,
      cosmeticConfig: item.cosmeticConfig ?? undefined,
      imageUrl: item.imageUrl ?? null,
      vpValue: price,
    },
  });
  await prisma.storeItem.update({
    where: { id: item.id },
    data: { purchaseCount: { increment: 1 } },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Purchase complete',
      body: `Bought ${item.itemName} for ${price} VP.`,
      type: 'store',
    },
  });
  await processWebsiteAction(user.id, 'purchases');
  if (item.cosmeticSlot) {
    await processWebsiteAction(user.id, 'cosmetic_owned');
    if (item.cosmeticSlot === 'banner') {
      await processWebsiteAction(user.id, 'banner_owned');
    } else if (item.cosmeticSlot === 'frame') {
      await processWebsiteAction(user.id, 'frame_owned');
    } else if (item.cosmeticSlot === 'nickname') {
      await processWebsiteAction(user.id, 'nickname_owned');
    }
  }
  return { ok: true as const, price };
}

/** Put selected catalog items on a timed fire sale. */
export async function adminSetFireSale(input: {
  itemIds: string[];
  percent: number;
  durationHours: number;
}) {
  const staff = await requireStaff();
  const percent = Math.min(90, Math.max(1, Math.round(input.percent)));
  const hours = Math.min(24 * 30, Math.max(1, Math.round(input.durationHours)));
  const ids = [...new Set(input.itemIds.filter(Boolean))];
  if (ids.length === 0) throw new Error('Select at least one item');

  const ends = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.storeItem.updateMany({
    where: { id: { in: ids } },
    data: { fireSalePercent: percent, fireSaleEndsAt: ends },
  });

  try {
    const { writeAuditLog } = await import('@/lib/audit');
    await writeAuditLog({
      actorId: staff.id,
      actorUsername: staff.username,
      action: 'fire_sale',
      detail: `${ids.length} items · -${percent}% · ${hours}h`,
    });
  } catch {
    // ignore
  }

  return { ok: true as const, endsAt: ends, percent, count: ids.length };
}

export async function adminClearFireSale(itemIds?: string[]) {
  await requireStaff();
  const where =
    itemIds && itemIds.length > 0 ? { id: { in: itemIds } } : { fireSalePercent: { gt: 0 } };
  const result = await prisma.storeItem.updateMany({
    where,
    data: { fireSalePercent: 0, fireSaleEndsAt: null },
  });
  return { ok: true as const, count: result.count };
}

// --- Inventory (owned cosmetics / items) ---

export async function getMyInventory() {
  const user = await requireSessionUser();
  return prisma.inventoryItem.findMany({
    where: { userId: user.id },
    orderBy: [{ isEquipped: 'desc' }, { acquiredAt: 'desc' }],
  });
}

/** Flatten equipped shop skins for the local match avatar. */
export async function getMyEquippedSkinAttachments(): Promise<SkinAttachment[]> {
  const user = await requireSessionUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { equippedSkins: true },
  });
  const map =
    row?.equippedSkins && typeof row.equippedSkins === 'object'
      ? (row.equippedSkins as Record<string, unknown>)
      : null;
  return flattenEquippedSkinsMap(map);
}

/** Equips a cosmetic (banner / frame / nickname), unequipping any other item in that slot. */
export async function equipInventoryItem(inventoryItemId: string) {
  const user = await requireSessionUser();
  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item || item.userId !== user.id) throw new Error('Item not found');
  if (!item.cosmeticSlot) throw new Error('This item cannot be equipped');

  await prisma.inventoryItem.updateMany({
    where: { userId: user.id, cosmeticSlot: item.cosmeticSlot, isEquipped: true },
    data: { isEquipped: false },
  });
  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { isEquipped: true },
  });

  if (item.cosmeticSlot === 'banner') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedBannerItemName: item.itemName,
        equippedBannerImageUrl: item.imageUrl ?? null,
        equippedBannerConfig: item.bannerConfig ?? undefined,
        cosmeticEquipCount: { increment: 1 },
      },
    });
  } else if (item.cosmeticSlot === 'frame') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedFrameItemName: item.itemName,
        equippedFrameConfig: item.cosmeticConfig ?? undefined,
        cosmeticEquipCount: { increment: 1 },
      },
    });
  } else if (item.cosmeticSlot === 'nickname') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedNicknameItemName: item.itemName,
        equippedNicknameConfig: item.cosmeticConfig ?? undefined,
        cosmeticEquipCount: { increment: 1 },
      },
    });
  } else if (item.cosmeticSlot && isSkinCosmeticSlot(item.cosmeticSlot)) {
    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { equippedSkins: true },
    });
    const map =
      prev?.equippedSkins && typeof prev.equippedSkins === 'object'
        ? { ...(prev.equippedSkins as Record<string, unknown>) }
        : {};
    map[item.cosmeticSlot] = item.cosmeticConfig ?? { itemName: item.itemName };
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedSkins: map as Prisma.InputJsonValue,
        cosmeticEquipCount: { increment: 1 },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { cosmeticEquipCount: { increment: 1 } },
    });
  }
  await processWebsiteAction(user.id, 'cosmetics_equipped');
  return { ok: true as const };
}

export async function unequipCosmeticSlot(cosmeticSlot: string) {
  const user = await requireSessionUser();
  await prisma.inventoryItem.updateMany({
    where: { userId: user.id, cosmeticSlot, isEquipped: true },
    data: { isEquipped: false },
  });
  if (cosmeticSlot === 'banner') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedBannerItemName: null,
        equippedBannerImageUrl: null,
        equippedBannerConfig: null,
      },
    });
  } else if (cosmeticSlot === 'frame') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedFrameItemName: null,
        equippedFrameConfig: null,
      },
    });
  } else if (cosmeticSlot === 'nickname') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedNicknameItemName: null,
        equippedNicknameConfig: null,
      },
    });
  } else if (isSkinCosmeticSlot(cosmeticSlot)) {
    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { equippedSkins: true },
    });
    const map =
      prev?.equippedSkins && typeof prev.equippedSkins === 'object'
        ? { ...(prev.equippedSkins as Record<string, unknown>) }
        : {};
    delete map[cosmeticSlot];
    await prisma.user.update({
      where: { id: user.id },
      data: { equippedSkins: map as Prisma.InputJsonValue },
    });
  }
  return { ok: true as const };
}

async function clearEquippedSnapshot(
  userId: string,
  slot: string | null | undefined
) {
  if (slot === 'banner') {
    await prisma.user.update({
      where: { id: userId },
      data: {
        equippedBannerItemName: null,
        equippedBannerImageUrl: null,
        equippedBannerConfig: null,
      },
    });
  } else if (slot === 'frame') {
    await prisma.user.update({
      where: { id: userId },
      data: { equippedFrameItemName: null, equippedFrameConfig: null },
    });
  } else if (slot === 'nickname') {
    await prisma.user.update({
      where: { id: userId },
      data: { equippedNicknameItemName: null, equippedNicknameConfig: null },
    });
  } else if (slot && isSkinCosmeticSlot(slot)) {
    const prev = await prisma.user.findUnique({
      where: { id: userId },
      select: { equippedSkins: true },
    });
    const map =
      prev?.equippedSkins && typeof prev.equippedSkins === 'object'
        ? { ...(prev.equippedSkins as Record<string, unknown>) }
        : {};
    delete map[slot];
    await prisma.user.update({
      where: { id: userId },
      data: { equippedSkins: map as Prisma.InputJsonValue },
    });
  }
}

/** Sells an owned item back for a fraction of its original VP price. */
export async function resellInventoryItem(inventoryItemId: string) {
  const user = await requireSessionUser();
  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item || item.userId !== user.id) throw new Error('Item not found');

  const refund = Math.floor(item.vpValue * INVENTORY_RESELL_RATE);
  await prisma.$transaction([
    prisma.inventoryItem.delete({ where: { id: item.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        vpCurrency: { increment: refund },
        ...(item.cosmeticSlot
          ? { cosmeticResellCount: { increment: 1 } }
          : {}),
      },
    }),
  ]);

  if (item.isEquipped) {
    await clearEquippedSnapshot(user.id, item.cosmeticSlot);
  }
  if (item.cosmeticSlot) {
    await processWebsiteAction(user.id, 'cosmetics_resold');
    await processWebsiteAction(user.id, 'cosmetic_owned');
  }
  return { ok: true as const, refund };
}

/** Permanently discards an owned item with no refund (inventory cleanup). */
export async function deleteInventoryItem(inventoryItemId: string) {
  const user = await requireSessionUser();
  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item || item.userId !== user.id) throw new Error('Item not found');

  await prisma.inventoryItem.delete({ where: { id: item.id } });

  if (item.isEquipped) {
    await clearEquippedSnapshot(user.id, item.cosmeticSlot);
  }
  if (item.cosmeticSlot) {
    await prisma.user.update({
      where: { id: user.id },
      data: { cosmeticDeleteCount: { increment: 1 } },
    });
    await processWebsiteAction(user.id, 'cosmetics_deleted');
    await processWebsiteAction(user.id, 'cosmetic_owned');
  }
  return { ok: true as const };
}

// --- Reputation (+rep / -rep) ---

// --- Reputation (+rep / -rep) — one permanent vote per player ---

export async function voteReputation(targetUserId: string, value: 1 | -1) {
  const user = await requireSessionUser();
  if (user.id === targetUserId) throw new Error('Cannot rep yourself');

  const existing = await prisma.reputationVote.findUnique({
    where: { voterId_targetId: { voterId: user.id, targetId: targetUserId } },
  });

  if (existing) {
    throw new Error('You already submitted reputation for this player');
  }

  await prisma.reputationVote.create({
    data: { voterId: user.id, targetId: targetUserId, value },
  });

  // Recompute from all votes so the visible total never drifts
  const reputation = await syncUserReputation(targetUserId);

  try {
    await processWebsiteAction(targetUserId, 'reputation');
  } catch {
    await tryUnlockAchievementIfPositive(targetUserId);
  }

  return {
    ok: true as const,
    reputation,
    myVote: value as 1 | -1,
  };
}

/** Sum ReputationVote rows onto User.reputation (source of truth). */
async function syncUserReputation(targetUserId: string): Promise<number> {
  const votes = await prisma.reputationVote.findMany({
    where: { targetId: targetUserId },
    select: { value: true },
  });
  const reputation = votes.reduce((sum, v) => sum + v.value, 0);
  await prisma.user.update({
    where: { id: targetUserId },
    data: { reputation },
  });
  return reputation;
}

async function tryUnlockAchievementIfPositive(userId: string) {
  const { tryUnlockAchievement, tryUnlockBadge } = await import('@/lib/progression-actions');
  await tryUnlockAchievement(userId, 'reputation');
  await tryUnlockBadge(userId, 'reputation');
}

export async function getMyReputationVote(targetUserId: string) {
  const user = await requireSessionUser();
  const vote = await prisma.reputationVote.findUnique({
    where: { voterId_targetId: { voterId: user.id, targetId: targetUserId } },
  });
  return vote?.value ?? 0;
}

// --- Admin / moderator ---

export async function adminListUsers(take = 50) {
  await requireStaff();
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      steamId: true,
      username: true,
      avatarUrl: true,
      role: true,
      isVip: true,
      isBanned: true,
      isMuted: true,
      vpCurrency: true,
      xpProgress: true,
      email: true,
      createdAt: true,
    },
  });
}

/** Adjust VP (+ give / − take). Floor at 0. */
export async function adminAdjustVp(userId: string, delta: number) {
  const staff = await requireStaff();
  const amount = Math.trunc(delta);
  if (!amount) throw new Error('Amount required');
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');
  const next = Math.max(0, target.vpCurrency + amount);
  await prisma.user.update({
    where: { id: userId },
    data: { vpCurrency: next },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: amount > 0 ? 'award_vp' : 'remove_vp',
    targetUserId: userId,
    targetUsername: target.username,
    detail: `${amount > 0 ? '+' : ''}${amount} VP → ${next}`,
  });
  if (amount > 0) {
    // Awards go to the mail inbox only.
    await prisma.message.create({
      data: {
        senderId: staff.id,
        receiverId: userId,
        body: `🎁 ${staff.username} awarded you +${amount} VP from the admin panel.`,
      },
    });
  } else {
    // Deductions are system alerts (bell).
    await prisma.notification.create({
      data: {
        userId,
        title: 'VP adjusted',
        body: `${staff.username} removed ${Math.abs(amount)} VP from your balance.`,
        type: 'admin',
      },
    });
  }
  return { ok: true as const, vpCurrency: next };
}

/** Full admin view of a player: inventory, purchases, badges, missions. */
export async function adminGetUserDetail(userId: string) {
  await requireStaff();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      steamId: true,
      username: true,
      avatarUrl: true,
      role: true,
      isVip: true,
      isBanned: true,
      isMuted: true,
      vpCurrency: true,
      xpProgress: true,
      currentRank: true,
      email: true,
      createdAt: true,
      loginStreak: true,
      reputation: true,
    },
  });
  if (!user) throw new Error('User not found');
  const [inventory, purchases, badges, achievements, missions] =
    await Promise.all([
      prisma.inventoryItem.findMany({
        where: { userId },
        orderBy: { acquiredAt: 'desc' },
        take: 80,
      }),
      prisma.purchase.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
      prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { earnedAt: 'desc' },
      }),
      prisma.userAchievement.findMany({
        where: { userId },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
        take: 40,
      }),
      prisma.activeMission.findMany({
        where: { userId },
        orderBy: [{ isCompleted: 'asc' }, { rewardXp: 'desc' }],
        take: 40,
      }),
    ]);
  return { user, inventory, purchases, badges, achievements, missions };
}

/** Site-wide mass message — lands in the mail inbox (not the bell). */
export async function adminBroadcastAnnouncement(input: {
  title: string;
  body: string;
  /** @deprecated Mass mail always goes to Messages; kept for call-site compat. */
  alsoDm?: boolean;
}) {
  const staff = await requireStaff();
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 2000);
  if (!title || !body) throw new Error('Title and body required');

  const users = await prisma.user.findMany({
    where: { NOT: { isBanned: true } },
    select: { id: true },
  });

  const chunk = 50;
  for (let i = 0; i < users.length; i += chunk) {
    const slice = users.slice(i, i + chunk);
    await prisma.message.createMany({
      data: slice
        .filter((u) => u.id !== staff.id)
        .map((u) => ({
          senderId: staff.id,
          receiverId: u.id,
          body: `📢 ${title}\n\n${body}`,
        })),
    });
  }

  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'broadcast',
    detail: `${title} → ${users.length} players (inbox)`,
  });

  return { ok: true as const, count: users.length };
}

export async function adminSetUserRole(userId: string, role: string) {
  const staff = await requireStaff();
  if (staff.role !== 'admin') throw new Error('Only admins can change roles');
  if (!isAccountRole(role)) throw new Error('Invalid role');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role: role as AccountRole,
      // VIP is a paid/unlocked flag — not automatic for staff roles.
      ...(role === 'vip' ? { isVip: true } : role === 'player' ? { isVip: false } : {}),
    },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'set_role',
    targetUserId: updated.id,
    targetUsername: updated.username,
    detail: `Role → ${role}`,
  });
  return updated;
}

/** Find players by username for friend add / discovery (excludes self). */
export async function searchPlayers(query: string) {
  const user = await requireSessionUser();
  const q = query.trim();
  if (q.length < 1) return [];

  // MongoDB string filters vary by Prisma version — try insensitive first.
  let rows;
  try {
    rows = await prisma.user.findMany({
      where: {
        ...NOT_BANNED,
        id: { not: user.id },
        username: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ xpProgress: 'desc' }, { createdAt: 'asc' }],
      take: 20,
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        role: true,
        isVip: true,
        xpProgress: true,
        currentRank: true,
        ...PUBLIC_USER_COSMETIC_SELECT,
      },
    });
  } catch {
    const all = await prisma.user.findMany({
      where: { ...NOT_BANNED, id: { not: user.id } },
      orderBy: [{ xpProgress: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        role: true,
        isVip: true,
        xpProgress: true,
        currentRank: true,
        ...PUBLIC_USER_COSMETIC_SELECT,
      },
    });
    const lower = q.toLowerCase();
    rows = all.filter((r) => (r.username || '').toLowerCase().includes(lower)).slice(0, 20);
  }

  return rows.map((row) => ({
    ...row,
    username: row.username || 'Player',
    avatarUrl: row.avatarUrl || '',
    xpProgress: row.xpProgress ?? 0,
    currentRank: row.currentRank || 'Unranked',
  }));
}

export async function adminSetBanned(userId: string, isBanned: boolean) {
  const staff = await requireStaff();
  const target = await prisma.user.update({
    where: { id: userId },
    data: { isBanned },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: isBanned ? 'ban' : 'unban',
    targetUserId: target.id,
    targetUsername: target.username,
  });
  return target;
}

/** Moderator tool: silence a player's global chat / forum posting without banning them. */
export async function adminSetMuted(userId: string, isMuted: boolean) {
  const staff = await requireStaff();
  const target = await prisma.user.update({
    where: { id: userId },
    data: { isMuted },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: isMuted ? 'mute' : 'unmute',
    targetUserId: target.id,
    targetUsername: target.username,
  });
  return target;
}

export async function adminListTickets(statusFilter?: string) {
  await requireStaff();
  const status =
    statusFilter && statusFilter !== 'all' ? statusFilter : undefined;
  return prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
}

export async function adminUpdateTicketStatus(
  ticketId: string,
  status: string,
  staffNote?: string
) {
  const staff = await requireStaff();
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      ...(staffNote !== undefined ? { staffNote: staffNote.slice(0, 2000) } : {}),
    },
  });
  await prisma.notification.create({
    data: {
      userId: ticket.userId,
      title: 'Support ticket updated',
      body: `Your ticket is now “${status}”.`,
      type: 'support',
    },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'ticket_status',
    targetUserId: ticket.userId,
    detail: `Ticket ${ticketId} → ${status}`,
  });
  return ticket;
}

export async function adminUpsertStoreItem(input: {
  id?: string;
  itemName: string;
  itemCategory: string;
  itemSku: string;
  vpPrice: number;
  imageUrl?: string;
  isAvailable?: boolean;
  cosmeticSlot?: string | null;
  bannerConfig?: BannerConfig | null;
  cosmeticConfig?: Record<string, unknown> | null;
}) {
  await requireStaff();
  const cosmeticData =
    input.cosmeticSlot !== undefined
      ? {
          cosmeticSlot: input.cosmeticSlot,
          bannerConfig:
            input.bannerConfig === null
              ? null
              : input.bannerConfig !== undefined
                ? (input.bannerConfig as unknown as Prisma.InputJsonValue)
                : undefined,
          cosmeticConfig:
            input.cosmeticConfig === null
              ? null
              : input.cosmeticConfig !== undefined
                ? (input.cosmeticConfig as unknown as Prisma.InputJsonValue)
                : undefined,
        }
      : {};
  if (input.id) {
    return prisma.storeItem.update({
      where: { id: input.id },
      data: {
        itemName: input.itemName,
        itemCategory: input.itemCategory,
        itemSku: input.itemSku,
        vpPrice: input.vpPrice,
        imageUrl: input.imageUrl,
        isAvailable: input.isAvailable ?? true,
        ...cosmeticData,
      },
    });
  }
  return prisma.storeItem.create({
    data: {
      itemName: input.itemName,
      itemCategory: input.itemCategory,
      itemSku: input.itemSku,
      vpPrice: input.vpPrice,
      imageUrl: input.imageUrl,
      isAvailable: input.isAvailable ?? true,
      ...cosmeticData,
    },
  });
}

export async function adminDeleteStoreItem(id: string) {
  await requireStaff();
  await prisma.storeItem.delete({ where: { id } });
  return { ok: true };
}

export async function adminCreateGuide(input: {
  title: string;
  summary: string;
  body: string;
  category?: string;
}) {
  const staff = await requireStaff();
  const guide = await prisma.guide.create({
    data: {
      title: input.title,
      summary: input.summary,
      body: input.body,
      category: input.category || 'general',
    },
  });
  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'create_guide',
    detail: guide.title,
  });
  return guide;
}

export async function adminDashboardStats() {
  await requireStaff();
  const [users, tickets, posts, purchases] = await Promise.all([
    prisma.user.count(),
    prisma.supportTicket.count({ where: { status: 'open' } }),
    prisma.forumPost.count(),
    prisma.purchase.count(),
  ]);
  return { users, openTickets: tickets, forumPosts: posts, purchases };
}

/** Called after Steam login to promote configured Steam IDs to admin (not VIP). */
export async function applyAdminSteamPromotion(steamId: string) {
  if (!steamIdsPromotedToAdmin().has(steamId)) return;
  await prisma.user.update({
    where: { steamId },
    data: { role: 'admin' },
  });
}
