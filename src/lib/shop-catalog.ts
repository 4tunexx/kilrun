/**
 * Storefront category tabs, sorting, and fire-sale helpers.
 */
export type ShopTabId =
  | 'fire'
  | 'banners'
  | 'frames'
  | 'nickname'
  | 'skins'
  | 'perks'
  | 'boosts'
  | 'emotes'
  | 'other'
  | 'all';

export type ShopSortId = 'popular' | 'cheapest' | 'highest' | 'newest';

export const SHOP_TABS: { id: ShopTabId; label: string }[] = [
  { id: 'fire', label: 'Fire Sale' },
  { id: 'all', label: 'All' },
  { id: 'banners', label: 'Banners' },
  { id: 'frames', label: 'Avatar Frames' },
  { id: 'nickname', label: 'Nickname Effects' },
  { id: 'skins', label: 'Skins' },
  { id: 'perks', label: 'Perks' },
  { id: 'boosts', label: 'Boosts' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'other', label: 'Other' },
];

export const SHOP_SORTS: { id: ShopSortId; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'highest', label: 'Highest price' },
  { id: 'newest', label: 'Newest' },
];

export type StoreItemLike = {
  itemCategory?: string | null;
  cosmeticSlot?: string | null;
  vpPrice?: number;
  purchaseCount?: number | null;
  fireSalePercent?: number | null;
  fireSaleEndsAt?: Date | string | null;
  createdAt?: Date | string | null;
  id?: string;
};

/** Normalize free-form category / slot into a shop tab. */
export function resolveShopTab(item: StoreItemLike): Exclude<ShopTabId, 'fire' | 'all'> {
  const slot = (item.cosmeticSlot || '').toLowerCase();
  if (slot === 'banner') return 'banners';
  if (slot === 'frame') return 'frames';
  if (slot === 'nickname') return 'nickname';

  const cat = (item.itemCategory || '').toLowerCase();
  if (cat.includes('banner')) return 'banners';
  if (cat.includes('frame')) return 'frames';
  if (cat.includes('nickname') || cat.includes('nick')) return 'nickname';
  if (cat.includes('skin')) return 'skins';
  if (cat.includes('perk')) return 'perks';
  if (cat.includes('boost') || cat.includes('xp')) return 'boosts';
  if (cat.includes('emote')) return 'emotes';
  if (cat.includes('cosmetic')) return 'other';
  return 'other';
}

export function isFireSaleActive(item: StoreItemLike, now = new Date()): boolean {
  const pct = item.fireSalePercent ?? 0;
  if (pct <= 0 || pct > 90) return false;
  if (!item.fireSaleEndsAt) return false;
  const ends = new Date(item.fireSaleEndsAt);
  return !Number.isNaN(ends.getTime()) && ends.getTime() > now.getTime();
}

/** Sale price after fire-sale %, or full vpPrice. */
export function getEffectiveVpPrice(item: StoreItemLike, now = new Date()): number {
  const base = Math.max(0, item.vpPrice ?? 0);
  if (!isFireSaleActive(item, now)) return base;
  const pct = Math.min(90, Math.max(1, item.fireSalePercent ?? 0));
  return Math.max(1, Math.round(base * (1 - pct / 100)));
}

export function filterByShopTab<T extends StoreItemLike>(
  items: T[],
  tab: ShopTabId,
  now = new Date()
): T[] {
  if (tab === 'all') return items;
  if (tab === 'fire') return items.filter((i) => isFireSaleActive(i, now));
  return items.filter((i) => resolveShopTab(i) === tab);
}

export function sortShopItems<T extends StoreItemLike>(
  items: T[],
  sort: ShopSortId,
  now = new Date()
): T[] {
  const copy = [...items];
  switch (sort) {
    case 'cheapest':
      return copy.sort(
        (a, b) => getEffectiveVpPrice(a, now) - getEffectiveVpPrice(b, now)
      );
    case 'highest':
      return copy.sort(
        (a, b) => getEffectiveVpPrice(b, now) - getEffectiveVpPrice(a, now)
      );
    case 'newest':
      return copy.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    case 'popular':
    default:
      return copy.sort((a, b) => {
        const pa = a.purchaseCount ?? 0;
        const pb = b.purchaseCount ?? 0;
        if (pb !== pa) return pb - pa;
        return getEffectiveVpPrice(a, now) - getEffectiveVpPrice(b, now);
      });
  }
}

export function formatFireSaleCountdown(endsAt: Date | string, now = new Date()): string {
  const ends = new Date(endsAt).getTime();
  const ms = Math.max(0, ends - now.getTime());
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}
