'use client';

import { useEffect, useState } from 'react';
import { Crown, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import {
  DEFAULT_VIP_CONFIG,
  parseVipConfig,
  serializeVipConfig,
  type VipConfig,
  type VipOffer,
} from '@/lib/vip-config';
import { useToast } from '@/hooks/use-toast';

function emptyOffer(): VipOffer {
  return {
    id: `offer_${Date.now().toString(36)}`,
    label: 'New offer',
    vpCost: 2500,
    durationDays: 30,
    enabled: true,
  };
}

export function AdminVipPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<VipConfig>({
    ...DEFAULT_VIP_CONFIG,
    offers: DEFAULT_VIP_CONFIG.offers.map((o) => ({ ...o })),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        setCfg(parseVipConfig((s as { vipConfigJson?: string }).vipConfigJson ?? '{}'));
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
      const next = parseVipConfig(cfg);
      await updateSiteSettings({ vipConfigJson: serializeVipConfig(next) });
      setCfg(next);
      toast({ title: 'VIP settings saved' });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading VIP config…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400 -mt-1">
        Platform VIP (crown, orange name, cosmetics) is a monthly membership priced here. This is
        separate from Kilrun Premium (Ranked Competitive). Users granted permanent VIP (no expiry
        date, via a user&apos;s role or the VIP expiry field) are never charged and are unaffected
        by this price.
      </p>

      <Card className="bg-slate-900/50 border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-300" />
            VIP pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default VP cost</Label>
            <Input
              type="number"
              min={0}
              value={cfg.vpCost}
              onChange={(e) => setCfg((c) => ({ ...c, vpCost: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default duration (days)</Label>
            <Input
              type="number"
              min={1}
              value={cfg.durationDays}
              onChange={(e) =>
                setCfg((c) => ({ ...c, durationDays: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
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
              className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-3 grid gap-2 sm:grid-cols-5"
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
                    setCfg((c) => ({ ...c, offers: c.offers.filter((_, i) => i !== idx) }))
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
          Save VIP settings
        </Button>
      </div>
    </div>
  );
}
