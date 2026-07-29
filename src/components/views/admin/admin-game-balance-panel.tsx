'use client';

/**
 * "Game Balance" admin tab — two independent config blobs on SiteSettings,
 * both following the EXACT premiumConfigJson/rankConfigJson pattern (see
 * admin-premium-panel.tsx / admin-ranks-panel.tsx for the reference):
 *
 *  1. Match reward economy (SiteSettings.matchRewardsConfigJson) — the
 *     Deathrun/Horde/Competitive XP+VP tables and in-game XP bonus formula
 *     constants that used to be hardcoded in src/lib/match-rewards.ts.
 *  2. Global default TPS camera (SiteSettings.defaultTpsViewJson) — the
 *     DB-backed override for the hardcoded DEFAULT_TPS_VIEW fallback in
 *     tps-view-settings.ts. Does NOT touch per-map camera settings.
 */

import { useEffect, useState } from 'react';
import { Coins, Loader2, Save, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import {
  DEFAULT_MATCH_REWARDS_CONFIG,
  parseMatchRewardsConfig,
  serializeMatchRewardsConfig,
  type MatchRewardsConfig,
  type RewardEntry,
} from '@/lib/match-rewards-config';
import {
  DEFAULT_TPS_VIEW,
  sanitizeTpsView,
  type TpsViewSettings,
} from '@/components/game/tps/tps-view-settings';
import { useToast } from '@/hooks/use-toast';

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function RewardRow({
  label,
  entry,
  onChange,
}: {
  label: string;
  entry: RewardEntry;
  onChange: (next: RewardEntry) => void;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-xs text-slate-400 capitalize">{label}</span>
      <Input
        type="number"
        min={0}
        value={entry.xp}
        onChange={(e) => onChange({ ...entry, xp: num(e.target.value, 0) })}
        placeholder="XP"
      />
      <Input
        type="number"
        min={0}
        value={entry.vp}
        onChange={(e) => onChange({ ...entry, vp: num(e.target.value, 0) })}
        placeholder="VP"
      />
    </div>
  );
}

function MatchRewardsSection() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<MatchRewardsConfig>({ ...DEFAULT_MATCH_REWARDS_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        setCfg(
          parseMatchRewardsConfig(
            (s as { matchRewardsConfigJson?: string }).matchRewardsConfigJson ?? '{}'
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
      const next = parseMatchRewardsConfig(cfg);
      await updateSiteSettings({ matchRewardsConfigJson: serializeMatchRewardsConfig(next) });
      setCfg(next);
      toast({ title: 'Match reward economy saved' });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading match rewards…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deathrun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['win', 'survived', 'loss', 'eliminated'] as const).map((k) => (
              <RewardRow
                key={k}
                label={k}
                entry={cfg.deathrun[k]}
                onChange={(next) =>
                  setCfg((c) => ({ ...c, deathrun: { ...c.deathrun, [k]: next } }))
                }
              />
            ))}
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Horde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['win', 'survived', 'loss', 'eliminated'] as const).map((k) => (
              <RewardRow
                key={k}
                label={k}
                entry={cfg.horde[k]}
                onChange={(next) => setCfg((c) => ({ ...c, horde: { ...c.horde, [k]: next } }))}
              />
            ))}
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Competitive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['win', 'loss'] as const).map((k) => (
              <RewardRow
                key={k}
                label={k}
                entry={cfg.competitive[k]}
                onChange={(next) =>
                  setCfg((c) => ({ ...c, competitive: { ...c.competitive, [k]: next } }))
                }
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">In-game XP bonus formula</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Base XP multiplier</Label>
            <Input
              type="number"
              min={0}
              step="0.05"
              value={cfg.inGameXpBaseMultiplier}
              onChange={(e) =>
                setCfg((c) => ({ ...c, inGameXpBaseMultiplier: num(e.target.value, c.inGameXpBaseMultiplier) }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">XP per kill</Label>
            <Input
              type="number"
              min={0}
              value={cfg.killXpPerKill}
              onChange={(e) => setCfg((c) => ({ ...c, killXpPerKill: num(e.target.value, c.killXpPerKill) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Kill bonus cap</Label>
            <Input
              type="number"
              min={0}
              value={cfg.killXpCap}
              onChange={(e) => setCfg((c) => ({ ...c, killXpCap: num(e.target.value, c.killXpCap) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">XP per wave</Label>
            <Input
              type="number"
              min={0}
              value={cfg.waveXpPerWave}
              onChange={(e) => setCfg((c) => ({ ...c, waveXpPerWave: num(e.target.value, c.waveXpPerWave) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Wave bonus cap</Label>
            <Input
              type="number"
              min={0}
              value={cfg.waveXpCap}
              onChange={(e) => setCfg((c) => ({ ...c, waveXpCap: num(e.target.value, c.waveXpCap) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Horde website-XP per wave</Label>
            <Input
              type="number"
              min={0}
              value={cfg.hordeWaveBonusPerWave}
              onChange={(e) =>
                setCfg((c) => ({ ...c, hordeWaveBonusPerWave: num(e.target.value, c.hordeWaveBonusPerWave) }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Horde website-XP cap</Label>
            <Input
              type="number"
              min={0}
              value={cfg.hordeWaveBonusCap}
              onChange={(e) =>
                setCfg((c) => ({ ...c, hordeWaveBonusCap: num(e.target.value, c.hordeWaveBonusCap) }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-500 text-black font-bold"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Coins className="h-4 w-4 mr-2" />}
          Save match rewards
        </Button>
      </div>
    </div>
  );
}

function CameraDefaultSection() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<TpsViewSettings>({ ...DEFAULT_TPS_VIEW });
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((s) => {
        if (cancelled) return;
        const raw = (s as { defaultTpsViewJson?: string }).defaultTpsViewJson ?? '{}';
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          parsed = {};
        }
        const hasConfig = Boolean(
          parsed && typeof parsed === 'object' && Object.keys(parsed as object).length > 0
        );
        setEnabled(hasConfig);
        setCfg(hasConfig ? sanitizeTpsView(parsed) : { ...DEFAULT_TPS_VIEW });
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
      await updateSiteSettings({
        defaultTpsViewJson: enabled ? JSON.stringify(sanitizeTpsView(cfg)) : '{}',
      });
      toast({ title: enabled ? 'Global camera default saved' : 'Global camera default cleared' });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading camera default…
      </div>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-sky-500/30">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-sky-300" />
          Global default TPS camera
        </CardTitle>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-sky-400"
          />
          Use custom global default
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-400">
          Used only when a map hasn&apos;t authored its own 3rd-person camera view (per-map settings
          always win). Unchecking clears it and falls back to the hardcoded default. A player&apos;s
          own Play Test / browser preference (if set) still takes priority over this.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Boom distance</Label>
            <Input
              type="number"
              step="0.1"
              disabled={!enabled}
              value={cfg.camera.boomDistance}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  camera: { ...c.camera, boomDistance: num(e.target.value, c.camera.boomDistance) },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Look height</Label>
            <Input
              type="number"
              step="0.1"
              disabled={!enabled}
              value={cfg.camera.lookHeight}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  camera: { ...c.camera, lookHeight: num(e.target.value, c.camera.lookHeight) },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Shoulder offset</Label>
            <Input
              type="number"
              step="0.05"
              disabled={!enabled}
              value={cfg.camera.shoulder}
              onChange={(e) =>
                setCfg((c) => ({ ...c, camera: { ...c.camera, shoulder: num(e.target.value, c.camera.shoulder) } }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">FOV</Label>
            <Input
              type="number"
              disabled={!enabled}
              value={cfg.camera.fov}
              onChange={(e) =>
                setCfg((c) => ({ ...c, camera: { ...c.camera, fov: num(e.target.value, c.camera.fov) } }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Default pitch</Label>
            <Input
              type="number"
              step="0.01"
              disabled={!enabled}
              value={cfg.camera.defaultPitch}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  camera: { ...c.camera, defaultPitch: num(e.target.value, c.camera.defaultPitch) },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Follow sharpness</Label>
            <Input
              type="number"
              disabled={!enabled}
              value={cfg.camera.followSharpness}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  camera: { ...c.camera, followSharpness: num(e.target.value, c.camera.followSharpness) },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Mouse sensitivity (deg/px)</Label>
            <Input
              type="number"
              step="0.01"
              disabled={!enabled}
              value={cfg.camera.mouseSensDeg}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  camera: { ...c.camera, mouseSensDeg: num(e.target.value, c.camera.mouseSensDeg) },
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Crosshair size</Label>
            <Input
              type="number"
              disabled={!enabled}
              value={cfg.crosshair.size}
              onChange={(e) =>
                setCfg((c) => ({ ...c, crosshair: { ...c.crosshair, size: num(e.target.value, c.crosshair.size) } }))
              }
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="bg-sky-600 hover:bg-sky-500 text-black font-bold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save camera default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminGameBalancePanel() {
  return (
    <div className="space-y-6">
      <MatchRewardsSection />
      <CameraDefaultSection />
    </div>
  );
}
