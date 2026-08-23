'use client';

import React from 'react';
import { Monitor, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ENGINE_INSTALLER_API_PATH,
  buildEngineDeepLink,
  completeKilrunEngineLaunch,
  fetchEngineInstaller,
  probeKilrunEngine,
  requestKilrunEngineOpen,
  tryLaunchKilrunEngine,
  type EngineInstallerInfo,
} from '@/lib/engine/protocol';
import {
  getEngineLaunchPref,
  setEngineLaunchPref,
  shouldOfferEngineLaunch,
} from '@/lib/engine/launch-pref';
import { isKilrunEngineDesktop, isWindowsClient } from '@/lib/engine/runtime';

function installerHref(info: EngineInstallerInfo | null): string {
  return info?.downloadUrl?.trim() || ENGINE_INSTALLER_API_PATH;
}

export function EngineInstallPrompt({
  open,
  mapId,
  onOpenInBrowser,
  onClose,
}: {
  open: boolean;
  mapId?: string;
  onOpenInBrowser: () => void;
  onClose: () => void;
}) {
  const [installer, setInstaller] = React.useState<EngineInstallerInfo | null>(null);

  React.useEffect(() => {
    if (!open) return;
    void fetchEngineInstaller().then(setInstaller);
  }, [open]);

  if (!open) return null;

  const href = buildEngineDeepLink({ mapId, action: 'open' });
  const download = installerHref(installer);

  return (
    <div className="fixed inset-0 z-[420] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-white">Kilrun Engine is not on this PC</p>
          <p className="text-xs text-slate-400 mt-1">
            The website could not reach Kilrun Engine.exe. Install it, then click Open Engine
            again — or keep editing in the browser.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild className="bg-cyan-600 hover:bg-cyan-500">
            <a href={ENGINE_INSTALLER_API_PATH} download="Kilrun-Engine-Setup.exe">
              <Download className="h-3.5 w-3.5 mr-1" />
              Download installer
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a
              href={href}
              onClick={() => {
                tryLaunchKilrunEngine({ mapId, action: 'open' });
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open Engine (if already installed)
            </a>
          </Button>
          <Button
            variant="ghost"
            className="text-slate-300"
            onClick={() => {
              onOpenInBrowser();
              onClose();
            }}
          >
            Continue in browser
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EngineLaunchBanner({
  mapId,
  onContinueInBrowser,
}: {
  mapId?: string;
  onContinueInBrowser?: () => void;
}) {
  const [visible, setVisible] = React.useState(false);
  const [status, setStatus] = React.useState<'checking' | 'running' | 'missing'>('checking');
  const [installer, setInstaller] = React.useState<EngineInstallerInfo | null>(null);

  React.useEffect(() => {
    const offer = shouldOfferEngineLaunch({
      isWindows: isWindowsClient(),
      isDesktopEngine: isKilrunEngineDesktop(),
    });
    setVisible(offer);
    if (!offer) return;
    let cancelled = false;
    void (async () => {
      const presence = await probeKilrunEngine();
      if (cancelled) return;
      setStatus(presence ? 'running' : 'missing');
      if (!presence) {
        const info = await fetchEngineInstaller();
        if (!cancelled) setInstaller(info);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  if (!visible) return null;

  const href = buildEngineDeepLink({ mapId, action: 'open' });
  const download = installerHref(installer);

  const openEngine = () => {
    if (status === 'running') {
      void requestKilrunEngineOpen({ mapId, action: 'open' });
      return;
    }
    tryLaunchKilrunEngine({ mapId, action: 'open' });
    void (async () => {
      const result = await completeKilrunEngineLaunch({ mapId, action: 'open' });
      setStatus(result === 'running' ? 'running' : 'missing');
      if (result === 'running') await requestKilrunEngineOpen({ mapId, action: 'open' });
    })();
  };

  return (
    <div className="rounded-lg border border-cyan-500/35 bg-slate-950/80 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
      <Monitor className="h-5 w-5 text-cyan-300 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Kilrun Engine</p>
        <p className="text-xs text-slate-400">
          {status === 'running'
            ? 'Kilrun Engine.exe is running on this PC.'
            : status === 'missing'
              ? 'Kilrun Engine.exe was not detected on this PC. Download the installer, then open it.'
              : 'Checking whether Kilrun Engine.exe is on this PC…'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500">
          <a href={ENGINE_INSTALLER_API_PATH} download="Kilrun-Engine-Setup.exe">
            <Download className="h-3.5 w-3.5 mr-1" />
            Download installer
          </a>
        </Button>
        {status === 'running' ? (
          <Button size="sm" variant="secondary" onClick={openEngine}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open Engine
          </Button>
        ) : (
          <Button asChild size="sm" variant="secondary">
            <a href={href} onClick={openEngine}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open Engine
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onContinueInBrowser?.();
            setVisible(false);
          }}
        >
          Continue in browser
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-slate-400"
          onClick={() => {
            setEngineLaunchPref('browser');
            onContinueInBrowser?.();
            setVisible(false);
          }}
        >
          Always browser
        </Button>
      </div>
    </div>
  );
}

export function EngineDownloadButton({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'default';
  className?: string;
}) {
  return (
    <Button asChild size={size} className={className || 'bg-cyan-600 hover:bg-cyan-500'}>
      <a href={ENGINE_INSTALLER_API_PATH} download="Kilrun-Engine-Setup.exe">
        <Download className="h-3.5 w-3.5 mr-1" />
        Download Kilrun Engine
      </a>
    </Button>
  );
}

export function EngineLaunchLink({
  mapId,
  className,
  children,
}: {
  mapId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (isKilrunEngineDesktop() || !isWindowsClient()) return null;
  if (getEngineLaunchPref() === 'browser') return null;
  return (
    <a href={buildEngineDeepLink({ mapId })} className={className}>
      {children}
    </a>
  );
}
