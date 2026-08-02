'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { processWebsiteAction } from '@/lib/progression-actions';

const MAX_LOBBY_SIZE = 3; // matches CompetitiveRoom's default maxPlayersPerTeam

/** Clan Wars only ever runs Competitive Casual — never Ranked/KP/Premium. */
export type ClanWarQueue = 'casual';

export type ClanLobbyMemberPublic = {
  id: string;
  username: string;
  avatarUrl: string;
};

export type ClanLobbyDto = {
  id: string;
  clanId: string;
  clanName: string;
  clanTag: string;
  leaderId: string;
  memberIds: string[];
  members: ClanLobbyMemberPublic[];
  queue: ClanWarQueue;
  status: string;
  opponentLobbyId: string | null;
  activeRoomId: string | null;
  isLeader: boolean;
  updatedAt: string;
};

export type ClanWarChallengeDto = {
  id: string;
  challengerLobbyId: string;
  challengerClanId: string;
  challengerClanName: string;
  challengerClanTag: string;
  targetClanId: string;
  queue: ClanWarQueue;
  status: string;
  createdAt: string;
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

async function requireClanMembership(userId: string) {
  const membership = await prisma.clanMember.findUnique({ where: { userId } });
  if (!membership) throw new Error('You must be in a clan to use Clan Wars');
  return membership;
}

async function loadMembers(memberIds: string[]): Promise<ClanLobbyMemberPublic[]> {
  if (memberIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return memberIds.map((id) => byId.get(id)).filter((u): u is ClanLobbyMemberPublic => !!u);
}

async function toDto(
  lobby: {
    id: string;
    clanId: string;
    leaderId: string;
    memberIds: string[];
    queue: string;
    status: string;
    opponentLobbyId: string | null;
    activeRoomId: string | null;
    updatedAt: Date;
  },
  viewerId: string
): Promise<ClanLobbyDto> {
  const clan = await prisma.clan.findUnique({ where: { id: lobby.clanId } });
  const members = await loadMembers(lobby.memberIds);
  return {
    id: lobby.id,
    clanId: lobby.clanId,
    clanName: clan?.name ?? 'Unknown clan',
    clanTag: clan?.tag ?? '???',
    leaderId: lobby.leaderId,
    memberIds: lobby.memberIds,
    members,
    queue: (lobby.queue as ClanWarQueue) ?? 'casual',
    status: lobby.status,
    opponentLobbyId: lobby.opponentLobbyId,
    activeRoomId: lobby.activeRoomId,
    isLeader: lobby.leaderId === viewerId,
    updatedAt: lobby.updatedAt.toISOString(),
  };
}

async function findOpenLobbyForClan(clanId: string) {
  return prisma.clanLobby.findFirst({
    where: { clanId, status: { in: ['open', 'challenging', 'matched'] } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getMyClanLobby(): Promise<ClanLobbyDto | null> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  const lobby = await prisma.clanLobby.findFirst({
    where: { clanId: membership.clanId, memberIds: { has: user.id }, status: { in: ['open', 'challenging', 'matched'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!lobby) return null;
  return toDto(lobby, user.id);
}

export async function createClanLobby(queue: ClanWarQueue = 'casual'): Promise<ClanLobbyDto> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);

  const existing = await findOpenLobbyForClan(membership.clanId);
  if (existing) {
    if (!existing.memberIds.includes(user.id)) {
      const updated = await prisma.clanLobby.update({
        where: { id: existing.id },
        data: { memberIds: [...existing.memberIds, user.id] },
      });
      return toDto(updated, user.id);
    }
    return toDto(existing, user.id);
  }

  const lobby = await prisma.clanLobby.create({
    data: {
      clanId: membership.clanId,
      leaderId: user.id,
      memberIds: [user.id],
      queue,
    },
  });
  return toDto(lobby, user.id);
}

export async function joinClanLobby(): Promise<ClanLobbyDto> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  const lobby = await findOpenLobbyForClan(membership.clanId);
  if (!lobby) throw new Error('Your clan has no open lobby — create one first');
  if (lobby.memberIds.includes(user.id)) return toDto(lobby, user.id);
  if (lobby.memberIds.length >= MAX_LOBBY_SIZE) throw new Error('Clan lobby is full');
  if (lobby.status !== 'open') throw new Error('This lobby already has a match starting');

  const updated = await prisma.clanLobby.update({
    where: { id: lobby.id },
    data: { memberIds: [...lobby.memberIds, user.id] },
  });
  return toDto(updated, user.id);
}

export async function leaveClanLobby(): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  const lobby = await findOpenLobbyForClan(membership.clanId);
  if (!lobby || !lobby.memberIds.includes(user.id)) return { ok: true };

  const remaining = lobby.memberIds.filter((id) => id !== user.id);
  if (remaining.length === 0) {
    await prisma.clanLobby.delete({ where: { id: lobby.id } });
    return { ok: true };
  }
  const nextLeader = lobby.leaderId === user.id ? remaining[0] : lobby.leaderId;
  await prisma.clanLobby.update({
    where: { id: lobby.id },
    data: { memberIds: remaining, leaderId: nextLeader },
  });
  return { ok: true };
}

/** Direct challenge to another clan (v1 — no open browse list yet). */
export async function challengeClan(targetClanId: string): Promise<ClanWarChallengeDto> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  if (membership.clanId === targetClanId) throw new Error("You can't challenge your own clan");

  const lobby = await findOpenLobbyForClan(membership.clanId);
  if (!lobby) throw new Error('Create a clan lobby first');
  if (lobby.leaderId !== user.id) throw new Error('Only the lobby leader can send a challenge');
  if (lobby.memberIds.length < 1) throw new Error('Your lobby needs at least one member');

  const targetClan = await prisma.clan.findUnique({ where: { id: targetClanId } });
  if (!targetClan) throw new Error('Target clan not found');
  const challengerClan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  if (!challengerClan) throw new Error('Clan not found');

  const challenge = await prisma.clanWarChallenge.create({
    data: {
      challengerLobbyId: lobby.id,
      challengerClanId: membership.clanId,
      targetClanId,
      queue: lobby.queue,
      status: 'pending',
    },
  });
  await prisma.clanLobby.update({ where: { id: lobby.id }, data: { status: 'challenging' } });

  const targetManagers = await prisma.clanMember.findMany({
    where: { clanId: targetClanId, role: { in: ['owner', 'officer'] } },
    select: { userId: true },
  });
  await prisma.notification.createMany({
    data: targetManagers.map((m) => ({
      userId: m.userId,
      title: 'Clan war challenge',
      body: `${challengerClan.name} [${challengerClan.tag}] challenged your clan to a ${lobby.queue} match. Open your Clans page to respond.`,
      type: 'clan_war_challenge',
      dedupeKey: `clan_war_challenge:${challenge.id}`,
    })),
  }).catch(() => {});

  return {
    id: challenge.id,
    challengerLobbyId: lobby.id,
    challengerClanId: membership.clanId,
    challengerClanName: challengerClan.name,
    challengerClanTag: challengerClan.tag,
    targetClanId,
    queue: lobby.queue as ClanWarQueue,
    status: challenge.status,
    createdAt: challenge.createdAt.toISOString(),
  };
}

export async function getIncomingChallenges(): Promise<ClanWarChallengeDto[]> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  if (!['owner', 'officer'].includes(membership.role)) return [];

  const rows = await prisma.clanWarChallenge.findMany({
    where: { targetClanId: membership.clanId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  const clanIds = [...new Set(rows.map((r) => r.challengerClanId))];
  const clans = await prisma.clan.findMany({ where: { id: { in: clanIds } } });
  const clanById = new Map(clans.map((c) => [c.id, c]));

  return rows.map((r) => {
    const clan = clanById.get(r.challengerClanId);
    return {
      id: r.id,
      challengerLobbyId: r.challengerLobbyId,
      challengerClanId: r.challengerClanId,
      challengerClanName: clan?.name ?? 'Unknown clan',
      challengerClanTag: clan?.tag ?? '???',
      targetClanId: r.targetClanId,
      queue: r.queue as ClanWarQueue,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Accept a challenge — creates/updates our own lobby and cross-links both. */
export async function acceptChallenge(challengeId: string): Promise<ClanLobbyDto> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  if (!['owner', 'officer'].includes(membership.role)) {
    throw new Error('Only the owner or officers can accept a challenge');
  }

  const challenge = await prisma.clanWarChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.targetClanId !== membership.clanId || challenge.status !== 'pending') {
    throw new Error('Challenge no longer available');
  }

  let myLobby = await findOpenLobbyForClan(membership.clanId);
  if (!myLobby) {
    myLobby = await prisma.clanLobby.create({
      data: {
        clanId: membership.clanId,
        leaderId: user.id,
        memberIds: [user.id],
        queue: challenge.queue,
      },
    });
  }

  await prisma.clanWarChallenge.update({ where: { id: challenge.id }, data: { status: 'accepted' } });
  await prisma.clanLobby.update({
    where: { id: myLobby.id },
    data: { status: 'matched', opponentLobbyId: challenge.challengerLobbyId },
  });
  await prisma.clanLobby.update({
    where: { id: challenge.challengerLobbyId },
    data: { status: 'matched', opponentLobbyId: myLobby.id },
  });

  const myClan = await prisma.clan.findUnique({ where: { id: membership.clanId } });
  const challengerLobby = await prisma.clanLobby.findUnique({ where: { id: challenge.challengerLobbyId } });
  if (challengerLobby) {
    await prisma.notification.createMany({
      data: challengerLobby.memberIds.map((uid) => ({
        userId: uid,
        title: 'Challenge accepted',
        body: `${myClan?.name ?? 'A clan'} accepted your clan war challenge. Ready up to queue.`,
        type: 'clan_war_accepted',
      })),
    }).catch(() => {});
  }

  const updated = await prisma.clanLobby.findUnique({ where: { id: myLobby.id } });
  return toDto(updated!, user.id);
}

export async function declineChallenge(challengeId: string): Promise<{ ok: true }> {
  const user = await requireSessionUser();
  const membership = await requireClanMembership(user.id);
  const challenge = await prisma.clanWarChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.targetClanId !== membership.clanId) return { ok: true };

  await prisma.clanWarChallenge.update({ where: { id: challenge.id }, data: { status: 'declined' } });
  await prisma.clanLobby.updateMany({
    where: { id: challenge.challengerLobbyId, status: 'challenging' },
    data: { status: 'open' },
  });

  const challengerLobby = await prisma.clanLobby.findUnique({ where: { id: challenge.challengerLobbyId } });
  if (challengerLobby) {
    await prisma.notification.createMany({
      data: challengerLobby.memberIds.map((uid) => ({
        userId: uid,
        title: 'Challenge declined',
        body: `Your clan war challenge was declined.`,
        type: 'clan_war_declined',
      })),
    }).catch(() => {});
  }
  return { ok: true };
}

/** Leader stamps the Colyseus room id once they've joined/created it — mirrors setPartyQueueRoom. */
export async function setClanLobbyQueueRoom(lobbyId: string, roomId: string): Promise<ClanLobbyDto> {
  const user = await requireSessionUser();
  const lobby = await prisma.clanLobby.findUnique({ where: { id: lobbyId } });
  if (!lobby) throw new Error('Lobby not found');
  if (lobby.leaderId !== user.id) throw new Error('Only the lobby leader can set the queue room');

  const updated = await prisma.clanLobby.update({
    where: { id: lobby.id },
    data: { activeRoomId: roomId.trim() || null },
  });

  // Mirror the room id onto the opponent lobby too, so their leader's client
  // (polling like a Party member) can join the same match.
  if (updated.opponentLobbyId) {
    await prisma.clanLobby.update({
      where: { id: updated.opponentLobbyId },
      data: { activeRoomId: updated.activeRoomId },
    });
  }
  return toDto(updated, user.id);
}

export async function clearClanLobbyAfterMatch(lobbyId: string): Promise<{ ok: true }> {
  await requireSessionUser();
  const lobby = await prisma.clanLobby.findUnique({ where: { id: lobbyId } });
  if (!lobby) return { ok: true };
  await prisma.clanLobby.update({
    where: { id: lobby.id },
    data: { status: 'closed', activeRoomId: null },
  });
  return { ok: true };
}

/**
 * Called by the match-result webhook (server-trusted context) after a
 * competitive match finishes, when the room was a clan war. Aggregates
 * per-clan outcome from the two lobbies and updates each Clan's war record.
 */
export async function recordClanWarResult(input: {
  lobbyAId: string;
  lobbyBId: string;
  roomId: string;
  winnerTeam: 'team_a' | 'team_b' | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const lobbyA = await prisma.clanLobby.findUnique({ where: { id: input.lobbyAId } });
  const lobbyB = await prisma.clanLobby.findUnique({ where: { id: input.lobbyBId } });
  if (!lobbyA || !lobbyB) return { ok: false, reason: 'Lobby not found' };

  const winnerClanId =
    input.winnerTeam === 'team_a' ? lobbyA.clanId : input.winnerTeam === 'team_b' ? lobbyB.clanId : null;

  await prisma.clanWarResult.create({
    data: {
      clanAId: lobbyA.clanId,
      clanBId: lobbyB.clanId,
      winnerClanId,
      queue: lobbyA.queue,
      roomId: input.roomId,
    },
  });

  if (winnerClanId) {
    await prisma.clan.update({
      where: { id: winnerClanId },
      data: { warWins: { increment: 1 } },
    });
    const loserClanId = winnerClanId === lobbyA.clanId ? lobbyB.clanId : lobbyA.clanId;
    await prisma.clan.update({
      where: { id: loserClanId },
      data: { warLosses: { increment: 1 } },
    });
  } else {
    await prisma.clan.updateMany({
      where: { id: { in: [lobbyA.clanId, lobbyB.clanId] } },
      data: { warDraws: { increment: 1 } },
    });
  }

  const allMemberIds = [...lobbyA.memberIds, ...lobbyB.memberIds];
  await Promise.all(
    allMemberIds.map((uid) => processWebsiteAction(uid, 'clan_wars_played').catch(() => {}))
  );
  if (winnerClanId) {
    const winningMemberIds = winnerClanId === lobbyA.clanId ? lobbyA.memberIds : lobbyB.memberIds;
    await Promise.all(
      winningMemberIds.map((uid) => processWebsiteAction(uid, 'clan_wars_won').catch(() => {}))
    );
  }

  const clanA = await prisma.clan.findUnique({ where: { id: lobbyA.clanId } });
  const clanB = await prisma.clan.findUnique({ where: { id: lobbyB.clanId } });
  await prisma.notification.createMany({
    data: allMemberIds.map((uid) => {
      const onWinningSide =
        winnerClanId &&
        ((winnerClanId === lobbyA.clanId && lobbyA.memberIds.includes(uid)) ||
          (winnerClanId === lobbyB.clanId && lobbyB.memberIds.includes(uid)));
      return {
        userId: uid,
        title: winnerClanId ? (onWinningSide ? 'Clan war won!' : 'Clan war lost') : 'Clan war ended in a draw',
        body: `${clanA?.name ?? 'Clan A'} vs ${clanB?.name ?? 'Clan B'} — match complete.`,
        type: 'clan_war_result',
      };
    }),
  }).catch(() => {});

  await prisma.clanLobby.updateMany({
    where: { id: { in: [lobbyA.id, lobbyB.id] } },
    data: { status: 'closed', activeRoomId: null },
  });

  return { ok: true };
}
