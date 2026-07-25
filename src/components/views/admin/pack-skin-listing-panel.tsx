'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, CalendarClock, Loader2, Megaphone, Search, ShoppingBag, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BannerFill } from '@/components/banner-fill';
import { normalizeBannerConfig } from '@/lib/banner';
import { useToast } from '@/hooks/use-toast';
import {
  adminListAssets,
  adminPublishAssetToShop,
  adminRemoveAssetFromShop,
} from '@/lib/asset-admin-actions';
import { loadCharacterAssetManifest } from '@/lib/asset-registry';
import { packBodyThumbnailPath } from '@/lib/pack-body-colors';
import { formatFireSaleCountdown } from '@/lib/shop-catalog';
import { cn } from '@/lib/utils';

type ListableAsset = {
  assetId: string;
  displayName: string;
  category: string;
  rarity: string;
  price: number;
  equipSlot: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  texturePath?: string | null;
  shopVisible: boolean;
};

const UNLOCK_TYPES = [
  { id: 'purchase', label: 'Purchase (VP)', hint: 'Players buy it in the shop' },
  { id: 'event', label: 'Event reward', hint: 'Won during a timed event' },
  { id: 'mission', label: 'Mission reward', hint: 'Granted by completing a mission' },
  { id: 'achievement', label: 'Achievement reward', hint: 'Granted by an achievement' },
  { id: 'badge', label: 'Badge reward', hint: 'Comes with a badge' },
] as const;

type UnlockTypeId = (typeof UNLOCK_TYPES)[number]['id'];

function assetThumb(a: ListableAsset): string | null {
  // A real thumbnail (ideally a rendered 3D icon) always wins over the raw
  // shared texture atlas fallback used for pack body-color variants.
  return (
    a.thumbnailUrl?.trim() ||
    packBodyThumbnailPath(a.assetId) ||
    packBodyThumbnailPath(a.displayName) ||
    a.previewUrl?.trim() ||
    a.texturePath?.trim() ||
    null
  );
}

/**
 * Cosmetics Studio → Skins: list ACTIVATED registry assets to the shop with
 * price / event / mission / achievement / badge unlocks + dashboard promo.
 */
