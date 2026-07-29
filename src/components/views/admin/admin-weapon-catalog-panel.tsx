'use client';

/**
 * Admin control for the GLOBAL weapon catalog (src/lib/weapon-catalog.ts).
 * Edits the base stats every new map starts from — per-map overrides
 * authored in the Weapon Editor still layer on top of whatever this panel
 * saves (global default -> per-map override -> in-match runtime).
 *
 * Mirrors the Powers editor's fetch/PATCH pattern against
 * /api/game/weapon-definitions (see power-editor.tsx / power-definitions
 * route for the reference implementation).
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { WeaponCombatKind, WeaponFireMode } from '@/lib/weapons';

type WeaponRecord = {
  id: string;
  label: string;
  modelUrl: string;
  kind: WeaponCombatKind;
  combat: {
    damage?: number;
    range?: number;
    cooldownMs?: number;
    fireMode?: WeaponFireMode;
    pellets?: number;
    magSize?: number;
    reserveAmmo?: number;
    reloadMs?: number;
  };
  modes: Array<'horde' | 'competitive'>;
  gripHint: string;
  unlockMetric?: string;
  unlockAmount?: number;
  isCore?: boolean;
  sortOrder?: number;
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function AdminWeaponCatalogPanel() {
  const { toast } = useToast();
  const [weapons, setWeapons] = useState<WeaponRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/game/weapon-definitions', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok) setWeapons(data.weapons ?? []);
    } catch {
      toast({ title: 'Failed to load weapon catalog', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id: string, partial: Partial<WeaponRecord>) => {
    setWeapons((list) => list.map((w) => (w.id === id ? { ...w, ...partial } : w)));
  };

  const patchCombat = (id: string, partial: Partial<WeaponRecord['combat']>) => {
    setWeapons((list) =>
      list.map((w) => (w.id === id ? { ...w, combat: { ...w.combat, ...partial } } : w))
    );
  };

  const toggleMode = (id: string, mode: 'horde' | 'competitive') => {
    setWeapons((list) =>
      list.map((w) => {
        if (w.id !== id) return w;
        const has = w.modes.includes(mode);
        return { ...w, modes: has ? w.modes.filter((m) => m !== mode) : [...w.modes, mode] };
      })
    );
  };

  const save = async (weapon: WeaponRecord) => {
    setSavingId(weapon.id);
    try {
      const res = await fetch('/api/game/weapon-definitions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(weapon),
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: data.error ?? 'Save failed', variant: 'destructive' });
        return;
      }
      toast({ title: 'Weapon updated', description: weapon.label });
      await load();
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading weapon catalog…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        These are the GLOBAL default stats every new map starts from. Per-map overrides authored
        in the Weapon Editor still layer on top and are unaffected by this panel.
      </p>
      {weapons
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((w) => (
          <Card key={w.id} className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Swords className="h-4 w-4 text-amber-300" />
                {w.label}
                <span className="text-[11px] font-normal text-slate-500">{w.id}</span>
              </CardTitle>
              {w.isCore && (
                <Badge className="bg-slate-700/50 text-slate-300 border-slate-600/50">Core</Badge>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-[11px]">Label</Label>
                <Input value={w.label} onChange={(e) => patch(w.id, { label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Kind</Label>
                <Select
                  value={w.kind}
                  onValueChange={(v) => patch(w.id, { kind: v as WeaponCombatKind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="melee">Melee</SelectItem>
                    <SelectItem value="hitscan">Hitscan</SelectItem>
                    <SelectItem value="cosmetic">Cosmetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Fire mode</Label>
                <Select
                  value={w.combat.fireMode ?? 'semi'}
                  onValueChange={(v) => patchCombat(w.id, { fireMode: v as WeaponFireMode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="semi">Semi</SelectItem>
                    <SelectItem value="bolt">Bolt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Model URL</Label>
                <Input value={w.modelUrl} onChange={(e) => patch(w.id, { modelUrl: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">Damage</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.combat.damage ?? 0}
                  onChange={(e) => patchCombat(w.id, { damage: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Range (m)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={w.combat.range ?? 0}
                  onChange={(e) => patchCombat(w.id, { range: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Cooldown (ms)</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.combat.cooldownMs ?? 0}
                  onChange={(e) => patchCombat(w.id, { cooldownMs: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Pellets (shotgun)</Label>
                <Input
                  type="number"
                  min={1}
                  value={w.combat.pellets ?? 1}
                  onChange={(e) => patchCombat(w.id, { pellets: num(e.target.value, 1) })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">Magazine size</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.combat.magSize ?? 0}
                  onChange={(e) => patchCombat(w.id, { magSize: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Reserve ammo</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.combat.reserveAmmo ?? 0}
                  onChange={(e) => patchCombat(w.id, { reserveAmmo: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Reload (ms)</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.combat.reloadMs ?? 0}
                  onChange={(e) => patchCombat(w.id, { reloadMs: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Unlock metric</Label>
                <Input
                  placeholder="e.g. competitive_kills"
                  value={w.unlockMetric ?? ''}
                  onChange={(e) => patch(w.id, { unlockMetric: e.target.value || undefined })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">Unlock amount</Label>
                <Input
                  type="number"
                  min={0}
                  value={w.unlockAmount ?? 0}
                  onChange={(e) => patch(w.id, { unlockAmount: num(e.target.value, 0) })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[11px]">Shows in modes</Label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <Switch
                      checked={w.modes.includes('horde')}
                      onCheckedChange={() => toggleMode(w.id, 'horde')}
                    />
                    Horde
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <Switch
                      checked={w.modes.includes('competitive')}
                      onCheckedChange={() => toggleMode(w.id, 'competitive')}
                    />
                    Competitive
                  </label>
                </div>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  size="sm"
                  onClick={() => void save(w)}
                  disabled={savingId === w.id}
                  className="bg-amber-600 hover:bg-amber-500 text-black font-bold"
                >
                  {savingId === w.id ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
