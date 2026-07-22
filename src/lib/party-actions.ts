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
  if (!party.memberIds.includes(user.id)) {
    throw new Error('Not in party');
  }
  if (party.memberIds.includes(friendUserId)) {
    return { ok: true, code: party.code };
  }
  if (party.memberIds.length >= MAX_PARTY_SIZE) {
    throw new Error('Party is full');
  }

  const target = await prisma.user.findUnique({
    where: { id: friendUserId },
    select: { id: true, steamId: true, username: true, isBanned: true },
  });
  if (!target || target.isBanned) throw new Error('Player not found');

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { userAId: user.id, userBId: friendUserId },
        { userAId: friendUserId, userBId: user.id },
      ],
    },
  });

  // Allow invite if hub friends OR Steam friends (when friend list is public).
  let steamFriendOk = false;
  if (!friendship && target.steamId && user.steamId) {
    try {
      const steam = await fetchSteamFriendSteamIds(user.steamId);
      steamFriendOk = steam.ids.has(target.steamId);
    } catch {
      steamFriendOk = false;
    }
  }
  if (!friendship && !steamFriendOk) {
    throw new Error('Not friends with that player');
  }

  const existingInvite = await prisma.notification.findFirst({
    where: {
      userId: friendUserId,
      type: 'party_invite',
      dedupeKey: `party_invite:${party.id}:${friendUserId}`,
    },
  });
  if (!existingInvite) {
    await prisma.notification.create({
      data: {
        userId: friendUserId,
        title: 'Party invite',
        body: `${user.username} invited you to party ${party.code}. Open Play → Party and join, or Accept from Notifications.`,
        type: 'party_invite',
        dedupeKey: `party_invite:${party.id}:${friendUserId}`,
      },
    });
  } else if (existingInvite.isRead) {
    await prisma.notification.update({
      where: { id: existingInvite.id },
      data: {
        isRead: false,
        body: `${user.username} invited you to party ${party.code}. Open Play → Party and join, or Accept from Notifications.`,
        title: 'Party invite',
      },
    });
  }

  return { ok: true, code: party.code };
}

/** Steam friends who also have a Kilrun account (for party invites). */
export type SteamPartyInviteRow = {
  id: string;
  steamId: string;
  username: string;
  avatarUrl: string;
  source: 'steam' | 'hub' | 'both';
  online?: boolean;
};

async function fetchSteamFriendSteamIds(steamId: string): Promise<{
  ids: Set<string>;
  /** true when Steam refused the list (usually private friends) */
  privateOrDenied: boolean;
  /** true when STEAM_API_KEY is missing */
  noApiKey: boolean;
}> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    return { ids: new Set(), privateOrDenied: false, noApiKey: true };
  }

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&relationship=friend`,
      { cache: 'no-store' }
    );
    if (!res.ok) {
      return { ids: new Set(), privateOrDenied: true, noApiKey: false };
    }
    const json = (await res.json()) as {
      friendslist?: { friends?: Array<{ steamid?: string }> };
    };
    const ids = new Set<string>();
    for (const f of json.friendslist?.friends ?? []) {
      if (f.steamid) ids.add(f.steamid);
    }
    return { ids, privateOrDenied: false, noApiKey: false };
  } catch {
    return { ids: new Set(), privateOrDenied: true, noApiKey: false };
  }
}

/**
 * Invite candidates: Steam friends on Kilrun + hub friends, merged.
 * Steam list requires public friends + STEAM_API_KEY.
 */
export async function getPartyInviteCandidates(): Promise<{
  rows: SteamPartyInviteRow[];
  steamFriendsAvailable: boolean;
  steamFriendsPrivate: boolean;
  noSteamApiKey: boolean;
  /** Total Steam friends returned by the API (may include people not on Kilrun). */
  totalSteamFriends: number;
  /** Subset of Steam friends who have a Kilrun account. */
  onKilrunSteamFriends: number;
}> {
  const user = await requireSessionUser();

  const hubFriends = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: {
        select: { id: true, steamId: true, username: true, avatarUrl: true },
      },
      userB: {
        select: { id: true, steamId: true, username: true, avatarUrl: true },
      },
    },
  });

  const byId = new Map<string, SteamPartyInviteRow>();
  for (const f of hubFriends) {
    const other = f.userAId === user.id ? f.userB : f.userA;
    byId.set(other.id, {
      id: other.id,
      steamId: other.steamId,
      username: other.username,
      avatarUrl: other.avatarUrl,
      source: 'hub',
    });
  }

  const steam = await fetchSteamFriendSteamIds(user.steamId);
  let steamFriendsAvailable = false;
  let steamFriendsPrivate = steam.privateOrDenied;
  const noSteamApiKey = steam.noApiKey;

  if (!steam.noApiKey && !steam.privateOrDenied) {
    steamFriendsAvailable = true;
    steamFriendsPrivate = false;
    if (steam.ids.size > 0) {
      const kilrunUsers = await prisma.user.findMany({
        where: { steamId: { in: [...steam.ids] }, isBanned: false },
        select: {
          id: true,
          steamId: true,
          username: true,
          avatarUrl: true,
        },
      });
      for (const u of kilrunUsers) {
        if (u.id === user.id) continue;
        const prev = byId.get(u.id);
        if (prev) {
          prev.source = 'both';
        } else {
          byId.set(u.id, {
            id: u.id,
            steamId: u.steamId,
            username: u.username,
            avatarUrl: u.avatarUrl,
            source: 'steam',
          });
        }
      }
    }
  }

  const rows = [...byId.values()].sort((a, b) =>
    a.username.localeCompare(b.username)
  );
  const onKilrunSteam = rows.filter(
    (r) => r.source === 'steam' || r.source === 'both'
  ).length;
  return {
    rows,
    steamFriendsAvailable,
    steamFriendsPrivate,
    noSteamApiKey,
    totalSteamFriends: steam.ids.size,
    onKilrunSteamFriends: onKilrunSteam,
  };
}

/** One-tap join from a party invite notification. */
export async function acceptPartyInvite(code: string): Promise<PartyDto> {
  const user = await requireSessionUser();
  const party = await joinPartyByCode(code);
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      type: 'party_invite',
      isRead: false,
    },
    data: { isRead: true },
  });
  return party;
}
