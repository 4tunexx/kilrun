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

export {
  PREMIUM_VP_COST,
  PREMIUM_MONTHLY_USD,
  PREMIUM_DURATION_DAYS,
  /** @deprecated Use PREMIUM_VP_COST — Premium replaced one-time VIP unlock. */
  VIP_UNLOCK_VP_COST,
  isPremiumActive,
  premiumMsRemaining,
  formatPremiumCountdown,
  addPremiumDays,
} from '@/lib/premium';

