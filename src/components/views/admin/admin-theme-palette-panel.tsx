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
  THEME_SLIDER_FIELDS,
  type ThemePalette,
} from '@/lib/theme-palette';

const PREVIEW_TARGETS = {
  mainPanel: {
    id: 'main-panel',
    label: 'Main glass panel',
    sectionId: 'theme-options-panels',
    controlId: 'theme-option-surface',
  },
  insetPanel: {
    id: 'inset-panel',
    label: 'Inset glass panel',
    sectionId: 'theme-options-panels',
    controlId: 'theme-option-insetTint',
  },
  primaryButton: {
    id: 'primary-button',
    label: 'Primary button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-primary',
  },
  secondaryButton: {
    id: 'secondary-button',
    label: 'Secondary button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-secondary',
  },
  outlineButton: {
    id: 'outline-button',
    label: 'Outline button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-accent',
  },
  ghostButton: {
    id: 'ghost-button',
    label: 'Ghost button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-accent',
  },
  destructiveButton: {
    id: 'destructive-button',
    label: 'Destructive button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-destructive',
  },
  linkButton: {
    id: 'link-button',
    label: 'Link button',
    sectionId: 'theme-options-buttons',
    controlId: 'theme-option-primary',
  },
  icons: {
    id: 'icons',
    label: 'Accent icons',
    sectionId: 'theme-options-icons',
    controlId: 'theme-option-icon',
  },
  corners: {
    id: 'corners',
    label: 'Panel corners',
    sectionId: 'theme-options-corners',
    controlId: 'theme-option-panelCut',
  },
  pageColors: {
    id: 'page-colors',
    label: 'Page and text colors',
    sectionId: 'theme-options-page-colors',
    controlId: 'theme-option-background',
  },
} as const;

const PREVIEW_TARGET_LIST = Object.values(PREVIEW_TARGETS);
type PreviewTarget = (typeof PREVIEW_TARGET_LIST)[number];
type ThemeColorField = (typeof THEME_COLOR_FIELDS)[number];

const getColorFields = (keys: readonly string[]): ThemeColorField[] =>
  THEME_COLOR_FIELDS.filter(({ key }) => keys.includes(key));

const BUTTON_COLOR_FIELDS = getColorFields([
  'primary',
  'primaryHover',
  'secondary',
  'secondaryHover',
  'accent',
  'destructive',
  'destructiveHover',
]);
const PANEL_COLOR_FIELDS = getColorFields([
  'surface',
  'border',
  'glassStroke',
  'glassTint',
  'insetTint',
  'panelHoverTint',
  'panelHoverBorder',
  'glassGradientTint',
  'glassShadowTint',
]);
const ICON_COLOR_FIELDS = getColorFields(['icon', 'iconHover']);
const PAGE_COLOR_FIELDS = getColorFields(['background', 'foreground', 'muted']);

