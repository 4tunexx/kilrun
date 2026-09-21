/**
 * Platform VIP — monthly hub membership (crown, orange name, VIP cosmetics).
 * Separate from Kilrun Premium (Ranked Competitive / KP) — see premium.ts.
 *
 * Data model (User):
 *   isVip=true,  vipExpiresAt=null   → PERMANENT VIP (staff, giveaways, partners)
 *   isVip=true,  vipExpiresAt=<date> → timed VIP; active until that instant
 *   isVip=false                      → not VIP
 * `role === 'vip'` mirrors `isVip` and is treated the same way.
 *
 * ALWAYS decide perks through isVipActive(); never read `isVip` alone for gating, because the
 * boolean is only cleaned up by the daily expiry job and can lag behind the real expiry.
 */

import { DEFAULT_VIP_CONFIG } from '@/lib/vip-config';

/**
 * @deprecated Use SiteSettings.vipConfigJson via parseVipConfig(). Kept as the fallback price
 * (and so existing imports keep compiling).
 */
export const VIP_UNLOCK_VP_COST = DEFAULT_VIP_CONFIG.vpCost;

/** Default membership length; live value comes from the admin-editable VIP config. */
export const VIP_DURATION_DAYS = DEFAULT_VIP_CONFIG.durationDays;

export type VipLike = {
  isVip?: boolean | null;
  role?: string | null;
  vipExpiresAt?: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** True when the user holds a VIP flag at all (before looking at any expiry date). */
export function hasVipFlag(u: VipLike): boolean {
  return u.isVip === true || u.role === 'vip';
}

/** True for VIP with no expiry date (permanent). Expiry that is unparseable is NOT permanent. */
export function isVipPermanent(u: VipLike): boolean {
  return hasVipFlag(u) && (u.vipExpiresAt == null || u.vipExpiresAt === '');
}

/**
 * Whether VIP perks should be shown/applied right now.
 * - Permanent VIP (no expiry) → active.
 * - Timed VIP → active only while expiry is strictly in the future.
 * - Unparseable expiry → NOT active (fail closed: never grant perks on corrupt data).
 * - admin/moderator alone are not VIP.
 */
export function isVipActive(u: VipLike | null | undefined, now: number = Date.now()): boolean {
  if (!u || !hasVipFlag(u)) return false;
  const expires = toTime(u.vipExpiresAt);
  if (expires === null) return true;
  if (Number.isNaN(expires)) return false;
  return expires > now;
}

/** Milliseconds of VIP left. Permanent → Infinity, inactive → 0. */
export function vipMsRemaining(u: VipLike | null | undefined, now: number = Date.now()): number {
  if (!isVipActive(u, now)) return 0;
  const expires = toTime(u!.vipExpiresAt);
  if (expires === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, expires - now);
}

/**
 * New expiry after buying/renewing. Stacks on top of the current expiry while still in the
 * future, otherwise starts from `now`. (Mirrors addPremiumDays.)
 */
export function addVipDays(
  currentExpiresAt: Date | string | null | undefined,
  days: number = VIP_DURATION_DAYS,
  now: number = Date.now()
): Date {
  const cur = toTime(currentExpiresAt);
  const base = cur !== null && !Number.isNaN(cur) && cur > now ? cur : now;
  return new Date(base + Math.max(1, Math.floor(days)) * DAY_MS);
}

export function formatVipCountdown(ms: number): string {
  if (!Number.isFinite(ms)) return 'Permanent';
  if (ms <= 0) return 'Expired';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * The exact Prisma `where` fragment for "users whose VIP is currently active".
 * Use it in every query that filters on isVip so expired-but-not-yet-cleaned rows are excluded.
 */
export function activeVipWhere(now: Date = new Date()) {
  return {
    isVip: true,
    OR: [{ vipExpiresAt: null }, { vipExpiresAt: { gt: now } }],
  } as const;
}

/**
 * Normalise a user-shaped object for the client: `isVip` becomes "VIP is active right now"
 * (so an expired-but-not-yet-cleaned row never shows perks) and `vipExpiresAt` is serialised.
 * Generic so it keeps every other field's type. Rows without VIP fields pass through unchanged
 * apart from `isVip: false`.
 */
export function withActiveVip<T extends VipLike>(
  row: T,
  now: number = Date.now()
): Omit<T, 'isVip' | 'vipExpiresAt'> & { isVip: boolean; vipExpiresAt: string | null } {
  const { isVip: _isVip, vipExpiresAt, ...rest } = row as T & { isVip?: unknown };
  void _isVip;
  const t = vipExpiresAt == null || vipExpiresAt === '' ? null : new Date(vipExpiresAt as Date | string);
  return {
    ...(rest as Omit<T, 'isVip' | 'vipExpiresAt'>),
    isVip: isVipActive(row, now),
    vipExpiresAt: t && !Number.isNaN(t.getTime()) ? t.toISOString() : null,
  };
}
