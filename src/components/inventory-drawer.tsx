'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, ShieldCheck, ShoppingBag, Trash2 } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  deleteInventoryItem,
  equipInventoryItem,
  getMyInventory,
  resellInventoryItem,
  unequipCosmeticSlot,
} from '@/lib/social-actions';
import { normalizeBannerConfig } from '@/lib/banner';
import { BannerFill } from '@/components/banner-fill';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type InventoryRow = Awaited<ReturnType<typeof getMyInventory>>[number];
type SortMode = 'newest' | 'oldest' | 'name' | 'value';
type InvTabId = Exclude<ShopTabId, 'fire' | 'all'> | 'all' | 'equipped';

const INV_TABS: { id: InvTabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'equipped', label: 'Equipped' },
  { id: 'banners', label: 'Banners' },
  { id: 'frames', label: 'Frames' },
  { id: 'nickname', label: 'Nickname' },
  { id: 'skins', label: 'Skins' },
  { id: 'perks', label: 'Perks' },
  { id: 'boosts', label: 'Boosts' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'other', label: 'Other' },
];

function InventoryPreview({ item }: { item: InventoryRow }) {
  if (item.bannerConfig) {
    const banner = normalizeBannerConfig(item.bannerConfig);
    return <BannerFill banner={banner} className="h-16 w-full" />;
  }
  if (item.cosmeticSlot === 'frame' && item.cosmeticConfig) {
    const frame = normalizeFrameConfig(item.cosmeticConfig);
    return (
      <div className="h-16 w-full flex items-center justify-center bg-slate-950">
        <div
          className={cn('rounded-full', frameAnimationClass(frame))}
          style={frameWrapperStyle(frame)}
        >
          <div className="h-10 w-10 rounded-full bg-slate-800 border-2 border-slate-900" />
        </div>
      </div>
    );
  }
  if (item.cosmeticSlot === 'nickname' && item.cosmeticConfig) {
    const nick = normalizeNicknameConfig(item.cosmeticConfig);
    return (
      <div className="h-16 w-full flex items-center justify-center bg-slate-950 px-2">
        <span
          className={cn('text-sm font-black truncate', nicknameEffectClass(nick))}
          style={nicknameEffectStyle(nick)}
        >
          You
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

export function InventoryDrawer({
  open,
  onOpenChange,
  onEquipChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after equip/unequip/resell/delete so parents can refresh derived UI (e.g. rail banner). */
  onEquipChange?: () => void;
}) {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>('newest');
  const [tab, setTab] = useState<InvTabId>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  const reload = () => {
    setLoading(true);
    getMyInventory()
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) reload();
  }, [open]);

  const visibleTabs = useMemo(() => {
    return INV_TABS.filter((t) => {
      if (t.id === 'all') return true;
      if (t.id === 'equipped') return items.some((i) => i.isEquipped);
      return items.some((i) => resolveShopTab(i) === t.id);
    });
  }, [items]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id ?? 'all');
    }
  }, [visibleTabs, tab]);

  const filtered = useMemo(() => {
    let list = items;
    if (tab === 'equipped') list = items.filter((i) => i.isEquipped);
    else if (tab !== 'all') list = items.filter((i) => resolveShopTab(i) === tab);

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
  }, [items, tab, sort]);

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      reload();
      onEquipChange?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[440px] bg-slate-900/60 backdrop-blur-md border-l border-slate-700/30 text-white overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold flex items-center gap-2">
            <Package /> Inventory
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-sm text-slate-400">
            {items.length} item{items.length === 1 ? '' : 's'}
          </p>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className="w-40 bg-slate-800/60 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="value">Value (high-low)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!loading && items.length > 0 && (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as InvTabId)}
            className="mt-3"
          >
            <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1">
              {visibleTabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex-none text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory...
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <ShoppingBag className="w-10 h-10 mx-auto opacity-40" />
            <p>No items yet. Visit the store to buy cosmetics and boosts.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No items in this category.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <Card
                key={item.id}
                className={`bg-slate-900/60 backdrop-blur-md border-slate-700/30 overflow-hidden ${
                  item.isEquipped ? 'ring-2 ring-primary' : ''
                }`}
              >
                <InventoryPreview item={item} />
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-semibold text-sm truncate">{item.itemName}</p>
                    {item.isEquipped && (
                      <Badge className="bg-primary text-[10px] h-5 shrink-0">Equipped</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 capitalize truncate">
                    {item.cosmeticSlot
                      ? `${item.itemCategory} · ${item.cosmeticSlot}`
                      : item.itemCategory}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {item.cosmeticSlot &&
                      (item.isEquipped ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1"
                          disabled={busyId === item.id}
                          onClick={() =>
                            withBusy(item.id, () =>
                              unequipCosmeticSlot(item.cosmeticSlot!).then(() => {})
                            )
                          }
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
                          className="h-7 text-xs flex-1"
                          disabled={busyId === item.id}
                          onClick={() =>
                            withBusy(item.id, () =>
                              equipInventoryItem(item.id).then(() => {})
                            )
                          }
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
                      className="h-7 text-xs flex-1"
                      disabled={busyId === item.id}
                      onClick={() =>
                        withBusy(item.id, () =>
                          resellInventoryItem(item.id).then((r) => {
                            toast({ title: `Sold for ${r.refund} VP` });
                          })
                        )
                      }
                    >
                      {busyId === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        `Sell ${Math.floor(item.vpValue * INVENTORY_RESELL_RATE)} VP`
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400 shrink-0"
                      disabled={busyId === item.id}
                      title="Discard"
                      onClick={() =>
                        withBusy(item.id, () =>
                          deleteInventoryItem(item.id).then(() => {})
                        )
                      }
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
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
