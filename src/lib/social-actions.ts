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

export async function getLeaderboard(take = 20) {
  const rows = await prisma.user.findMany({
    where: NOT_BANNED,
    orderBy: [
      { xpProgress: 'desc' },
      { vpCurrency: 'desc' },
      { createdAt: 'asc' },
    ],
    take,
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      xpProgress: true,
      currentRank: true,
      isVip: true,
      role: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    username: row.username || 'Player',
    avatarUrl: row.avatarUrl || '',
    xpProgress: row.xpProgress ?? 0,
    currentRank: row.currentRank || 'Unranked',
  }));
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
    },
  });
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
        },
      },
    },
  });
  return rows.map((f) => (f.userAId === user.id ? f.userB : f.userA));
}

export async function getFriendRequests() {
  const user = await requireSessionUser();
  return prisma.friendship.findMany({
    where: { userBId: user.id, status: 'pending' },
    include: {
      userA: { select: { id: true, username: true, avatarUrl: true, role: true, isVip: true } },
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
  if (user.id === targetUserId) throw new Error('Cannot friend yourself');
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
      sender: { select: { id: true, username: true, avatarUrl: true, role: true, isVip: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true, role: true, isVip: true } },
    },
  });

  const byPeer = new Map<
    string,
    {
      peer: { id: string; username: string; avatarUrl: string; role: string; isVip: boolean };
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
  const message = await prisma.message.create({
    data: { senderId: user.id, receiverId, body: text },
  });
  await prisma.notification.create({
    data: {
      userId: receiverId,
      title: 'New message',
      body: `${user.username}: ${text.slice(0, 80)}`,
      type: 'message',
    },
  });
  await processWebsiteAction(user.id, 'messages');
  return message;
}

export async function getForumPosts(take = 30) {
  return prisma.forumPost.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, role: true, isVip: true } },
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
      author: { select: { id: true, username: true, avatarUrl: true, role: true, isVip: true } },
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

export async function getNotifications() {
  const user = await requireSessionUser();
  return prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function markAllNotificationsRead() {
  const user = await requireSessionUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  return { ok: true };
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

export async function voteReputation(targetUserId: string, value: 1 | -1) {
  const user = await requireSessionUser();
  if (user.id === targetUserId) throw new Error('Cannot rep yourself');

  const existing = await prisma.reputationVote.findUnique({
    where: { voterId_targetId: { voterId: user.id, targetId: targetUserId } },
  });

  let delta: number = value;
  if (existing) {
    if (existing.value === value) {
      // Same vote again = retract it.
      await prisma.reputationVote.delete({ where: { id: existing.id } });
      delta = -existing.value;
    } else {
      await prisma.reputationVote.update({
        where: { id: existing.id },
        data: { value },
      });
      delta = value - existing.value;
    }
  } else {
    await prisma.reputationVote.create({
      data: { voterId: user.id, targetId: targetUserId, value },
    });
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { reputation: { increment: delta } },
  });
  await tryUnlockAchievementIfPositive(targetUserId);
  return { ok: true as const, reputation: updated.reputation };
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
  await prisma.notification.create({
    data: {
      userId,
      title: amount > 0 ? 'VP received' : 'VP adjusted',
      body:
        amount > 0
          ? `${staff.username} granted you +${amount} VP.`
          : `${staff.username} removed ${Math.abs(amount)} VP from your balance.`,
      type: 'admin',
    },
  });
  if (amount > 0) {
    await prisma.message.create({
      data: {
        senderId: staff.id,
        receiverId: userId,
        body: `🎁 ${staff.username} awarded you +${amount} VP from the admin panel.`,
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

/** Site-wide announcement: notification for every player (+ optional DM from staff). */
export async function adminBroadcastAnnouncement(input: {
  title: string;
  body: string;
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
    await prisma.notification.createMany({
      data: slice.map((u) => ({
        userId: u.id,
        title: `📢 ${title}`,
        body: `${body}\n— ${staff.username}`,
        type: 'announcement',
      })),
    });
    if (input.alsoDm) {
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
  }

  const { writeAuditLog } = await import('@/lib/audit');
  await writeAuditLog({
    actorId: staff.id,
    actorUsername: staff.username,
    action: 'broadcast',
    detail: `${title} → ${users.length} players`,
  });

  return { ok: true as const, count: users.length };
}

export async function adminSetUserRole(userId: string, role: string) {
  const staff = await requireStaff();
  if (staff.role !== 'admin') throw new Error('Only admins can change roles');
  if (!isAccountRole(role)) throw new Error('Invalid role');
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: role as AccountRole,
      // VIP is a paid/unlocked flag — not automatic for staff roles.
      ...(role === 'vip' ? { isVip: true } : role === 'player' ? { isVip: false } : {}),
    },
  });
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
  await requireStaff();
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

export async function adminCreateNews(input: {
  title: string;
  summary: string;
  body: string;
  headerImageUrl?: string;
}) {
  await requireStaff();
  return prisma.newsPost.create({
    data: {
      title: input.title.trim().slice(0, 160),
      summary: input.summary.trim().slice(0, 400),
      body: input.body.trim().slice(0, 20000),
      headerImageUrl: input.headerImageUrl?.trim() || null,
      published: true,
    },
  });
}

export async function adminCreateGuide(input: {
  title: string;
  summary: string;
  body: string;
  category?: string;
}) {
  await requireStaff();
  return prisma.guide.create({
    data: {
      title: input.title,
      summary: input.summary,
      body: input.body,
      category: input.category || 'general',
    },
  });
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
