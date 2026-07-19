'use client';

import { useEffect, useState } from 'react';
import { Award, Crown, Lock, Loader2, Package, Plus, Sparkles, ThumbsUp, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  getMyShowcaseEditor,
  setShowcaseSlot,
  type ShowcaseOption,
} from '@/lib/showcase-actions';
import { SHOWCASE_UNLOCK_LEVELS, type ShowcaseItemType } from '@/lib/showcase';
import { useToast } from '@/hooks/use-toast';

type Editor = Awaited<ReturnType<typeof getMyShowcaseEditor>>;

const TYPE_ICONS: Record<ShowcaseItemType, typeof Crown> = {
  rank: Crown,
  badge: Award,
  achievement: Trophy,
  inventory: Package,
  reputation: ThumbsUp,
};

const TYPE_LABELS: Record<ShowcaseItemType, string> = {
  rank: 'Rank',
  badge: 'Badges',
  achievement: 'Achievements',
  inventory: 'Owned Items',
  reputation: 'Reputation',
};

export function ShowcaseEditor() {
  const [data, setData] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const { toast } = useToast();

  const reload = () => {
    getMyShowcaseEditor()
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading showcase...
      </div>
    );
  }

  const entryForSlot = (slot: number) => data.entries.find((e) => e.slot === slot);
  const optionFor = (itemType: ShowcaseItemType, refId?: string) =>
    data.options.find((o) => o.itemType === itemType && o.refId === refId);

  const handlePick = async (option: ShowcaseOption) => {
    if (pickerSlot === null) return;
    setBusySlot(pickerSlot);
    try {
      await setShowcaseSlot(pickerSlot, { itemType: option.itemType, refId: option.refId });
      toast({ title: `Showcasing ${option.title}` });
      setPickerSlot(null);
      reload();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Could not update showcase', variant: 'destructive' });
    } finally {
      setBusySlot(null);
    }
  };

  const handleClear = async (slot: number) => {
    setBusySlot(slot);
    try {
      await setShowcaseSlot(slot, null);
      reload();
    } finally {
      setBusySlot(null);
    }
  };

  const grouped = (Object.keys(TYPE_LABELS) as ShowcaseItemType[]).map((type) => ({
    type,
    options: data.options.filter((o) => o.itemType === type),
  }));

  return (
    <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Profile Showcase
        </CardTitle>
        <CardDescription>
          Pick a few highlights to show off on your mini hover card and public profile. More
          slots unlock as you level up — {data.unlockedSlots}/{data.maxSlots} unlocked at level{' '}
          {data.level}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: data.maxSlots }, (_, slot) => {
            const unlocked = slot < data.unlockedSlots;
            const entry = entryForSlot(slot);
            const option = entry ? optionFor(entry.itemType, entry.refId) : undefined;
            const Icon = entry ? TYPE_ICONS[entry.itemType] : Plus;

            if (!unlocked) {
              const unlockLevel = SHOWCASE_UNLOCK_LEVELS[slot];
              return (
                <div
                  key={slot}
                  className="aspect-square rounded-lg border border-slate-700/40 bg-slate-900/30 flex flex-col items-center justify-center text-slate-500 gap-1"
                >
                  <Lock className="h-4 w-4" />
                  <span className="text-[10px] text-center px-1">Lv {unlockLevel}</span>
                </div>
              );
            }

            if (entry && option) {
              return (
                <div
                  key={slot}
                  className="relative aspect-square rounded-lg border border-primary/40 bg-slate-900/50 flex flex-col items-center justify-center gap-1 p-2 group"
                >
                  <button
                    type="button"
                    onClick={() => handleClear(slot)}
                    disabled={busySlot === slot}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 border border-slate-600 p-0.5 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {busySlot === slot ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : option.iconImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.iconImageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <Icon className="h-6 w-6 text-primary" />
                  )}
                  <span className="text-[10px] text-center truncate w-full px-1">
                    {option.title}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={slot}
                type="button"
                disabled={busySlot === slot}
                onClick={() => setPickerSlot(slot)}
                className="aspect-square rounded-lg border border-dashed border-slate-600 bg-slate-900/20 flex flex-col items-center justify-center text-slate-500 hover:border-primary/60 hover:text-primary transition-colors"
              >
                {busySlot === slot ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={pickerSlot !== null} onOpenChange={(open) => !open && setPickerSlot(null)}>
        <DialogContent className="bg-slate-900/95 border-slate-700 text-white max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose what to showcase</DialogTitle>
            <DialogDescription className="text-slate-400">
              Only things you&apos;ve unlocked or own can be showcased.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {grouped.map(({ type, options }) =>
              options.length === 0 ? null : (
                <div key={type} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {TYPE_LABELS[type]}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {options.map((option) => {
                      const OptionIcon = TYPE_ICONS[option.itemType];
                      return (
                        <button
                          key={`${option.itemType}-${option.refId ?? 'rank'}`}
                          type="button"
                          onClick={() => handlePick(option)}
                          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-primary/60 transition-colors"
                        >
                          {option.iconImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={option.iconImageUrl}
                              alt=""
                              className="h-6 w-6 rounded object-cover shrink-0"
                            />
                          ) : (
                            <OptionIcon
                              className={`h-5 w-5 shrink-0 ${
                                option.itemType === 'inventory' ? 'text-cyan-400' : 'text-primary'
                              }`}
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm truncate">{option.title}</span>
                            {option.rarity && (
                              <Badge variant="outline" className="text-[9px] capitalize mt-0.5">
                                {option.rarity}
                              </Badge>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
            {grouped.every((g) => g.options.length === 0) && (
              <p className="text-center text-slate-400 py-6">
                Nothing to showcase yet — earn badges, achievements, or buy cosmetics first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
