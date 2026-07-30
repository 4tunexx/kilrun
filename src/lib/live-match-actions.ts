'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { canAccessAdmin } from '@/lib/roles';
import { getSiteSecretValue } from '@/lib/site-secrets';

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

export type LiveMatchPlayer = { username: string; role: string };

export type LiveMatch = {
  roomId: string;
  roomName: string;
  mode: string;
  phase: string;
  paused: boolean;
  playerCount: number;
  players: LiveMatchPlayer[];
};

/**
 * Same NEXT_PUBLIC_GAME_SERVER_URL (ws/wss) -> http/https conversion as
 * adminRestartColyseus() in admin-dashboard.ts — kept local here rather
 * than factored out since it's a two-line conversion and this file already
 * mirrors that one's overall shape.
 */
async function resolveGameServerHttpUrl(path: string): Promise<{ url: string } | { error: string }> {
  const wsUrl = (await getSiteSecretValue('NEXT_PUBLIC_GAME_SERVER_URL')) || '';
  if (!wsUrl) return { error: 'NEXT_PUBLIC_GAME_SERVER_URL is not set' };
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.pathname = path;
    u.search = '';
    u.hash = '';
    return { url: u.toString() };
  } catch {
    return { error: 'Invalid NEXT_PUBLIC_GAME_SERVER_URL' };
  }
}

async function callGameServer(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const secret = (await getSiteSecretValue('GAME_SERVER_ADMIN_SECRET')) || '';
  if (!secret) return { ok: false, error: 'GAME_SERVER_ADMIN_SECRET is not set on the web app' };

  const resolved = await resolveGameServerHttpUrl(path);
  if ('error' in resolved) return { ok: false, error: resolved.error };

  try {
    const res = await fetch(resolved.url, {
      method,
      headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
      body: method === 'POST' ? JSON.stringify({ ...body, secret }) : undefined,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Game server returned ${res.status}` };
    }
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to reach game server' };
  }
}

/** Read-only — any staff (mod or admin) may view live matches. */
export async function adminListLiveMatches(): Promise<{
  ok: boolean;
  error?: string;
  matches: LiveMatch[];
}> {
  await requireStaff();
  const result = await callGameServer('/admin/live-matches', 'GET');
  if (!result.ok) return { ok: false, error: result.error, matches: [] };
  const data = result.data as { matches?: LiveMatch[] };
  return { ok: true, matches: data.matches ?? [] };
}

async function requireAdminActor() {
  const actor = await requireStaff();
  if (actor.role !== 'admin') throw new Error('Admin only');
  return actor;
}

async function auditLiveMatchAction(
  actorId: string,
  actorUsername: string,
  action: string,
  roomId: string,
  detail?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorUsername,
        action,
        targetUserId: null,
        targetUsername: null,
        detail: `room ${roomId}${detail ? `: ${detail}` : ''}`,
      },
    });
  } catch {
    // Audit is best-effort — never block the actual action on it.
  }
}

export async function adminPauseLiveMatch(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const result = await callGameServer(`/admin/live-matches/${roomId}/pause`, 'POST');
  if (result.ok) void auditLiveMatchAction(actor.id, actor.username, 'live_match_pause', roomId);
  return result;
}

export async function adminResumeLiveMatch(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const result = await callGameServer(`/admin/live-matches/${roomId}/resume`, 'POST');
  if (result.ok) void auditLiveMatchAction(actor.id, actor.username, 'live_match_resume', roomId);
  return result;
}

export async function adminCancelLiveMatch(
  roomId: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const result = await callGameServer(`/admin/live-matches/${roomId}/cancel`, 'POST');
  if (result.ok) void auditLiveMatchAction(actor.id, actor.username, 'live_match_cancel', roomId);
  return result;
}

export async function adminSendLiveMatchMessage(
  roomId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminActor();
  const trimmed = text.trim().slice(0, 240);
  if (!trimmed) return { ok: false, error: 'Message is required' };
  const result = await callGameServer(`/admin/live-matches/${roomId}/message`, 'POST', {
    text: trimmed,
  });
  if (result.ok) {
    void auditLiveMatchAction(actor.id, actor.username, 'live_match_message', roomId, trimmed);
  }
  return result;
}
