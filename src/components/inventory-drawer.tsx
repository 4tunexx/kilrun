'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Loader2, Package, ShieldCheck, ShoppingBag, Trash2, Upload } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
<<<<<<< HEAD
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
=======
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
>>>>>>> origin/main
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  deleteInventoryItem,
  equipInventoryItem,
  getMyEquippedSkinAttachments,
  getMyInventory,
  resellInventoryItem,
  unequipCosmeticSlot,
} from '@/lib/social-actions';
import { normalizeBannerConfig } from '@/lib/banner';
import { BannerFill } from '@/components/banner-fill';
import { ProfileHeroBanner } from '@/components/profile-hero-banner';
import { AvatarWithFrame } from '@/components/avatar-with-frame';
import { NicknameEffectText } from '@/components/nickname-effect';
import {
  frameAnimationClass,
  frameWrapperStyle,
  nicknameEffectClass,
  nicknameEffectStyle,
  normalizeFrameConfig,
  normalizeNicknameConfig,
} from '@/lib/cosmetics';
import { INVENTORY_RESELL_RATE } from '@/lib/inventory-constants';
import {
  DEFAULT_INVENTORY_CONFIG,
  parseInventoryConfig,
  type InventoryConfig,
} from '@/lib/inventory-config';
import { getSiteSettings } from '@/lib/progression-actions';
import { resolveShopImageUrl } from '@/lib/shop-images';
import { resolveShopTab, type ShopTabId } from '@/lib/shop-catalog';
import type { SkinAttachment } from '@/lib/player-skins';
import { InventoryAvatarPreview } from './inventory-avatar-preview';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type InventoryRow = Awaited<ReturnType<typeof getMyInventory>>[number];
type SortMode = 'newest' | 'oldest' | 'name' | 'value';

type PageTabId = 'skins' | 'cosmetics' | 'powers';
type SubTabId = ShopTabId | 'equipped';

const PAGE_TABS: { id: PageTabId; label: string; includes: ShopTabId[] }[] = [
  {
    id: 'skins',
    label: 'Skins',
    includes: ['skins'],
  },
  {
    id: 'cosmetics',
    label: 'Cosmetics',
    includes: ['banners', 'frames', 'nickname', 'emotes', 'other'],
  },
  {
    id: 'powers',
    label: 'Powers',
    includes: ['perks', 'boosts'],
  },
];

const EQUIP_SLOTS: {
  key: string;
  label: string;
  accepts: Array<'skin' | 'banner' | 'frame' | 'nickname' | 'perk' | 'boost' | 'emote' | 'other'>;
  side: 'left' | 'right';
  cosmeticSlot?: string;
  icon?: 'head' | 'torso' | 'legs' | 'boots' | 'gloves' | 'back' | 'banner' | 'frame' | 'nickname' | 'emote' | 'other';
}[] = [
  {
    key: 'head',
    label: 'Head',
    accepts: ['skin'],
    side: 'left',
    cosmeticSlot: 'skin_hat',
    icon: 'head',
  },
  {
    key: 'torso',
    label: 'Garb / Torso',
    accepts: ['skin'],
    side: 'right',
    cosmeticSlot: 'skin_torso',
    icon: 'torso',
  },
  {
    key: 'legs',
    label: 'Pants',
    accepts: ['skin'],
    side: 'left',
    cosmeticSlot: 'skin_pants',
    icon: 'legs',
  },
  {
    key: 'gloves',
    label: 'Gloves',
    accepts: ['skin'],
    side: 'right',
    cosmeticSlot: 'skin_gloves',
    icon: 'gloves',
  },
  {
    key: 'boots',
    label: 'Boots',
    accepts: ['skin'],
    side: 'left',
    cosmeticSlot: 'skin_boots',
    icon: 'boots',
  },
  {
    key: 'back',
    label: 'Backpack',
    accepts: ['skin'],
    side: 'right',
    cosmeticSlot: 'skin_back',
    icon: 'back',
  },
];

/** Profile / hub cosmetics — shown on the Cosmetics tab instead of body gear. */
const COSMETIC_EQUIP_SLOTS: (typeof EQUIP_SLOTS)[number][] = [
  {
    key: 'banner',
    label: 'Banner',
    accepts: ['banner'],
    side: 'left',
    cosmeticSlot: 'banner',
    icon: 'banner',
  },
  {
    key: 'frame',
    label: 'Frame',
    accepts: ['frame'],
    side: 'right',
    cosmeticSlot: 'frame',
    icon: 'frame',
  },
  {
    key: 'nickname',
    label: 'Nickname',
    accepts: ['nickname'],
    side: 'left',
    cosmeticSlot: 'nickname',
    icon: 'nickname',
  },
  {
    key: 'emote',
    label: 'Emote',
    accepts: ['emote'],
    side: 'right',
    cosmeticSlot: 'emote',
    icon: 'emote',
  },
  {
    key: 'other',
    label: 'Other',
    accepts: ['other'],
    side: 'left',
    cosmeticSlot: 'other',
    icon: 'other',
  },
];

