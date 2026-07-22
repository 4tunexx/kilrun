'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const PARTY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PARTY_SIZE = 4;

export type PartyMemberPublic = {
  id: string;
  username: string;
  avatarUrl: string;
};

export type PartyDto = {
  id: string;
  code: string;
  leaderId: string;
  memberIds: string[];
  mode: string | null;
  activeRoomId: string | null;
  members: PartyMemberPublic[];
  isLeader: boolean;
  updatedAt: string;
};

async function requireSessionUser() {
  const session = await auth();
  const steamId = (session?.user as { steamId?: string } | undefined)?.steamId;
  if (!steamId) throw new Error('Not authenticated');
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) throw new Error('User not found');
  if (user.isBanned) throw new Error('Account banned');
  return user;
}

function randomPartyCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += PARTY_CODE_CHARS[Math.floor(Math.random() * PARTY_CODE_CHARS.length)];
  }
  return out;
}

async function loadMembers(memberIds: string[]): Promise<PartyMemberPublic[]> {
  if (memberIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return memberIds
    .map((id) => byId.get(id))
    .filter((u): u is PartyMemberPublic => !!u);
}

async function toDto(
  party: {
    id: string;
    code: string;
    leaderId: string;
    memberIds: string[];
    mode: string | null;
    activeRoomId: string | null;
    updatedAt: Date;
  },
  viewerId: string
): Promise<PartyDto> {
  const members = await loadMembers(party.memberIds);
  return {
    id: party.id,
    code: party.code,
    leaderId: party.leaderId,
    memberIds: party.memberIds,
    mode: party.mode,
    activeRoomId: party.activeRoomId,
    members,
    isLeader: party.leaderId === viewerId,
    updatedAt: party.updatedAt.toISOString(),
  };
}

async function findPartyForUser(userId: string) {
  return prisma.party.findFirst({
    where: { memberIds: { has: userId } },
  });
}

export async function getMyParty(): Promise<PartyDto | null> {
  const user = await requireSessionUser();
  const party = await findPartyForUser(user.id);
  if (!party) return null;
  return toDto(party, user.id);
}

export async function createParty(): Promise<PartyDto> {
  const user = await requireSessionUser();
  const existing = await findPartyForUser(user.id);
  if (existing) return toDto(existing, user.id);

  let code = randomPartyCode();
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await prisma.party.findUnique({ where: { code } });
    if (!clash) break;
    code = randomPartyCode();
  }

  const party = await prisma.party.create({
    data: {
      code,
      leaderId: user.id,
      memberIds: [user.id],
    },
  });
  return toDto(party, user.id);
}

export async function joinPartyByCode(rawCode: string): Promise<PartyDto> {
  const user = await requireSessionUser();
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4) throw new Error('Invalid invite code');

  const current = await findPartyForUser(user.id);
  if (current) {
    if (current.code === code) return toDto(current, user.id);
    throw new Error('Leave your current party before joining another');
  }

  const party = await prisma.party.findUnique({ where: { code } });
  if (!party) throw new Error('Party not found');
  if (party.memberIds.length >= MAX_PARTY_SIZE) throw new Error('Party is full');
  if (party.memberIds.includes(user.id)) return toDto(party, user.id);

  const updated = await prisma.party.update({
    where: { id: party.id },
    data: {
      memberIds: [...party.memberIds, user.id],
      activeRoomId: null,
    },
  });
  return toDto(updated, user.id);
}

export async function leaveParty(): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const party = await findPartyForUser(user.id);
  if (!party) return { ok: true };

  const remaining = party.memberIds.filter((id) => id !== user.id);
  if (remaining.length === 0) {
    await prisma.party.delete({ where: { id: party.id } });
    return { ok: true };
  }

  const nextLeader =
    party.leaderId === user.id ? remaining[0] : party.leaderId;
  await prisma.party.update({
    where: { id: party.id },
    data: {
      memberIds: remaining,
      leaderId: nextLeader,
      activeRoomId: null,
      mode: null,
    },
  });
  return { ok: true };
}

export async function kickPartyMember(memberId: string): Promise<PartyDto> {
  const user = await requireSessionUser();
  const party = await findPartyForUser(user.id);
  if (!party) throw new Error('Not in a party');
  if (party.leaderId !== user.id) throw new Error('Only the leader can kick');
  if (memberId === user.id) throw new Error('Cannot kick yourself');
  if (!party.memberIds.includes(memberId)) throw new Error('Member not in party');

  const remaining = party.memberIds.filter((id) => id !== memberId);
  const updated = await prisma.party.update({
    where: { id: party.id },
    data: {
      memberIds: remaining,
      activeRoomId: null,
    },
  });
  return toDto(updated, user.id);
}

export async function setPartyMode(mode: string | null): Promise<PartyDto> {
  const user = await requireSessionUser();
  const party = await findPartyForUser(user.id);
  if (!party) throw new Error('Not in a party');
  if (party.leaderId !== user.id) throw new Error('Only the leader can set mode');

  const updated = await prisma.party.update({
    where: { id: party.id },
    data: {
      mode: mode && mode.trim() ? mode.trim() : null,
      activeRoomId: null,
    },
  });
  return toDto(updated, user.id);
}

export async function setPartyQueueRoom(
  partyId: string,
  roomId: string
): Promise<PartyDto> {
  const user = await requireSessionUser();
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) throw new Error('Party not found');
  if (party.leaderId !== user.id) throw new Error('Only the leader can set the queue room');
  if (!party.memberIds.includes(user.id)) throw new Error('Not in party');

  const updated = await prisma.party.update({
    where: { id: party.id },
    data: { activeRoomId: roomId.trim() || null },
  });
  return toDto(updated, user.id);
}

export async function clearPartyQueueRoom(): Promise<PartyDto | null> {
  const user = await requireSessionUser();
  const party = await findPartyForUser(user.id);
  if (!party) return null;
  if (party.leaderId !== user.id) return toDto(party, user.id);

  const updated = await prisma.party.update({
    where: { id: party.id },
    data: { activeRoomId: null, mode: null },
  });
  return toDto(updated, user.id);
}

export async function inviteFriendToParty(friendUserId: string): Promise<{
  ok: true;
  code: string;
}> {
  const user = await requireSessionUser();
  let party = await findPartyForUser(user.id);
  if (!party) {
    const created = await createParty();
    party = await prisma.party.findUnique({ where: { id: created.id } });
    if (!party) throw new Error('Failed to create party');
  }
  if (party.leaderId !== user.id && !party.memberIds.includes(user.id)) {
    throw new Error('Not in party');
  }

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

  await prisma.notification.create({
    data: {
      userId: friendUserId,
      title: 'Party invite',
      body: `${user.username} invited you to party ${party.code}. Join with the code on Play.`,
      type: 'party_invite',
      dedupeKey: `party_invite:${party.id}:${friendUserId}:${Date.now()}`,
    },
  });

  return { ok: true, code: party.code };
}
