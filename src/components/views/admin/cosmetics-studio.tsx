'use client';

import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AvatarWithFrame } from '@/components/avatar-with-frame';
import { NicknameEffectText } from '@/components/nickname-effect';
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
import {
  DEFAULT_FRAME_CONFIG,
  DEFAULT_NICKNAME_CONFIG,
  FRAME_STYLES,
  NICKNAME_EFFECTS,
  type FrameConfig,
  type FrameStyle,
  type NicknameConfig,
  type NicknameEffect,
} from '@/lib/cosmetics';
import {
  SKIN_ATTACH_SLOTS,
  SKIN_PRIMITIVES,
  defaultAttachment,
  materialForFeel,
  type SkinAttachSlot,
  type SkinPrimitive,
} from '@/lib/player-skins';
import { captureSkinPartThumbnail } from '@/components/game/editor/skin-attachments';
import { useToast } from '@/hooks/use-toast';

function ShopMetaFields({
  itemName,
  setItemName,
  itemSku,
  setItemSku,
  vpPrice,
  setVpPrice,
  namePlaceholder,
  skuPlaceholder,
}: {
  itemName: string;
  setItemName: (v: string) => void;
  itemSku: string;
  setItemSku: (v: string) => void;
  vpPrice: number;
  setVpPrice: (v: number) => void;
  namePlaceholder: string;
  skuPlaceholder: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Item name</Label>
        <Input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder={namePlaceholder}
          className="bg-slate-900/50 border-slate-700"
        />
      </div>
      <div className="space-y-1">
        <Label>SKU</Label>
        <Input
          value={itemSku}
          onChange={(e) => setItemSku(e.target.value)}
          placeholder={skuPlaceholder}
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
  );
}

