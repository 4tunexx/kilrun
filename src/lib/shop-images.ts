/** Local fallback art when catalog paths point at missing /shop assets. */
const SHOP_PLACEHOLDERS: Record<string, string> = {
  '/shop/trail.png': '/shop/trail.svg',
  '/shop/cape.png': '/shop/cape.svg',
  '/shop/xp.png': '/shop/xp.svg',
  '/shop/icon.png': '/shop/icon.svg',
  '/shop/emote.png': '/shop/emote.svg',
  '/shop/trail.svg': '/shop/trail.svg',
  '/shop/cape.svg': '/shop/cape.svg',
  '/shop/xp.svg': '/shop/xp.svg',
  '/shop/icon.svg': '/shop/icon.svg',
  '/shop/emote.svg': '/shop/emote.svg',
  // Legacy external placeholders from older seeds.
  'https://placehold.co/400x400/0f172a/ef4444/png?text=Neon+Trail':
    '/shop/trail.svg',
  'https://placehold.co/400x400/0f172a/f59e0b/png?text=Cape': '/shop/cape.svg',
  'https://placehold.co/400x400/0f172a/22c55e/png?text=XP+Boost':
    '/shop/xp.svg',
  'https://placehold.co/400x400/0f172a/38bdf8/png?text=VP+Icon':
    '/shop/icon.svg',
  'https://placehold.co/400x400/0f172a/a855f7/png?text=Emote':
    '/shop/emote.svg',
};

const DEFAULT_SHOP_PLACEHOLDER = '/shop/default.svg';

/**
 * Maps broken relative shop paths (and legacy placehold.co seeds) to local
 * SVGs; passes through other http(s), data URLs, and public paths.
 */
export function resolveShopImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  if (SHOP_PLACEHOLDERS[trimmed]) return SHOP_PLACEHOLDERS[trimmed];
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return DEFAULT_SHOP_PLACEHOLDER;
}
