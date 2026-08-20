'use client';

import React from 'react';
import { Puzzle, Trash2, FolderOpen, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  inspectDesktopPluginArchive,
  installDesktopPluginArchive,
  listDesktopPlugins,
  openDesktopKilrunFolder,
  setDesktopPluginEnabled,
  uninstallDesktopPlugin,
} from '@/lib/engine/desktop-bridge';
import { loadDesktopPlugins } from '@/lib/engine/plugin-loader';
import type { InstalledPlugin } from '@/lib/engine/plugin-manifest';
import { useToast } from '@/hooks/use-toast';

export function PluginManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = React.useState<InstalledPlugin[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<InstalledPlugin | null>(null);
  const [pendingBytes, setPendingBytes] = React.useState<Uint8Array | null>(null);

  const refresh = React.useCallback(async () => {
    setRows(await listDesktopPlugins());
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const reload = async () => {
    setBusy(true);
    try {
      const result = await loadDesktopPlugins();
      await refresh();
      toast({
        title: result.loaded.length
          ? `Loaded ${result.loaded.length} plugin${result.loaded.length === 1 ? '' : 's'}`
          : 'Plugins reloaded',
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
      const installed = await installDesktopPluginArchive(pendingBytes);
      setPending(null);
      setPendingBytes(null);
      await loadDesktopPlugins();
      await refresh();
      toast({
        title: `Installed ${installed.name}`,
        description: `v${installed.version}${installed.author ? ` · ${installed.author}` : ''}`,
      });
    } catch (err) {
      toast({
        title: 'Install failed',
        description: err instanceof Error ? err.message : 'Could not install plugin',
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
          <Puzzle className="h-5 w-5 text-red-300" />
          <div>
            <p className="font-semibold">Plugins</p>
            <p className="text-[11px] text-slate-400">Install .kplugin packs without rebuilding Engine</p>
          </div>
        </div>

        {pending ? (
          <div className="rounded-xl border border-red-500/30 bg-black/30 p-3 mb-4 space-y-2 text-sm">
            <p className="font-semibold">{pending.name}</p>
            <p className="text-slate-400 text-[12px]">
              v{pending.version}
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
              Plugin code runs in a sandbox (no Engine page access, no network). Entity scripts also
              run on the live game server when you upload a map. Only install files you trust.
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
            <p className="text-sm text-slate-400">No plugins installed yet.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
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
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    disabled={busy}
                    onClick={async () => {
                      await setDesktopPluginEnabled(row.id, !row.enabled);
                      await loadDesktopPlugins();
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
                      await uninstallDesktopPlugin(row.id);
                      await loadDesktopPlugins();
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
          <Button
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Install plugin
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void openDesktopKilrunFolder('Plugins')}
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
          accept=".kplugin,.zip,application/zip"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const preview = await inspectDesktopPluginArchive(bytes);
              setPending(preview);
              setPendingBytes(bytes);
            } catch (err) {
              toast({
                title: 'Could not read plugin',
                description: err instanceof Error ? err.message : 'Invalid .kplugin',
                variant: 'destructive',
              });
            }
          }}
        />
      </div>
    </div>
  );
}
