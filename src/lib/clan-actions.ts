'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processWebsiteAction } from '@/lib/progression-actions';

const CLAN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAG_MIN = 3;
const TAG_MAX = 5;
const NAME_MAX = 32;
const DESCRIPTION_MAX = 280;

export type ClanRole = 'owner' | 'officer' | 'member';

export type ClanMemberPublic = {
  id: string;
  username: string;
  avatarUrl: string;
  role: ClanRole;
  kp: number;
  joinedAt: string;
};

export type ClanDto = {
  id: string;
  name: string;
  tag: string;
  description: string;
  imageUrl: string;
  bannerUrl: string;
  inviteCode: string;
  isOpen: boolean;
  ownerId: string;
  createdAt: string;
  members: ClanMemberPublic[];
  totalKp: number;
  averageKp: number;
  totalWins: number;
  warWins: number;
  warLosses: number;
  warDraws: number;
  viewerRole: ClanRole | null;
};

export type ClanLeaderboardRow = {
  id: string;
  name: string;
  tag: string;
  imageUrl: string;
  memberCount: number;
  totalKp: number;
  averageKp: number;
  rank: number;
};

export type ClanJoinRequestDto = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
};

async function notifyUser(input: {
  userId: string;
  title: string;
  body: string;
  type: string;
  dedupeKey?: string;
}) {
  try {
    if (input.dedupeKey) {
      const existing = await prisma.notification.findFirst({
        where: { userId: input.userId, type: input.type, dedupeKey: input.dedupeKey },
      });
      if (existing) {
        if (existing.isRead) {
          await prisma.notification.update({
            where: { id: existing.id },
            data: { isRead: false, title: input.title, body: input.body },
          });
        }
        return;
      }
    }
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        type: input.type,
        dedupeKey: input.dedupeKey,
      },
    });
  } catch {
    // Notifications are best-effort — never block the underlying clan action.
  }
}

async function notifyClanManagers(clanId: string, input: Omit<Parameters<typeof notifyUser>[0], 'userId'>) {
  const managers = await prisma.clanMember.findMany({
    where: { clanId, role: { in: ['owner', 'officer'] } },
    select: { userId: true },
  });
  await Promise.all(managers.map((m) => notifyUser({ ...input, userId: m.userId })));
}

async function requireSessionUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Account banned');
  return user;
}

function randomClanCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CLAN_CODE_CHARS[Math.floor(Math.random() * CLAN_CODE_CHARS.length)];
  }
  return out;
}

function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function assertValidName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 3) throw new Error('Clan name must be at least 3 characters');
  if (trimmed.length > NAME_MAX) throw new Error(`Clan name must be ${NAME_MAX} characters or fewer`);
}

function assertValidTag(tag: string) {
  if (tag.length < TAG_MIN || tag.length > TAG_MAX) {
    throw new Error(`Clan tag must be ${TAG_MIN}-${TAG_MAX} letters/numbers`);
  }
}

async function findClanForUser(userId: string) {
  const membership = await prisma.clanMember.findUnique({ where: { userId } });
  if (!membership) return null;
  return prisma.clan.findUnique({ where: { id: membership.clanId } });
}

