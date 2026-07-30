/**
 * In-game admin actions that need to persist beyond the current match.
 * Kick and mute are purely in-room (handled directly in each Room) and never
 * touch this file — only ban needs a website round-trip. Mirrors
 * match-report.ts / chat.ts's shared-secret fetch pattern.
 */

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export type AdminBanRequest = {
  actorUserId: string;
  actorUsername: string;
  targetUserId: string;
  mode: string;
  detail?: string;
};

export type AdminBanResult = { ok: true } | { ok: false; error: string };

/** Bans the target account. Returns { ok:false } (never throws) on any failure. */
export async function reportAdminBan(req: AdminBanRequest): Promise<AdminBanResult> {
  const base = resolveWebAppUrl();
  const secret = (process.env.GAME_SERVER_ADMIN_SECRET || '').trim();
  if (!base || !secret) {
    return { ok: false, error: 'Game server is not configured to reach the web app' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base}/api/game/admin-action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ ...req, action: 'ban', secret }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[admin-ban] failed:', err);
    return { ok: false, error: 'Network error contacting web app' };
  } finally {
    clearTimeout(timer);
  }
}
