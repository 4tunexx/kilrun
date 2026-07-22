export const ACCOUNT_ROLES = ['player', 'vip', 'moderator', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** Hardcoded owner SteamID64 — always promoted to admin on Steam login. */
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

/**
 * Steam IDs promoted to admin on every login:
 * - hardcoded owner IDs (always)
 * - plus any extras from ADMIN_STEAM_IDS env (comma-separated)
 */
export function steamIdsPromotedToAdmin(): Set<string> {
  const fromEnv = (process.env.ADMIN_STEAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set([...OWNER_STEAM_IDS, ...fromEnv]);
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