function BannerPanel({ onCreated }: { onCreated?: () => void }) {
  const [colors, setColors] = useState(['#ef4444', '#7c3aed']);
  const [angle, setAngle] = useState(135);
  const [animated, setAnimated] = useState(true);
  const [animationStyle, setAnimationStyle] =
    useState<BannerAnimationStyle>('shimmer');
  const [blur, setBlur] = useState(0);
  const [opacity, setOpacity] = useState(1);
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
    blur,
    opacity,
  };

  const canSave =
    itemName.trim() &&
    itemSku.trim() &&
    colors.length >= 2 &&
    colors.every(isValidHexColor);

  const save = async () => {
    if (!canSave) return;
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
      toast({ title: `Banner “${itemName}” added to the shop` });
      setItemName('');
      setItemSku('');
      onCreated?.();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Colors</Label>
          <div className="flex flex-wrap gap-2">
            {colors.map((color, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="color"
                  value={isValidHexColor(color) ? color : '#000000'}
                  onChange={(e) =>
                    setColors((c) => c.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="h-9 w-9 rounded border border-slate-700 cursor-pointer"
                />
                {colors.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setColors((c) => c.filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {colors.length < 4 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setColors((c) => [...c, '#ffffff'])}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BANNER_PRESET_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() =>
                  setColors((c) => c.map((x, i) => (i === c.length - 1 ? swatch : x)))
                }
                className="h-5 w-5 rounded-full border border-slate-600"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Gradient angle</Label>
            <span className="text-slate-400 tabular-nums">{angle}°</span>
          </div>
          <Slider min={0} max={360} step={5} value={[angle]} onValueChange={([v]) => setAngle(v)} />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Opacity</Label>
            <span className="text-slate-400">{opacity.toFixed(2)}</span>
          </div>
          <Slider
            min={0.4}
            max={1}
            step={0.05}
            value={[opacity]}
            onValueChange={([v]) => setOpacity(v)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Soft blur</Label>
            <span className="text-slate-400">{blur.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[blur]}
            onValueChange={([v]) => setBlur(v)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-700/50 p-3">
          <div>
            <p className="font-medium">Animated</p>
            <p className="text-xs text-slate-400">Motion on the banner</p>
          </div>
          <Switch checked={animated} onCheckedChange={setAnimated} />
        </div>
        {animated && (
          <div className="space-y-2">
            <Label>Animation</Label>
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
          <Label>Live preview</Label>
          <div
            className={`aspect-[21/9] w-full min-h-[7rem] rounded-lg border border-slate-700 overflow-hidden ${bannerAnimationClass(config)}`}
            style={{
              ...bannerStyle(config),
              backgroundPosition: 'center',
            }}
          />
          <p className="text-[11px] text-slate-500">
            Same gradient fill players see on profile headers &amp; store cards.
          </p>
        </div>
        <ShopMetaFields
          itemName={itemName}
          setItemName={setItemName}
          itemSku={itemSku}
          setItemSku={setItemSku}
          vpPrice={vpPrice}
          setVpPrice={setVpPrice}
          namePlaceholder="Crimson Wave"
          skuPlaceholder="banner-crimson-wave"
        />
        <Button className="w-full" disabled={saving || !canSave} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save banner to shop'}
        </Button>
      </div>
    </div>
  );
}

function FramePanel({
  onCreated,
  markLogoUrl,
}: {
  onCreated?: () => void;
  markLogoUrl?: string;
}) {
  const [frame, setFrame] = useState<FrameConfig>({ ...DEFAULT_FRAME_CONFIG });
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [vpPrice, setVpPrice] = useState(800);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!itemName.trim() || !itemSku.trim()) return;
    setSaving(true);
    try {
      await adminUpsertStoreItem({
        itemName: itemName.trim(),
        itemCategory: 'Avatar Frame',
        itemSku: itemSku.trim(),
        vpPrice,
        cosmeticSlot: 'frame',
        cosmeticConfig: frame as unknown as Record<string, unknown>,
      });
      toast({ title: `Frame “${itemName}” added to the shop` });
      setItemName('');
      setItemSku('');
      onCreated?.();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Frame style</Label>
          <Select
            value={frame.style}
            onValueChange={(style) =>
              setFrame((f) => ({ ...f, style: style as FrameStyle }))
            }
          >
            <SelectTrigger className="bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAME_STYLES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label>Primary</Label>
            <input
              type="color"
              value={frame.color}
              onChange={(e) => setFrame((f) => ({ ...f, color: e.target.value }))}
              className="h-10 w-14 rounded border border-slate-700 cursor-pointer"
            />
          </div>
          <div className="space-y-1">
            <Label>Secondary</Label>
            <input
              type="color"
              value={frame.secondaryColor}
              onChange={(e) =>
                setFrame((f) => ({ ...f, secondaryColor: e.target.value }))
              }
              className="h-10 w-14 rounded border border-slate-700 cursor-pointer"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Thickness</Label>
            <span className="text-slate-400">{frame.thickness}px</span>
          </div>
          <Slider
            min={1}
            max={8}
            step={1}
            value={[frame.thickness]}
            onValueChange={([thickness]) => setFrame((f) => ({ ...f, thickness }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-700/50 p-3">
          <p className="font-medium">Glow</p>
          <Switch
            checked={frame.glow}
            onCheckedChange={(glow) => setFrame((f) => ({ ...f, glow }))}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-700/50 p-3">
          <p className="font-medium">Animated</p>
          <Switch
            checked={frame.animated}
            onCheckedChange={(animated) => setFrame((f) => ({ ...f, animated }))}
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-950/50 p-8">
          <AvatarWithFrame
            src={markLogoUrl?.trim() || '/api/site-favicon'}
            alt="Preview"
            fallback="K"
            frameConfig={frame}
            sizeClass="h-28 w-28"
          />
        </div>
        <ShopMetaFields
          itemName={itemName}
          setItemName={setItemName}
          itemSku={itemSku}
          setItemSku={setItemSku}
          vpPrice={vpPrice}
          setVpPrice={setVpPrice}
          namePlaceholder="Crimson Ring"
          skuPlaceholder="frame-crimson-ring"
        />
        <Button
          className="w-full"
          disabled={saving || !itemName.trim() || !itemSku.trim()}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save frame to shop'}
        </Button>
      </div>
    </div>
  );
}

function NicknamePanel({ onCreated }: { onCreated?: () => void }) {
  const [nick, setNick] = useState<NicknameConfig>({ ...DEFAULT_NICKNAME_CONFIG });
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [vpPrice, setVpPrice] = useState(600);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    if (!itemName.trim() || !itemSku.trim()) return;
    setSaving(true);
    try {
      await adminUpsertStoreItem({
        itemName: itemName.trim(),
        itemCategory: 'Nickname Effect',
        itemSku: itemSku.trim(),
        vpPrice,
        cosmeticSlot: 'nickname',
        cosmeticConfig: nick as unknown as Record<string, unknown>,
      });
      toast({ title: `Nickname effect “${itemName}” added` });
      setItemName('');
      setItemSku('');
      onCreated?.();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Effect</Label>
          <Select
            value={nick.effect}
            onValueChange={(effect) =>
              setNick((n) => ({ ...n, effect: effect as NicknameEffect }))
            }
          >
            <SelectTrigger className="bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NICKNAME_EFFECTS.filter((e) => e.value !== 'none').map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Accent color</Label>
          <input
            type="color"
            value={nick.color}
            onChange={(e) => setNick((n) => ({ ...n, color: e.target.value }))}
            className="h-10 w-14 rounded border border-slate-700 cursor-pointer"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>Intensity</Label>
            <span className="text-slate-400">{nick.intensity.toFixed(2)}</span>
          </div>
          <Slider
            min={0.2}
            max={1}
            step={0.05}
            value={[nick.intensity]}
            onValueChange={([intensity]) => setNick((n) => ({ ...n, intensity }))}
          />
        </div>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-950/50 p-8 min-h-[120px]">
          <NicknameEffectText
            name="KilrunPlayer"
            effect={nick}
            className="text-3xl font-black"
          />
        </div>
        <ShopMetaFields
          itemName={itemName}
          setItemName={setItemName}
          itemSku={itemSku}
          setItemSku={setItemSku}
          vpPrice={vpPrice}
          setVpPrice={setVpPrice}
          namePlaceholder="Neon Pulse"
          skuPlaceholder="nick-neon-pulse"
        />
        <Button
          className="w-full"
          disabled={saving || !itemName.trim() || !itemSku.trim()}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save nickname effect to shop'}
        </Button>
      </div>
    </div>
  );
}

function SkinPanel({ onCreated }: { onCreated?: () => void }) {
  const [slot, setSlot] = useState<SkinAttachSlot>('hat');
  const [primitive, setPrimitive] = useState<SkinPrimitive>('sphere');
  const [color, setColor] = useState('#c4a574');
  const [itemName, setItemName] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [vpPrice, setVpPrice] = useState(250);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const meta = SKIN_ATTACH_SLOTS.find((s) => s.id === slot)!;

  const save = async () => {
    if (!itemName.trim() || !itemSku.trim()) return;
    setSaving(true);
    try {
      const attachment = {
        ...defaultAttachment(slot),
        primitive,
        material: materialForFeel(meta.defaultFeel, { color }),
        color,
      };
      const preset = {
        kind: 'player_skin' as const,
        version: 3,
        id: `skin_${itemSku.trim()}`,
        name: itemName.trim(),
        baseModelKey: 'default-mannequin',
        primarySlot: slot,
        attachments: [attachment],
      };
      let imageUrl: string | undefined;
      try {
        imageUrl = (await captureSkinPartThumbnail(attachment, 256)) ?? undefined;
      } catch {
        imageUrl = undefined;
      }
      await adminUpsertStoreItem({
        itemName: itemName.trim(),
        itemCategory: 'Skins',
        itemSku: itemSku.trim(),
        vpPrice,
        imageUrl,
        cosmeticSlot: meta.cosmeticSlot,
        cosmeticConfig: preset,
      });
      toast({ title: `Skin “${itemName}” added to the shop` });
      setItemName('');
      setItemSku('');
      onCreated?.();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Slot</Label>
          <Select value={slot} onValueChange={(v) => setSlot(v as SkinAttachSlot)}>
            <SelectTrigger className="bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKIN_ATTACH_SLOTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Primitive shape</Label>
          <Select
            value={primitive}
            onValueChange={(v) => setPrimitive(v as SkinPrimitive)}
          >
            <SelectTrigger className="bg-slate-900/50 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKIN_PRIMITIVES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Color</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 rounded border border-slate-700 cursor-pointer"
          />
        </div>
        <p className="text-xs text-slate-400 leading-snug">
          Quick shop skins without the Model Editor. For sculpted / bonded / uploaded meshes,
          use Map Editor → Model Editor → Publish to shop.
        </p>
      </div>
      <div className="space-y-4">
        <div
          className="flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-950/50 p-8 min-h-[120px]"
          style={{ background: `radial-gradient(circle, ${color}55, transparent)` }}
        >
          <span className="text-sm font-bold uppercase tracking-wide text-slate-300">
            {meta.label} · {primitive}
          </span>
        </div>
        <ShopMetaFields
          itemName={itemName}
          setItemName={setItemName}
          itemSku={itemSku}
          setItemSku={setItemSku}
          vpPrice={vpPrice}
          setVpPrice={setVpPrice}
          namePlaceholder="Bronze Helm"
          skuPlaceholder="skin-bronze-helm"
        />
        <Button
          className="w-full"
          disabled={saving || !itemName.trim() || !itemSku.trim()}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save skin to shop'}
        </Button>
      </div>
    </div>
  );
}

/** Admin cosmetics studio: banners, avatar frames, nickname effects, skins. */
export function CosmeticsStudio({
  onCreated,
  markLogoUrl,
}: {
  onCreated?: () => void;
  /** Admin mark logo for frame preview (falls back to site favicon API). */
  markLogoUrl?: string;
}) {
  return (
    <Card className="bg-slate-800/40 border-slate-700/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Cosmetics Studio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="banner">
          <TabsList className="mb-4 bg-slate-900/60">
            <TabsTrigger value="banner">Banners</TabsTrigger>
            <TabsTrigger value="frame">Avatar frames</TabsTrigger>
            <TabsTrigger value="nickname">Nickname effects</TabsTrigger>
            <TabsTrigger value="skins">Skins</TabsTrigger>
          </TabsList>
          <TabsContent value="banner">
            <BannerPanel onCreated={onCreated} />
          </TabsContent>
          <TabsContent value="frame">
            <FramePanel onCreated={onCreated} markLogoUrl={markLogoUrl} />
          </TabsContent>
          <TabsContent value="nickname">
            <NicknamePanel onCreated={onCreated} />
          </TabsContent>
          <TabsContent value="skins">
            <SkinPanel onCreated={onCreated} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** @deprecated use CosmeticsStudio */
export { CosmeticsStudio as BannerGenerator };
