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

export async function unlockVipWithVp() {
  const user = await requireSessionUser();
  if (user.isVip || user.role === 'vip' || user.role === 'admin' || user.role === 'moderator') {
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
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'VIP unlocked',
      body: `You spent ${VIP_UNLOCK_VP_COST} VP to unlock VIP perks.`,
      type: 'vip',
    },
  });
  await processWebsiteAction(user.id, 'vip');
  return { ok: true as const, already: false };
}

export async function getLeaderboard(take = 20) {
  return prisma.user.findMany({
    where: { isBanned: false },
    orderBy: [{ xpProgress: 'desc' }, { vpCurrency: 'desc' }],
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
}

/** Public profile snippet for messaging / profile deep-links. */
export async function getUserBrief(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, isBanned: false },
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
      userA: { select: { id: true, username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
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
      sender: { select: { id: true, username: true, avatarUrl: true } },
      receiver: { select: { id: true, username: true, avatarUrl: true } },
    },
  });

  const byPeer = new Map<
    string,
    {
      peer: { id: string; username: string; avatarUrl: string };
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
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 5000);
  if (!title || !body) throw new Error('Title and body required');
  const post = await prisma.forumPost.create({
    data: {
      authorId: user.id,
      title,
      body,
      category: (input.category || 'general').slice(0, 40),
    },
  });
  await processWebsiteAction(user.id, 'forum');
  return post;
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
  if (user.vpCurrency < item.vpPrice) return { ok: false as const, error: 'Not enough VP' };

  await prisma.user.update({
    where: { id: user.id },
    data: { vpCurrency: { decrement: item.vpPrice } },
  });
  await prisma.purchase.create({
    data: {
      userId: user.id,
      itemSku: item.itemSku,
      itemName: item.itemName,
      vpSpent: item.vpPrice,
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
      imageUrl: item.imageUrl ?? null,
      vpValue: item.vpPrice,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Purchase complete',
      body: `Bought ${item.itemName} for ${item.vpPrice} VP.`,
      type: 'store',
    },
  });
  await processWebsiteAction(user.id, 'purchases');
  return { ok: true as const };
}

// --- Inventory (owned cosmetics / items) ---

export async function getMyInventory() {
  const user = await requireSessionUser();
  return prisma.inventoryItem.findMany({
    where: { userId: user.id },
    orderBy: [{ isEquipped: 'desc' }, { acquiredAt: 'desc' }],
  });
}

/** Equips a cosmetic (currently only "banner"), unequipping any other item in that slot. */
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
      },
    });
  }
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
  }
  return { ok: true as const };
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
      data: { vpCurrency: { increment: refund } },
    }),
  ]);

  if (item.isEquipped && item.cosmeticSlot === 'banner') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedBannerItemName: null,
        equippedBannerImageUrl: null,
        equippedBannerConfig: null,
      },
    });
  }
  return { ok: true as const, refund };
}

/** Permanently discards an owned item with no refund (inventory cleanup). */
export async function deleteInventoryItem(inventoryItemId: string) {
  const user = await requireSessionUser();
  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item || item.userId !== user.id) throw new Error('Item not found');

  await prisma.inventoryItem.delete({ where: { id: item.id } });

  if (item.isEquipped && item.cosmeticSlot === 'banner') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        equippedBannerItemName: null,
        equippedBannerImageUrl: null,
        equippedBannerConfig: null,
      },
    });
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
      vpCurrency: true,
      xpProgress: true,
      email: true,
      createdAt: true,
    },
  });
}

export async function adminSetUserRole(userId: string, role: string) {
  const staff = await requireStaff();
  if (staff.role !== 'admin') throw new Error('Only admins can change roles');
  if (!isAccountRole(role)) throw new Error('Invalid role');
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: role as AccountRole,
      isVip: role === 'vip' || role === 'admin' || role === 'moderator',
    },
  });
}

export async function adminSetBanned(userId: string, isBanned: boolean) {
  await requireStaff();
  return prisma.user.update({ where: { id: userId }, data: { isBanned } });
}

export async function adminListTickets() {
  await requireStaff();
  return prisma.supportTicket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
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
}) {
  await requireStaff();
  const cosmeticData =
    input.cosmeticSlot !== undefined
      ? {
          cosmeticSlot: input.cosmeticSlot,
          bannerConfig:
            input.bannerConfig === null
              ? null
              : (input.bannerConfig as unknown as Prisma.InputJsonValue),
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
}) {
  await requireStaff();
  return prisma.newsPost.create({ data: input });
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

/** Called after Steam login to promote configured Steam IDs to admin. */
export async function applyAdminSteamPromotion(steamId: string) {
  if (!steamIdsPromotedToAdmin().has(steamId)) return;
  await prisma.user.update({
    where: { steamId },
    data: { role: 'admin', isVip: true },
  });
}
