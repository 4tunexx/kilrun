'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  MessageCircle,
  RefreshCw,
  Server,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  adminGetDashboardOverview,
  adminRestartColyseus,
  adminToggleService,
  type AdminDashboardOverview,
} from '@/lib/admin-dashboard';
import {
  adminGetSchemaSyncStatus,
  adminSyncDatabaseSchema,
} from '@/lib/admin-db-sync';
import { adminSeedProgression } from '@/lib/progression-actions';
import { adminImportSeedFile } from '@/lib/admin-seed-import';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function StatCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number | string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <Card
      className={cn(
        'bg-slate-800/40 border-slate-700/30',
        warn && 'border-amber-500/40'
      )}
    >
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        <p className="text-2xl font-black tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function AdminDashboardPanel({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<AdminDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<{
    version: string | null;
    at: string | null;
    cliPush: string | null;
    expectedVersion: string;
    upToDate: boolean;
  } | null>(null);
  const [lastSyncLog, setLastSyncLog] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [overview, sync] = await Promise.all([
        adminGetDashboardOverview(),
        adminGetSchemaSyncStatus(),
      ]);
      setData(overview);
      setSchemaStatus(sync);
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Failed to load dashboard',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (service: 'chat' | 'game', enabled: boolean) => {
    setBusy(`toggle-${service}`);
    try {
      await adminToggleService(service, enabled);
      toast({
        title:
          service === 'chat'
            ? enabled
              ? 'Live chat enabled'
              : 'Live chat disabled'
            : enabled
              ? 'Deathrun open'
              : 'Deathrun in maintenance',
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Toggle failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestartColyseus = async () => {
    if (
      !window.confirm(
        'Restart the Colyseus game server now? Active matches will disconnect. The host should bring it back in a few seconds.'
      )
    ) {
      return;
    }
    setBusy('colyseus');
    try {
      const result = await adminRestartColyseus();
      if (!result.ok) {
        toast({
          title: 'Colyseus restart failed',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Colyseus restarting',
        description: result.detail ?? 'Restart signal sent',
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Restart failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSeedDefaults = async () => {
    if (
      !window.confirm(
        'Upsert built-in Kilrun missions, achievements, badges, and shop items into MongoDB?'
      )
    ) {
      return;
    }
    setBusy('seed');
    try {
      const result = await adminSeedProgression();
      toast({
        title: 'Default progression loaded',
        description: `${result.missions} missions · ${result.achievements} achievements · ${result.badges} badges`,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Seed failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleSchemaSync = async () => {
    if (
      !window.confirm(
        'Sync Prisma schema to MongoDB now? This runs prisma db push and verifies KP, peak ranks, Premium expiry, premiumConfigJson, MatchResult fields, and skins. Safe for Mongo — does not wipe player data.'
      )
    ) {
      return;
    }
    setBusy('schema');
    try {
      const result = await adminSyncDatabaseSchema();
      setLastSyncLog(result.steps);
      toast({
        title: 'Database schema synced',
        description:
          result.cliPush === 'ok'
            ? 'prisma db push OK · KP + skins ready'
            : `Field verify OK · CLI: ${result.cliPush}`,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Schema sync failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy('import');
    try {
      const text = await file.text();
      const result = await adminImportSeedFile(text, file.name);
      toast({
        title: 'Seed import complete',
        description: `${result.missions} missions · ${result.achievements} achievements · ${result.badges} badges · ${result.shopItems} shop`,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : 'Import failed',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
      </div>
    );
  }

  if (!data) return null;
  const s = data.stats;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Operations overview
          </h2>
          <p className="text-xs text-slate-400">
            Live Mongo counts, service health, and quick controls
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || Boolean(busy)}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard label="Players" value={s.players} hint={`+${s.newPlayers7d} this week`} />
        <StatCard label="VIP" value={s.vip} />
        <StatCard label="Email verified" value={s.emailVerified} />
        <StatCard
          label="Open tickets"
          value={s.openTickets}
          warn={s.openTickets > 0}
          hint={`${s.inProgressTickets} in progress`}
        />
        <StatCard label="Matches today" value={s.matchesToday} hint={`${s.matches} all-time`} />
        <StatCard label="VP spent" value={s.vpSpent} hint={`${s.purchases} purchases`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatCard label="Banned" value={s.banned} warn={s.banned > 0} />
        <StatCard label="Muted" value={s.muted} warn={s.muted > 0} />
        <StatCard label="Friends" value={s.friendships} />
        <StatCard label="Forum posts" value={s.forumPosts} hint={`${s.forumReplies} replies`} />
        <StatCard label="Chat msgs" value={s.chatMessages} />
        <StatCard label="Missions" value={s.missions} />
        <StatCard label="Shop items" value={s.storeItems} />
        <StatCard label="Audit (24h)" value={s.auditLast24h} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Services */}
        <Card className="bg-slate-800/40 border-slate-700/30 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" /> Service status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.services.map((svc) => (
              <div
                key={svc.id}
                className="flex items-start gap-2 rounded-lg border border-slate-700/40 bg-slate-950/30 p-2.5"
              >
                {svc.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{svc.label}</p>
                    {svc.toggleable && isAdmin && (
                      <Switch
                        checked={Boolean(svc.toggledOn)}
                        disabled={busy === `toggle-${svc.id === 'game' ? 'game' : 'chat'}`}
                        onCheckedChange={(v) =>
                          void toggle(svc.id === 'game' ? 'game' : 'chat', v)
                        }
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{svc.detail}</p>
                </div>
              </div>
            ))}
            {isAdmin && (
              <div className="rounded-lg border border-sky-700/40 bg-sky-950/20 p-2.5 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4 text-sky-300" /> Colyseus game server
                </p>
                <p className="text-[11px] text-slate-500">
                  Soft-restart rooms after deploy. Set{' '}
                  <code className="text-slate-400">GAME_SERVER_ADMIN_SECRET</code> on both
                  web and game server.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={Boolean(busy)}
                  onClick={() => void handleRestartColyseus()}
                >
                  {busy === 'colyseus' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                  )}
                  Restart Colyseus
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent audit */}
        <Card className="bg-slate-800/40 border-slate-700/30 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent staff actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {data.recentAudit.length === 0 ? (
              <p className="text-sm text-slate-500">No audit entries yet.</p>
            ) : (
              data.recentAudit.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg bg-slate-950/40 border border-slate-700/30 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {log.action.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {formatDistanceToNow(new Date(log.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 truncate">
                    {log.actorUsername}
                    {log.targetUsername ? ` → ${log.targetUsername}` : ''}
                  </p>
                  {log.detail && (
                    <p className="text-[11px] text-slate-500 truncate">{log.detail}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Tickets + content counts */}
        <Card className="bg-slate-800/40 border-slate-700/30 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Support queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs mb-2">
              <Badge variant="outline">{s.openTickets} open</Badge>
              <Badge variant="outline">{s.inProgressTickets} in progress</Badge>
              <Badge variant="outline">{s.resolvedTickets} resolved</Badge>
            </div>
            {data.recentTickets.length === 0 ? (
              <p className="text-sm text-slate-500">No recent tickets.</p>
            ) : (
              data.recentTickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg bg-slate-950/40 border border-slate-700/30 px-2.5 py-2"
                >
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-[11px] text-slate-500">
                    {t.username} · {t.status} ·{' '}
                    {formatDistanceToNow(new Date(t.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ))
            )}
            <div className="pt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <p>Achievements: {s.achievements}</p>
              <p>Badges: {s.badges}</p>
              <p>News: {s.newsPosts}</p>
              <p>Guides: {s.guides}</p>
              <p>Inventory rows: {s.inventoryItems}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Database schema sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">
              After deploying schema changes (KP, peak ranks, Premium, rank config, MatchResult, skins), press this once
              so Mongo gets the new fields. Also run <strong>Seed progression</strong> below for Horde /
              Competitive missions &amp; badges.
              so Mongo gets the latest Prisma fields (
              <code className="text-slate-300">User.kp</code>,{' '}
              <code className="text-slate-300">MatchResult.kpDelta</code>,{' '}
              <code className="text-slate-300">equippedSkins</code>
              ). No CLI needed on your laptop.
            </p>
            <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 px-3 py-2 text-xs text-slate-400 space-y-1">
              <p>
                Expected version:{' '}
                <span className="font-mono text-slate-200">
                  {schemaStatus?.expectedVersion ?? '—'}
                </span>
              </p>
              <p>
                Last sync:{' '}
                {schemaStatus?.at ? (
                  <>
                    <span className="text-slate-200">
                      {formatDistanceToNow(new Date(schemaStatus.at), { addSuffix: true })}
                    </span>
                    {schemaStatus.upToDate ? (
                      <Badge className="ml-2 bg-emerald-600/30 text-emerald-200 border-emerald-500/40">
                        up to date
                      </Badge>
                    ) : (
                      <Badge className="ml-2 bg-amber-600/30 text-amber-100 border-amber-500/40">
                        needs sync
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-amber-200">never — run sync before using shop skins</span>
                )}
              </p>
            </div>
            <Button
              disabled={Boolean(busy)}
              onClick={() => void handleSchemaSync()}
              className="bg-cyan-700 hover:bg-cyan-600"
            >
              {busy === 'schema' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Sync database schema (prisma db push)
            </Button>
            {lastSyncLog && lastSyncLog.length > 0 && (
              <ul className="text-[11px] text-slate-500 space-y-0.5 font-mono">
                {lastSyncLog.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
              Safe on MongoDB — does not wipe players. If CLI push is skipped on serverless,
              field verify still confirms skins can save.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="bg-slate-800/40 border-slate-700/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Data import → MongoDB
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">
              Upload a <code className="text-slate-300">.json</code> seed bundle or a{' '}
              <code className="text-slate-300">.sql</code> dump with{' '}
              <code className="text-slate-300">INSERT INTO</code> rows for missions,
              achievements, badges, or shop items. Rows are upserted by key/SKU —
              nothing is wiped.
            </p>
            <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3 text-[11px] text-slate-500 font-mono whitespace-pre-wrap">
              {`{
  "missions": [{ "key": "ig_play_1", "title": "...", "metric": "runs", "targetCount": 1, "rewardXp": 50, "category": "game" }],
  "achievements": [],
  "badges": [],
  "shopItems": [{ "itemSku": "neon-trail", "itemName": "Neon Trail", "vpPrice": 500, "itemCategory": "cosmetic" }]
}`}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,.sql,application/json,text/plain"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
              <Button
                disabled={Boolean(busy)}
                onClick={() => fileRef.current?.click()}
              >
                {busy === 'import' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload SQL / JSON seed
              </Button>
              <Button
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => void handleSeedDefaults()}
              >
                {busy === 'seed' && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Load built-in Kilrun defaults
              </Button>
            </div>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
              Built-in defaults only fill missing/outdated progression catalogs — they
              do not delete player data.
            </p>
          </CardContent>
        </Card>
      )}

      {data.site.gameDisabled && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-medium text-amber-200">Maintenance mode is ON</p>
            <p className="text-sm text-amber-100/80">
              {data.site.gameDisabledMsg || 'Deathrun is disabled for players.'}
            </p>
            {isAdmin && (
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs text-amber-100/70">Re-open game</Label>
                <Switch
                  checked={false}
                  disabled={busy === 'toggle-game'}
                  onCheckedChange={() => void toggle('game', true)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
