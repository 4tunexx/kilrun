import { timingSafeEqual } from 'crypto';

export type CronAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authorise a scheduled-job request. Fails CLOSED: with no configured secret nothing is allowed
 * (503), and a wrong/missing bearer token is 401. Compared in constant time.
 */
export function checkCronAuth(
  authorizationHeader: string | null | undefined,
  expectedSecret: string | null | undefined
): CronAuthResult {
  if (!expectedSecret) return { ok: false, status: 503, error: 'CRON_SECRET not configured' };
  const header = authorizationHeader ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !secretsEqual(provided, expectedSecret)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}
