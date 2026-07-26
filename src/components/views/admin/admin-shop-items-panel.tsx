'use client';

import { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  Flame,
  LayoutGrid,
  List,
  Loader2,
  Megaphone,
  Search,
  Trash2,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UnlockChannelSelect } from '@/components/views/admin/unlock-channel-select';
import { BannerFill } from '@/components/banner-fill';
import { StoreItemPreview } from '@/components/store-item-preview';
import { normalizeBannerConfig } from '@/lib/banner';
import {
  SHOP_TABS,
  filterByShopTab,
  formatFireSaleCountdown,
  getEffectiveVpPrice,
  isFireSaleActive,
  type ShopTabId,
} from '@/lib/shop-catalog';
import {
  adminDeleteStoreItem,
  adminQuickUpdateStoreItem,
  type adminGetAllStoreItems,
} from '@/lib/social-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type StoreRow = Awaited<ReturnType<typeof adminGetAllStoreItems>>[number];

const UNLOCK_LABEL: Record<string, string> = {
  event: 'Event reward',
  mission: 'Mission reward',
  achievement: 'Achievement reward',
  badge: 'Badge reward',
  purchase: 'Purchase',
};

const QUICK_CATEGORIES = [
  'Skins',
  'Cosmetics',
  'Profile Banner',
  'Avatar Frame',
  'Nickname Effect',
  'Perks',
  'Boosts',
  'Emotes',
  'Other',
];

