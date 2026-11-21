'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HubLoadingState } from '@/components/ui/hub-loading-state';
import { useToast } from '@/hooks/use-toast';
import { broadcastSiteSettings } from '@/lib/site-branding-events';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import {
  applyThemePalette,
  DEFAULT_THEME_PALETTE,
  parseThemePalette,
  serializeThemePalette,
  THEME_COLOR_FIELDS,
  THEME_PALETTES,
  type ThemePalette,
} from '@/lib/theme-palette';

export function AdminThemePalettePanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPalette, setSavedPalette] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
  const [draftPalette, setDraftPalette] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
  const savedPaletteRef = useRef(savedPalette);
  const hasPreviewRef = useRef(false);

  useEffect(() => {
    savedPaletteRef.current = savedPalette;
  }, [savedPalette]);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((settings) => {
        if (cancelled) return;
        const palette = parseThemePalette(settings.themePaletteJson);
        setSavedPalette(palette);
        setDraftPalette(palette);
        applyThemePalette(palette, document.documentElement);
      })
      .catch((error: unknown) => {
        console.error('[admin-theme-palette] failed to load palette', error);
        toast({
          title: 'Could not load the saved palette',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (hasPreviewRef.current) {
        applyThemePalette(savedPaletteRef.current, document.documentElement);
      }
    };
  }, [toast]);

  const isDirty =
    serializeThemePalette(savedPalette) !== serializeThemePalette(draftPalette);

  const preview = (next: ThemePalette) => {
    hasPreviewRef.current = true;
    setDraftPalette(next);
    applyThemePalette(next, document.documentElement);
    broadcastSiteSettings({ themePaletteJson: serializeThemePalette(next) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateSiteSettings({
        themePaletteJson: serializeThemePalette(draftPalette),
      });
      const palette = parseThemePalette(
        saved.themePaletteJson || serializeThemePalette(draftPalette)
      );
      setSavedPalette(palette);
      setDraftPalette(palette);
      savedPaletteRef.current = palette;
      hasPreviewRef.current = false;
      applyThemePalette(palette, document.documentElement);
      broadcastSiteSettings({ themePaletteJson: serializeThemePalette(palette) });
      toast({ title: 'Palette saved', description: `${palette.name} is now live.` });
    } catch (error: unknown) {
      console.error('[admin-theme-palette] failed to save palette', error);
      toast({
        title: error instanceof Error ? error.message : 'Could not save the palette',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <HubLoadingState label="Loading the current color palette" className="p-6" />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Platform color palette
          </CardTitle>
          <CardDescription>
            Choose a starting palette or adjust individual colors. Changes preview across the
            platform immediately; save them to keep the palette for everyone.
          </CardDescription>
          <p className="text-sm text-slate-300">
            Current saved palette: <strong className="text-foreground">{savedPalette.name}</strong>
            {isDirty && <span className="ml-2 text-amber-300">Unsaved preview</span>}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                aria-pressed={draftPalette.id === palette.id}
                onClick={() => preview({ ...palette })}
                className={`hub-glass-inset flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                  draftPalette.id === palette.id
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-slate-700/50 hover:border-primary/50'
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{palette.name}</span>
                  {savedPalette.id === palette.id && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Check className="h-3 w-3" /> Saved
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1" aria-hidden="true">
                  {[palette.primary, palette.background, palette.surface].map((color) => (
                    <span
                      key={color}
                      className="h-5 w-5 rounded-full border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THEME_COLOR_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="hub-glass-inset flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="text-xs uppercase text-slate-400">{draftPalette[key]}</span>
                </span>
                <input
                  type="color"
                  aria-label={label}
                  value={draftPalette[key]}
                  onChange={(event) =>
                    preview({
                      ...draftPalette,
                      id: 'custom',
                      name: 'Custom',
                      [key]: event.currentTarget.value,
                    })
                  }
                  className="h-10 w-12 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!isDirty || saving}>
              {saving ? (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save palette
            </Button>
            <Button
              variant="outline"
              onClick={() => preview({ ...savedPalette })}
              disabled={!isDirty || saving}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Discard preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <CardDescription>Preview of the current draft using real platform color tokens.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hub-glass-panel space-y-4 rounded-xl border p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {draftPalette.name} palette
              </p>
              <h3 className="mt-1 text-xl font-bold text-foreground">A platform panel</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Text, buttons, borders, and glass surfaces update as you edit.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[draftPalette.primary, draftPalette.surface, draftPalette.border].map((color) => (
                <span
                  key={color}
                  className="h-10 rounded-md border"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
