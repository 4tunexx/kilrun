/**
 * Fetch the active MAIN cloud map sim payload from the Next.js app.
 * Used by Colyseus rooms onCreate so authority does not wait on a client push.
 */

function resolveWebAppUrl(): string | null {
  const raw = (process.env.WEB_APP_URL || process.env.CLIENT_ORIGIN || '').trim();
  if (!raw || raw === '*') return null;
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) return null;
  return raw.replace(/\/$/, '');
}

export type ActiveMapPayload = Record<string, unknown>;

export async function fetchActiveMapPayload(
  mode: string
): Promise<{ id: string; name: string; payload: ActiveMapPayload } | null> {
  const base = resolveWebAppUrl();
  if (!base) {
    console.warn(
      `[active-map] WEB_APP_URL / CLIENT_ORIGIN not set — room will wait for client loadCustomMap (${mode})`
    );
    return null;
  }

  const url = `${base}/api/game/active-map?mode=${encodeURIComponent(mode)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[active-map] ${res.status} from ${url}: ${text.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      ok?: boolean;
      map?: { id?: string; name?: string; payload?: ActiveMapPayload } | null;
    };
    if (!data?.ok || !data.map?.payload) return null;
    const platforms = data.map.payload.platforms;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    return {
      id: String(data.map.id ?? ''),
      name: String(data.map.name ?? 'MAIN'),
      payload: data.map.payload,
    };
  } catch (err) {
    console.error(`[active-map] fetch failed for ${mode}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
