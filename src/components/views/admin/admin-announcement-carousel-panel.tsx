'use client';

import { useEffect, useState } from 'react';
import { Loader2, Radio, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_ANNOUNCEMENT_TYPES,
  defaultAnnouncementCarouselConfig,
  type AnnouncementCarouselConfig,
  type AnnouncementType,
} from '@/lib/announcement-carousel-config';
import {
  getAnnouncementCarouselItems,
  updateAnnouncementCarouselConfig,
} from '@/lib/announcement-carousel-actions';

export function AdminAnnouncementCarouselPanel() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AnnouncementCarouselConfig>(
    defaultAnnouncementCarouselConfig()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAnnouncementCarouselItems()
      .then(({ config }) => setConfig(config))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (type: AnnouncementType) => {
    setConfig((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAnnouncementCarouselConfig(config);
      toast({ title: 'Carousel settings saved' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/40 border-slate-700/30 max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          Hub Announcement Carousel
        </CardTitle>
        <CardDescription className="text-slate-400">
          Configure the scrolling ticker shown at the top of every hub page (not on the landing
          page).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/40 bg-slate-900/40 px-4 py-3">
          <div>
            <p className="font-semibold text-white text-sm">Enable carousel</p>
            <p className="text-xs text-slate-400 mt-0.5">Show the announcement ticker to all hub users</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig((p) => ({ ...p, enabled: v }))}
          />
        </div>

        {/* Announcement types */}
        <div className="space-y-2">
          <Label className="text-slate-200 text-sm font-semibold">
            Announcement Types
          </Label>
          <p className="text-xs text-slate-400 mb-3">
            Select which event types appear in the carousel
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_ANNOUNCEMENT_TYPES.map((t) => (
              <label
                key={t.value}
                className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/30 px-3 py-2.5 cursor-pointer hover:bg-slate-900/60 transition-colors"
              >
                <Checkbox
                  checked={config.types.includes(t.value)}
                  onCheckedChange={() => toggle(t.value)}
                  className="shrink-0"
                />
                <span className="text-sm text-slate-200 select-none">
                  {t.emoji} {t.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Direction */}
        <div className="space-y-2">
          <Label className="text-slate-200 text-sm font-semibold">Scroll Direction</Label>
          <Select
            value={config.direction}
            onValueChange={(v) =>
              setConfig((p) => ({ ...p, direction: v as 'left' | 'right' }))
            }
          >
            <SelectTrigger className="bg-slate-900/50 border-slate-700 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              <SelectItem value="left">← Left (default)</SelectItem>
              <SelectItem value="right">→ Right</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Speed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-slate-200 text-sm font-semibold">Scroll Speed</Label>
            <span className="text-xs text-slate-400 tabular-nums">{config.speed} px/s</span>
          </div>
          <Slider
            min={10}
            max={300}
            step={5}
            value={[config.speed]}
            onValueChange={([v]) => setConfig((p) => ({ ...p, speed: v }))}
            className="w-full"
          />
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Slow</span>
            <span>Fast</span>
          </div>
        </div>

        {/* Thickness */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-slate-200 text-sm font-semibold">Band Height (thickness)</Label>
            <span className="text-xs text-slate-400 tabular-nums">{config.thickness}px</span>
          </div>
          <Slider
            min={24}
            max={80}
            step={4}
            value={[config.thickness]}
            onValueChange={([v]) => setConfig((p) => ({ ...p, thickness: v }))}
            className="w-full"
          />
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Thin</span>
            <span>Thick</span>
          </div>
          {/* Live preview strip */}
          <div
            className="rounded border border-slate-700/50 bg-slate-900/60 overflow-hidden flex items-center px-4"
            style={{ height: config.thickness }}
          >
            <span className="text-xs text-slate-300 animate-pulse">
              🔥 Fire Sale &nbsp;•&nbsp; 🏆 Won Match &nbsp;•&nbsp; 👋 New Member
            </span>
          </div>
        </div>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Carousel Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