async function toDto(
  clan: {
    id: string;
    name: string;
    tag: string;
    description: string;
    imageUrl: string;
    bannerUrl: string;
    inviteCode: string;
    isOpen: boolean;
    ownerId: string;
    createdAt: Date;
    warWins?: number;
    warLosses?: number;
    warDraws?: number;
  },
  viewerId?: string
): Promise<ClanDto> {
  const members = await prisma.clanMember.findMany({
    where: { clanId: clan.id },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true, kp: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const memberDtos: ClanMemberPublic[] = members
    .filter((m) => !!m.user)
    .map((m) => ({
      id: m.user.id,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl,
      role: m.role as ClanRole,
      kp: m.user.kp,
      joinedAt: m.joinedAt.toISOString(),
    }))
    .sort((a, b) => b.kp - a.kp);

  const totalKp = memberDtos.reduce((sum, m) => sum + m.kp, 0);
  const averageKp = memberDtos.length > 0 ? Math.round(totalKp / memberDtos.length) : 0;

  const totalWins = await prisma.matchResult.count({
    where: {
      userId: { in: memberDtos.map((m) => m.id) },
      outcome: 'win',
    },
  });

  const viewerMembership = viewerId
    ? memberDtos.find((m) => m.id === viewerId)
    : undefined;

  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    imageUrl: clan.imageUrl,
    bannerUrl: clan.bannerUrl,
    inviteCode: clan.inviteCode,
    isOpen: clan.isOpen,
    ownerId: clan.ownerId,
    createdAt: clan.createdAt.toISOString(),
    members: memberDtos,
    totalKp,
    averageKp,
    totalWins,
    warWins: clan.warWins ?? 0,
    warLosses: clan.warLosses ?? 0,
    warDraws: clan.warDraws ?? 0,
    viewerRole: viewerMembership?.role ?? null,
  };
}

async function requireMembership(userId: string, roles: ClanRole[] = ['owner', 'officer', 'member']) {
  const membership = await prisma.clanMember.findUnique({ where: { userId } });
  if (!membership) throw new Error('Not in a clan');
  if (!roles.includes(membership.role as ClanRole)) {
    throw new Error('You do not have permission to do that');
  }
  return membership;
}

export async function getMyClan(): Promise<ClanDto | null> {
  const user = await requireSessionUser();
  const clan = await findClanForUser(user.id);
  if (!clan) return null;
  return toDto(clan, user.id);
}

export async function getClanByTag(rawTag: string): Promise<ClanDto | null> {
  const tag = normalizeTag(rawTag);
  const clan = await prisma.clan.findUnique({ where: { tag } });
  if (!clan) return null;
  return toDto(clan);
}

export async function getClanLeaderboard(
  sortBy: 'total' | 'average' = 'total'
): Promise<ClanLeaderboardRow[]> {
  const clans = await prisma.clan.findMany({
    include: {
      members: {
        include: { user: { select: { kp: true } } },
      },
    },
  });

  const rows = clans.map((c) => {
    const kps = c.members.map((m) => m.user?.kp ?? 0);
    const totalKp = kps.reduce((sum, kp) => sum + kp, 0);
    const memberCount = c.members.length;
    const averageKp = memberCount > 0 ? Math.round(totalKp / memberCount) : 0;
    return {
      id: c.id,
      name: c.name,
      tag: c.tag,
      imageUrl: c.imageUrl,
      memberCount,
      totalKp,
      averageKp,
    };
  });

  rows.sort((a, b) => (sortBy === 'average' ? b.averageKp - a.averageKp : b.totalKp - a.totalKp));

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function createClan(input: {
  name: string;
  tag: string;
  description?: string;
}): Promise<ClanDto> {
  const user = await requireSessionUser();
  const existing = await findClanForUser(user.id);
  if (existing) throw new Error('Leave your current clan before creating a new one');

  const name = input.name.trim();
  const tag = normalizeTag(input.tag);
  assertValidName(name);
  assertValidTag(tag);

  const tagClash = await prisma.clan.findUnique({ where: { tag } });
  if (tagClash) throw new Error('That clan tag is already taken');

  let inviteCode = randomClanCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await prisma.clan.findUnique({ where: { inviteCode } });
    if (!clash) break;
    inviteCode = randomClanCode();
  }

  const clan = await prisma.clan.create({
    data: {
      name,
      tag,
      description: (input.description ?? '').trim().slice(0, DESCRIPTION_MAX),
      inviteCode,
      ownerId: user.id,
      members: {
        create: { userId: user.id, role: 'owner' },
      },
    },
  });

  await processWebsiteAction(user.id, 'clan_joined').catch(() => {});
  return toDto(clan, user.id);
}

export async function updateClanProfile(input: {
  name?: string;
  description?: string;
  imageUrl?: string;
  bannerUrl?: string;
  isOpen?: boolean;
}): Promise<ClanDto> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);
  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  if (!clan) throw new Error('Clan not found');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    assertValidName(name);
    data.name = name;
  }
  if (input.description !== undefined) {
    data.description = input.description.trim().slice(0, DESCRIPTION_MAX);
  }
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl.trim();
  if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl.trim();
  if (input.isOpen !== undefined) data.isOpen = input.isOpen;

  const updated = await prisma.clan.update({ where: { id: clan.id }, data });
  return toDto(updated, user.id);
}

export async function regenerateInviteCode(): Promise<{ inviteCode: string }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);

  let inviteCode = randomClanCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await prisma.clan.findUnique({ where: { inviteCode } });
    if (!clash) break;
    inviteCode = randomClanCode();
  }

  await prisma.clan.update({
    where: { id: membership.clanId },
    data: { inviteCode },
  });
  return { inviteCode };
}

