'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Eye, EyeOff, LayoutGrid, Loader2, PanelTop, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSiteSettings, updateSiteSettings } from '@/lib/progression-actions';
import { broadcastSiteSettings } from '@/lib/site-branding-events';
import {
  HUB_NAV_CATALOG,
  parseHubChrome,
  parseHubNav,
  parseHubPages,
  type HubChromeConfig,
  type HubNavLayout,
  type HubPageId,
  type HubPagesConfig,
} from '@/lib/hub-layout';
import { useToast } from '@/hooks/use-toast';

/**
 * Site Settings sub-tabs: page access toggles, live nav placement, hub chrome.
 */
export function AdminSiteLayoutPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState<HubPagesConfig>(() => parseHubPages('{}'));
  const [nav, setNav] = useState<HubNavLayout>(() => parseHubNav('{}'));
  const [chrome, setChrome] = useState<HubChromeConfig>(() => parseHubChrome('{}'));

  const reload = async () => {
    const s = await getSiteSettings();
    setPages(parseHubPages((s as { hubPagesJson?: string }).hubPagesJson));
    setNav(parseHubNav((s as { hubNavJson?: string }).hubNavJson));
    setChrome(parseHubChrome((s as { hubChromeJson?: string }).hubChromeJson));
  };

  useEffect(() => {
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (partial: {
    hubPagesJson?: string;
    hubNavJson?: string;
    hubChromeJson?: string;
  }) => {
    setSaving(true);
    try {
      const saved = await updateSiteSettings(partial);
      broadcastSiteSettings({
        hubPagesJson: (saved as { hubPagesJson?: string }).hubPagesJson,
        hubNavJson: (saved as { hubNavJson?: string }).hubNavJson,
        hubChromeJson: (saved as { hubChromeJson?: string }).hubChromeJson,
      });
      await reload();
      toast({ title: 'Layout saved' });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const moveTo = (id: HubPageId, rail: 'left' | 'right') => {
    const item = HUB_NAV_CATALOG.find((i) => i.id === id);
    if (item?.locked && rail !== 'left') return;
    setNav((prev) => {
      const left = prev.left.filter((x) => x !== id);
      const right = prev.right.filter((x) => x !== id);
      if (rail === 'left') left.push(id);
      else right.push(id);
      return parseHubNav({ left, right });
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading layout…
      </div>
    );
  }

  return (
    <Tabs defaultValue="pages" className="space-y-4">
      <TabsList className="bg-slate-800/60 flex flex-wrap h-auto gap-1">
        <TabsTrigger value="pages">
          <Eye className="h-3.5 w-3.5 mr-1.5" /> Page access
        </TabsTrigger>
        <TabsTrigger value="nav">
          <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" /> Live nav
        </TabsTrigger>
        <TabsTrigger value="chrome">
          <PanelTop className="h-3.5 w-3.5 mr-1.5" /> Header / Footer / Landing
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pages" className="mt-0">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" /> Page toggles
            </CardTitle>
            <CardDescription>
              Disabled pages are hidden from the nav and blocked for regular players. Staff can
              still open them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {HUB_NAV_CATALOG.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5"
              >
                <div>
                  <p className="font-semibold text-sm">{item.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {item.locked
                      ? 'Always on (Home)'
                      : pages[item.id]
                        ? 'Visible to everyone'
                        : 'Staff only'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pages[item.id] ? (
                    <Eye className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-slate-500" />
                  )}
                  <Switch
                    checked={pages[item.id]}
                    disabled={!!item.locked || saving}
                    onCheckedChange={(checked) =>
                      setPages((p) => ({ ...p, [item.id]: checked }))
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              disabled={saving}
              onClick={() => save({ hubPagesJson: JSON.stringify(pages) })}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save page access
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="nav" className="mt-0">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle>Live link editor</CardTitle>
            <CardDescription>
              Move icons between the left rail and the right shortcuts menu. Changes apply after
              Save (staff keep Admin / Inventory / VIP).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(['left', 'right'] as const).map((rail) => (
              <div key={rail} className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                  {rail === 'left' ? 'Left rail' : 'Right menu'}
                </p>
                <div className="space-y-2 min-h-[120px]">
                  {(rail === 'left' ? nav.left : nav.right).map((id) => {
                    const item = HUB_NAV_CATALOG.find((i) => i.id === id);
                    if (!item) return null;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/40 bg-slate-800/50 px-2.5 py-2"
                      >
                        <span className="text-sm font-medium truncate">{item.label}</span>
                        {!item.locked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={saving}
                            onClick={() => moveTo(id, rail === 'left' ? 'right' : 'left')}
                          >
                            → {rail === 'left' ? 'Right' : 'Left'}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button disabled={saving} onClick={() => save({ hubNavJson: JSON.stringify(nav) })}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save navigation
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="chrome" className="mt-0">
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader>
            <CardTitle>Header / Footer / Landing</CardTitle>
            <CardDescription>
              Toggle dashboard chrome and the public landing hero slider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ['showHeader', 'Hub header (page banner + toolbar)'],
                ['showFooter', 'Hub footer'],
                ['showLandingSlider', 'Landing page hero slider'],
              ] as const
            ).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5"
              >
                <p className="font-semibold text-sm">{label}</p>
                <Switch
                  checked={chrome[key]}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                    setChrome((c) => ({ ...c, [key]: checked }))
                  }
                />
              </div>
            ))}
            <Button
              disabled={saving}
              onClick={() => save({ hubChromeJson: JSON.stringify(chrome) })}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save chrome
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
