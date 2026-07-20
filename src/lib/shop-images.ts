/** Fallback art when local /shop assets are missing or URLs fail. */
const SHOP_PLACEHOLDERS: Record<string, string> = {
  '/shop/trail.png':
    'https://placehold.co/400x400/0f172a/ef4444/png?text=Neon+Trail',
  '/shop/cape.png':
    'https://placehold.co/400x400/0f172a/f59e0b/png?text=Cape',
  '/shop/xp.png':
    'https://placehold.co/400x400/0f172a/22c55e/png?text=XP+Boost',
  '/shop/icon.png':
    'https://placehold.co/400x400/0f172a/38bdf8/png?text=VP+Icon',
  '/shop/emote.png':
    'https://placehold.co/400x400/0f172a/a855f7/png?text=Emote',
};

const DEFAULT_SHOP_PLACEHOLDER =
  'https://placehold.co/400x400/0f172a/94a3b8/png?text=Kilrun';

/**
 * Maps broken relative shop paths to remote placeholders; passes through
 * http(s), data URLs, and local public paths (/uploads, /shop, etc.).
 */
export function resolveShopImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    return SHOP_PLACEHOLDERS[trimmed] ?? trimmed;
  }
  return SHOP_PLACEHOLDERS[trimmed] ?? DEFAULT_SHOP_PLACEHOLDER;
}
