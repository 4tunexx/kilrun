/**
 * Pure planning logic for the daily VIP expiry job. No database access: the route handler loads
 * candidate users, calls computeVipExpiryPlan(), then applies the plan. Keeping the decisions here
 * makes the risky part — who gets demoted, who is warned — unit-testable.
 */

export const VIP_COSMETIC_SKUS = ['vip-crown-frame', 'vip-banner', 'vip-nickname'] as const;

export type VipExpiryCandidate = {
  id: string;
  role: string | null;
  isVip: boolean;
  vipExpiresAt: Date | string | null;
};

export type VipExpiryPlan = {
  /** VIP has ended: clear the flag (and demote role 'vip' → 'player'), unequip cosmetics. */
  expire: Array<{ id: string; expiredAt: Date; demoteRole: boolean }>;
  /** Users to warn, keyed by stage. Notifications are de-duplicated by (user, expiry, stage). */
  warn3: Array<{ id: string; expiresAt: Date }>;
  warn1: Array<{ id: string; expiresAt: Date }>;
  /** Rows ignored, with the reason (useful for the job's log and for tests). */
  skipped: Array<{ id: string; reason: 'permanent' | 'not_vip' | 'unparseable_expiry' | 'not_due' }>;
};

const HOUR_MS = 60 * 60 * 1000;
export const WARN_3D_MS = 72 * HOUR_MS;
export const WARN_1D_MS = 24 * HOUR_MS;

export function computeVipExpiryPlan(users: VipExpiryCandidate[], now: number = Date.now()): VipExpiryPlan {
  const plan: VipExpiryPlan = { expire: [], warn3: [], warn1: [], skipped: [] };

  for (const u of users) {
    if (!u.isVip) {
      plan.skipped.push({ id: u.id, reason: 'not_vip' });
      continue;
    }
    if (u.vipExpiresAt == null || u.vipExpiresAt === '') {
      // Permanent VIP (staff, giveaways, legacy): never expired by the job.
      plan.skipped.push({ id: u.id, reason: 'permanent' });
      continue;
    }
    const expiresAt = new Date(u.vipExpiresAt);
    const t = expiresAt.getTime();
    if (Number.isNaN(t)) {
      // Corrupt data: do NOT demote on a guess. isVipActive() already hides perks (fails closed).
      plan.skipped.push({ id: u.id, reason: 'unparseable_expiry' });
      continue;
    }

    if (t <= now) {
      plan.expire.push({
        id: u.id,
        expiredAt: expiresAt,
        // Only the plain 'vip' role is demoted. admin / moderator / player are never touched.
        demoteRole: u.role === 'vip',
      });
      continue;
    }

    const remaining = t - now;
    if (remaining <= WARN_1D_MS) plan.warn1.push({ id: u.id, expiresAt });
    else if (remaining <= WARN_3D_MS) plan.warn3.push({ id: u.id, expiresAt });
    else plan.skipped.push({ id: u.id, reason: 'not_due' });
  }
  return plan;
}

/** Idempotency keys for notifications, unique per (user, expiry instant, stage). */
export function vipNotificationKey(
  stage: 'warn3' | 'warn1' | 'expired' | 'grandfather',
  userId: string,
  expiresAt?: Date
): string {
  if (stage === 'grandfather') return `vip:grandfather:${userId}`;
  return `vip:${stage}:${userId}:${expiresAt ? expiresAt.toISOString() : 'na'}`;
}

/**
 * Decide which denormalised `equipped*` snapshot fields on User must be cleared after VIP expiry.
 * A snapshot is cleared ONLY if it still points at a VIP item — never a cosmetic the user chose.
 */
export function vipSnapshotFieldsToClear(user: {
  equippedFrameItemName?: string | null;
  equippedBannerItemName?: string | null;
  equippedNicknameItemName?: string | null;
}): { frame: boolean; banner: boolean; nickname: boolean } {
  return {
    frame: user.equippedFrameItemName === 'VIP Crown Frame',
    banner: user.equippedBannerItemName === 'VIP Banner',
    nickname: user.equippedNicknameItemName === 'VIP Nickname',
  };
}
