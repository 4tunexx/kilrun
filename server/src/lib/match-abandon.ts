/**
 * Reports a deliberate Competitive match abandon to the website so it can
 * apply the escalating 10m/30m/2h/5h/1d queue cooldown. Mirrors
 * admin-actions.ts's shared-secret fetch pattern.
 */

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export type ReportAbandonResult =
  | { ok: true; cooldownUntil: string }
  | { ok: false; error: string };

/** Records the abandon and returns the new cooldown expiry. Never throws. */
export async function reportMatchAbandon(userId: string): Promise<ReportAbandonResult> {
  const base = resolveWebAppUrl();
  const secret = (process.env.GAME_SERVER_ADMIN_SECRET || '').trim();
  if (!base || !secret) {
    return { ok: false, error: 'Game server is not configured to reach the web app' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base}/api/game/abandon-match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ userId, secret }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      cooldownUntil?: string;
    };
    if (!res.ok || !data.ok || !data.cooldownUntil) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true, cooldownUntil: data.cooldownUntil };
  } catch (err) {
    console.error('[match-abandon] failed:', err);
    return { ok: false, error: 'Network error contacting web app' };
  } finally {
    clearTimeout(timer);
  }
}
