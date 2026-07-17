'use client';

import { useEffect, useState } from 'react';
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
import {
  deleteInventoryItem,
  equipInventoryItem,
  getMyInventory,
  resellInventoryItem,
  unequipCosmeticSlot,
} from '@/lib/social-actions';
import { bannerAnimationClass, bannerStyle, normalizeBannerConfig } from '@/lib/banner';
import { INVENTORY_RESELL_RATE } from '@/lib/inventory-constants';
import { useToast } from '@/hooks/use-toast';

type InventoryRow = Awaited<ReturnType<typeof getMyInventory>>[number];
type SortMode = 'newest' | 'oldest' | 'name' | 'value';

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

  const sorted = [...items].sort((a, b) => {
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

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      reload();
      onEquipChange?.();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Something went wrong', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[440px] bg-slate-900/95 backdrop-blur-md border-l border-slate-700 text-white overflow-y-auto"
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

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inventory...
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <ShoppingBag className="w-10 h-10 mx-auto opacity-40" />
            <p>No items yet. Visit the store to buy cosmetics and boosts.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {sorted.map((item) => {
              const banner = item.bannerConfig ? normalizeBannerConfig(item.bannerConfig) : null;
              return (
                <Card
                  key={item.id}
                  className={`bg-slate-800/60 border-slate-700/50 overflow-hidden ${
                    item.isEquipped ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div
                    className={`h-16 w-full flex items-center justify-center ${
                      banner ? bannerAnimationClass(banner) : 'bg-slate-900'
                    }`}
                    style={banner ? bannerStyle(banner) : undefined}
                  >
                    {!banner && item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    )}
                    {!banner && !item.imageUrl && (
                      <Package className="w-8 h-8 text-slate-600" />
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-semibold text-sm truncate">{item.itemName}</p>
                      {item.isEquipped && (
                        <Badge className="bg-primary text-[10px] h-5 shrink-0">Equipped</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 capitalize truncate">
                      {item.itemCategory}
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
                              withBusy(item.id, () => unequipCosmeticSlot(item.cosmeticSlot!).then(() => {}))
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
                            onClick={() => withBusy(item.id, () => equipInventoryItem(item.id).then(() => {}))}
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
                        onClick={() => withBusy(item.id, () => deleteInventoryItem(item.id).then(() => {}))}
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
        )}
      </SheetContent>
    </Sheet>
  );
}