function toLocalDatetimeValue(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function QuickEdit({
  item,
  onSaved,
  onDeleted,
}: {
  item: StoreRow;
  onSaved: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(item.itemName);
  const [price, setPrice] = useState(item.vpPrice);
  const [category, setCategory] = useState(item.itemCategory);
  const [available, setAvailable] = useState(item.isAvailable);
  const [unlockType, setUnlockType] = useState(item.unlockType || 'purchase');
  const [unlockRef, setUnlockRef] = useState(item.unlockRef || '');
  const [eventEndsAt, setEventEndsAt] = useState(toLocalDatetimeValue(item.eventEndsAt));
  const [promoted, setPromoted] = useState(Boolean(item.promoted));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    setBusy('save');
    try {
      await adminQuickUpdateStoreItem(item.id, {
        itemName: name,
        vpPrice: price,
        itemCategory: category,
        isAvailable: available,
        unlockType,
        unlockRef: unlockRef || null,
        eventEndsAt: eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
        promoted,
      });
      toast({ title: `Updated ${name}` });
      await onSaved();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete “${item.itemName}” from the shop? Owned copies stay in inventories.`)) {
      return;
    }
    setBusy('delete');
    try {
      await adminDeleteStoreItem(item.id);
      toast({ title: `Deleted ${item.itemName}` });
      await onDeleted();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Delete failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-t border-slate-700/50 bg-slate-950/50 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 bg-slate-900/50 border-slate-700"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">VP price</Label>
        <Input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value) || 0)}
          className="h-8 bg-slate-900/50 border-slate-700"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 bg-slate-900/50 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...new Set([category, ...QUICK_CATEGORIES])].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <Trophy className="h-3 w-3 text-amber-400" /> Obtained via
        </Label>
        <UnlockChannelSelect value={unlockType} onValueChange={setUnlockType} />
      </div>
      {unlockType !== 'purchase' && (
        <div className="space-y-1">
          <Label className="text-xs">Event / mission / badge name</Label>
          <Input
            value={unlockRef}
            onChange={(e) => setUnlockRef(e.target.value)}
            placeholder="Summer Run 2026"
            className="h-8 bg-slate-900/50 border-slate-700"
          />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <CalendarClock className="h-3 w-3 text-sky-400" /> Event ends (countdown)
        </Label>
        <Input
          type="datetime-local"
          value={eventEndsAt}
          onChange={(e) => setEventEndsAt(e.target.value)}
          className="h-8 bg-slate-900/50 border-slate-700"
        />
      </div>
      <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-2">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <Switch checked={available} onCheckedChange={setAvailable} />
          Visible in shop
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <Switch checked={promoted} onCheckedChange={setPromoted} />
          <Megaphone className="h-3 w-3 text-fuchsia-400" /> Dashboard promo
        </label>
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-red-400"
          disabled={busy !== null}
          onClick={() => void remove()}
        >
          {busy === 'delete' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </>
          )}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={() => void save()}>
          {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin shop catalog: search + category/availability filters, list/grid view,
 * click a row to slide down inline quick-edit (price, name, unlock, promo…).
 */
export function AdminShopItemsPanel({
  items,
  viewer,
  fireSaleSelected,
  onToggleFireSale,
  onChanged,
}: {
  items: StoreRow[];
  viewer?: { username?: string; avatarUrl?: string };
  fireSaleSelected: string[];
  onToggleFireSale: (id: string, checked: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<ShopTabId>('all');
  const [availability, setAvailability] = useState<'all' | 'live' | 'hidden'>('all');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = filterByShopTab(items, tab);
    if (availability === 'live') list = list.filter((i) => i.isAvailable);
    if (availability === 'hidden') list = list.filter((i) => !i.isAvailable);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (i) =>
          i.itemName.toLowerCase().includes(needle) ||
          i.itemSku.toLowerCase().includes(needle) ||
          i.itemCategory.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [items, tab, availability, q]);

  const renderBadges = (item: StoreRow) => {
    const onFire = isFireSaleActive(item);
    return (
      <>
        {!item.isAvailable && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            Hidden
          </Badge>
        )}
        {item.unlockType && item.unlockType !== 'purchase' && (
          <Badge className="bg-amber-700 text-[9px] px-1.5 py-0 gap-0.5">
            <Trophy className="h-2.5 w-2.5" />
            {UNLOCK_LABEL[item.unlockType] ?? item.unlockType}
          </Badge>
        )}
        {item.promoted && (
          <Badge className="bg-fuchsia-700 text-[9px] px-1.5 py-0 gap-0.5">
            <Megaphone className="h-2.5 w-2.5" /> Promo
          </Badge>
        )}
        {item.eventEndsAt && new Date(item.eventEndsAt).getTime() > Date.now() && (
          <Badge className="bg-sky-700 text-[9px] px-1.5 py-0">
            {formatFireSaleCountdown(item.eventEndsAt)}
          </Badge>
        )}
        {onFire && (
          <Badge className="bg-orange-600 text-[9px] px-1.5 py-0 gap-0.5">
            <Flame className="h-2.5 w-2.5" /> −{item.fireSalePercent}%
          </Badge>
        )}
      </>
    );
  };

  const renderThumb = (item: StoreRow, className: string) => {
    const banner = item.bannerConfig ? normalizeBannerConfig(item.bannerConfig) : null;
    if (banner) return <BannerFill banner={banner} className={cn(className, 'rounded')} />;
    return (
      <div className={cn('relative overflow-hidden rounded bg-slate-900', className)}>
        <StoreItemPreview item={item} viewer={viewer} />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, SKU, category…"
            className="pl-8 bg-slate-900/50 border-slate-700"
          />
        </div>
        <Select value={tab} onValueChange={(v) => setTab(v as ShopTabId)}>
          <SelectTrigger className="w-40 bg-slate-900/50 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHOP_TABS.filter((t) => t.id !== 'fire').map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={availability}
          onValueChange={(v) => setAvailability(v as 'all' | 'live' | 'hidden')}
        >
          <SelectTrigger className="w-32 bg-slate-900/50 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-md border border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'px-2.5 py-2',
              view === 'list' ? 'bg-slate-700 text-white' : 'bg-slate-900/50 text-slate-400'
            )}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'px-2.5 py-2',
              view === 'grid' ? 'bg-slate-700 text-white' : 'bg-slate-900/50 text-slate-400'
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {filtered.length} item{filtered.length === 1 ? '' : 's'} · click one for quick edit ·
        checkbox = fire-sale selection
      </p>

      {view === 'list' ? (
        <div className="space-y-2">
          {filtered.map((item) => {
            const onFire = isFireSaleActive(item);
            const salePrice = getEffectiveVpPrice(item);
            const open = openId === item.id;
            return (
              <Card
                key={item.id}
                className={cn(
                  'bg-slate-800/40 border-slate-700/30 overflow-hidden',
                  onFire && 'border-orange-500/60',
                  open && 'border-cyan-500/50'
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left cursor-pointer"
                  onClick={() => setOpenId(open ? null : item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenId(open ? null : item.id);
                    }
                  }}
                >
                  <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={fireSaleSelected.includes(item.id)}
                          onCheckedChange={(v) => onToggleFireSale(item.id, Boolean(v))}
                          aria-label={`Select ${item.itemName}`}
                        />
                      </span>
                      {renderThumb(item, 'w-12 h-12 shrink-0')}
                      <div className="min-w-0">
                        <p className="font-semibold truncate flex items-center gap-1.5 flex-wrap">
                          {item.itemName}
                          {item.cosmeticSlot && (
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {item.cosmeticSlot}
                            </Badge>
                          )}
                          {renderBadges(item)}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {item.itemSku} ·{' '}
                          {item.unlockType && item.unlockType !== 'purchase' ? (
                            <span className="text-amber-300">
                              {UNLOCK_LABEL[item.unlockType] ?? item.unlockType}
                              {item.unlockRef ? ` — ${item.unlockRef}` : ''}
                            </span>
                          ) : onFire ? (
                            <>
                              <span className="text-orange-400 font-semibold">{salePrice} VP</span>{' '}
                              <span className="line-through">{item.vpPrice}</span>
                            </>
                          ) : (
                            <>{item.vpPrice} VP</>
                          )}{' '}
                          · {item.itemCategory}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-slate-500 transition-transform shrink-0',
                        open && 'rotate-180'
                      )}
                    />
                  </CardContent>
                </div>
                {open && (
                  <QuickEdit
                    item={item}
                    onSaved={async () => {
                      await onChanged();
                    }}
                    onDeleted={async () => {
                      setOpenId(null);
                      await onChanged();
                    }}
                  />
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((item) => {
            const open = openId === item.id;
            return (
              <Card
                key={item.id}
                className={cn(
                  'bg-slate-800/40 border-slate-700/30 overflow-hidden',
                  open && 'border-cyan-500/50 col-span-2 sm:col-span-3 lg:col-span-4'
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setOpenId(open ? null : item.id)}
                >
                  <div className={cn('flex', open ? 'items-center gap-3 p-3' : 'flex-col')}>
                    {renderThumb(item, open ? 'w-14 h-14 shrink-0' : 'aspect-square w-full')}
                    <div className={cn('min-w-0', !open && 'p-2')}>
                      <p className="text-xs font-semibold truncate">{item.itemName}</p>
                      <div className="flex flex-wrap gap-1 mt-1 items-center">
                        <span className="text-[10px] text-slate-400">
                          {item.unlockType && item.unlockType !== 'purchase'
                            ? UNLOCK_LABEL[item.unlockType] ?? item.unlockType
                            : `${getEffectiveVpPrice(item)} VP`}
                        </span>
                        {renderBadges(item)}
                      </div>
                    </div>
                    <span onClick={(e) => e.stopPropagation()} className={cn(!open && 'px-2 pb-2')}>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <Checkbox
                          checked={fireSaleSelected.includes(item.id)}
                          onCheckedChange={(v) => onToggleFireSale(item.id, Boolean(v))}
                        />
                        fire sale
                      </label>
                    </span>
                  </div>
                </button>
                {open && (
                  <QuickEdit
                    item={item}
                    onSaved={async () => {
                      await onChanged();
                    }}
                    onDeleted={async () => {
                      setOpenId(null);
                      await onChanged();
                    }}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardContent className="py-10 text-center text-sm text-slate-400">
            No items match the filters.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