export function PackSkinListingPanel({ onCreated }: { onCreated?: () => void }) {
  const { toast } = useToast();
  const [assets, setAssets] = useState<ListableAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ListableAsset | null>(null);
  const [saving, setSaving] = useState(false);

  // Listing form
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState(500);
  const [unlockType, setUnlockType] = useState<UnlockTypeId>('purchase');
  const [unlockRef, setUnlockRef] = useState('');
  const [eventEndsAt, setEventEndsAt] = useState('');
  const [promoted, setPromoted] = useState(false);
  const [promoHeadline, setPromoHeadline] = useState('');
  const [promoColorA, setPromoColorA] = useState('#7c3aed');
  const [promoColorB, setPromoColorB] = useState('#0ea5e9');
  const [promoAngle, setPromoAngle] = useState(120);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminListAssets({ enabled: true, take: 500 });
      if (res.items.length > 0) {
        setAssets(
          res.items.map((r) => ({
            assetId: r.assetId,
            displayName: r.displayName,
            category: r.category,
            rarity: r.rarity,
            price: r.price,
            equipSlot: r.equipSlot,
            thumbnailUrl: r.thumbnailUrl,
            previewUrl: r.previewUrl,
            texturePath: r.texturePath,
            shopVisible: r.shopVisible,
          }))
        );
        return;
      }
      const man = await loadCharacterAssetManifest(true);
      setAssets(
        (man?.assets ?? [])
          .filter((a) => a.enabled)
          .map((a) => ({
            assetId: a.id,
            displayName: a.displayName,
            category: a.category,
            rarity: a.rarity,
            price: a.price,
            equipSlot: a.equipSlot,
            thumbnailUrl: a.thumbnailPath,
            previewUrl: a.previewPath,
            texturePath: a.texturePath,
            shopVisible: a.shopVisible,
          }))
      );
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to load activated assets',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter(
      (a) =>
        a.displayName.toLowerCase().includes(needle) ||
        a.assetId.toLowerCase().includes(needle) ||
        a.category.toLowerCase().includes(needle)
    );
  }, [assets, q]);

  const pick = (a: ListableAsset) => {
    setSelected(a);
    setItemName(a.displayName);
    setPrice(a.price > 0 ? a.price : 500);
    setUnlockType('purchase');
    setUnlockRef('');
    setEventEndsAt('');
    setPromoted(false);
    setPromoHeadline(`NEW: ${a.displayName}`);
  };

  const promoBannerConfig = normalizeBannerConfig({
    colors: [promoColorA, promoColorB],
    angle: promoAngle,
    animated: true,
    animationStyle: 'shimmer',
  });

  const eventDate = eventEndsAt ? new Date(eventEndsAt) : null;
  const eventValid = !eventDate || !Number.isNaN(eventDate.getTime());
  const canSave =
    Boolean(selected) &&
    itemName.trim().length > 0 &&
    eventValid &&
    (unlockType === 'purchase' || unlockRef.trim().length > 0 || unlockType === 'event');

  const publish = async () => {
    if (!selected || !canSave) return;
    setSaving(true);
    try {
      await adminPublishAssetToShop(selected.assetId, undefined, {
        itemName: itemName.trim(),
        price,
        unlockType,
        unlockRef: unlockRef.trim() || null,
        eventEndsAt: eventDate ? eventDate.toISOString() : null,
        promoted,
        promoBanner: promoted
          ? {
              headline: promoHeadline.trim() || itemName.trim(),
              colors: [promoColorA, promoColorB],
              angle: promoAngle,
            }
          : null,
      });
      toast({
        title: `“${itemName}” is live in the shop`,
        description:
          unlockType === 'purchase'
            ? `${price} VP`
            : `Earned via ${unlockType}${unlockRef ? ` — ${unlockRef}` : ''}`,
      });
      await refresh();
      onCreated?.();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to list skin',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const unlist = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminRemoveAssetFromShop(selected.assetId);
      toast({ title: `“${selected.displayName}” removed from the shop` });
      await refresh();
      onCreated?.();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to unlist',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Activated asset picker */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activated skins…"
              className="pl-8 bg-slate-900/50 border-slate-700"
            />
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {filtered.length} activated
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading activated assets…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400 space-y-1">
            <p>No activated skins.</p>
            <p className="text-xs">
              Go to the <span className="text-slate-300">Assets</span> tab, pick a skin, and press{' '}
              <span className="text-slate-300">Activate</span> first.
            </p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-700/50 bg-slate-950/40 p-2">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {filtered.map((a) => {
                const src = assetThumb(a);
                const active = selected?.assetId === a.assetId;
                return (
                  <button
                    key={a.assetId}
                    type="button"
                    onClick={() => pick(a)}
                    className={cn(
                      'relative flex flex-col overflow-hidden rounded-md border text-left transition-all',
                      active
                        ? 'border-cyan-400/80 ring-2 ring-cyan-400/40 bg-slate-800/80'
                        : 'border-slate-700/50 bg-slate-900/50 hover:border-slate-500'
                    )}
                  >
                    <div className="aspect-square w-full overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_70%)]">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={a.displayName}
                          loading="lazy"
                          className="h-full w-full object-contain p-1.5"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-500">
                          <Box className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-semibold truncate">{a.displayName}</p>
                      <div className="flex gap-1 mt-0.5">
                        <span className="text-[9px] text-slate-500 capitalize">{a.category}</span>
                        {a.shopVisible && (
                          <Badge className="text-[8px] px-1 py-0 h-3.5 bg-emerald-700">Listed</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Listing form */}
      <div className="space-y-3 rounded-lg border border-slate-700/50 bg-slate-900/40 p-3 h-fit">
        {!selected ? (
          <p className="text-xs text-slate-400 py-10 text-center">
            Pick an activated skin on the left to configure its shop listing.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold truncate">{selected.displayName}</p>
              {selected.shopVisible && (
                <Badge className="bg-emerald-700 text-[10px]">Listed</Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label>Shop name</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="bg-slate-900/50 border-slate-700"
              />
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-400" /> How is it obtained?
              </Label>
              <Select value={unlockType} onValueChange={(v) => setUnlockType(v as UnlockTypeId)}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNLOCK_TYPES.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500">
                {UNLOCK_TYPES.find((u) => u.id === unlockType)?.hint}
              </p>
            </div>

            {unlockType === 'purchase' ? (
              <div className="space-y-1">
                <Label>VP price</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>
                  {unlockType === 'event'
                    ? 'Event name'
                    : unlockType === 'mission'
                      ? 'Mission name'
                      : unlockType === 'achievement'
                        ? 'Achievement name'
                        : 'Badge name'}
                </Label>
                <Input
                  value={unlockRef}
                  onChange={(e) => setUnlockRef(e.target.value)}
                  placeholder={
                    unlockType === 'event' ? 'Summer Run 2026' : 'Shown on the shop card'
                  }
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-sky-400" /> Event countdown (optional)
              </Label>
              <Input
                type="datetime-local"
                value={eventEndsAt}
                onChange={(e) => setEventEndsAt(e.target.value)}
                className="bg-slate-900/50 border-slate-700"
              />
              {eventDate && eventValid && eventDate.getTime() > Date.now() && (
                <p className="text-[10px] text-sky-300">
                  Ends in {formatFireSaleCountdown(eventDate)}
                </p>
              )}
              {eventDate && eventValid && eventDate.getTime() <= Date.now() && (
                <p className="text-[10px] text-rose-300">That time is already in the past.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-700/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Megaphone className="h-3.5 w-3.5 text-fuchsia-400" /> Dashboard promo
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Custom banner on the main page with a countdown
                  </p>
                </div>
                <Switch checked={promoted} onCheckedChange={setPromoted} />
              </div>
              {promoted && (
                <>
                  <div className="space-y-1">
                    <Label>Headline</Label>
                    <Input
                      value={promoHeadline}
                      onChange={(e) => setPromoHeadline(e.target.value)}
                      className="bg-slate-900/50 border-slate-700"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1">
                      <Label>Color A</Label>
                      <input
                        type="color"
                        value={promoColorA}
                        onChange={(e) => setPromoColorA(e.target.value)}
                        className="h-9 w-12 rounded border border-slate-700 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Color B</Label>
                      <input
                        type="color"
                        value={promoColorB}
                        onChange={(e) => setPromoColorB(e.target.value)}
                        className="h-9 w-12 rounded border border-slate-700 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-xs">
                        <Label>Angle</Label>
                        <span className="text-slate-400">{promoAngle}°</span>
                      </div>
                      <Slider
                        min={0}
                        max={360}
                        step={5}
                        value={[promoAngle]}
                        onValueChange={([v]) => setPromoAngle(v)}
                      />
                    </div>
                  </div>
                  {/* Live promo preview — same layout as the home dashboard strip */}
                  <div className="relative overflow-hidden rounded-lg border border-slate-700">
                    <BannerFill banner={promoBannerConfig} className="absolute inset-0" />
                    <div className="relative z-10 flex items-center gap-3 p-3 bg-black/25">
                      {assetThumb(selected) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetThumb(selected)!}
                          alt=""
                          className="h-12 w-12 rounded object-contain bg-black/30"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate">
                          {promoHeadline.trim() || itemName}
                        </p>
                        <p className="text-[10px] text-white/80">
                          {unlockType === 'purchase'
                            ? `${price} VP in the shop`
                            : `${UNLOCK_TYPES.find((u) => u.id === unlockType)?.label}${unlockRef ? ` · ${unlockRef}` : ''}`}
                          {eventDate && eventValid && eventDate.getTime() > Date.now()
                            ? ` · ends in ${formatFireSaleCountdown(eventDate)}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" disabled={saving || !canSave} onClick={() => void publish()}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : selected.shopVisible ? (
                  'Update listing'
                ) : (
                  'List in shop'
                )}
              </Button>
              {selected.shopVisible && (
                <Button variant="outline" disabled={saving} onClick={() => void unlist()}>
                  Unlist
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
