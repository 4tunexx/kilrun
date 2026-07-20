'use client';

import { useEffect, useState } from 'react';
import { Gem, Loader2, Plus, Trash2, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import {
  DEFAULT_PREMIUM_CONFIG,
  isFreeRankedWeekActive,
  parsePremiumConfig,
  serializePremiumConfig,
  type PremiumConfig,
  type PremiumOffer,
} from '@/lib/premium-config';
import { useToast } from '@/hooks/use-toast';

function emptyOffer(): PremiumOffer {
  return {
    id: `offer_${Date.now().toString(36)}`,
    label: 'New offer',
    vpCost: 5000,
    usd: null,
    durationDays: 30,
    enabled: true,
  };
}

export function AdminPremiumPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PremiumConfig>({ ...DEFAULT_PREMIUM_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        setCfg(
          parsePremiumConfig(
            (s as { premiumConfigJson?: string }).premiumConfigJson ?? '{}'
          )
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const next = parsePremiumConfig(cfg);
      await updateSiteSettings({
        premiumConfigJson: serializePremiumConfig(next),
      });
      setCfg(next);
      toast({ title: 'Premium settings saved' });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const startFreeWeek = () => {
    const ends = new Date(Date.now() + 7 * 86400_000);
    setCfg((c) => ({
      ...c,
      freeRankedWeekEnabled: true,
      freeWeekEndsAt: ends.toISOString(),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Premium config…
      </div>
    );
  }

  const freeActive = isFreeRankedWeekActive(cfg);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gem className="h-4 w-4 text-amber-300" />
            Premium pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Default VP cost</Label>
            <Input
              type="number"
              min={0}
              value={cfg.vpCost}
              onChange={(e) =>
                setCfg((c) => ({ ...c, vpCost: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Monthly card USD</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={cfg.monthlyUsd}
              onChange={(e) =>
                setCfg((c) => ({ ...c, monthlyUsd: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default duration (days)</Label>
            <Input
              type="number"
              min={1}
              value={cfg.durationDays}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  durationDays: Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-sky-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-sky-300" />
            Free Ranked week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Open Ranked to everyone</p>
              <p className="text-xs text-slate-400">
                While active, players can join Ranked Competitive without Premium. KP still
                applies.
              </p>
            </div>
            <Switch
              checked={cfg.freeRankedWeekEnabled}
              onCheckedChange={(v) =>
                setCfg((c) => ({ ...c, freeRankedWeekEnabled: v }))
              }
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-[12rem]">
              <Label>Ends at (ISO / local datetime)</Label>
              <Input
                type="datetime-local"
                value={
                  cfg.freeWeekEndsAt
                    ? new Date(cfg.freeWeekEndsAt).toISOString().slice(0, 16)
                    : ''
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setCfg((c) => ({
                    ...c,
                    freeWeekEndsAt: v ? new Date(v).toISOString() : null,
                  }));
                }}
              />
            </div>
            <Button type="button" variant="secondary" onClick={startFreeWeek}>
              Start 7-day free week
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setCfg((c) => ({
                  ...c,
                  freeRankedWeekEnabled: false,
                  freeWeekEndsAt: null,
                }))
              }
            >
              Clear
            </Button>
          </div>
          <Badge
            className={
              freeActive
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                : 'bg-slate-700/50 text-slate-300'
            }
          >
            {freeActive ? 'Free Ranked ACTIVE' : 'Free Ranked off'}
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Offers</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setCfg((c) => ({ ...c, offers: [...c.offers, emptyOffer()] }))}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add offer
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {cfg.offers.map((offer, idx) => (
            <div
              key={offer.id}
              className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-3 grid gap-2 sm:grid-cols-6"
            >
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[10px]">Label</Label>
                <Input
                  value={offer.label}
                  onChange={(e) =>
                    setCfg((c) => {
                      const offers = [...c.offers];
                      offers[idx] = { ...offer, label: e.target.value };
                      return { ...c, offers };
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">VP</Label>
                <Input
                  type="number"
                  min={0}
                  value={offer.vpCost}
                  onChange={(e) =>
                    setCfg((c) => {
                      const offers = [...c.offers];
                      offers[idx] = { ...offer, vpCost: Number(e.target.value) || 0 };
                      return { ...c, offers };
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">USD (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={offer.usd ?? ''}
                  onChange={(e) =>
                    setCfg((c) => {
                      const offers = [...c.offers];
                      const raw = e.target.value;
                      offers[idx] = {
                        ...offer,
                        usd: raw === '' ? null : Number(raw) || 0,
                      };
                      return { ...c, offers };
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Days</Label>
                <Input
                  type="number"
                  min={1}
                  value={offer.durationDays}
                  onChange={(e) =>
                    setCfg((c) => {
                      const offers = [...c.offers];
                      offers[idx] = {
                        ...offer,
                        durationDays: Math.max(1, Number(e.target.value) || 1),
                      };
                      return { ...c, offers };
                    })
                  }
                />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    checked={offer.enabled}
                    onCheckedChange={(v) =>
                      setCfg((c) => {
                        const offers = [...c.offers];
                        offers[idx] = { ...offer, enabled: v };
                        return { ...c, offers };
                      })
                    }
                  />
                  <span className="text-xs text-slate-400">On</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-rose-400"
                  onClick={() =>
                    setCfg((c) => ({
                      ...c,
                      offers: c.offers.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-500 text-black font-bold"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Premium settings
        </Button>
      </div>
    </div>
  );
}