/** Direct invite to a hub friend — requires an accepted friendship, mirrors inviteFriendToParty. */
export async function inviteToClan(friendUserId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);
  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  if (!clan) throw new Error('Clan not found');

  const target = await prisma.user.findUnique({
    where: { id: friendUserId },
    select: { id: true, username: true, isBanned: true },
  });
  if (!target || target.isBanned) throw new Error('Player not found');

  const alreadyInClan = await prisma.clanMember.findUnique({ where: { userId: friendUserId } });
  if (alreadyInClan) throw new Error('That player is already in a clan');

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { userAId: user.id, userBId: friendUserId },
        { userAId: friendUserId, userBId: user.id },
      ],
    },
  });
  if (!friendship) throw new Error('Not friends with that player');

  await notifyUser({
    userId: friendUserId,
    title: 'Clan invite',
    body: `${user.username} invited you to join ${clan.name} [${clan.tag}]. Use invite code ${clan.inviteCode} to join, or accept from Notifications.`,
    type: 'clan_invite',
    dedupeKey: `clan_invite:${clan.id}:${friendUserId}`,
  });
  return { ok: true };
}

export async function requestToJoinClan(
  rawCode: string
): Promise<{ status: 'joined' | 'requested'; clan: ClanDto }> {
  const user = await requireSessionUser();
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4) throw new Error('Invalid invite code');

  const existing = await findClanForUser(user.id);
  if (existing) throw new Error('Leave your current clan before joining another');

  const clan = await prisma.clan.findUnique({ where: { inviteCode: code } });
  if (!clan) throw new Error('Invite code not found');

  if (clan.isOpen) {
    await prisma.clanMember.create({
      data: { clanId: clan.id, userId: user.id, role: 'member' },
    });
    await notifyClanManagers(clan.id, {
      title: 'New clan member',
      body: `${user.username} joined ${clan.name} [${clan.tag}].`,
      type: 'clan_member_joined',
    });
    await processWebsiteAction(user.id, 'clan_joined').catch(() => {});
    const dto = await toDto(clan, user.id);
    return { status: 'joined', clan: dto };
  }

  const existingRequest = await prisma.clanJoinRequest.findUnique({
    where: { clanId_userId: { clanId: clan.id, userId: user.id } },
  });
  if (!existingRequest) {
    await prisma.clanJoinRequest.create({
      data: { clanId: clan.id, userId: user.id, status: 'pending' },
    });
  } else if (existingRequest.status !== 'pending') {
    await prisma.clanJoinRequest.update({
      where: { id: existingRequest.id },
      data: { status: 'pending' },
    });
  }
  await notifyClanManagers(clan.id, {
    title: 'Clan join request',
    body: `${user.username} wants to join ${clan.name} [${clan.tag}]. Review it on your clan page.`,
    type: 'clan_join_request',
    dedupeKey: `clan_join_request:${clan.id}:${user.id}`,
  });
  const dto = await toDto(clan);
  return { status: 'requested', clan: dto };
}

export async function getJoinRequests(): Promise<ClanJoinRequestDto[]> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);

  const requests = await prisma.clanJoinRequest.findMany({
    where: { clanId: membership.clanId, status: 'pending' },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return requests
    .filter((r) => !!r.user)
    .map((r) => ({
      id: r.id,
      userId: r.user.id,
      username: r.user.username,
      avatarUrl: r.user.avatarUrl,
      createdAt: r.createdAt.toISOString(),
    }));
}

export async function respondToJoinRequest(
  requestId: string,
  accept: boolean
): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);

  const request = await prisma.clanJoinRequest.findUnique({ where: { id: requestId } });
  if (!request || request.clanId !== membership.clanId) {
    throw new Error('Join request not found');
  }
  const clan = await prisma.clan.findUnique({ where: { id: request.clanId } });

  if (accept) {
    const alreadyInClan = await prisma.clanMember.findUnique({ where: { userId: request.userId } });
    if (!alreadyInClan) {
      await prisma.clanMember.create({
        data: { clanId: request.clanId, userId: request.userId, role: 'member' },
      });
    }
    await prisma.clanJoinRequest.update({
      where: { id: request.id },
      data: { status: 'accepted' },
    });
    await notifyUser({
      userId: request.userId,
      title: 'Clan request accepted',
      body: clan ? `You're now a member of ${clan.name} [${clan.tag}].` : 'You joined the clan.',
      type: 'clan_join_accepted',
      dedupeKey: `clan_join_accepted:${request.clanId}:${request.userId}`,
    });
    await processWebsiteAction(request.userId, 'clan_joined').catch(() => {});
  } else {
    await prisma.clanJoinRequest.update({
      where: { id: request.id },
      data: { status: 'declined' },
    });
    await notifyUser({
      userId: request.userId,
      title: 'Clan request declined',
      body: clan ? `Your request to join ${clan.name} [${clan.tag}] was declined.` : 'Your join request was declined.',
      type: 'clan_join_declined',
      dedupeKey: `clan_join_declined:${request.clanId}:${request.userId}`,
    });
  }
  return { ok: true };
}

