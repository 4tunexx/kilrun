'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CaseOpenResultDto } from '@/lib/case-actions';

export const RARITY_STYLES: Record<string, { ring: string; glow: string; text: string }> = {
  common: { ring: 'ring-slate-500/50', glow: 'shadow-slate-500/20', text: 'text-slate-300' },
  rare: { ring: 'ring-sky-400/60', glow: 'shadow-sky-500/40', text: 'text-sky-300' },
  epic: { ring: 'ring-purple-400/60', glow: 'shadow-purple-500/40', text: 'text-purple-300' },
  legendary: { ring: 'ring-amber-400/70', glow: 'shadow-amber-500/50', text: 'text-amber-300' },
};

export function rarityStyle(rarity: string) {
  return RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
}

const REEL_ITEM_WIDTH = 108; // px, must match the CSS width below
const REEL_LANDING_INDEX = 40; // where the reel visually settles (repeated items)

/** Closed crate that shakes in place, building anticipation before the reel starts spinning. */
function ShakingCrate({ imageUrl, active }: { imageUrl: string; active: boolean }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/80 py-8">
      <div className="flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className={`h-32 w-32 object-contain drop-shadow-[0_0_25px_rgba(56,189,248,0.35)] ${
              active ? 'animate-crate-shake' : ''
            }`}
          />
        ) : (
          <Gift className={`h-24 w-24 text-slate-400 ${active ? 'animate-crate-shake' : ''}`} />
        )}
      </div>
      <p className="text-center text-xs text-slate-500 mt-3 animate-pulse">Unlocking…</p>
    </div>
  );
}

/** Opened crate reveal — scales/fades in once the reel has landed. */
function OpenedCrate({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-slate-950/80 py-6">
      <div className="flex items-center justify-center animate-crate-open">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-32 w-32 object-contain drop-shadow-[0_0_35px_rgba(251,191,36,0.5)]"
          />
        ) : (
          <Gift className="h-24 w-24 text-amber-300" />
        )}
      </div>
    </div>
  );
}

/** Transitional "lid pops off" beat between the closed-crate shake and the reel spin. */
function OpeningCrate({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-slate-950/80 py-8">
      <div className="flex items-center justify-center animate-crate-open">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-32 w-32 object-contain drop-shadow-[0_0_35px_rgba(251,191,36,0.5)]"
          />
        ) : (
          <Gift className="h-24 w-24 text-amber-300" />
        )}
      </div>
      <p className="text-center text-xs text-amber-400/80 mt-3 animate-pulse">Opening…</p>
    </div>
  );
}

/** Renders an item's real shop image (any aspect/size — banners, small
 *  cosmetics like eyebrows, etc) scaled to fit its slot without cropping. */
function ReelItemThumb({
  item,
  style,
  imgClassName,
}: {
  item: CaseOpenResultDto['reel'][number];
  style: { text: string };
  imgClassName: string;
}) {
  if (item.rewardType === 'currency') {
    return <Coins className={`${imgClassName} ${style.text}`} />;
  }
  if (item.displayImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.displayImage}
        alt=""
        className={`${imgClassName} object-contain`}
        draggable={false}
      />
    );
  }
  return <Gift className={`${imgClassName} ${style.text}`} />;
}

function UnboxingReel({
  items,
  wonIndex,
  onDone,
}: {
  items: CaseOpenResultDto['reel'];
  wonIndex: number;
  onDone: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [spinning, setSpinning] = useState(true);

  // Build a long repeated strip so the reel has room to spin, ending on the
  // won item at a fixed index. Using a step coprime-ish offset just varies
  // the run-up visually — the actual reward always comes from `items[wonIndex]`
  // and is placed at `REEL_LANDING_INDEX`, which is where the math below
  // guarantees the marker will land.
  const strip = Array.from(
    { length: REEL_LANDING_INDEX + 8 },
    (_, i) => items[(wonIndex + i * 7) % items.length]
  );
  strip[REEL_LANDING_INDEX] = items[wonIndex];

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const pitch = REEL_ITEM_WIDTH + 8; // item width + flex gap
    // Track is left-padded by 50% of its own width (pl-[50%]), so item i's
    // center sits at `i * pitch + pitch / 2` from the track's own left edge
    // — which is itself offset by +50%-of-container from the container's
    // left edge. The center marker sits at the container's horizontal
    // center. Translating the track by exactly `-(landingCenter)` (in the
    // track's own coordinate space) puts that item's center under the
    // marker regardless of container width, since the 50% padding already
    // cancels the container-width term.
    const landingCenter = REEL_LANDING_INDEX * pitch + pitch / 2;
    const targetX = -landingCenter;
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px)';
    // Force reflow before starting the transition.
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 4.2s cubic-bezier(0.11, 0.72, 0.14, 1)';
      el.style.transform = `translateX(${targetX}px)`;
    });
    const t = setTimeout(() => {
      setSpinning(false);
      onDone();
    }, 4300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 py-6">
      <div className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 bg-cyan-400/80 z-10" />
      <div ref={trackRef} className="flex gap-2 pl-[50%]">
        {strip.map((item, i) => {
          const style = rarityStyle(item.rarity);
          return (
            <div
              key={i}
              className={`shrink-0 h-24 rounded-lg bg-slate-900 border border-slate-700 flex flex-col items-center justify-center gap-1 p-1.5 ring-2 ${style.ring} shadow-lg ${style.glow}`}
              style={{ width: REEL_ITEM_WIDTH - 8 }}
            >
              <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                <ReelItemThumb item={item} style={style} imgClassName="max-h-14 max-w-full h-auto w-auto" />
              </div>
              <span className="text-[9px] px-1 truncate max-w-full text-slate-300 shrink-0">
                {item.displayName}
              </span>
            </div>
          );
        })}
      </div>
      {spinning && (
        <p className="text-center text-xs text-slate-500 mt-3 animate-pulse">Opening…</p>
      )}
    </div>
  );
}

/**
 * Full closed-crate shake -> lid-open pop -> reel spin -> item reveal sequence,
 * driven by an already-resolved CaseOpenResultDto. Used by both the Cases page
 * (opening a free/VP case) and the Inventory drawer (opening an owned crate).
 */
export function CrateUnboxModal({
  result,
  onClose,
}: {
  result: CaseOpenResultDto;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'shaking' | 'opening' | 'spinning' | 'revealed'>('shaking');

  useEffect(() => {
    setPhase('shaking');
    const t1 = setTimeout(() => setPhase('opening'), 900);
    const t2 = setTimeout(() => setPhase('spinning'), 900 + 650);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [result]);

  // Portal to document.body — this can be mounted deep inside a rail/panel
  // that has its own backdrop-blur or transform (e.g. the Inventory drawer's
  // nav rail), which would otherwise trap a plain `fixed` element inside that
  // ancestor instead of covering the real viewport.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4">
        {phase === 'shaking' && <ShakingCrate imageUrl={result.caseImageUrl} active />}
        {phase === 'opening' && (
          <OpeningCrate imageUrl={result.caseOpenImageUrl || result.caseImageUrl} />
        )}
        {phase === 'spinning' && (
          <UnboxingReel
            items={result.reel}
            wonIndex={result.wonIndex}
            onDone={() => setPhase('revealed')}
          />
        )}
        {phase === 'revealed' && (
          <OpenedCrate imageUrl={result.caseOpenImageUrl || result.caseImageUrl} />
        )}
        {phase === 'revealed' && (
          <Card
            className={`bg-slate-900 border-2 ${rarityStyle(result.wonRarity).ring} ${rarityStyle(result.wonRarity).glow} shadow-2xl`}
          >
            <CardContent className="p-5 flex items-center gap-4">
              {result.wonRewardType === 'currency' ? (
                <Coins className={`h-12 w-12 ${rarityStyle(result.wonRarity).text}`} />
              ) : result.wonImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.wonImage} alt="" className="h-16 w-16 object-contain" />
              ) : (
                <Gift className={`h-12 w-12 ${rarityStyle(result.wonRarity).text}`} />
              )}
              <div className="flex-1">
                <p className={`text-xs uppercase tracking-wide ${rarityStyle(result.wonRarity).text}`}>
                  {result.wonRarity}
                </p>
                <p className="text-lg font-bold text-slate-100">{result.wonName}</p>
                {result.wonRewardType === 'currency' && (
                  <div className="flex items-center gap-3 mt-1">
                    {result.wonVpAmount > 0 && (
                      <span className="flex items-center gap-1 text-sm text-amber-300">
                        <Coins className="h-3.5 w-3.5" /> +{result.wonVpAmount} VP
                      </span>
                    )}
                    {result.wonXpAmount > 0 && (
                      <span className="flex items-center gap-1 text-sm text-cyan-300">
                        <Sparkles className="h-3.5 w-3.5" /> +{result.wonXpAmount} XP
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Button onClick={onClose}>Nice!</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>,
    document.body
  );
}