export function AdminThemePalettePanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPalette, setSavedPalette] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
  const [draftPalette, setDraftPalette] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
  const [selectedPreviewTarget, setSelectedPreviewTarget] = useState<PreviewTarget>(
    PREVIEW_TARGETS.mainPanel
  );
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

  const updateStyle = (
    key:
      | (typeof THEME_SLIDER_FIELDS)[number]['key']
      | 'panelCut'
      | 'panelRadius',
    value: number
  ) => {
    preview({ ...draftPalette, [key]: value });
  };

  const focusPreviewTarget = (target: PreviewTarget) => {
    setSelectedPreviewTarget(target);
    const control = document.getElementById(target.controlId);
    const section = document.getElementById(target.sectionId);
    (control ?? section)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    control?.focus({ preventScroll: true });
  };

  const isSelectedPreviewTarget = (target: PreviewTarget) =>
    selectedPreviewTarget.id === target.id;

  const renderColorFields = (fields: readonly ThemeColorField[]) =>
    fields.map(({ key, label }) => (
      <label
        key={key}
        className="hub-glass-inset flex items-center justify-between gap-3 rounded-lg border p-3"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs uppercase text-slate-400">{draftPalette[key]}</span>
        </span>
        <input
          id={`theme-option-${key}`}
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
    ));

  const renderSliderFields = (
    keys: readonly string[],
    className = 'grid gap-x-5 gap-y-4 sm:grid-cols-2'
  ) => (
    <div className={className}>
      {THEME_SLIDER_FIELDS.filter(({ key }) => keys.includes(key)).map(
        ({ key, label, min, max, unit }) => (
          <label key={key} className="space-y-2">
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{label}</span>
              <span className="tabular-nums text-muted-foreground">
                {draftPalette[key]}
                {unit}
              </span>
            </span>
            <input
              id={`theme-option-${key}`}
              type="range"
              min={min}
              max={max}
              step={1}
              value={draftPalette[key]}
              onChange={(event) => updateStyle(key, Number(event.currentTarget.value))}
              className="w-full accent-primary"
              aria-label={label}
            />
          </label>
        )
      )}
    </div>
  );

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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
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

          <section
            id="theme-options-corners"
            className={`hub-glass-inset space-y-4 rounded-lg border p-4 transition-shadow ${
              selectedPreviewTarget.sectionId === 'theme-options-corners'
                ? 'ring-2 ring-primary'
                : ''
            }`}
          >
            <div>
              <h3 className="font-semibold text-foreground">Panel corners</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Kilrun’s clipped corners are the default. Choose a shape and tune either corner
                size; the preview updates immediately.
              </p>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-foreground">Corner style</legend>
              <div className="flex flex-wrap gap-2">
                {([
                  ['chamfer', 'Kilrun cut corners'],
                  ['square', 'Square'],
                  ['rounded', 'Rounded'],
                ] as const).map(([shape, label]) => (
                  <Button
                    key={shape}
                    type="button"
                    variant={draftPalette.panelShape === shape ? 'default' : 'outline'}
                    aria-pressed={draftPalette.panelShape === shape}
                    onClick={() => preview({ ...draftPalette, panelShape: shape })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['panelCut', 'Cut-corner size'],
                ['panelRadius', 'Rounded-corner size'],
              ] as const).map(([key, label]) => (
                <label key={key} className="space-y-2">
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {draftPalette[key]}px
                    </span>
                  </span>
                  <input
                    id={`theme-option-${key}`}
                    type="range"
                    min={0}
                    max={24}
                    step={1}
                    value={draftPalette[key]}
                    onChange={(event) => updateStyle(key, Number(event.currentTarget.value))}
                    className="w-full accent-primary"
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </section>

          <section
            id="theme-options-buttons"
            className={`hub-glass-inset space-y-4 rounded-lg border p-4 transition-shadow ${
              selectedPreviewTarget.sectionId === 'theme-options-buttons'
                ? 'ring-2 ring-primary'
                : ''
            }`}
          >
            <div>
              <h3 className="font-semibold text-foreground">Buttons & hover</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Change button fills, hover colors and hover intensity. Hover the preview buttons
                to test their actual platform states.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderColorFields(BUTTON_COLOR_FIELDS)}
            </div>
            <div className="hub-glass-inset space-y-3 rounded-lg border p-4">
              <h4 className="text-sm font-semibold text-foreground">Hover behavior</h4>
              {renderSliderFields([
                'buttonHoverBrightness',
                'primaryHoverOpacity',
                'secondaryHoverOpacity',
                'destructiveHoverOpacity',
              ])}
            </div>
          </section>

          <section
            id="theme-options-panels"
            className={`hub-glass-inset space-y-4 rounded-lg border p-4 transition-shadow ${
              selectedPreviewTarget.sectionId === 'theme-options-panels'
                ? 'ring-2 ring-primary'
                : ''
            }`}
          >
            <div>
              <h3 className="font-semibold text-foreground">Panels, glass & hover</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tune panel surfaces, gradients, strokes, transparency, blur and panel hover.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderColorFields(PANEL_COLOR_FIELDS)}
            </div>
            {renderSliderFields([
              'glassOpacity',
              'insetOpacity',
              'glassBlur',
              'insetBlur',
              'glassSaturation',
              'insetSaturation',
              'gradientStrength',
              'borderOpacity',
              'insetBorderOpacity',
              'panelHoverOpacity',
            ])}
          </section>

          <section
            id="theme-options-icons"
            className={`hub-glass-inset space-y-4 rounded-lg border p-4 transition-shadow ${
              selectedPreviewTarget.sectionId === 'theme-options-icons'
                ? 'ring-2 ring-primary'
                : ''
            }`}
          >
            <div>
              <h3 className="font-semibold text-foreground">Accent icons</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Set the color of accent icons and the color they use when hovered.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {renderColorFields(ICON_COLOR_FIELDS)}
            </div>
          </section>

          <section
            id="theme-options-page-colors"
            className={`hub-glass-inset space-y-4 rounded-lg border p-4 transition-shadow ${
              selectedPreviewTarget.sectionId === 'theme-options-page-colors'
                ? 'ring-2 ring-primary'
                : ''
            }`}
          >
            <div>
              <h3 className="font-semibold text-foreground">Page & text colors</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Adjust the site background, main text and secondary text colors.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {renderColorFields(PAGE_COLOR_FIELDS)}
            </div>
          </section>

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

      <Card
        className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto"
      >
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <CardDescription>
            Hover buttons to test their real hover states. Click a sample or choose it below to
            jump straight to its controls.
          </CardDescription>
          <label className="block space-y-2 text-sm font-medium text-foreground">
            <span>Choose a sample to edit</span>
            <select
              value={selectedPreviewTarget.id}
              onChange={(event) => {
                const target = PREVIEW_TARGET_LIST.find(
                  ({ id }) => id === event.currentTarget.value
                );
                if (target) focusPreviewTarget(target);
              }}
              className="hub-glass-inset w-full rounded-md border px-3 py-2 text-foreground"
            >
              <optgroup label="Panels">
                <option value={PREVIEW_TARGETS.mainPanel.id}>Main glass panel</option>
                <option value={PREVIEW_TARGETS.insetPanel.id}>Inset glass panel</option>
                <option value={PREVIEW_TARGETS.corners.id}>Panel corners</option>
              </optgroup>
              <optgroup label="Buttons">
                <option value={PREVIEW_TARGETS.primaryButton.id}>Primary button</option>
                <option value={PREVIEW_TARGETS.secondaryButton.id}>Secondary button</option>
                <option value={PREVIEW_TARGETS.outlineButton.id}>Outline button</option>
                <option value={PREVIEW_TARGETS.ghostButton.id}>Ghost button</option>
                <option value={PREVIEW_TARGETS.destructiveButton.id}>Destructive button</option>
                <option value={PREVIEW_TARGETS.linkButton.id}>Link button</option>
              </optgroup>
              <optgroup label="Colors & icons">
                <option value={PREVIEW_TARGETS.icons.id}>Accent icons</option>
                <option value={PREVIEW_TARGETS.pageColors.id}>Page and text colors</option>
              </optgroup>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Editing: <span className="font-semibold text-foreground">{selectedPreviewTarget.label}</span>
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <button
              type="button"
              aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.mainPanel.id}
              onClick={() => focusPreviewTarget(PREVIEW_TARGETS.mainPanel)}
              className={`hub-glass-panel block w-full space-y-2 rounded-xl border p-5 text-left transition-shadow ${
                selectedPreviewTarget.id === PREVIEW_TARGETS.mainPanel.id
                  ? 'ring-2 ring-primary'
                  : ''
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {draftPalette.name} palette
              </p>
              <span className="block text-xl font-bold text-foreground">Main glass panel</span>
              <span className="block text-sm text-muted-foreground">
                Click to edit panel color, glass, stroke and hover settings.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.insetPanel.id}
              onClick={() => focusPreviewTarget(PREVIEW_TARGETS.insetPanel)}
              className={`hub-glass-inset block w-full space-y-2 rounded-md border p-4 text-left transition-shadow ${
                selectedPreviewTarget.id === PREVIEW_TARGETS.insetPanel.id
                  ? 'ring-2 ring-primary'
                  : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Inset glass panel</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                Click to edit inset tint, transparency and blur.
              </span>
            </button>
            <div className="hub-glass-inset space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold text-foreground">Button samples</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.primaryButton.id}
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.primaryButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.primaryButton)}
                >
                  Primary
                </Button>
                <Button
                  variant="secondary"
                  aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.secondaryButton.id}
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.secondaryButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.secondaryButton)}
                >
                  Secondary
                </Button>
                <Button
                  variant="outline"
                  aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.outlineButton.id}
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.outlineButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.outlineButton)}
                >
                  Outline
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.ghostButton.id}
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.ghostButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.ghostButton)}
                >
                  Ghost
                </Button>
                <Button
                  variant="destructive"
                  aria-pressed={
                    selectedPreviewTarget.id === PREVIEW_TARGETS.destructiveButton.id
                  }
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.destructiveButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.destructiveButton)}
                >
                  Destructive
                </Button>
                <Button
                  variant="link"
                  aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.linkButton.id}
                  className={
                    isSelectedPreviewTarget(PREVIEW_TARGETS.linkButton)
                      ? 'ring-2 ring-primary'
                      : ''
                  }
                  onClick={() => focusPreviewTarget(PREVIEW_TARGETS.linkButton)}
                >
                  Link
                </Button>
              </div>
            </div>
            <button
              type="button"
              aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.pageColors.id}
              onClick={() => focusPreviewTarget(PREVIEW_TARGETS.pageColors)}
              className={`hub-glass-inset block w-full space-y-1 rounded-lg border p-4 text-left transition-shadow ${
                selectedPreviewTarget.id === PREVIEW_TARGETS.pageColors.id
                  ? 'ring-2 ring-primary'
                  : ''
              }`}
            >
              <span className="block font-semibold text-foreground">Text color sample</span>
              <span className="block text-sm text-muted-foreground">
                Supporting text and the page background controls
              </span>
            </button>
            <button
              type="button"
              aria-pressed={selectedPreviewTarget.id === PREVIEW_TARGETS.icons.id}
              onClick={() => focusPreviewTarget(PREVIEW_TARGETS.icons)}
              className={`hub-glass-inset flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-shadow ${
                selectedPreviewTarget.id === PREVIEW_TARGETS.icons.id
                  ? 'ring-2 ring-primary'
                  : ''
              }`}
            >
              <Palette className="h-5 w-5 text-primary" />
              <Check className="h-5 w-5 text-primary" />
              <Save className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Accent icon samples</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
