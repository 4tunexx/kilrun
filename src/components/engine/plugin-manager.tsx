'use client';

import React from 'react';
import { Blocks, Puzzle, Trash2, FolderOpen, RefreshCw, Upload, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  inspectDesktopModuleArchive,
  installDesktopModuleArchive,
  listDesktopModules,
  openDesktopKilrunFolder,
  setDesktopModuleEnabled,
  uninstallDesktopModule,
} from '@/lib/engine/desktop-bridge';
import { loadDesktopModules } from '@/lib/engine/plugin-loader';
import type { InstalledPlugin } from '@/lib/engine/plugin-manifest';
import { MODULE_KIND_META, MODULE_KINDS, parseModuleKind, type ModuleKind } from '@/lib/engine/module-kind';
import { hasEngineSession, publishCloudModule } from '@/lib/engine/platform-client';
import { useToast } from '@/hooks/use-toast';
import { readDesktopModuleFile } from '@/lib/engine/desktop-bridge';

const KIND_ICON = {
  plugin: Puzzle,
  extension: Wrench,
  addon: Blocks,
} as const;

export function PluginManagerDialog({
  open,
  onClose,
  canPushOfficial = false,
}: {
  open: boolean;
  onClose: () => void;
  canPushOfficial?: boolean;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState<ModuleKind>('plugin');
  const [rows, setRows] = React.useState<InstalledPlugin[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<InstalledPlugin | null>(null);
  const [pendingBytes, setPendingBytes] = React.useState<Uint8Array | null>(null);

  const meta = MODULE_KIND_META[kind];
  const Icon = KIND_ICON[kind];

  const refresh = React.useCallback(async () => {
    const listed = await listDesktopModules(kind);
    setRows(listed.filter((row) => parseModuleKind(row.kind, kind) === kind));
  }, [kind]);

  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const reload = async () => {
    setBusy(true);
    try {
      const result = await loadDesktopModules();
      await refresh();
      toast({
        title: result.loaded.length
          ? `Loaded ${result.loaded.length} module${result.loaded.length === 1 ? '' : 's'}`
          : 'Modules reloaded',
        description: result.errors.length
          ? result.errors.map((row) => `${row.id}: ${row.error}`).join(' · ')
          : undefined,
        variant: result.errors.length ? 'destructive' : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmInstall = async () => {
    if (!pendingBytes) return;
    setBusy(true);
    try {
      const installed = await installDesktopModuleArchive(pendingBytes);
      setPending(null);
      setPendingBytes(null);
      setKind(parseModuleKind(installed.kind, kind));
      await loadDesktopModules();
      await refresh();
      toast({
        title: `Installed ${installed.name}`,
        description: `v${installed.version}${installed.author ? ` · ${installed.author}` : ''}`,
      });
    } catch (err) {
      toast({
        title: 'Install failed',
        description: err instanceof Error ? err.message : 'Could not install module',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const pushOfficial = async (row: InstalledPlugin) => {
    if (!hasEngineSession()) {
      toast({ title: 'Link live game first', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const source = await readDesktopModuleFile(row.kind, row.id, row.entry);
      if (!source) throw new Error(`Missing ${row.entry}`);
      await publishCloudModule({
        moduleId: row.id,
        kind: row.kind,
        version: row.version,
        source,
        entry: row.entry,
        permissions: row.permissions,
        modes: row.modes,
        name: row.name,
        official: true,
      });
      toast({
        title: `Pushed ${row.name} to everyone`,
        description: 'Other Engine clients install this official pack on next launch.',
      });
    } catch (err) {
      toast({
        title: 'Push failed',
        description: err instanceof Error ? err.message : 'Could not publish official module',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700/40 bg-slate-900/90 backdrop-blur-md p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Icon className="h-5 w-5 text-red-300" />
          <div>
            <p className="font-semibold">Modules</p>
            <p className="text-[11px] text-slate-400">Install without rebuilding Engine</p>
          </div>
        </div>

        <div className="flex gap-1 mb-4">
          {MODULE_KINDS.map((id) => {
            const TabIcon = KIND_ICON[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${
                  kind === id
                    ? 'border-red-400/50 bg-red-500/15 text-red-100'
                    : 'border-slate-700/50 bg-slate-950/40 text-slate-400'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5 inline mr-1" />
                {MODULE_KIND_META[id].plural}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 mb-3">{meta.tagline}</p>

        {pending ? (
          <div className="rounded-xl border border-red-500/30 bg-black/30 p-3 mb-4 space-y-2 text-sm">
            <p className="font-semibold">{pending.name}</p>
            <p className="text-slate-400 text-[12px]">
              {MODULE_KIND_META[parseModuleKind(pending.kind)].label} · v{pending.version}
              {pending.author ? ` · ${pending.author}` : ''}
            </p>
            {pending.description ? (
              <p className="text-slate-300 text-[12px]">{pending.description}</p>
            ) : null}
            <p className="text-[11px] uppercase tracking-wider text-red-300/80">Permissions</p>
            <p className="text-[12px] text-slate-300">
              {(pending.permissions || []).join(', ') || 'none listed'}
            </p>
            <p className="text-[11px] text-amber-200/90">
              Module code runs in a sandbox (no Engine page access, no network). Only install files
              you trust.
            </p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={busy} onClick={() => void confirmInstall()}>
                Install
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPending(null);
                  setPendingBytes(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 max-h-[40vh] overflow-auto mb-4">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">No {meta.plural.toLowerCase()} installed yet.</p>
          ) : (
            rows.map((row) => (
              <div
                key={`${row.kind}:${row.id}`}
                className="rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{row.name}</span>
                    <Badge className="text-[10px] bg-slate-800">{row.version}</Badge>
                    {!row.enabled ? (
                      <Badge className="text-[10px] bg-slate-700">off</Badge>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {row.author ? `${row.author} · ` : ''}
                    {row.id}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                  {canPushOfficial ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      disabled={busy}
                      onClick={() => void pushOfficial(row)}
                    >
                      Push to everyone
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    disabled={busy}
                    onClick={async () => {
                      await setDesktopModuleEnabled(row.kind, row.id, !row.enabled);
                      await loadDesktopModules();
                      await refresh();
                    }}
                  >
                    {row.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm(`Uninstall “${row.name}”?`)) return;
                      await uninstallDesktopModule(row.kind, row.id);
                      await loadDesktopModules();
                      await refresh();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            Install {meta.label.toLowerCase()}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void openDesktopKilrunFolder(meta.folder)}
          >
            <FolderOpen className="h-3.5 w-3.5 mr-1" />
            Folder
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".kplugin,.kext,.kaddon,.zip,application/zip"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const preview = await inspectDesktopModuleArchive(bytes);
              setPending(preview);
              setPendingBytes(bytes);
            } catch (err) {
              toast({
                title: 'Could not read module',
                description: err instanceof Error ? err.message : 'Invalid archive',
                variant: 'destructive',
              });
            }
          }}
        />
      </div>
    </div>
  );
}
