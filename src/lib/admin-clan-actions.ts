'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin, isAdminRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/audit';
import type { ClanDto, ClanMemberPublic, ClanRole } from '@/lib/clan-actions';

async function requireStaff() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user || user.isBanned || !canAccessAdmin(user.role)) {
    throw new Error('Staff only');
  }
  return user;
}

async function requireAdmin() {
  const user = await requireStaff();
  if (!isAdminRole(user.role)) throw new Error('Admin only');
  return user;
}

export type AdminClanRow = {
  id: string;
  name: string;
  tag: string;
  imageUrl: string;
  ownerId: string;
  ownerUsername: string;
  memberCount: number;
  totalKp: number;
  isOpen: boolean;
  createdAt: string;
};

export async function adminListClans(input?: {
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AdminClanRow[]; totalPages: number }> {
  await requireStaff();
  const page = Math.max(1, input?.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, input?.pageSize ?? 20));
  const query = (input?.query ?? '').trim();

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { tag: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [clans, total] = await Promise.all([
    prisma.clan.findMany({
      where,
      include: { members: { include: { user: { select: { kp: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.clan.count({ where }),
  ]);

  const ownerIds = [...new Set(clans.map((c) => c.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, username: true },
  });
  const ownerById = new Map(owners.map((o) => [o.id, o.username]));

  const rows: AdminClanRow[] = clans.map((c) => ({
    id: c.id,
    name: c.name,
    tag: c.tag,
    imageUrl: c.imageUrl,
    ownerId: c.ownerId,
    ownerUsername: ownerById.get(c.ownerId) ?? 'Unknown',
    memberCount: c.members.length,
    totalKp: c.members.reduce((sum, m) => sum + (m.user?.kp ?? 0), 0),
    isOpen: c.isOpen,
    createdAt: c.createdAt.toISOString(),
  }));

  return { rows, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function adminGetClan(clanId: string): Promise<ClanDto> {
  await requireStaff();
  const clan = await prisma.clan.findUnique({ where: { id: clanId } });
  if (!clan) throw new Error('Clan not found');

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    include: { user: { select: { id: true, username: true, avatarUrl: true, kp: true } } },
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
  const totalWins = await prisma.matchResult.count({
    where: { userId: { in: memberDtos.map((m) => m.id) }, outcome: 'win' },
  });

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
    averageKp: memberDtos.length > 0 ? Math.round(totalKp / memberDtos.length) : 0,
    totalWins,
    warWins: clan.warWins,
    warLosses: clan.warLosses,
    warDraws: clan.warDraws,
    viewerRole: null,
  };
}

export async function adminKickClanMember(clanId: string, userId: string): Promise<{ ok: true }> {
  await requireStaff();
  const target = await prisma.clanMember.findUnique({ where: { userId } });
  if (!target || target.clanId !== clanId) throw new Error('Member not found');

  await prisma.clanMember.delete({ where: { userId } });
  await prisma.notification.create({
    data: {
      userId,
      title: 'Removed from clan',
      body: 'A staff member removed you from your clan.',
      type: 'clan_kicked',
    },
  });
  await writeAuditLog({
    action: 'admin_clan_kick_member',
    targetUserId: userId,
    detail: `clanId=${clanId}`,
  }).catch(() => {});

  const remaining = await prisma.clanMember.count({ where: { clanId } });
  if (remaining === 0) {
    await prisma.clanJoinRequest.deleteMany({ where: { clanId } });
    await prisma.clan.delete({ where: { id: clanId } });
  }
  return { ok: true };
}

export async function adminTransferClanOwnership(
  clanId: string,
  newOwnerId: string
): Promise<{ ok: true }> {
  await requireStaff();
  const clan = await prisma.clan.findUnique({ where: { id: clanId } });
  if (!clan) throw new Error('Clan not found');
  const target = await prisma.clanMember.findUnique({ where: { userId: newOwnerId } });
  if (!target || target.clanId !== clanId) throw new Error('Member not found in this clan');

  const currentOwnerMember = await prisma.clanMember.findUnique({ where: { userId: clan.ownerId } });
  if (currentOwnerMember) {
    await prisma.clanMember.update({
      where: { userId: clan.ownerId },
      data: { role: 'officer' },
    });
  }
  await prisma.clanMember.update({ where: { userId: newOwnerId }, data: { role: 'owner' } });
  await prisma.clan.update({ where: { id: clanId }, data: { ownerId: newOwnerId } });

  await writeAuditLog({
    action: 'admin_clan_transfer_ownership',
    targetUserId: newOwnerId,
    detail: `clanId=${clanId}`,
  }).catch(() => {});
  return { ok: true };
}

export async function adminUpdateClanProfile(
  clanId: string,
  input: { name?: string; tag?: string; description?: string; imageUrl?: string; bannerUrl?: string }
): Promise<{ ok: true }> {
  await requireStaff();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim().slice(0, 32);
  if (input.tag !== undefined) data.tag = input.tag.trim().toUpperCase().slice(0, 5);
  if (input.description !== undefined) data.description = input.description.trim().slice(0, 280);
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl.trim();
  if (input.bannerUrl !== undefined) data.bannerUrl = input.bannerUrl.trim();

  await prisma.clan.update({ where: { id: clanId }, data });
  await writeAuditLog({
    action: 'admin_clan_update_profile',
    detail: `clanId=${clanId} ${JSON.stringify(input)}`,
  }).catch(() => {});
  return { ok: true };
}

export async function adminSetClanOpen(clanId: string, isOpen: boolean): Promise<{ ok: true }> {
  await requireStaff();
  await prisma.clan.update({ where: { id: clanId }, data: { isOpen } });
  await writeAuditLog({
    action: 'admin_clan_set_open',
    detail: `clanId=${clanId} isOpen=${isOpen}`,
  }).catch(() => {});
  return { ok: true };
}

export async function adminRegenerateClanInviteCode(clanId: string): Promise<{ inviteCode: string }> {
  await requireStaff();
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomCode = () =>
    Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

  let inviteCode = randomCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await prisma.clan.findUnique({ where: { inviteCode } });
    if (!clash) break;
    inviteCode = randomCode();
  }
  await prisma.clan.update({ where: { id: clanId }, data: { inviteCode } });
  await writeAuditLog({
    action: 'admin_clan_regenerate_invite',
    detail: `clanId=${clanId}`,
  }).catch(() => {});
  return { inviteCode };
}

/** Full admin only — permanently deletes a clan and all memberships/requests. */
export async function adminDisbandClan(clanId: string): Promise<{ ok: true }> {
  await requireAdmin();
  const clan = await prisma.clan.findUnique({ where: { id: clanId } });
  if (!clan) throw new Error('Clan not found');

  const members = await prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
  await prisma.notification.createMany({
    data: members.map((m) => ({
      userId: m.userId,
      title: 'Clan disbanded',
      body: `${clan.name} [${clan.tag}] was disbanded by staff.`,
      type: 'clan_disbanded',
    })),
  });

  await prisma.clanJoinRequest.deleteMany({ where: { clanId } });
  await prisma.clanMember.deleteMany({ where: { clanId } });
  await prisma.clan.delete({ where: { id: clanId } });

  await writeAuditLog({
    action: 'admin_clan_disband',
    detail: `clanId=${clanId} name=${clan.name} tag=${clan.tag}`,
  }).catch(() => {});
  return { ok: true };
}
