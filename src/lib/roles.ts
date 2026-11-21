export const ACCOUNT_ROLES = ['player', 'vip', 'moderator', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Original deployment owner, excluded when self-hosted mode is enabled. */
export const OWNER_STEAM_IDS = ['76561198001993310'] as const;

export function isAccountRole(value: string): value is AccountRole {
  return (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export function canAccessAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'moderator';
}

/** Full admin only — economy minting, role changes, banning staff. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function canModerate(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'moderator';
}

export function isStaff(role: string | null | undefined): boolean {
  return canModerate(role);
}

/** Alias for isStaff — used by engine/page.tsx and other server components. */
export function isStaffRole(role: string | null | undefined): boolean {
  return canModerate(role);
}

/**
 * Steam IDs promoted to admin on every login:
 * - hardcoded owner IDs on the original deployment
 * - plus any extras from ADMIN_STEAM_IDS env (comma-separated)
 */
export function steamIdsPromotedToAdmin(): Set<string> {
  const fromEnv = (process.env.ADMIN_STEAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const defaultOwners = process.env.KILRUN_SELF_HOSTED === '1' ? [] : OWNER_STEAM_IDS;
  return new Set([...defaultOwners, ...fromEnv]);
}

export { VIP_UNLOCK_VP_COST } from '@/lib/vip';

export {
  PREMIUM_VP_COST,
  PREMIUM_MONTHLY_USD,
  PREMIUM_DURATION_DAYS,
  isPremiumActive,
  premiumMsRemaining,
  formatPremiumCountdown,
  addPremiumDays,
} from '@/lib/premium';

