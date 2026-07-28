'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BannerFill } from '@/components/banner-fill';
import { normalizeBannerConfig } from '@/lib/banner';
import { formatFireSaleCountdown } from '@/lib/shop-catalog';
import { getPromotedStoreItems } from '@/lib/social-actions';

type PromoItem = Awaited<ReturnType<typeof getPromotedStoreItems>>[number];

const UNLOCK_LABEL: Record<string, string> = {
  event: 'Event reward',
  mission: 'Mission reward',
  achievement: 'Achievement reward',
  badge: 'Badge reward',
};

function Countdown({ endsAt }: { endsAt: Date | string }) {
  const [label, setLabel] = useState(() => formatFireSaleCountdown(endsAt));
  useEffect(() => {
    const id = setInterval(() => setLabel(formatFireSaleCountdown(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return <span className="tabular-nums font-bold">{label}</span>;
}

/**
 * Home dashboard promo strip — shop items an admin promoted from
 * Cosmetics Studio (custom banner, unlock info, live event countdown).
 */
export function HomePromoBanner({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [promos, setPromos] = useState<PromoItem[]>([]);

  useEffect(() => {
    let mounted = true;
    getPromotedStoreItems()
      .then((list) => {
        if (mounted) setPromos(list);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (promos.length === 0) return null;

  return (
    <div className="space-y-3">
      {promos.slice(0, 2).map((promo) => {
        const raw = (promo.promoBanner ?? {}) as Record<string, unknown>;
        const bannerConfig = normalizeBannerConfig({
          colors:
            Array.isArray(raw.colors) && (raw.colors as unknown[]).length >= 2
              ? (raw.colors as string[])
              : ['#7c3aed', '#0ea5e9'],
          angle: typeof raw.angle === 'number' ? raw.angle : 120,
          opacity: typeof raw.opacity === 'number' ? raw.opacity : 1,
          blur: typeof raw.blur === 'number' ? raw.blur : 0,
          animated:
            raw.animated !== false &&
            (typeof raw.animationStyle === 'string'
              ? raw.animationStyle !== 'none'
              : true),
          animationStyle:
            typeof raw.animationStyle === 'string' ? raw.animationStyle : 'shimmer',
          pattern: typeof raw.pattern === 'string' ? raw.pattern : 'none',
          patternOpacity:
            typeof raw.patternOpacity === 'number' ? raw.patternOpacity : 0.35,
          patternScale: typeof raw.patternScale === 'number' ? raw.patternScale : 1,
        });
        const overlayOpacity =
          typeof raw.overlayOpacity === 'number' && Number.isFinite(raw.overlayOpacity)
            ? Math.max(0, Math.min(0.85, raw.overlayOpacity))
            : 0.3;
        const headline =
          typeof raw.headline === 'string' ? raw.headline.trim() : '';
        const earned = Boolean(promo.unlockType && promo.unlockType !== 'purchase');
        const eventLive =
          promo.eventEndsAt && new Date(promo.eventEndsAt).getTime() > Date.now();
        return (
          <div
            key={promo.id}
            className="relative overflow-hidden rounded-xl border border-white/10 shadow-lg"
          >
            <BannerFill banner={bannerConfig} className="absolute inset-0" />
            <div
              className="relative z-10 flex flex-wrap items-center gap-3 sm:gap-4 px-4 py-3 sm:px-6"
              style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
            >
              {promo.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={promo.imageUrl}
                  alt={promo.itemName}
                  className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg object-contain bg-black/30 border border-white/10"
                />
              ) : (
                <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-lg bg-black/30 border border-white/10">
                  <Sparkles className="h-6 w-6 text-white/80" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base font-black truncate text-white drop-shadow">
                  {headline || promo.itemName}
                </p>
                <p className="text-[11px] sm:text-xs text-white/85 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {earned ? (
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      {UNLOCK_LABEL[promo.unlockType as string] ?? 'Reward'}
                      {promo.unlockRef ? ` · ${promo.unlockRef}` : ''}
                    </span>
                  ) : (
                    <span>{promo.vpPrice} VP in the shop</span>
                  )}
                  {eventLive && promo.eventEndsAt && (
                    <span className="flex items-center gap-1 text-amber-200">
                      Ends in <Countdown endsAt={promo.eventEndsAt} />
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur"
                onClick={() => onNavigate?.('store')}
              >
                {earned ? 'View in shop' : 'Get it'}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
