'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  accepts: Array<'skin' | 'banner' | 'frame' | 'nickname' | 'perk' | 'boost'>;
  side: 'left' | 'right';
  cosmeticSlot?: string;
  icon?: 'head' | 'torso' | 'legs' | 'boots' | 'gloves' | 'back';
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
  const { toast } = useToast();

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
        const [next, skins] = await Promise.all([
          getMyInventory(),
          getMyEquippedSkinAttachments().catch(() => [] as SkinAttachment[]),
        ]);
        setItems(next);
        setSkinsLoad(skins);
      } finally {
        setLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const pageIncludes = PAGE_TABS.find((p) => p.id === pageTab)?.includes ?? [];
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
    if (!slot.accepts.includes(kind as 'skin')) {
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
            'w-[min(1100px,95vw)] max-w-[min(1100px,95vw)] h-[100vh]',
            'p-0 gap-0 overflow-hidden',
            'bg-[#0b1020]/95 backdrop-blur-md border-[#1a2540]/80 text-white',
            'shadow-[0_30px_80px_-10px_rgba(0,0,0,0.65)]'
          )}
        >
          <SheetHeader className="relative px-6 pt-5 pb-3 border-b border-white/10 bg-gradient-to-b from-[#121a33] to-transparent">
            <SheetTitle className="flex items-center justify-between text-xl font-black tracking-wide">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500/40 to-indigo-500/50 border border-cyan-400/30 flex items-center justify-center text-cyan-200">
                  <Package className="h-5 w-5" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-white">INVENTORY</span>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
                    {items.length} item{items.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Tabs
                  value={pageTab}
                  onValueChange={(v) => {
                    setPageTab(v as PageTabId);
                    setSelectedItemId(null);
                  }}
                  className="w-auto"
                >
                  <TabsList className="h-9 p-1 rounded-lg bg-slate-800/50 border border-white/10 gap-1">
                    {PAGE_TABS.map((t) => (
                      <TabsTrigger
                        key={t.id}
                        value={t.id}
                        className="h-7 px-4 text-xs font-bold uppercase tracking-[0.14em] data-[state=active]:bg-gradient-to-b data-[state=active]:from-cyan-500/30 data-[state=active]:to-indigo-500/30 data-[state=active]:text-white data-[state=active]:shadow-inner data-[state=active]:border data-[state=active]:border-cyan-400/30 border border-transparent rounded-md"
                      >
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                  <SelectTrigger className="w-36 h-9 bg-slate-800/40 border-white/10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
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

          <div className="grid grid-cols-1 md:grid-cols-[1.15fr_0.95fr] grid-rows-[auto_auto_1fr] md:grid-rows-[1fr_auto] gap-0 h-[calc(100%-60px)] overflow-hidden">
            <section className="flex flex-col min-h-0 border-r border-white/5 p-5 gap-4">
              <Tabs
                value={subTab}
                onValueChange={(v) => {
                  setSubTab(v as SubTabId);
                  setSelectedItemId(null);
                }}
                className="w-full"
              >
                <TabsList className="w-full h-10 p-1 rounded-lg bg-slate-800/30 border border-white/10 gap-1 flex-wrap">
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
                        className="h-8 px-3 text-xs font-semibold data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-200 border border-transparent data-[state=active]:border-cyan-400/30 rounded-md"
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
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/inventory-item-id');
                  const row = id ? items.find((i) => i.id === id) ?? null : null;
                  void handleDropOnEquipZone(row);
                }}
                className={cn(
                  'rounded-xl border transition-colors',
                  'p-3 bg-[#0d1528]/60 border-[#1a2644]/80 min-h-[240px] md:min-h-[290px]',
                  dragOverSlot === '__equip__'
                    ? 'ring-2 ring-cyan-400/70 bg-cyan-500/10 border-cyan-400/40'
                    : ''
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 font-bold">
                    Equipped · Drop gear here
                  </p>
                  <Badge className="bg-white/5 text-cyan-200 border-white/10 text-[10px] h-5">
                    <Upload className="h-3 w-3 mr-1" />
                    Drag & drop
                  </Badge>
                </div>
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  {EQUIP_SLOTS.filter((s) => s.side === 'left').concat(
                    EQUIP_SLOTS.filter((s) => s.side === 'right')
                  ).map((slot) => {
                    const equipped = itemForEquipSlot(slot, items);
                    const isOver = dragOverSlot === slot.key;
                    return (
                      <div
                        key={slot.key}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverSlot(slot.key);
                        }}
                        onDragLeave={() =>
                          setDragOverSlot((cur) => (cur === slot.key ? null : cur))
                        }
                        onDrop={(e) => {
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
                            ? 'ring-2 ring-cyan-400 border-cyan-400/60 scale-[1.03]'
                            : 'border-white/10 hover:border-cyan-400/30'
                        )}
                      >
                        {equipped ? (
                          <div
                            className={cn(
                              'absolute inset-0 cursor-pointer',
                              selectedItemId === equipped.id && 'ring-2 ring-cyan-400'
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
                              <p className="text-[9px] uppercase tracking-wider text-cyan-300/80">
                                {slot.label}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 group-hover:text-cyan-400/80">
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

              <div className="min-h-0 flex-1 overflow-hidden flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 font-bold">
                    {subTab === 'equipped' ? 'Equipped list' : 'Backpack'}
                  </p>
                  <Badge className="bg-white/5 text-slate-200 border-white/10 text-[10px] h-5">
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
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 -mr-1">
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3 pb-1">
                      {filtered.map((item) => {
                        const kind = inventoryKind(item);
                        const draggable = ['skin', 'banner', 'frame', 'nickname'].includes(
                          kind
                        );
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
                              'border-white/10',
                              item.isEquipped
                                ? 'ring-1 ring-cyan-400/50 border-cyan-400/30'
                                : '',
                              isSelected
                                ? 'ring-2 ring-cyan-400 -translate-y-0.5 shadow-lg shadow-cyan-500/10'
                                : 'hover:border-cyan-400/25 hover:-translate-y-0.5'
                            )}
                          >
                            {draggable && (
                              <div className="absolute top-1 right-1 z-10 h-5 w-5 rounded bg-black/40 border border-white/10 flex items-center justify-center text-white/60">
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
                                  <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30 text-[9px] h-4 shrink-0">
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
                                      className="h-6 text-[10px] flex-1 px-1.5 bg-cyan-600/70 hover:bg-cyan-500"
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
                                      item.vpValue * INVENTORY_RESELL_RATE
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

              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 min-h-[90px]">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 font-bold mb-2">
                  Item detail
                </p>
                {selectedItem ? (
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-slate-950">
                      <InventoryPreviewSmall item={selectedItem} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm truncate">
                          {selectedItem.itemName}
                        </p>
                        {selectedItem.isEquipped && (
                          <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30 text-[9px] h-4">
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
                          ? `Equip onto your character. Drag onto a slot on the right or use Equip. Resell refund: ${Math.floor(
                              selectedItem.vpValue * INVENTORY_RESELL_RATE
                            )} VP.`
                          : `Power / boost that activates when purchased or equipped. Resell refund: ${Math.floor(
                              selectedItem.vpValue * INVENTORY_RESELL_RATE
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

            <section className="relative min-h-0 flex flex-col p-5 gap-4 overflow-hidden bg-gradient-to-br from-[#0a1228]/70 via-[#0b1730]/70 to-[#100a26]/60">
              <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.25),transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.2),transparent_55%)]" />
              </div>

              <div className="relative flex items-center justify-between z-10">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80 font-bold">
                  {pageTab === 'cosmetics' ? 'Profile preview' : 'Equipment preview'}
                </p>
                <Badge className="bg-white/5 text-cyan-200 border-white/10 text-[10px] h-5">
                  {pageTab === 'cosmetics' ? 'Live profile' : 'Idle · Auto spin'}
                </Badge>
              </div>

              {pageTab === 'cosmetics' ? (
                <div className="relative flex-1 min-h-[380px] rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-b from-[#0d1730]/80 to-[#080d1d]/80 z-10">
                  <div className="absolute inset-0 p-3">
                    <div className="h-full rounded-xl border border-white/10 bg-slate-950/30 overflow-hidden">
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
                <div className="relative flex-1 min-h-[380px] rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-b from-[#0d1730]/80 to-[#080d1d]/80 z-10">
                  <InventoryAvatarPreview
                    className="absolute inset-0"
                    attachments={skinsLoad}
                    spinSpeed={0.45}
                  />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/60 pointer-events-none">
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-white/10">
                      Default model
                    </span>
                    <span className="px-2 py-1 rounded-md bg-black/40 border border-white/10">
                      Equipped skins preview
                    </span>
                  </div>
                </div>
              )}

              <div className="relative grid grid-cols-2 gap-3 z-10">
                {EQUIP_SLOTS.map((slot) => {
                  const equipped = itemForEquipSlot(slot, items);
                  return (
                    <div
                      key={slot.key}
                      className={cn(
                        'rounded-lg border transition-all',
                        'bg-slate-900/40 border-white/10 p-2.5',
                        slot.side === 'left' ? '' : ''
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-10 w-10 shrink-0 rounded-md flex items-center justify-center border',
                            equipped
                              ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200 overflow-hidden'
                              : 'border-white/10 bg-slate-950 text-slate-500'
                          )}
                        >
                          {equipped ? (
                            <InventoryPreviewSmall item={equipped} />
                          ) : (
                            <SlotIcon slot={slot} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/80 font-semibold">
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
