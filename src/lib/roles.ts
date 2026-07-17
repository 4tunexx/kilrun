export const ACCOUNT_ROLES = ['player', 'vip', 'moderator', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

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

/** Comma-separated Steam IDs in ADMIN_STEAM_IDS become admins on login. */
export function steamIdsPromotedToAdmin(): Set<string> {
  const raw = process.env.ADMIN_STEAM_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export const VIP_UNLOCK_VP_COST = 2500;
