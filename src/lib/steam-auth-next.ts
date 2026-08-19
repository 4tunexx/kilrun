export const KILRUN_AUTH_NEXT_COOKIE = 'kilrun_auth_next';

export type SteamAuthNext = '/engine' | '/api/engine/desktop-login';

export function parseSteamAuthNext(raw: string | null | undefined): SteamAuthNext | null {
  if (raw === '/engine' || raw === '/api/engine/desktop-login') return raw;
  if (raw === 'desktop') return '/api/engine/desktop-login';
  return null;
}

export function steamAuthRedirect(origin: string, next: string | undefined): string {
  const base = origin.replace(/\/$/, '');
  if (next === '/engine') return `${base}/engine`;
  if (next === '/api/engine/desktop-login') return `${base}/api/engine/desktop-login`;
  return `${base}/`;
}
