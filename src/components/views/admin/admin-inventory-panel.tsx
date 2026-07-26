'use client';

import { useEffect, useState } from 'react';
import { Loader2, Package, Save } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DEFAULT_INVENTORY_CONFIG,
  parseInventoryConfig,
  type InventoryConfig,
} from '@/lib/inventory-config';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import { useToast } from '@/hooks/use-toast';

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
    </div>
  );
}
