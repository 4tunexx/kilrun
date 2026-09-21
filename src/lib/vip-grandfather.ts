/**
 * Pure selection logic for the one-off "VIP is now monthly" migration. No database access.
 *
 * Who is a candidate: users flagged VIP (isVip or role 'vip') with NO expiry date, i.e. legacy
 * permanent VIP. They get a grace period of `graceDays`, after which they behave like any other
 * timed VIP (warnings, expiry, renewal).
 *
 * Who is NEVER a candidate: admin / moderator (staff keep permanent VIP), anyone already having a
 * date, and anyone explicitly excluded (giveaway winners, partners, ...).
 */

import { hasVipFlag } from '@/lib/vip';

export type GrandfatherUser = {
  id: string;
  username?: string | null;
  role: string | null;
  isVip: boolean;
  vipExpiresAt: Date | string | null;
};

export type GrandfatherSkipReason =
  | 'not_vip'
  | 'already_has_expiry'
  | 'staff'
  | 'excluded';

export type GrandfatherPlan = {
  /** Users who will receive vipExpiresAt = expiresAt. */
  apply: Array<{ id: string; username: string; expiresAt: Date }>;
  skipped: Array<{ id: string; reason: GrandfatherSkipReason }>;
};

export const DEFAULT_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function planGrandfather(
  users: GrandfatherUser[],
  opts: { graceDays?: number; excludeIds?: Iterable<string>; now?: number } = {}
): GrandfatherPlan {
  const graceDays = Math.max(1, Math.floor(opts.graceDays ?? DEFAULT_GRACE_DAYS));
  const now = opts.now ?? Date.now();
  const excluded = new Set(opts.excludeIds ?? []);
  const expiresAt = new Date(now + graceDays * DAY_MS);
  const plan: GrandfatherPlan = { apply: [], skipped: [] };

  for (const u of users) {
    if (!hasVipFlag(u)) {
      plan.skipped.push({ id: u.id, reason: 'not_vip' });
    } else if (u.role === 'admin' || u.role === 'moderator') {
      plan.skipped.push({ id: u.id, reason: 'staff' });
    } else if (excluded.has(u.id)) {
      plan.skipped.push({ id: u.id, reason: 'excluded' });
    } else if (u.vipExpiresAt != null && u.vipExpiresAt !== '') {
      plan.skipped.push({ id: u.id, reason: 'already_has_expiry' });
    } else {
      plan.apply.push({ id: u.id, username: u.username ?? '', expiresAt });
    }
  }
  return plan;
}

/** Parse a CSV/newline list of user ids (first column, optional header, '#' comments). */
export function parseExcludeList(text: string): string[] {
  const ids: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const first = line.split(',')[0].trim().replace(/^"|"$/g, '');
    if (/^[a-f0-9]{24}$/i.test(first)) ids.push(first.toLowerCase());
  }
  return [...new Set(ids)];
}
