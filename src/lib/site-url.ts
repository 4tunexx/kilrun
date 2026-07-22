/**
 * Canonical public site origin for emails, embeds, and SSR fallbacks.
 * Prefer NEXT_PUBLIC_SITE_URL, then NEXTAUTH_URL, then localhost.
 */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}