const POWER_EQUIP_SLOTS: (typeof EQUIP_SLOTS)[number][] = [
  {
    key: 'perk',
    label: 'Perk',
    accepts: ['perk'],
    side: 'left',
    icon: 'other',
  },
  {
    key: 'boost',
    label: 'Boost',
    accepts: ['boost'],
    side: 'right',
    icon: 'other',
  },
];

function equipSlotsForPage(page: PageTabId): (typeof EQUIP_SLOTS)[number][] {
  if (page === 'cosmetics') return COSMETIC_EQUIP_SLOTS;
  if (page === 'powers') return POWER_EQUIP_SLOTS;
  return EQUIP_SLOTS;
}

type PendingClash = {
  itemId: string;
  itemName: string;
  reasons: string[];
};

const CATEGORY_BY_KIND: Record<
  'skin' | 'banner' | 'frame' | 'nickname' | 'perk' | 'boost' | 'emote' | 'other',
  ShopTabId
> = {
  skin: 'skins',
  banner: 'banners',
  frame: 'frames',
  nickname: 'nickname',
  perk: 'perks',
  boost: 'boosts',
  emote: 'emotes',
  other: 'other',
};

function inventoryKind(item: InventoryRow):
  | 'skin'
  | 'banner'
  | 'frame'
  | 'nickname'
  | 'perk'
  | 'boost'
  | 'emote'
  | 'other' {
  const slot = (item.cosmeticSlot || '').toLowerCase();
  if (slot === 'banner') return 'banner';
  if (slot === 'frame') return 'frame';
  if (slot === 'nickname') return 'nickname';
  if (slot.startsWith('skin_') || slot === 'skin') return 'skin';
  const cat = resolveShopTab(item);
  if (cat === 'perks') return 'perk';
  if (cat === 'boosts') return 'boost';
  if (cat === 'emotes') return 'emote';
  return 'other';
}

function itemForEquipSlot(
  slot: (typeof EQUIP_SLOTS)[number],
  items: InventoryRow[]
): InventoryRow | null {
  if (slot.cosmeticSlot) {
    const direct = items.find(
      (i) => i.isEquipped && i.cosmeticSlot === slot.cosmeticSlot
    );
    if (direct) return direct;
  }
  if (slot.key === 'banner') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'banner') ?? null;
  }
  if (slot.key === 'frame') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'frame') ?? null;
  }
  if (slot.key === 'nickname') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'nickname') ?? null;
  }
  if (slot.key === 'emote') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'emote') ?? null;
  }
  if (slot.key === 'other') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'other') ?? null;
  }
  if (slot.key === 'perk') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'perk') ?? null;
  }
  if (slot.key === 'boost') {
    return items.find((i) => i.isEquipped && inventoryKind(i) === 'boost') ?? null;
  }
  if (slot.key === 'head') {
    return (
      items.find(
        (i) =>
          i.isEquipped &&
          (i.cosmeticSlot === 'skin_hat' ||
            i.cosmeticSlot === 'skin_hair' ||
            i.cosmeticSlot === 'skin_face' ||
            i.cosmeticSlot === 'skin_glasses')
      ) ?? null
    );
  }
  if (slot.key === 'torso') {
    return (
      items.find(
        (i) =>
          i.isEquipped &&
          (i.cosmeticSlot === 'skin_torso' ||
            i.cosmeticSlot === 'fullbody' ||
            i.cosmeticSlot === 'skin_fullbody' ||
            i.cosmeticSlot === 'body')
      ) ?? null
    );
  }
  return null;
}

function InventoryPreview({
  item,
  viewerName,
  viewerAvatar,
}: {
  item: InventoryRow;
  viewerName?: string;
  viewerAvatar?: string;
}) {
  if (item.bannerConfig) {
    const banner = normalizeBannerConfig(item.bannerConfig);
    return <BannerFill banner={banner} className="h-16 w-full" />;
  }
  if (item.cosmeticSlot === 'frame' && item.cosmeticConfig) {
    const frame = normalizeFrameConfig(item.cosmeticConfig);
    const name = viewerName?.trim() || 'You';
    return (
      <div className="h-16 w-full flex items-center justify-center bg-slate-950">
        <div
          className={cn('rounded-full', frameAnimationClass(frame))}
          style={frameWrapperStyle(frame)}
        >
          <div className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-slate-900 bg-slate-800">
            {viewerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewerAvatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black text-slate-300">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (item.cosmeticSlot === 'nickname' && item.cosmeticConfig) {
    const nick = normalizeNicknameConfig(item.cosmeticConfig);
    const name = viewerName?.trim() || 'You';
    return (
      <div className="h-16 w-full flex items-center justify-center bg-slate-950 px-2">
        <span
          className={cn('text-sm font-black truncate', nicknameEffectClass(nick))}
          style={nicknameEffectStyle(nick)}
          title={name}
        >
          {name}
        </span>
      </div>
    );
  }
  const imageSrc = resolveShopImageUrl(item.imageUrl);
  if (imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageSrc} alt="" className="h-16 w-full object-cover" />
    );
  }
  return (
    <div className="h-16 w-full flex items-center justify-center bg-slate-900">
      <Package className="w-8 h-8 text-slate-600" />
    </div>
  );
}

