'use client';

import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminUpsertStoreItem } from '@/lib/social-actions';
import {
  BANNER_ANIMATION_STYLES,
  BANNER_PRESET_SWATCHES,
  bannerAnimationClass,
  bannerStyle,
  isValidHexColor,
  type BannerAnimationStyle,
  type BannerConfig,
} from '@/lib/banner';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_COLORS = ['#ef4444', '#7c3aed'];

/** Admin tool: build a gradient/animated profile-banner cosmetic and publish it to the shop. */
export function BannerGenerator({ onCreated }: { onCreated?: () => void }) {
  const [colors, setColors] = useState<string[]>(DEFAULT_COLORS);
  const [angle, setAngle] = useState(135);
  const [animated, setAnimated] = useState(false);
  const [animationStyle, setAnimationStyle] = useState<BannerAnimationStyle>('none');
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [vpPrice, setVpPrice] = useState(1000);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const config: BannerConfig = {
    colors,
    angle,
    animated: animated && animationStyle !== 'none',
    animationStyle,
  };

  const updateColor = (index: number, value: string) => {
    setColors((c) => c.map((existing, i) => (i === index ? value : existing)));
  };

  const addColor = () => {
    if (colors.length >= 4) return;
    setColors((c) => [...c, '#ffffff']);
  };

  const removeColor = (index: number) => {
    if (colors.length <= 2) return;
    setColors((c) => c.filter((_, i) => i !== index));
  };

  const canSave =
    itemName.trim().length > 0 &&
    itemSku.trim().length > 0 &&
    colors.length >= 2 &&
    colors.every(isValidHexColor);

  const handleSave = async () => {
    if (!canSave) {
      toast({ title: 'Name, SKU, and at least 2 valid colors are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await adminUpsertStoreItem({
        itemName: itemName.trim(),
        itemCategory: 'Profile Banner',
        itemSku: itemSku.trim(),
        vpPrice,
        cosmeticSlot: 'banner',
        bannerConfig: config,
      });
      toast({ title: `Banner "${itemName}" added to the shop` });
      setItemName('');
      setItemSku('');
      onCreated?.();
    } catch (e: any) {
      toast({ title: e?.message ?? 'Failed to save banner', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-slate-800/40 border-slate-700/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Banner Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Colors</Label>
            <div className="flex flex-wrap gap-2">
              {colors.map((color, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="color"
                    value={isValidHexColor(color) ? color : '#000000'}
                    onChange={(e) => updateColor(i, e.target.value)}
                    className="h-9 w-9 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  {colors.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeColor(i)}
                      className="text-slate-500 hover:text-red-400"
                      aria-label="Remove color"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {colors.length < 4 && (
                <Button type="button" variant="outline" size="icon" onClick={addColor}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {BANNER_PRESET_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  title={swatch}
                  onClick={() => updateColor(colors.length - 1, swatch)}
                  className="h-5 w-5 rounded-full border border-slate-600"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Gradient angle: {angle}°</Label>
            <Slider
              min={0}
              max={360}
              step={5}
              value={[angle]}
              onValueChange={([v]) => setAngle(v)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-700/50 p-3">
            <div>
              <p className="font-medium">Animated</p>
              <p className="text-xs text-slate-400">Adds motion to the banner</p>
            </div>
            <Switch checked={animated} onCheckedChange={setAnimated} />
          </div>

          {animated && (
            <div className="space-y-2">
              <Label>Animation style</Label>
              <Select
                value={animationStyle}
                onValueChange={(v) => setAnimationStyle(v as BannerAnimationStyle)}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANNER_ANIMATION_STYLES.filter((s) => s.value !== 'none').map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Preview</Label>
            <div
              className={`h-24 w-full rounded-lg border border-slate-700 ${bannerAnimationClass(config)}`}
              style={bannerStyle(config)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Item name</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Sunset Gradient"
                className="bg-slate-900/50 border-slate-700"
              />
            </div>
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input
                value={itemSku}
                onChange={(e) => setItemSku(e.target.value)}
                placeholder="banner-sunset-gradient"
                className="bg-slate-900/50 border-slate-700"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>VP price</Label>
              <Input
                type="number"
                value={vpPrice}
                onChange={(e) => setVpPrice(Number(e.target.value) || 0)}
                className="bg-slate-900/50 border-slate-700"
              />
            </div>
          </div>

          <Button className="w-full" disabled={saving || !canSave} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save to Shop'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