async function disbandIfEmpty(clanId: string) {
  const remaining = await prisma.clanMember.count({ where: { clanId } });
  if (remaining === 0) {
    await prisma.clanJoinRequest.deleteMany({ where: { clanId } });
    await prisma.clan.delete({ where: { id: clanId } });
  }
}

export async function leaveClan(): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await prisma.clanMember.findUnique({ where: { userId: user.id } });
  if (!membership) return { ok: true };

  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  await prisma.clanMember.delete({ where: { userId: user.id } });

  if (clan && clan.ownerId === user.id) {
    const nextOwner = await prisma.clanMember.findFirst({
      where: { clanId: clan.id },
      orderBy: { joinedAt: 'asc' },
    });
    if (nextOwner) {
      await prisma.clanMember.update({
        where: { id: nextOwner.id },
        data: { role: 'owner' },
      });
      await prisma.clan.update({
        where: { id: clan.id },
        data: { ownerId: nextOwner.userId },
      });
    }
  }

  await disbandIfEmpty(membership.clanId);
  return { ok: true };
}

export async function kickMember(userId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner', 'officer']);
  if (userId === user.id) throw new Error('Use "Leave clan" to remove yourself');

  const target = await prisma.clanMember.findUnique({ where: { userId } });
  if (!target || target.clanId !== membership.clanId) throw new Error('Member not found');
  if (target.role === 'owner') throw new Error('Cannot kick the owner');
  if (target.role === 'officer' && membership.role !== 'owner') {
    throw new Error('Only the owner can remove officers');
  }

  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  await prisma.clanMember.delete({ where: { userId } });
  await notifyUser({
    userId,
    title: 'Removed from clan',
    body: clan ? `You were removed from ${clan.name} [${clan.tag}].` : 'You were removed from your clan.',
    type: 'clan_kicked',
  });
  return { ok: true };
}

export async function promoteMember(userId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner']);
  const target = await prisma.clanMember.findUnique({ where: { userId } });
  if (!target || target.clanId !== membership.clanId) throw new Error('Member not found');
  if (target.role !== 'member') throw new Error('Member is already an officer or owner');

  await prisma.clanMember.update({ where: { userId }, data: { role: 'officer' } });
  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  await notifyUser({
    userId,
    title: 'Promoted to officer',
    body: clan ? `You're now an officer of ${clan.name} [${clan.tag}].` : 'You were promoted to officer.',
    type: 'clan_promoted',
  });
  return { ok: true };
}

export async function demoteMember(userId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner']);
  const target = await prisma.clanMember.findUnique({ where: { userId } });
  if (!target || target.clanId !== membership.clanId) throw new Error('Member not found');
  if (target.role !== 'officer') throw new Error('Member is not an officer');

  await prisma.clanMember.update({ where: { userId }, data: { role: 'member' } });
  const clan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  await notifyUser({
    userId,
    title: 'Demoted to member',
    body: clan ? `You're now a member of ${clan.name} [${clan.tag}].` : 'You were demoted to member.',
    type: 'clan_demoted',
  });
  return { ok: true };
}

export async function transferOwnership(userId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner']);
  const target = await prisma.clanMember.findUnique({ where: { userId } });
  if (!target || target.clanId !== membership.clanId) throw new Error('Member not found');

  await prisma.clanMember.update({ where: { userId: user.id }, data: { role: 'officer' } });
  await prisma.clanMember.update({ where: { userId }, data: { role: 'owner' } });
  await prisma.clan.update({
    where: { id: membership.clanId },
    data: { ownerId: userId },
  });
  return { ok: true };
}

export async function deleteClan(): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireMembership(user.id, ['owner']);

  await prisma.clanJoinRequest.deleteMany({ where: { clanId: membership.clanId } });
  await prisma.clanMember.deleteMany({ where: { clanId: membership.clanId } });
  await prisma.clan.delete({ where: { id: membership.clanId } });
  return { ok: true };
}