function InventoryPreviewSmall({
  item,
  className,
}: {
  item: InventoryRow;
  className?: string;
}) {
  const imageSrc = resolveShopImageUrl(item.imageUrl);
  if (imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageSrc}
        alt=""
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }
  if (item.bannerConfig) {
    const banner = normalizeBannerConfig(item.bannerConfig);
    return <BannerFill banner={banner} className={cn('h-full w-full', className)} />;
  }
  return (
    <div
      className={cn(
        'h-full w-full flex items-center justify-center bg-slate-900 text-slate-600',
        className
      )}
    >
      <Package className="w-5 h-5" />
    </div>
  );
}

function SlotIcon({ slot }: { slot: (typeof EQUIP_SLOTS)[number] }) {
  const stroke = 'currentColor';
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={stroke} strokeWidth={1.6}>
      {slot.icon === 'head' && (
        <>
          <circle cx="12" cy="9" r="4.2" />
          <path d="M5 19c1.4-2.7 3.8-4.2 7-4.2s5.6 1.5 7 4.2" strokeLinecap="round" />
        </>
      )}
      {slot.icon === 'torso' && (
        <path
          d="M7 7.5c.7-1 1.9-1.6 3.4-1.7h3.2c1.5.1 2.7.7 3.4 1.7l.9 1.5c.3.5.5 1.1.5 1.7V14c0 1.2-1 2.2-2.2 2.2h-8.4C8 16.2 7 15.2 7 14V10.7c0-.6.2-1.2.5-1.7l-.5-1.5Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'legs' && (
        <path
          d="M8 6.2h8l.9 2.1V13c0 .9-.6 1.7-1.5 1.9l-1.9.5v5.8h-3v-5.8L8.6 15c-.9-.2-1.6-1-1.6-1.9V8.3L8 6.2Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'boots' && (
        <path
          d="M6.2 7.8h3.2v6.3l2.1 1.2v3.3H6.2V7.8Zm8.4 0h3.2v10.8h-5.3v-3.3l2.1-1.2V7.8Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'gloves' && (
        <path
          d="M6.8 6.3h3.2v4.7l2 1.5v2.3l-1.8 3.9H7.5c-.8 0-1.5-.6-1.7-1.3L4.3 9.5c-.3-1.1.5-2.2 1.6-2.2h.9v-1Zm10.4 0h3.2v1c1.1 0 1.9 1.1 1.6 2.2l-1.5 9.1c-.2.7-.9 1.3-1.7 1.3h-2.7l-1.8-3.9v-2.3l2-1.5V6.3Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'back' && (
        <path
          d="M7.2 7c0-2 1.7-3.5 3.8-3.5h2c2.1 0 3.8 1.5 3.8 3.5v12c0 .8-.7 1.5-1.5 1.5h-6.6c-.8 0-1.5-.7-1.5-1.5V7Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'banner' && (
        <path
          d="M5.5 4.5h13v3.2c0 1.4-.8 2.6-2.1 3.1L12 13.2 7.6 10.8A3.4 3.4 0 0 1 5.5 7.7V4.5Zm1.8 0v12.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'frame' && (
        <rect x="5" y="5" width="14" height="14" rx="2.5" />
      )}
      {slot.icon === 'nickname' && (
        <path
          d="M5 16.5 8.2 7h2.2L14 16.5h-2.1l-.6-1.8H7.7l-.6 1.8H5Zm3.2-3.5h2.6L9.5 9.2 8.2 13Zm6.3-6.5h4.8v1.7h-3v1.6h2.7v1.6h-2.7v2.1H20v1.7h-5.5V6.5Z"
          strokeLinejoin="round"
        />
      )}
      {slot.icon === 'emote' && (
        <>
          <circle cx="12" cy="12" r="7.2" />
          <path d="M8.8 10.2h.1M15.2 10.2h.1M8.8 14.2c1.1 1.3 2.2 1.9 3.2 1.9s2.1-.6 3.2-1.9" strokeLinecap="round" />
        </>
      )}
      {slot.icon === 'other' && (
        <path
          d="M12 5.2v2.4M12 16.4v2.4M5.2 12h2.4M16.4 12h2.4M7.2 7.2l1.7 1.7M15.1 15.1l1.7 1.7M16.8 7.2l-1.7 1.7M8.9 15.1l-1.7 1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function InventoryDrawer({
  open,
  onOpenChange,
  onEquipChange,
  username,
  avatarUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after equip/unequip/resell/delete so parents can refresh derived UI (e.g. rail banner). */
  onEquipChange?: () => void;
  username?: string;
  avatarUrl?: string;
}) {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>('newest');
  const [pageTab, setPageTab] = useState<PageTabId>('skins');
  const [subTab, setSubTab] = useState<SubTabId>('equipped');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingClash, setPendingClash] = useState<PendingClash | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [skinsLoad, setSkinsLoad] = useState<SkinAttachment[]>([]);
  const [invCfg, setInvCfg] = useState<InventoryConfig>(DEFAULT_INVENTORY_CONFIG);
  const { toast } = useToast();

  const resellRate = invCfg.resellRate > 0 ? invCfg.resellRate : INVENTORY_RESELL_RATE;

  const pageTabs = useMemo(() => {
    return PAGE_TABS.filter((t) => {
      if (t.id === 'cosmetics') return invCfg.showCosmeticsTab;
      if (t.id === 'powers') return invCfg.showPowersTab;
      return true;
    });
  }, [invCfg.showCosmeticsTab, invCfg.showPowersTab]);

  const equippedBanner = useMemo(() => {
    const row =
      items.find((i) => i.isEquipped && i.cosmeticSlot === 'banner' && i.bannerConfig) ?? null;
    return row ? normalizeBannerConfig(row.bannerConfig) : null;
  }, [items]);
  const equippedFrame = useMemo(() => {
    const row =
      items.find((i) => i.isEquipped && i.cosmeticSlot === 'frame' && i.cosmeticConfig) ?? null;
    return row ? normalizeFrameConfig(row.cosmeticConfig) : null;
  }, [items]);
  const equippedNickname = useMemo(() => {
    const row =
      items.find((i) => i.isEquipped && i.cosmeticSlot === 'nickname' && i.cosmeticConfig) ?? null;
    return row ? normalizeNicknameConfig(row.cosmeticConfig) : null;
  }, [items]);

  const reload = useMemo(() => {
    return async () => {
      setLoading(true);
      try {
        const [next, skins, settings] = await Promise.all([
          getMyInventory(),
          getMyEquippedSkinAttachments().catch(() => [] as SkinAttachment[]),
          getSiteSettings().catch(() => null),
        ]);
        setItems(next);
        setSkinsLoad(skins);
        if (settings) {
          const cfg = parseInventoryConfig(
            (settings as { inventoryConfigJson?: string }).inventoryConfigJson ?? '{}'
          );
          setInvCfg(cfg);
          setPageTab((cur) => {
            if (cur === 'cosmetics' && !cfg.showCosmeticsTab) return cfg.defaultPageTab;
            if (cur === 'powers' && !cfg.showPowersTab) return cfg.defaultPageTab;
            return cur;
          });
        }
      } finally {
        setLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

<<<<<<< HEAD
  const pageIncludes = useMemo(
    () => pageTabs.find((p) => p.id === pageTab)?.includes ?? [],
    [pageTabs, pageTab]
  );
=======
  const pageIncludes = pageTabs.find((p) => p.id === pageTab)?.includes ?? [];
>>>>>>> origin/main
  useEffect(() => {
    if (!pageTabs.some((t) => t.id === pageTab)) {
      setPageTab(pageTabs[0]?.id ?? 'skins');
    }
  }, [pageTab, pageTabs]);

  const subTabsForPage = useMemo(() => {
    const out: { id: SubTabId; label: string }[] = [{ id: 'equipped', label: 'Equipped' }];
    for (const inc of pageIncludes) {
      const label =
        inc === 'banners'
          ? 'Banners'
          : inc === 'frames'
            ? 'Frames'
            : inc === 'nickname'
              ? 'Nickname'
              : inc === 'skins'
                ? 'Skins'
                : inc === 'perks'
                  ? 'Perks'
                  : inc === 'boosts'
                    ? 'Boosts'
                    : inc === 'emotes'
                      ? 'Emotes'
                      : 'Other';
      out.push({ id: inc, label });
    }
    return out;
  }, [pageIncludes]);

  useEffect(() => {
    const valid = new Set(subTabsForPage.map((s) => s.id));
    if (!valid.has(subTab)) setSubTab(subTabsForPage[0]?.id ?? 'equipped');
  }, [subTab, subTabsForPage]);

  const filtered = useMemo(() => {
    let list = items;
    if (subTab === 'equipped') {
      list = items.filter((i) => i.isEquipped);
      const pageKinds = new Set<string>();
      for (const inc of pageIncludes) pageKinds.add(inc);
      list = list.filter((i) => pageKinds.has(CATEGORY_BY_KIND[inventoryKind(i)]));
    } else {
      list = items.filter((i) => resolveShopTab(i) === subTab);
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime();
        case 'name':
          return a.itemName.localeCompare(b.itemName);
        case 'value':
          return b.vpValue - a.vpValue;
        default:
          return new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime();
      }
    });
  }, [items, subTab, sort, pageIncludes]);

  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null),
    [items, selectedItemId]
  );

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      await reload();
      onEquipChange?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const tryEquip = async (item: InventoryRow, confirmClear = false) => {
    setBusyId(item.id);
    try {
      const result = await equipInventoryItem(item.id, {
        confirmClearClashes: confirmClear,
      });
      if ('needsConfirm' in result && result.needsConfirm) {
        setPendingClash({
          itemId: item.id,
          itemName: item.itemName,
          reasons: result.reasons,
        });
        return;
      }
      toast({ title: `Equipped ${item.itemName}` });
      await reload();
      onEquipChange?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDropOnSlot = async (
    slot: (typeof EQUIP_SLOTS)[number],
    payload: InventoryRow | null
  ) => {
    setDragOverSlot(null);
    if (!payload) return;
    if (busyId === payload.id) return;
    const kind = inventoryKind(payload);
    if (!slot.accepts.includes(kind)) {
      toast({
        title: `Doesn't fit ${slot.label}`,
        description: `${payload.itemName} is not valid for this slot.`,
        variant: 'destructive',
      });
      return;
    }
    await tryEquip(payload, false);
  };

  const handleDropOnEquipZone = async (payload: InventoryRow | null) => {
    setDragOverSlot(null);
    if (!payload || busyId === payload.id) return;
    await tryEquip(payload, false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            'w-full max-w-full sm:w-[min(var(--inv-max,1100px),95vw)] sm:max-w-[min(var(--inv-max,1100px),95vw)] h-[100dvh]',
            'p-0 gap-0 overflow-hidden flex flex-col',
            'bg-slate-900/95 backdrop-blur-md border-slate-700/30 text-white',
            'shadow-[0_30px_80px_-10px_rgba(0,0,0,0.65)]'
          )}
            style={
              {
                '--inv-max': `${invCfg.sheetMaxWidth}px`,
              } as CSSProperties
            }
        >
          <SheetHeader className="relative shrink-0 px-4 sm:px-6 pt-5 pb-3 pr-12 border-b border-slate-700/30 bg-gradient-to-b from-slate-800/60 to-transparent">
            <SheetTitle className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xl font-black tracking-wide">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-white">{invCfg.title || 'INVENTORY'}</span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {invCfg.subtitle.trim()
                      ? invCfg.subtitle
                      : `${items.length} item${items.length === 1 ? '' : 's'}`}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Tabs
                  value={pageTab}
                  onValueChange={(v) => {
                    setPageTab(v as PageTabId);
                    setSelectedItemId(null);
                  }}
                  className="w-auto"
                >
                  <TabsList className="h-9 p-1 rounded-lg bg-slate-800/60 border border-slate-700/40 gap-1">
                    {pageTabs.map((t) => (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="h-7 px-3 sm:px-4 text-xs font-bold uppercase tracking-[0.14em] data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-inner data-[state=active]:border data-[state=active]:border-primary/30 border border-transparent rounded-md"
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                  <SelectTrigger className="w-32 sm:w-36 h-9 bg-slate-800/60 border-slate-700/40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700/40 text-white">
                    <SelectItem value="newest" className="text-xs">
                      Newest first
                    </SelectItem>
                    <SelectItem value="oldest" className="text-xs">
                      Oldest first
                    </SelectItem>
                    <SelectItem value="name" className="text-xs">
                      Name (A-Z)
                    </SelectItem>
                    <SelectItem value="value" className="text-xs">
                      Value (high-low)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div
            className={cn(
              'flex-1 min-h-0 grid gap-0 overflow-y-auto md:overflow-hidden overscroll-contain',
              invCfg.showPreviewColumn
                ? 'grid-cols-1 md:grid-cols-[1.15fr_0.95fr] md:grid-rows-[minmax(0,1fr)]'
                : 'grid-cols-1 md:grid-rows-[minmax(0,1fr)]'
            )}
          >
            <section className="flex flex-col md:min-h-0 border-b md:border-b-0 md:border-r border-slate-700/30 p-4 sm:p-5 gap-4">
              <Tabs
                value={subTab}
                onValueChange={(v) => {
                  setSubTab(v as SubTabId);
                  setSelectedItemId(null);
                }}
                className="w-full"
              >
                <TabsList className="w-full h-auto min-h-10 p-1 rounded-lg bg-slate-800/40 border border-slate-700/40 gap-1 flex-wrap justify-start">
                  {subTabsForPage.map((t) => {
                    const count =
                      t.id === 'equipped'
                        ? items.filter(
                            (i) =>
                              i.isEquipped &&
                              pageIncludes.includes(CATEGORY_BY_KIND[inventoryKind(i)])
                          ).length
                        : items.filter((i) => resolveShopTab(i) === t.id).length;
                    return (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="h-8 px-3 text-xs font-semibold data-[state=active]:bg-primary/20 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/30 rounded-md"
                      >
                        <span className="mr-1">{t.label}</span>
                        <span className="text-[10px] opacity-60">{count}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              <div
                onDragOver={(e) => {
                  if (!invCfg.enableDragDrop) return;
                  e.preventDefault();
                  setDragOverSlot('__equip__');
                }}
                onDragLeave={() =>
                  setDragOverSlot((cur) => (cur === '__equip__' ? null : cur))
                }
                onDrop={(e) => {
                  if (!invCfg.enableDragDrop) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/inventory-item-id');
                  const row = id ? items.find((i) => i.id === id) ?? null : null;
                  void handleDropOnEquipZone(row);
                }}
                className={cn(
                  'rounded-xl border transition-colors shrink-0',
                  'p-3 bg-slate-900/60 border-slate-700/40',
                  dragOverSlot === '__equip__'
                    ? 'ring-2 ring-primary/70 bg-primary/10 border-primary/40'
                    : ''
                )}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                    Equipped ·{' '}
                    {pageTab === 'cosmetics'
                      ? 'Drop cosmetics here'
                      : pageTab === 'powers'
                        ? 'Drop powers here'
                        : 'Drop gear here'}
                  </p>
                  <Badge className="hidden sm:inline-flex bg-slate-800/60 text-slate-300 border-slate-700/40 text-[10px] h-5">
                    <Upload className="h-3 w-3 mr-1" />
                    {invCfg.enableDragDrop ? 'Drag & drop' : 'Click to equip'}
                  </Badge>
                </div>
                <div
                  className={cn(
                    'grid gap-2 md:gap-3',
                    pageTab === 'skins'
                      ? 'grid-cols-3 sm:grid-cols-6'
                      : pageTab === 'cosmetics'
                        ? 'grid-cols-3 sm:grid-cols-5'
                        : 'grid-cols-2 sm:grid-cols-2'
                  )}
                >
                  {equipSlotsForPage(pageTab).map((slot) => {
                    const equipped = itemForEquipSlot(slot, items);
                    const isOver = dragOverSlot === slot.key;
                    return (
                      <div
                        key={slot.key}
                        onDragOver={(e) => {
                          if (!invCfg.enableDragDrop) return;
                          e.preventDefault();
                          setDragOverSlot(slot.key);
                        }}
                        onDragLeave={() =>
                          setDragOverSlot((cur) => (cur === slot.key ? null : cur))
                        }
                        onDrop={(e) => {
                          if (!invCfg.enableDragDrop) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const id = e.dataTransfer.getData('text/inventory-item-id');
                          const row = id ? items.find((i) => i.id === id) ?? null : null;
                          void handleDropOnSlot(slot, row);
                        }}
                        className={cn(
                          'group relative aspect-square rounded-lg border transition-all overflow-hidden',
                          'bg-gradient-to-b from-slate-900/80 to-slate-950/80',
                          isOver
                            ? 'ring-2 ring-primary border-primary/60 scale-[1.03]'
                            : 'border-slate-700/40 hover:border-primary/40'
                        )}
                      >
                        {equipped ? (
                          <div
                            className={cn(
                              'absolute inset-0 cursor-pointer',
                              selectedItemId === equipped.id && 'ring-2 ring-primary'
                            )}
                            onClick={() => setSelectedItemId(equipped.id)}
                            title={`${equipped.itemName} · ${slot.label}`}
                          >
                            <InventoryPreviewSmall item={equipped} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                            <div className="absolute left-1.5 right-1.5 bottom-1.5">
                              <p className="text-[10px] font-bold truncate text-white">
                                {equipped.itemName}
                              </p>
                              <p className="text-[9px] uppercase tracking-wider text-primary/90">
                                {slot.label}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 group-hover:text-primary/80">
                            <SlotIcon slot={slot} />
                            <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] opacity-70">
                              {slot.label}
                            </p>
                            <p className="mt-0.5 text-[9px] opacity-50">Empty</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="md:min-h-0 md:flex-1 md:overflow-hidden flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                    {subTab === 'equipped' ? 'Equipped list' : 'Backpack'}
                  </p>
                  <Badge className="bg-slate-800/60 text-slate-200 border-slate-700/40 text-[10px] h-5">
                    {filtered.length} item{filtered.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {loading ? (
                  <div className="py-12 flex items-center justify-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory...
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <ShoppingBag className="w-10 h-10 mx-auto opacity-40" />
                    <p>No items yet. Visit the store to buy cosmetics and boosts.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  subTab === 'equipped' ? (
                    <div className="py-10 text-center text-slate-400 text-sm space-y-2">
                      <p>No equipped items yet.</p>
                      <p className="text-xs text-slate-500">
                        Pick a category tab above to view your backpack and equip items.
                      </p>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-400 text-sm">
                      No items in this category.
                    </div>
                  )
                ) : (
                  <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1 md:-mr-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-1">
                      {filtered.map((item) => {
                        const kind = inventoryKind(item);
                        const draggable =
                          invCfg.enableDragDrop &&
                          ['skin', 'banner', 'frame', 'nickname'].includes(kind);
                        const isSelected = selectedItemId === item.id;
                        return (
                          <Card
                            key={item.id}
                            draggable={draggable}
                            onDragStart={(e) => {
                              if (!draggable) return;
                              e.dataTransfer.setData('text/inventory-item-id', item.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragOverSlot(null)}
                            onClick={() => setSelectedItemId(item.id)}
                            className={cn(
                              'select-none relative bg-slate-900/60 backdrop-blur-md overflow-hidden cursor-pointer transition-all',
                              'border-slate-700/40',
                              item.isEquipped
                                ? 'ring-1 ring-primary/50 border-primary/30'
                                : '',
                              isSelected
                                ? 'ring-2 ring-primary -translate-y-0.5 shadow-lg shadow-primary/10'
                                : 'hover:border-primary/30 hover:-translate-y-0.5'
                            )}
                          >
                            {draggable && (
                              <div className="absolute top-1 right-1 z-10 h-5 w-5 rounded bg-black/40 border border-slate-700/40 flex items-center justify-center text-white/60">
                                <Upload className="h-3 w-3" />
                              </div>
                            )}
                            <InventoryPreview
                              item={item}
                              viewerName={username}
                              viewerAvatar={avatarUrl}
                            />
                            <CardContent className="p-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-semibold text-xs truncate">
                                  {item.itemName}
                                </p>
                                {item.isEquipped && (
                                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] h-4 shrink-0">
                                    Equipped
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 capitalize truncate">
                                {item.itemCategory}
                              </p>
                              <div className="flex flex-wrap gap-1 pt-1">
                                {item.cosmeticSlot &&
                                  (item.isEquipped ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-[10px] flex-1 px-1.5"
                                      disabled={busyId === item.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void withBusy(item.id, () =>
                                          unequipCosmeticSlot(item.cosmeticSlot!).then(
                                            () => {}
                                          )
                                        );
                                      }}
                                    >
                                      {busyId === item.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        'Unequip'
                                      )}
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="h-6 text-[10px] flex-1 px-1.5 bg-primary/80 hover:bg-primary"
                                      disabled={busyId === item.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void tryEquip(item, false);
                                      }}
                                    >
                                      {busyId === item.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <>
                                          <ShieldCheck className="w-3 h-3 mr-1" /> Equip
                                        </>
                                      )}
                                    </Button>
                                  ))}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] flex-1 px-1.5"
                                  disabled={busyId === item.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void withBusy(item.id, () =>
                                      resellInventoryItem(item.id).then((r) => {
                                        toast({ title: `Sold for ${r.refund} VP` });
                                      })
                                    );
                                  }}
                                >
                                  {busyId === item.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    `Sell ${Math.floor(
                                      item.vpValue * resellRate
                                    )} VP`
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-red-400 shrink-0"
                                  disabled={busyId === item.id}
                                  title="Discard"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void withBusy(item.id, () =>
                                      deleteInventoryItem(item.id).then(() => {})
                                    );
                                  }}
                                >
                                  {busyId === item.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-700/40 bg-slate-900/60 p-3 min-h-[90px] shrink-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-2">
                  Item detail
                </p>
                {selectedItem ? (
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-slate-700/40 bg-slate-950">
                      <InventoryPreviewSmall item={selectedItem} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm truncate">
                          {selectedItem.itemName}
                        </p>
                        {selectedItem.isEquipped && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] h-4">
                            Equipped
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 capitalize truncate">
                        {selectedItem.itemCategory} ·{' '}
                        {selectedItem.cosmeticSlot ?? 'cosmetic'}
                      </p>
                      <p className="text-[11px] text-slate-300 leading-snug line-clamp-3">
                        {selectedItem.cosmeticSlot
                          ? `Equip onto your character. Drag onto a slot or use Equip. Resell refund: ${Math.floor(
                              selectedItem.vpValue * resellRate
                            )} VP.`
                          : `Power / boost that activates when purchased or equipped. Resell refund: ${Math.floor(
                              selectedItem.vpValue * resellRate
                            )} VP.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Select an item from the grid to view details and equip to the model.
                  </p>
                )}
              </div>
            </section>

            {invCfg.showPreviewColumn && (
            <section className="relative md:min-h-0 flex flex-col p-4 sm:p-5 gap-4 md:overflow-y-auto bg-gradient-to-br from-slate-900/70 via-slate-800/50 to-slate-900/70">
              <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.14),transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(148,163,184,0.12),transparent_55%)]" />
              </div>

              <div className="relative flex items-center justify-between z-10">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                  {pageTab === 'cosmetics' ? 'Profile preview' : 'Equipment preview'}
                </p>
                <Badge className="bg-slate-800/60 text-slate-300 border-slate-700/40 text-[10px] h-5">
                  {pageTab === 'cosmetics' ? 'Live profile' : 'Idle · Auto spin'}
                </Badge>
              </div>

              {pageTab === 'cosmetics' ? (
                <div className="relative flex-1 min-h-[280px] sm:min-h-[380px] rounded-2xl border border-slate-700/40 overflow-hidden bg-gradient-to-b from-slate-900/80 to-slate-950/80 z-10">
                  <div className="absolute inset-0 p-3">
                    <div className="h-full rounded-xl border border-slate-700/40 bg-slate-950/30 overflow-hidden">
                      <ProfileHeroBanner
                        rounded
                        banner={equippedBanner}
                        avatar={
                          <AvatarWithFrame
                            src={avatarUrl}
                            fallback={(username?.trim() || 'You').charAt(0).toUpperCase()}
                            alt={username ?? 'Player'}
                            frameConfig={equippedFrame}
                            sizeClass="h-20 w-20 sm:h-24 sm:w-24"
                            borderClassName="border-4 border-slate-900 shadow-2xl"
                          />
                        }
                        title={
                          <div className="min-w-0">
                            <NicknameEffectText
                              name={username?.trim() || 'You'}
                              effect={equippedNickname}
                              className="text-xl sm:text-2xl font-black truncate"
                            />
                          </div>
                        }
                        subtitle={
                          <p className="text-xs text-slate-300/80 mt-1">
                            Banner · Frame · Nickname preview
                          </p>
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative flex-1 min-h-[280px] sm:min-h-[380px] rounded-2xl border border-slate-700/40 overflow-hidden bg-gradient-to-b from-slate-900/80 to-slate-950/80 z-10">
                  <InventoryAvatarPreview
                    key={`${invCfg.previewModelUrl}|${invCfg.previewClipName}`}
                    className="absolute inset-0"
                    attachments={skinsLoad}
                    modelUrl={invCfg.previewModelUrl || null}
                    defaultClipName={invCfg.previewClipName || undefined}
                    spinSpeed={invCfg.previewSpinSpeed}
                  />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-white/60 pointer-events-none">
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-slate-700/40">
                      {invCfg.previewModelUrl.trim() ? 'Custom model' : 'Default model'}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-slate-700/40">
                      {invCfg.previewClipName.trim() || 'Idle'} · Equipped skins
                    </span>
                  </div>
                </div>
              )}

              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 z-10 shrink-0">
                {equipSlotsForPage(pageTab).map((slot) => {
                  const equipped = itemForEquipSlot(slot, items);
                  return (
                    <div
                      key={slot.key}
                      className="rounded-lg border transition-all bg-slate-900/60 border-slate-700/40 p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-10 w-10 shrink-0 rounded-md flex items-center justify-center border',
                            equipped
                              ? 'border-primary/40 bg-primary/10 text-primary overflow-hidden'
                              : 'border-slate-700/40 bg-slate-950 text-slate-500'
                          )}
                        >
                          {equipped ? (
                            <InventoryPreviewSmall item={equipped} />
                          ) : (
                            <SlotIcon slot={slot} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-semibold">
                            Slot: {slot.label}
                          </p>
                          <p
                            className={cn(
                              'text-xs truncate font-semibold',
                              equipped ? 'text-white' : 'text-slate-500'
                            )}
                          >
                            {equipped ? equipped.itemName : '[Empty]'}
                          </p>
                        </div>
                        {equipped && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-slate-300 hover:text-red-400"
                            disabled={busyId === equipped.id || !equipped.cosmeticSlot}
                            onClick={() =>
                              withBusy(equipped.id, () =>
                                unequipCosmeticSlot(equipped.cosmeticSlot!).then(() => {})
                              )
                            }
                          >
                            {busyId === equipped.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Remove'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(pendingClash)}
        onOpenChange={(open) => {
          if (!open) setPendingClash(null);
        }}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove clashing skins?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-slate-300 text-sm">
                <p>
                  To equip{' '}
                  <span className="font-semibold text-white">
                    {pendingClash?.itemName}
                  </span>
                  , these need to come off first:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {(pendingClash?.reasons ?? []).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = pendingClash;
                setPendingClash(null);
                if (!pending) return;
                const row = items.find((i) => i.id === pending.itemId);
                if (row) void tryEquip(row, true);
              }}
            >
              Unequip &amp; Equip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
