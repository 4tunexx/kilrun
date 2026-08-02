'use client';

import { useEffect, useState } from 'react';
import { Loader2, Package, PackagePlus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DEFAULT_INVENTORY_CONFIG,
  parseInventoryConfig,
  type InventoryConfig,
} from '@/lib/inventory-config';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import {
  adminDeleteSlotPack,
  adminGetSlotPacks,
  adminUpsertSlotPack,
} from '@/lib/social-actions';
import {
  BASE_INVENTORY_SLOTS,
  LEVEL_SLOTS_PER_STEP,
  LEVEL_SLOTS_STEP,
  MAX_LEVEL_INVENTORY_SLOTS,
} from '@/lib/inventory-slots';
import { useToast } from '@/hooks/use-toast';

type SlotPackRow = Awaited<ReturnType<typeof adminGetSlotPacks>>[number];

function SlotPacksEditor() {
  const { toast } = useToast();
  const [packs, setPacks] = useState<SlotPackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(5);
  const [price, setPrice] = useState(500);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    adminGetSlotPacks()
      .then(setPacks)
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      await adminUpsertSlotPack({
        itemName: name.trim() || `+${amount} Slots`,
        vpPrice: price,
        slotAmount: amount,
      });
      setName('');
      toast({ title: 'Slot pack created' });
      reload();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to create pack',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (pack: SlotPackRow) => {
    setBusyId(pack.id);
    try {
      await adminUpsertSlotPack({
        id: pack.id,
        itemName: pack.itemName,
        vpPrice: pack.vpPrice,
        slotAmount: pack.slotAmount ?? 1,
        isAvailable: !pack.isAvailable,
      });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (pack: SlotPackRow) => {
    if (!confirm(`Delete "${pack.itemName}"? Players who already bought it keep their slots.`)) {
      return;
    }
    setBusyId(pack.id);
    try {
      await adminDeleteSlotPack(pack.id);
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-emerald-400" /> Inventory slot packs
        </CardTitle>
        <p className="text-xs text-slate-400 font-normal">
          Base cap is {BASE_INVENTORY_SLOTS} slots, +{LEVEL_SLOTS_PER_STEP} every{' '}
          {LEVEL_SLOTS_STEP} levels, capping at {MAX_LEVEL_INVENTORY_SLOTS} from leveling alone.
          Slot packs sold here stack on top of that as permanent purchases, shown in the shop's
          "Inventory Slots" section.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`+${amount} Slots`}
              className="h-8 bg-slate-900/50 border-slate-700"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slots granted</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 bg-slate-900/50 border-slate-700"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">VP price</Label>
            <Input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 bg-slate-900/50 border-slate-700"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={saving} onClick={() => void create()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Add slot pack
          </Button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading packs…
            </div>
          ) : packs.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No slot packs yet.</p>
          ) : (
            packs.map((pack) => (
              <div
                key={pack.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{pack.itemName}</p>
                  <p className="text-[11px] text-slate-400">
                    +{pack.slotAmount ?? 0} slots · {pack.vpPrice} VP
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!pack.isAvailable && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      Hidden
                    </Badge>
                  )}
                  <Switch
                    checked={pack.isAvailable}
                    disabled={busyId === pack.id}
                    onCheckedChange={() => void toggleAvailable(pack)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-400"
                    disabled={busyId === pack.id}
                    onClick={() => void remove(pack)}
                  >
                    {busyId === pack.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Admin → Inventory: tune the player inventory drawer (resell rate, tabs,
 * title, panel width, drag-drop, preview column).
 */
export function AdminInventoryPanel() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<InventoryConfig>(DEFAULT_INVENTORY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSiteSettings()
      .then((s) => {
        if (!mounted) return;
        setCfg(
          parseInventoryConfig(
            (s as { inventoryConfigJson?: string }).inventoryConfigJson ?? '{}'
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const patch = <K extends keyof InventoryConfig>(key: K, value: InventoryConfig[K]) => {
    setCfg((c) => ({ ...c, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSiteSettings({
        inventoryConfigJson: JSON.stringify(cfg),
      });
      toast({ title: 'Inventory settings saved' });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading inventory settings…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="bg-slate-900/60 border-slate-700/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Inventory drawer
          </CardTitle>
          <p className="text-xs text-slate-400 font-normal">
            Controls the player Inventory panel opened from the left nav. Changes apply the
            next time a player opens it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={cfg.title}
                onChange={(e) => patch('title', e.target.value)}
                maxLength={32}
                className="bg-slate-900/50 border-slate-700"
              />
            </div>
            <div className="space-y-1">
              <Label>Subtitle override</Label>
              <Input
                value={cfg.subtitle}
                onChange={(e) => patch('subtitle', e.target.value)}
                placeholder="Leave blank for “N items”"
                maxLength={64}
                className="bg-slate-900/50 border-slate-700"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Resell refund rate</Label>
              <span className="text-slate-400 tabular-nums">
                {Math.round(cfg.resellRate * 100)}% of VP value
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[cfg.resellRate]}
              onValueChange={([v]) => patch('resellRate', v)}
            />
            <p className="text-[10px] text-slate-500">
              Players get this fraction of an item&apos;s original VP price when they sell it
              back from inventory.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Panel max width</Label>
              <span className="text-slate-400 tabular-nums">{cfg.sheetMaxWidth}px</span>
            </div>
            <Slider
              min={640}
              max={1280}
              step={20}
              value={[cfg.sheetMaxWidth]}
              onValueChange={([v]) => patch('sheetMaxWidth', v)}
            />
          </div>

          <div className="space-y-1">
            <Label>Default tab on open</Label>
            <Select
              value={cfg.defaultPageTab}
              onValueChange={(v) =>
                patch('defaultPageTab', v as InventoryConfig['defaultPageTab'])
              }
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skins">Skins</SelectItem>
                <SelectItem value="cosmetics">Cosmetics</SelectItem>
                <SelectItem value="powers">Powers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2.5">
              <span className="text-sm">Show Cosmetics tab</span>
              <Switch
                checked={cfg.showCosmeticsTab}
                onCheckedChange={(v) => patch('showCosmeticsTab', v)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2.5">
              <span className="text-sm">Show Powers tab</span>
              <Switch
                checked={cfg.showPowersTab}
                onCheckedChange={(v) => patch('showPowersTab', v)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2.5">
              <span className="text-sm">Drag &amp; drop equip</span>
              <Switch
                checked={cfg.enableDragDrop}
                onCheckedChange={(v) => patch('enableDragDrop', v)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-950/40 px-3 py-2.5">
              <span className="text-sm">Preview column (3D / profile)</span>
              <Switch
                checked={cfg.showPreviewColumn}
                onCheckedChange={(v) => patch('showPreviewColumn', v)}
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-700/40 bg-slate-950/40 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-200">3D preview (all players)</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Model and animation shown in every player&apos;s Inventory → Skins turntable.
                Leave model blank for the default pack body.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Preview model URL</Label>
              <Input
                value={cfg.previewModelUrl}
                onChange={(e) => patch('previewModelUrl', e.target.value)}
                placeholder="/game/skins/.../Body_Blue_001.fbx or GLB URL"
                maxLength={512}
                className="bg-slate-900/50 border-slate-700 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Animation clip name</Label>
              <Input
                value={cfg.previewClipName}
                onChange={(e) => patch('previewClipName', e.target.value)}
                placeholder="Idle (empty = auto-pick idle/stand)"
                maxLength={96}
                className="bg-slate-900/50 border-slate-700 font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Turntable spin</Label>
                <span className="text-slate-400 tabular-nums">
                  {cfg.previewSpinSpeed.toFixed(2)} rad/s
                </span>
              </div>
              <Slider
                min={0}
                max={1.5}
                step={0.05}
                value={[cfg.previewSpinSpeed]}
                onValueChange={([v]) => patch('previewSpinSpeed', v)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save inventory settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <SlotPacksEditor />
    </div>
  );
}
