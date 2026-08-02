'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Flame, Gift, Loader2, Trophy } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getStoreItems } from '@/lib/actions';
import { purchaseStoreItem } from '@/lib/social-actions';
import type { StoreItem } from '@/generated/prisma';
import {
  filterByShopTab,
  formatFireSaleCountdown,
  getEffectiveVpPrice,
  isFireSaleActive,
  SHOP_SORTS,
  SHOP_TABS,
  sortShopItems,
  type ShopSortId,
  type ShopTabId,
} from '@/lib/shop-catalog';
import { StoreItemPreview } from '@/components/store-item-preview';
import { getAvailableCases, purchaseCrateFromShop, type CaseDto } from '@/lib/case-actions';
import { CrateContentsPreview } from '@/components/crate-contents-preview';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type CatalogItem = StoreItem & {
  purchaseCount?: number;
  fireSalePercent?: number;
  fireSaleEndsAt?: Date | string | null;
  createdAt?: Date | string | null;
}

function FireSaleCountdown({ endsAt }: { endsAt: Date | string }) {
  const [label, setLabel] = useState(() => formatFireSaleCountdown(endsAt));
  useEffect(() => {
    const tick = () => setLabel(formatFireSaleCountdown(endsAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return (
    <span className="tabular-nums font-semibold text-amber-200 drop-shadow">
      {label}
    </span>
  );
}

export default function StoreView({
  userId,
  username,
  avatarUrl,
}: {
  userId?: string;
  /** Live viewer identity for nickname / frame previews. */
  username?: string;
  avatarUrl?: string;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [tab, setTab] = useState<ShopTabId>('all');
  const [sort, setSort] = useState<ShopSortId>('popular');
  const [crates, setCrates] = useState<CaseDto[]>([]);
  const [cratesLoading, setCratesLoading] = useState(true);
  const [buyingCrateId, setBuyingCrateId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;
    getStoreItems()
      .then((data) => {
        if (!isMounted) return;
        setItems(data as CatalogItem[]);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        toast({
          title: 'Failed to load store',
          variant: 'destructive',
        });
      });
    return () => {
      isMounted = false;
    };
  }, [userId, toast]);

  const reloadCrates = () => {
    setCratesLoading(true);
    return getAvailableCases()
      .then((data) => setCrates(data.filter((c) => c.acquireType === 'vp_purchase')))
      .catch(() => setCrates([]))
      .finally(() => setCratesLoading(false));
  };

  useEffect(() => {
    void reloadCrates();
  }, [userId]);

  const buyCrate = async (c: CaseDto) => {
    setBuyingCrateId(c.id);
    try {
      await purchaseCrateFromShop(c.id);
      toast({ title: `Purchased ${c.name}`, description: 'Open it from your Inventory.' });
      await reloadCrates();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Purchase failed',
        variant: 'destructive',
      });
    } finally {
      setBuyingCrateId(null);
    }
  };

  const fireCount = useMemo(
    () => items.filter((i) => isFireSaleActive(i)).length,
    [items]
  );

  const visibleTabs = useMemo(() => {
    return SHOP_TABS.filter((t) => {
      if (t.id === 'fire') return fireCount > 0;
      if (t.id === 'all') return true;
      return filterByShopTab(items, t.id).length > 0;
    });
  }, [items, fireCount]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id ?? 'all');
    }
  }, [visibleTabs, tab]);

  const displayed = useMemo(() => {
    return sortShopItems(filterByShopTab(items, tab), sort);
  }, [items, tab, sort]);

  const buy = async (item: CatalogItem) => {
    setBuyingId(item.id);
    try {
      const result = await purchaseStoreItem(item.id);
      if (!result.ok) {
        toast({ title: result.error ?? 'Purchase failed', variant: 'destructive' });
      } else {
        const price = 'price' in result ? result.price : getEffectiveVpPrice(item);
        toast({ title: `Purchased ${item.itemName}`, description: `${price} VP` });
        const refreshed = await getStoreItems();
        setItems(refreshed as CatalogItem[]);
      }
    } catch {
      toast({ title: 'Purchase failed', variant: 'destructive' });
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Store</h2>
          <p className="text-xs text-slate-400">
            Cosmetics, boosts, and more — spend VP wisely
          </p>
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as ShopSortId)}>
          <SelectTrigger className="w-full sm:w-48 bg-slate-900/60 border-slate-700">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SHOP_SORTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!cratesLoading && crates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
            <Gift className="h-4 w-4 text-amber-400" /> Crates
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {crates.map((c) => (
              <Card
                key={c.id}
                className="bg-slate-900/60 backdrop-blur-md border-amber-500/20 hover:border-amber-400/50 transition-all overflow-hidden"
              >
                <CardContent className="p-4 space-y-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex items-center gap-3 w-full text-left">
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.imageUrl}
                            alt=""
                            className="h-14 w-14 rounded object-cover border border-amber-500/30"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded bg-slate-800 border border-amber-500/30 flex items-center justify-center">
                            <Gift className="h-7 w-7 text-amber-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{c.name}</p>
                          {c.description && (
                            <p className="text-[11px] text-slate-500 truncate">{c.description}</p>
                          )}
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 bg-slate-900 border-slate-700 p-3">
                      <CrateContentsPreview name={c.name} items={c.items} />
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-yellow-400 flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5" />
                      {c.vpPrice} VP
                    </p>
                    <Button
                      size="sm"
                      disabled={buyingCrateId === c.id}
                      onClick={() => void buyCrate(c)}
                    >
                      {buyingCrateId === c.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Buy'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-[40vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading catalog...
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
          <CardContent className="py-16 text-center text-slate-400">
            The store catalog is empty. Ask an admin to add items.
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as ShopTabId)}>
            <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-slate-800/60 p-1">
              {visibleTabs.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex-none gap-1.5">
                  {t.id === 'fire' && <Flame className="h-3.5 w-3.5 text-orange-400" />}
                  {t.label}
                  {t.id === 'fire' && (
                    <Badge className="ml-1 h-5 bg-orange-500/90 text-[10px]">
                      {fireCount}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {displayed.length === 0 ? (
            <Card className="bg-slate-800/40 border-slate-700/30">
              <CardContent className="py-12 text-center text-slate-400">
                No items in this category.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {displayed.map((item) => {
                const onFire = isFireSaleActive(item);
                const effective = getEffectiveVpPrice(item);
                const earned = Boolean(item.unlockType && item.unlockType !== 'purchase');
                const earnedLabel = earned
                  ? {
                      event: 'Event reward',
                      mission: 'Mission reward',
                      achievement: 'Achievement reward',
                      badge: 'Badge reward',
                    }[item.unlockType as string] ?? 'Reward'
                  : null;
                const eventLive =
                  item.eventEndsAt &&
                  new Date(item.eventEndsAt).getTime() > Date.now();
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'bg-slate-900/60 backdrop-blur-md border-slate-700/30 hover:border-primary/50 transition-all duration-300 group shadow-lg flex flex-col overflow-hidden',
                      onFire &&
                        'border-orange-500/70 shadow-[0_0_0_1px_rgba(249,115,22,0.35),0_0_24px_rgba(249,115,22,0.15)]'
                    )}
                  >
                    <CardContent className="p-0 w-full">
                      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-slate-800/30">
                        <StoreItemPreview
                          item={item}
                          viewer={{ username, avatarUrl }}
                        />
                        {onFire && (
                          <>
                            <div className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-orange-400/80" />
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-gradient-to-r from-orange-600 to-red-600 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">
                              <Flame className="h-3.5 w-3.5" />
                              Fire Sale −{item.fireSalePercent}%
                            </div>
                            {item.fireSaleEndsAt && (
                              <div className="absolute bottom-0 inset-x-0 z-10 bg-black/70 backdrop-blur-sm px-2 py-1.5 text-center text-xs">
                                Ends in{' '}
                                <FireSaleCountdown endsAt={item.fireSaleEndsAt} />
                              </div>
                            )}
                          </>
                        )}
                        {earned && (
                          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-600 to-yellow-600 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-white shadow-lg">
                            <Trophy className="h-3.5 w-3.5" />
                            {earnedLabel}
                          </div>
                        )}
                        {!onFire && eventLive && item.eventEndsAt && (
                          <div className="absolute bottom-0 inset-x-0 z-10 bg-black/70 backdrop-blur-sm px-2 py-1.5 text-center text-xs">
                            Ends in <FireSaleCountdown endsAt={item.eventEndsAt} />
                          </div>
                        )}
                      </div>
                      <div className="p-4 w-full">
                        <p className="text-xs text-slate-400 uppercase">
                          {item.itemCategory}
                        </p>
                        <h3 className="font-bold text-lg truncate">{item.itemName}</h3>
                        {earned ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                              <Trophy className="h-3.5 w-3.5" />
                              {earnedLabel}
                              {item.unlockRef ? ` · ${item.unlockRef}` : ''}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Can&apos;t be purchased — earn it in game.
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between mt-2 gap-2">
                            <div>
                              {onFire ? (
                                <div className="flex items-baseline gap-2">
                                  <p className="font-bold text-orange-400 flex items-center gap-1">
                                    <Coins className="h-3.5 w-3.5" />
                                    {effective} VP
                                  </p>
                                  <p className="text-xs text-slate-500 line-through">
                                    {item.vpPrice} VP
                                  </p>
                                </div>
                              ) : (
                                <p className="font-bold text-yellow-400 flex items-center gap-1">
                                  <Coins className="h-3.5 w-3.5" />
                                  {item.vpPrice} VP
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              disabled={buyingId === item.id}
                              className={onFire ? 'bg-orange-600 hover:bg-orange-500' : ''}
                              onClick={() => void buy(item)}
                            >
                              {buyingId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'Buy'
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
