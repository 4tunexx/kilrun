'use client';

import React from 'react';
import { Monitor, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildEngineDeepLink, tryLaunchKilrunEngine } from '@/lib/engine/protocol';
import {
  getEngineLaunchPref,
  setEngineLaunchPref,
  shouldOfferEngineLaunch,
} from '@/lib/engine/launch-pref';
import { isKilrunEngineDesktop, isWindowsClient } from '@/lib/engine/runtime';

export function EngineLaunchBanner({
  mapId,
  onContinueInBrowser,
}: {
  mapId?: string;
  onContinueInBrowser?: () => void;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const offer = shouldOfferEngineLaunch({
      isWindows: isWindowsClient(),
      isDesktopEngine: isKilrunEngineDesktop(),
    });
    setVisible(offer);
    if (offer) tryLaunchKilrunEngine({ mapId, action: 'open' });
  }, [mapId]);

  if (!visible) return null;

  const href = buildEngineDeepLink({ mapId, action: 'open' });

  return (
    <div className="rounded-lg border border-cyan-500/35 bg-slate-950/80 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
      <Monitor className="h-5 w-5 text-cyan-300 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Kilrun Engine</p>
        <p className="text-xs text-slate-400">
          Opening the Windows editor. The browser editor still works if the app
          is not installed.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <Button asChild size="sm" className="bg-cyan-600 hover:bg-cyan-500">
          <a href={href}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open Engine
          </a>
        </Button>
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
