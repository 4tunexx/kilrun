'use client';

import { useEffect, useState } from 'react';
import { Loader2, Medal, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import {
  adminEndRankedSeason,
  getSiteSettings,
  updateSiteSettings,
} from '@/lib/progression-actions';
import {
  DEFAULT_RANK_CONFIG,
  parseRankConfig,
  serializeRankConfig,
  type RankConfig,
  type RankTierDef,
} from '@/lib/rank-config';
import { useToast } from '@/hooks/use-toast';

function emptyTier(): RankTierDef {
  return {
    name: 'New Rank',
    minKp: 1000,
    imageUrl: '',
    color: '#94a3b8',
  };
}

export function AdminRanksPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<RankConfig>({
    ...DEFAULT_RANK_CONFIG,
    tiers: DEFAULT_RANK_CONFIG.tiers.map((t) => ({ ...t })),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endingSeason, setEndingSeason] = useState(false);
  const [nextSeasonName, setNextSeasonName] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        setCfg(
          parseRankConfig((s as { rankConfigJson?: string }).rankConfigJson ?? '{}')
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
      const next = parseRankConfig(cfg);
      await updateSiteSettings({
        rankConfigJson: serializeRankConfig(next),
      });
      setCfg(next);
      toast({ title: 'Rank settings saved' });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const endSeason = async () => {
    if (
      !window.confirm(
        `End ${cfg.seasonName} and reset all players to KP ${cfg.seasonKpResetTo}? Peak KP / peak ranks are kept.`
      )
    ) {
      return;
    }
    setEndingSeason(true);
    try {
      const result = await adminEndRankedSeason({
        nextSeasonName: nextSeasonName.trim() || undefined,
      });
      const s = await getSiteSettings();
      setCfg(
        parseRankConfig((s as { rankConfigJson?: string }).rankConfigJson ?? '{}')
      );
      setNextSeasonName('');
      toast({
        title: 'Season ended',
        description: `Reset ${result.playersReset} players → ${result.seasonName}`,
      });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Season end failed',
        variant: 'destructive',
      });
    } finally {
      setEndingSeason(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading ranks…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Medal className="h-4 w-4 text-amber-300" />
            Ranked season
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Season name</Label>
            <Input
              value={cfg.seasonName}
              onChange={(e) =>
                setCfg((c) => ({ ...c, seasonName: e.target.value }))
              }
            />
            <p className="text-[11px] text-slate-500">
              Shown on the Ranked leaderboard and Premium page. Id: {cfg.seasonId}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>KP reset to (on season end)</Label>
            <Input
              type="number"
              min={0}
              value={cfg.seasonKpResetTo}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  seasonKpResetTo: Math.max(0, Number(e.target.value) || 0),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Season starts at (ISO, optional)</Label>
            <Input
              value={cfg.seasonStartsAt ?? ''}
              placeholder="2026-07-01T00:00:00.000Z"
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  seasonStartsAt: e.target.value.trim() || null,
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Season ends at (ISO, optional)</Label>
            <Input
              value={cfg.seasonEndsAt ?? ''}
              placeholder="2026-09-30T23:59:59.000Z"
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  seasonEndsAt: e.target.value.trim() || null,
                }))
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Next season name (when ending)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                value={nextSeasonName}
                placeholder="Season 2"
                onChange={(e) => setNextSeasonName(e.target.value)}
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="destructive"
                disabled={endingSeason}
                onClick={() => void endSeason()}
              >
                {endingSeason ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                End season & reset KP
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Keeps peakKp / peakRank for every player. Saves a new season id automatically.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Medal className="h-4 w-4 text-amber-300" />
            Ranked matchmaking
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Same-rank wait (seconds)</Label>
            <Input
              type="number"
              min={3}
              value={cfg.matchmakingWaitSec}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  matchmakingWaitSec: Math.max(3, Number(e.target.value) || 3),
                }))
              }
            />
            <p className="text-[11px] text-slate-500">
              Prefer players in the same KP tier. After this wait, everyone joins an open lobby.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Min same-rank players to keep lobby</Label>
            <Input
              type="number"
              min={2}
              max={8}
              value={cfg.minSameRankPlayers}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  minSameRankPlayers: Math.max(2, Number(e.target.value) || 2),
                }))
              }
            />
            <p className="text-[11px] text-slate-500">
              If fewer than this after the wait, the room opens to all ranks.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Rank tiers (low → high KP)</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setCfg((c) => ({ ...c, tiers: [...c.tiers, emptyTier()] }))}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add rank
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfg.tiers.map((tier, idx) => (
            <div
              key={`${tier.name}-${idx}`}
              className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-3 space-y-3"
            >
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px]">Name</Label>
                  <Input
                    value={tier.name}
                    onChange={(e) =>
                      setCfg((c) => {
                        const tiers = [...c.tiers];
                        tiers[idx] = { ...tier, name: e.target.value };
                        return { ...c, tiers };
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Min KP</Label>
                  <Input
                    type="number"
                    min={0}
                    value={tier.minKp}
                    onChange={(e) =>
                      setCfg((c) => {
                        const tiers = [...c.tiers];
                        tiers[idx] = {
                          ...tier,
                          minKp: Math.max(0, Number(e.target.value) || 0),
                        };
                        return { ...c, tiers };
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Color</Label>
                  <Input
                    type="color"
                    value={tier.color || '#94a3b8'}
                    onChange={(e) =>
                      setCfg((c) => {
                        const tiers = [...c.tiers];
                        tiers[idx] = { ...tier, color: e.target.value };
                        return { ...c, tiers };
                      })
                    }
                  />
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-rose-400"
                    onClick={() =>
                      setCfg((c) => ({
                        ...c,
                        tiers: c.tiers.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-3">
                {tier.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tier.imageUrl}
                    alt={tier.name}
                    className="h-12 w-12 rounded-md border border-slate-600 object-contain bg-slate-900"
                  />
                ) : (
                  <div
                    className="h-12 w-12 rounded-md border border-slate-600 flex items-center justify-center text-[10px] text-slate-500"
                    style={{ color: tier.color }}
                  >
                    {tier.name.slice(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <ImageUploadField
                    label="Rank image / badge"
                    value={tier.imageUrl}
                    onChange={(url) =>
                      setCfg((c) => {
                        const tiers = [...c.tiers];
                        tiers[idx] = { ...tier, imageUrl: url };
                        return { ...c, tiers };
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={saving || cfg.tiers.length === 0}
          className="bg-amber-600 hover:bg-amber-500 text-black font-bold"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save rank settings
        </Button>
      </div>
    </div>
  );
}
