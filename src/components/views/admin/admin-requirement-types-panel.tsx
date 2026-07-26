'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Plus,
  Radar,
  Save,
  Search,
  Trash2,
  AlertTriangle,
  Megaphone,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  REQUIREMENT_CATEGORY_LABELS,
  type CatalogMetric,
  type RequirementCatalog,
  type RequirementCategory,
  type UnlockChannel,
} from '@/lib/requirement-catalog';
import {
  adminBumpUserMetric,
  adminDeleteRequirementMetric,
  adminDeleteUnlockChannel,
  adminSaveRequirementCatalog,
  adminUpsertRequirementMetric,
  adminUpsertUnlockChannel,
  getRequirementCatalogAdmin,
} from '@/lib/requirement-actions';
import { cn } from '@/lib/utils';

const CATEGORIES = Object.keys(REQUIREMENT_CATEGORY_LABELS) as RequirementCategory[];

/**
 * Admin → Requirement types: browse wired metrics, create customs for events,
 * edit unlock channels used by the shop “Obtained via” dropdown.
 */
export function AdminRequirementTypesPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<RequirementCatalog | null>(null);
  const [scan, setScan] = useState<{
    wired: string[];
    unwiredBuiltin: string[];
    custom: string[];
    orphanWired: string[];
  } | null>(null);
  const [q, setQ] = useState('');
  const [editMetric, setEditMetric] = useState<CatalogMetric | null>(null);
  const [newMetric, setNewMetric] = useState({
    value: '',
    label: '',
    description: '',
    category: 'game' as RequirementCategory,
  });
  const [newUnlock, setNewUnlock] = useState({ id: '', label: '', hint: '' });
  const [grant, setGrant] = useState({ user: '', metric: '', amount: '1' });

  const refresh = useCallback(async () => {
    const data = await getRequirementCatalogAdmin();
    setCatalog(data.catalog);
    setScan(data.scan);
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) =>
        toast({
          title: 'Failed to load',
          description: e instanceof Error ? e.message : 'Error',
          variant: 'destructive',
        })
      )
      .finally(() => setLoading(false));
  }, [refresh, toast]);

  const filteredMetrics = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return catalog.metrics;
    return catalog.metrics.filter(
      (m) =>
        m.value.includes(needle) ||
        m.label.toLowerCase().includes(needle) ||
        m.description.toLowerCase().includes(needle) ||
        m.category.includes(needle)
    );
  }, [catalog, q]);

  if (loading || !catalog) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading requirement types…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800/40 border-slate-700/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-cyan-400" /> Requirement types
          </CardTitle>
          <CardDescription>
            Progression metrics power missions, achievements, and badges. Unlock channels label how
            shop items are obtained (purchase, event, …). Custom metrics store counters on the player
            — bump them when an event goal is reached.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="metrics">
        <TabsList className="bg-slate-900/60">
          <TabsTrigger value="metrics">Progression metrics</TabsTrigger>
          <TabsTrigger value="unlocks">Shop unlock channels</TabsTrigger>
          <TabsTrigger value="scan">
            <Radar className="h-3.5 w-3.5 mr-1" /> Scan
          </TabsTrigger>
          <TabsTrigger value="grant">Grant / test</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="space-y-4 mt-4">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" /> Create custom metric
              </CardTitle>
              <CardDescription>
                Example: <code className="text-cyan-300">event_summer_finish</code> — players who
                finish the event map get +1; attach a mission/achievement with target 1 to grant
                rewards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Id (code)</Label>
                <Input
                  value={newMetric.value}
                  onChange={(e) => setNewMetric((s) => ({ ...s, value: e.target.value }))}
                  placeholder="event_summer_finish"
                  className="bg-slate-900/50 border-slate-700 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>Label</Label>
                <Input
                  value={newMetric.label}
                  onChange={(e) => setNewMetric((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Summer event finish"
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={newMetric.category}
                  onValueChange={(v) =>
                    setNewMetric((s) => ({ ...s, category: v as RequirementCategory }))
                  }
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {REQUIREMENT_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                <Label>Description</Label>
                <Input
                  value={newMetric.description}
                  onChange={(e) => setNewMetric((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Reach the finish on the Summer Run map"
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button
                  disabled={saving || !newMetric.value.trim() || !newMetric.label.trim()}
                  onClick={() => {
                    setSaving(true);
                    void adminUpsertRequirementMetric(newMetric)
                      .then((cat) => {
                        setCatalog(cat);
                        setNewMetric({
                          value: '',
                          label: '',
                          description: '',
                          category: 'game',
                        });
                        toast({ title: 'Metric created' });
                        return refresh();
                      })
                      .catch((e) =>
                        toast({
                          title: 'Create failed',
                          description: e instanceof Error ? e.message : 'Error',
                          variant: 'destructive',
                        })
                      )
                      .finally(() => setSaving(false));
                  }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add metric
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter metrics…"
              className="max-w-sm bg-slate-900/50 border-slate-700 h-8"
            />
            <span className="text-xs text-slate-500">{filteredMetrics.length} types</span>
          </div>

          <div className="space-y-2">
            {filteredMetrics.map((m) => {
              const open = editMetric?.value === m.value;
              return (
                <div
                  key={m.value}
                  className={cn(
                    'rounded-lg border border-slate-700/40 bg-slate-900/30 p-3',
                    !m.enabled && 'opacity-60'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1"
                      onClick={() => setEditMetric(open ? null : { ...m })}
                    >
                      <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                        {m.label}
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {m.category}
                        </Badge>
                        {m.builtIn ? (
                          <Badge className="bg-emerald-600/30 text-emerald-200 text-[10px]">
                            built-in
                          </Badge>
                        ) : (
                          <Badge className="bg-fuchsia-600/30 text-fuchsia-200 text-[10px]">
                            custom
                          </Badge>
                        )}
                        {m.source === 'wired' && (
                          <Badge className="bg-sky-600/30 text-sky-200 text-[10px]">wired</Badge>
                        )}
                        {!m.enabled && (
                          <Badge variant="destructive" className="text-[10px]">
                            disabled
                          </Badge>
                        )}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500">{m.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{m.description}</p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={m.enabled}
                        onCheckedChange={(on) => {
                          setSaving(true);
                          void adminUpsertRequirementMetric({ ...m, enabled: on })
                            .then((cat) => {
                              setCatalog(cat);
                              return refresh();
                            })
                            .catch((e) =>
                              toast({
                                title: 'Update failed',
                                description: e instanceof Error ? e.message : 'Error',
                                variant: 'destructive',
                              })
                            )
                            .finally(() => setSaving(false));
                        }}
                      />
                      {!m.builtIn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 h-8 w-8 p-0"
                          onClick={() => {
                            if (!confirm(`Delete custom metric “${m.value}”?`)) return;
                            setSaving(true);
                            void adminDeleteRequirementMetric(m.value)
                              .then((cat) => {
                                setCatalog(cat);
                                toast({ title: 'Deleted' });
                                return refresh();
                              })
                              .catch((e) =>
                                toast({
                                  title: 'Delete failed',
                                  description: e instanceof Error ? e.message : 'Error',
                                  variant: 'destructive',
                                })
                              )
                              .finally(() => setSaving(false));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {open && editMetric && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 border-t border-slate-700/40 pt-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={editMetric.label}
                          onChange={(e) =>
                            setEditMetric((s) => (s ? { ...s, label: e.target.value } : s))
                          }
                          className="h-8 bg-slate-950/50 border-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={editMetric.category}
                          onValueChange={(v) =>
                            setEditMetric((s) =>
                              s ? { ...s, category: v as RequirementCategory } : s
                            )
                          }
                        >
                          <SelectTrigger className="h-8 bg-slate-950/50 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {REQUIREMENT_CATEGORY_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={editMetric.description}
                          onChange={(e) =>
                            setEditMetric((s) =>
                              s ? { ...s, description: e.target.value } : s
                            )
                          }
                          className="h-8 bg-slate-950/50 border-slate-700"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <Button
                          size="sm"
                          disabled={saving}
                          onClick={() => {
                            setSaving(true);
                            void adminUpsertRequirementMetric(editMetric)
                              .then((cat) => {
                                setCatalog(cat);
                                setEditMetric(null);
                                toast({ title: 'Saved' });
                                return refresh();
                              })
                              .catch((e) =>
                                toast({
                                  title: 'Save failed',
                                  description: e instanceof Error ? e.message : 'Error',
                                  variant: 'destructive',
                                })
                              )
                              .finally(() => setSaving(false));
                          }}
                        >
                          <Save className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="unlocks" className="space-y-4 mt-4">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-fuchsia-400" /> Unlock channels
              </CardTitle>
              <CardDescription>
                Shown in Shop / Cosmetics Studio “Obtained via” dropdowns (purchase, event reward,
                …).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Id</Label>
                <Input
                  value={newUnlock.id}
                  onChange={(e) => setNewUnlock((s) => ({ ...s, id: e.target.value }))}
                  placeholder="season_pass"
                  className="bg-slate-900/50 border-slate-700 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label>Label</Label>
                <Input
                  value={newUnlock.label}
                  onChange={(e) => setNewUnlock((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Season pass reward"
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>Hint</Label>
                <Input
                  value={newUnlock.hint}
                  onChange={(e) => setNewUnlock((s) => ({ ...s, hint: e.target.value }))}
                  placeholder="Earned via battle pass"
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <Button
                  disabled={saving || !newUnlock.id.trim() || !newUnlock.label.trim()}
                  onClick={() => {
                    setSaving(true);
                    void adminUpsertUnlockChannel(newUnlock)
                      .then((cat) => {
                        setCatalog(cat);
                        setNewUnlock({ id: '', label: '', hint: '' });
                        toast({ title: 'Unlock channel added' });
                        return refresh();
                      })
                      .catch((e) =>
                        toast({
                          title: 'Failed',
                          description: e instanceof Error ? e.message : 'Error',
                          variant: 'destructive',
                        })
                      )
                      .finally(() => setSaving(false));
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add channel
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {catalog.unlockChannels.map((u: UnlockChannel) => (
              <div
                key={u.id}
                className={cn(
                  'rounded-lg border border-slate-700/40 bg-slate-900/30 p-3 flex flex-wrap items-center justify-between gap-2',
                  !u.enabled && 'opacity-60'
                )}
              >
                <div>
                  <p className="font-semibold text-sm flex items-center gap-2">
                    {u.label}
                    <span className="font-mono text-[10px] text-slate-500">{u.id}</span>
                    {u.builtIn && (
                      <Badge className="bg-emerald-600/30 text-emerald-200 text-[10px]">
                        built-in
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">{u.hint}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={u.enabled}
                    disabled={u.id === 'purchase'}
                    onCheckedChange={(on) => {
                      setSaving(true);
                      void adminUpsertUnlockChannel({ ...u, enabled: on })
                        .then((cat) => {
                          setCatalog(cat);
                          return refresh();
                        })
                        .finally(() => setSaving(false));
                    }}
                  />
                  {!u.builtIn && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 h-8 w-8 p-0"
                      onClick={() => {
                        setSaving(true);
                        void adminDeleteUnlockChannel(u.id)
                          .then((cat) => {
                            setCatalog(cat);
                            return refresh();
                          })
                          .finally(() => setSaving(false));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scan" className="mt-4 space-y-3">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="h-4 w-4 text-amber-300" /> Feature scan
              </CardTitle>
              <CardDescription>
                Compares catalog entries to metrics wired in <code>metricCount()</code> (game
                matches, KP, chat, cosmetics, daily checks, …).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {scan && (
                <>
                  <div className="flex items-start gap-2 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">{scan.wired.length} wired built-ins</p>
                      <p className="text-xs text-slate-400 font-mono break-all">
                        {scan.wired.slice(0, 12).join(', ')}
                        {scan.wired.length > 12 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-fuchsia-300">
                    <Plus className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">{scan.custom.length} custom counters</p>
                      <p className="text-xs text-slate-400">
                        Stored on the player — use Grant / test or call{' '}
                        <code>adminBumpUserMetric</code> from event code.
                      </p>
                      {scan.custom.length > 0 && (
                        <p className="text-xs font-mono mt-1">{scan.custom.join(', ')}</p>
                      )}
                    </div>
                  </div>
                  {scan.unwiredBuiltin.length > 0 && (
                    <div className="flex items-start gap-2 text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Catalog entries missing wire-up</p>
                        <p className="text-xs font-mono">{scan.unwiredBuiltin.join(', ')}</p>
                      </div>
                    </div>
                  )}
                  {scan.orphanWired.length > 0 && (
                    <div className="flex items-start gap-2 text-sky-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">Wired in code but not in catalog labels</p>
                        <p className="text-xs font-mono">{scan.orphanWired.join(', ')}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void refresh().then(() => toast({ title: 'Scan refreshed' }));
                }}
              >
                Re-scan
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grant" className="mt-4">
          <Card className="bg-slate-800/40 border-slate-700/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grant custom metric</CardTitle>
              <CardDescription>
                Bump a player’s custom counter (e.g. after they finish an event). Missions using that
                metric will progress on next hub sync.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Steam ID or username</Label>
                <Input
                  value={grant.user}
                  onChange={(e) => setGrant((s) => ({ ...s, user: e.target.value }))}
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="space-y-1">
                <Label>Metric id</Label>
                <Select
                  value={grant.metric || undefined}
                  onValueChange={(v) => setGrant((s) => ({ ...s, metric: v }))}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700">
                    <SelectValue placeholder="Pick custom metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.metrics
                      .filter((m) => !m.builtIn || m.source === 'custom')
                      .map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label} ({m.value})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min={1}
                  value={grant.amount}
                  onChange={(e) => setGrant((s) => ({ ...s, amount: e.target.value }))}
                  className="bg-slate-900/50 border-slate-700"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <Button
                  disabled={saving || !grant.user.trim() || !grant.metric}
                  onClick={() => {
                    setSaving(true);
                    void adminBumpUserMetric({
                      steamIdOrUsername: grant.user,
                      metric: grant.metric,
                      amount: Number(grant.amount) || 1,
                    })
                      .then((res) => {
                        toast({
                          title: 'Granted',
                          description: `${grant.metric} → ${res.value}`,
                        });
                      })
                      .catch((e) =>
                        toast({
                          title: 'Grant failed',
                          description: e instanceof Error ? e.message : 'Error',
                          variant: 'destructive',
                        })
                      )
                      .finally(() => setSaving(false));
                  }}
                >
                  Grant
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Keep save path available for bulk edits if needed later */}
      <div className="hidden">
        <Button
          onClick={() => {
            void adminSaveRequirementCatalog(catalog);
          }}
        >
          Save all
        </Button>
      </div>
    </div>
  );
}
