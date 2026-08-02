'use client';

import { useEffect, useRef, useState } from 'react';
import { Coins, Gift, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getAvailableCases,
  openCase,
  type CaseDto,
  type CaseOpenResultDto,
} from '@/lib/case-actions';

const RARITY_STYLES: Record<string, { ring: string; glow: string; text: string }> = {
  common: { ring: 'ring-slate-500/50', glow: 'shadow-slate-500/20', text: 'text-slate-300' },
  rare: { ring: 'ring-sky-400/60', glow: 'shadow-sky-500/40', text: 'text-sky-300' },
  epic: { ring: 'ring-purple-400/60', glow: 'shadow-purple-500/40', text: 'text-purple-300' },
  legendary: { ring: 'ring-amber-400/70', glow: 'shadow-amber-500/50', text: 'text-amber-300' },
};

function rarityStyle(rarity: string) {
  return RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
}

function timeUntil(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
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

  // Build a long repeated strip so the reel has room to spin, ending on the won item.
  const strip = Array.from({ length: REEL_LANDING_INDEX + 8 }, (_, i) => items[(wonIndex + i * 7) % items.length]);
  strip[REEL_LANDING_INDEX] = items[wonIndex];

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const targetX = -(REEL_LANDING_INDEX * REEL_ITEM_WIDTH) + REEL_ITEM_WIDTH * 1.5;
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
              className={`shrink-0 w-24 h-24 rounded-lg bg-slate-900 border border-slate-700 flex flex-col items-center justify-center ring-2 ${style.ring} shadow-lg ${style.glow}`}
              style={{ width: REEL_ITEM_WIDTH - 8 }}
            >
              {item.rewardType === 'currency' ? (
                <Coins className={`h-8 w-8 ${style.text}`} />
              ) : item.displayImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.displayImage} alt="" className="h-12 w-12 object-contain" />
              ) : (
                <Gift className={`h-8 w-8 ${style.text}`} />
              )}
              <span className="text-[9px] mt-1 px-1 truncate max-w-full text-slate-300">
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

export default function CasesView() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingCaseId, setOpeningCaseId] = useState<string | null>(null);
  const [result, setResult] = useState<CaseOpenResultDto | null>(null);
  const [phase, setPhase] = useState<'shaking' | 'opening' | 'spinning' | 'revealed'>('shaking');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setCases(await getAvailableCases());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleOpen = async (c: CaseDto) => {
    setBusy(true);
    setPhase('shaking');
    setResult(null);
    try {
      const res = await openCase(c.id);
      setOpeningCaseId(c.id);
      setResult(res);
      // Let the closed crate shake for a beat, then play the lid-popping-open
      // animation, and only then start the reel spin — builds anticipation
      // instead of jumping straight into the spin.
      setTimeout(() => setPhase('opening'), 900);
      setTimeout(() => setPhase('spinning'), 900 + 650);
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Could not open case',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const closeUnbox = () => {
    setOpeningCaseId(null);
    setResult(null);
    setPhase('shaking');
    void refresh();
  };

  return (
    <div className="px-4 sm:px-8 py-6 space-y-6">
      <div className="flex items-center gap-2 text-slate-100">
        <Gift className="h-5 w-5 text-amber-400" />
        <h1 className="text-xl font-bold">Cases</h1>
      </div>

      {openingCaseId && result && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-xl space-y-4">
            {phase === 'shaking' && (
              <ShakingCrate imageUrl={result.caseImageUrl} active />
            )}
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
                  <Button onClick={closeUnbox}>Nice!</Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
        </div>
      ) : cases.length === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No cases available right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <Card key={c.id} className="bg-slate-900/50 border-slate-700/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-12 w-12 rounded object-cover border border-slate-700" />
                  ) : (
                    <div className="h-12 w-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <Gift className="h-6 w-6 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{c.name}</p>
                    {c.description && (
                      <p className="text-[11px] text-slate-500 truncate">{c.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {c.items.slice(0, 6).map((item) => (
                    <span
                      key={item.id}
                      className={`text-[9px] px-1.5 py-0.5 rounded border ${rarityStyle(item.rarity).ring} ${rarityStyle(item.rarity).text} bg-slate-950/50`}
                      title={`${item.chancePercent}% chance`}
                    >
                      {item.displayName}
                    </span>
                  ))}
                  {c.items.length > 6 && (
                    <span className="text-[9px] text-slate-500">+{c.items.length - 6} more</span>
                  )}
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy || !c.canOpen}
                  onClick={() => void handleOpen(c)}
                >
                  {c.acquireType === 'vp_purchase'
                    ? `Open — ${c.vpPrice} VP`
                    : c.canOpen
                      ? 'Open free case'
                      : `Available in ${timeUntil(c.nextFreeAt)}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
