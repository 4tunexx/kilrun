'use client';

import React from 'react';
import {
  Cloud,
  FolderOpen,
  Link2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Puzzle,
  Settings,
  Unlink,
  Upload,
} from 'lucide-react';
import { InteractiveWordmark } from '@/components/interactive-wordmark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  formatBytes,
  getMapThumbnail,
  type MapListItem,
} from '@/components/game/editor/map-storage';
import { getActivePlayMapIdForMode } from '@/components/game/editor/prefab-storage';
import { getKilrunModeInfo, type KilrunMode } from '@/lib/game-modes';
import { useKilrunModes } from '@/lib/use-kilrun-modes';
import { ENGINE_BG, ENGINE_WORDMARK } from '@/lib/engine/brand';
import { usePointerParallax } from '@/hooks/use-pointer-parallax';
import type { EngineSessionUser } from '@/lib/engine/platform-client';
import { EngineBackdrop } from './engine-splash';
import { MenuSfxRoot } from '@/components/game/effects/menu-sfx';

const PANEL = 'bg-slate-900/60 backdrop-blur-md border border-slate-700/30';

export type CloudBadge = { uploaded: boolean; isActive: boolean };

export function EngineHome({
  maps,
  filtered,
  query,
  onQueryChange,
  cloudByLocalId,
  liveUser,
  siteHost,
  livePingMs,
  desktop,
  onCreateMap,
  onImport,
  onPull,
  onOpenProjects,
  onOpenPlugins,
  onOpenMap,
  onUpload,
  onSetMain,
  onConnect,
  onDisconnect,
  onOpenSettings,
}: {
  maps: MapListItem[];
  filtered: MapListItem[];
  query: string;
  onQueryChange: (value: string) => void;
  cloudByLocalId: Record<string, CloudBadge>;
  liveUser: EngineSessionUser | null;
  siteHost: string;
  livePingMs: number | null;
  desktop: boolean;
  onCreateMap: (mode: KilrunMode) => void;
  onImport: () => void;
  onPull: (mode: KilrunMode) => void;
  onOpenProjects: () => void;
  onOpenPlugins?: () => void;
  onOpenMap: (id: string) => void;
  onUpload: (id: string) => void;
  onSetMain: (id: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSettings?: () => void;
}) {
  const heroParallax = usePointerParallax(22);
  const modeList = useKilrunModes();
  const counts = React.useMemo(() => {
    const next: Record<string, number> = {};
    for (const mode of modeList) next[mode] = 0;
    for (const item of maps) {
      if (item.gameMode) next[item.gameMode] = (next[item.gameMode] ?? 0) + 1;
    }
    return next;
  }, [maps, modeList]);
  const [asideCollapsed, setAsideCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('kilrun.engineHomeAsideCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleAside = () => {
    setAsideCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('kilrun.engineHomeAsideCollapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <MenuSfxRoot music="menu" className="relative flex h-full min-h-0 font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <EngineBackdrop />
      </div>
      {asideCollapsed ? (
        <aside className="relative z-10 w-12 shrink-0 bg-slate-900/60 backdrop-blur-md border-r border-slate-700/30 flex flex-col items-center py-2 gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0"
            title="Expand side panel"
            onClick={toggleAside}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0"
            title={liveUser ? 'Unlink live game' : 'Link live game'}
            onClick={liveUser ? onDisconnect : onConnect}
          >
            {liveUser ? <Unlink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Import JSON" onClick={onImport}>
            <Upload className="h-4 w-4" />
          </Button>
          {desktop ? (
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Open Projects" onClick={onOpenProjects}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          ) : null}
          {desktop && onOpenPlugins ? (
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Plugins" onClick={onOpenPlugins}>
              <Puzzle className="h-4 w-4" />
            </Button>
          ) : null}
          {onOpenSettings ? (
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0" title="Audio & look" onClick={onOpenSettings}>
              <Settings className="h-4 w-4" />
            </Button>
          ) : null}
        </aside>
      ) : (
      <aside className="relative z-10 w-[220px] shrink-0 bg-slate-900/60 backdrop-blur-md border-r border-slate-700/30 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-700/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.28em] text-red-300/80">Live site</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Collapse side panel"
              onClick={toggleAside}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-[12px] font-semibold text-slate-100 truncate" title={siteHost}>
            {siteHost}
          </p>
          {liveUser ? (
            <div className="mt-3 space-y-2">
              <Badge className="bg-red-700/85 text-[10px] max-w-full truncate">
                Linked{livePingMs != null ? ` · ${livePingMs}ms` : ''}
              </Badge>
              <p className="text-[11px] text-slate-300 truncate">{liveUser.username}</p>
              <Button size="sm" variant="ghost" className="h-7 w-full justify-start text-[11px]" onClick={onDisconnect}>
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Unlink
              </Button>
            </div>
          ) : (
            <Button size="sm" className="mt-3 h-8 w-full text-[11px] shadow-2xl" onClick={onConnect}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Link live game
            </Button>
          )}
        </div>
        <div className="px-4 py-4 border-b border-slate-700/40 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-red-300/80">Maps</p>
          {modeList.map((mode) => (
            <div key={mode} className="flex items-center justify-between text-[12px] text-slate-300">
              <span>{getKilrunModeInfo(mode).shortTitle}</span>
              <span className="font-black tabular-nums text-slate-100">{counts[mode] ?? 0}</span>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-slate-500">{maps.length} local file{maps.length === 1 ? '' : 's'}</p>
        </div>
        <div className="px-3 py-3 space-y-1.5">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.28em] text-red-300/80">Shortcuts</p>
          <Button size="sm" variant="ghost" className="h-8 w-full justify-start text-[11px]" onClick={onImport}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import JSON
          </Button>
          {modeList.map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant="ghost"
              className="h-8 w-full justify-start text-[11px]"
              onClick={() => onPull(mode)}
            >
              <Cloud className="h-3.5 w-3.5 mr-1.5" />
              Pull {getKilrunModeInfo(mode).shortTitle}
            </Button>
          ))}
          {desktop ? (
            <>
              <Button size="sm" variant="ghost" className="h-8 w-full justify-start text-[11px]" onClick={onOpenProjects}>
                <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                Open Projects
              </Button>
              {onOpenPlugins ? (
                <Button size="sm" variant="ghost" className="h-8 w-full justify-start text-[11px]" onClick={onOpenPlugins}>
                  <Puzzle className="h-3.5 w-3.5 mr-1.5" />
                  Plugins
                </Button>
              ) : null}
            </>
          ) : null}
          {onOpenSettings ? (
            <Button size="sm" variant="ghost" className="h-8 w-full justify-start text-[11px]" onClick={onOpenSettings}>
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Audio & look
            </Button>
          ) : null}
        </div>
      </aside>
      )}

      <div className="relative min-w-0 flex-1 overflow-auto">
        <div
          ref={heroParallax.ref}
          className="relative h-48 sm:h-56 overflow-hidden touch-pan-y"
          onPointerMove={heroParallax.onPointerMove}
          onPointerLeave={heroParallax.onPointerLeave}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ENGINE_BG}
            alt=""
            className="absolute inset-[-8%] h-[116%] w-[116%] max-w-none object-cover pointer-events-none select-none"
            style={heroParallax.mediaStyle}
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/55 to-slate-900/70 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent pointer-events-none" />
          <div className="relative h-full px-6 sm:px-8 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <InteractiveWordmark
                src={ENGINE_WORDMARK}
                alt="Kilrun"
                className="h-12 sm:h-16 md:h-20 w-auto max-w-[min(100%,22rem)]"
              />
              <p className="mt-3 max-w-xl text-sm text-slate-200">
                Create maps in the Engine. Upload a draft to the website, then Set as MAIN when
                players should load it.
              </p>
            </div>
            <Button
              size="lg"
              className="shrink-0 h-12 px-6 text-base font-bold shadow-2xl"
              onClick={() => onCreateMap('deathrun')}
            >
              <Plus className="mr-2 h-5 w-5" />
              New Deathrun
            </Button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-8">
          <section>
            <SectionLabel>New file</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-3">
              {modeList.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onCreateMap(mode)}
                  className={`group relative overflow-hidden rounded-2xl ${PANEL} px-5 py-6 text-left transition hover:border-red-400/50 hover:bg-white/[0.03] hover:shadow-[0_0_28px_rgba(226,61,74,0.25)]`}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-br from-red-600/20 to-transparent" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/20 text-red-300">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-lg">{getKilrunModeInfo(mode).shortTitle}</span>
                      <span className="block text-[12px] text-slate-400 mt-1">
                        {getKilrunModeInfo(mode).editorBlurb}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                size="sm"
                variant="secondary"
                className="border border-white/10"
                onClick={onImport}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Import JSON
              </Button>
              {modeList.map((mode) => (
                <Button
                  key={`cloud-${mode}`}
                  size="sm"
                  variant="ghost"
                  className="text-slate-300"
                  onClick={() => onPull(mode)}
                >
                  <Cloud className="h-3.5 w-3.5 mr-1" />
                  Pull {getKilrunModeInfo(mode).shortTitle}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4 mb-3">
              <SectionLabel className="flex-1 mb-0">Maps</SectionLabel>
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search maps…"
                className="max-w-xs bg-slate-950/70 border-slate-700/40"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400">No maps yet. Start a new file above.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item) => (
                  <ProjectCard
                    key={item.id}
                    item={item}
                    cloud={cloudByLocalId[item.id]}
                    onOpen={() => onOpenMap(item.id)}
                    onUpload={() => onUpload(item.id)}
                    onSetMain={() => onSetMain(item.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </MenuSfxRoot>
  );
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 mb-3 ${className}`}>
      <p className="text-[11px] uppercase tracking-[0.28em] text-red-300/80 shrink-0">{children}</p>
      <div className="h-px flex-1 bg-slate-700/40" />
    </div>
  );
}

function ProjectCard({
  item,
  cloud,
  onOpen,
  onUpload,
  onSetMain,
}: {
  item: MapListItem;
  cloud?: CloudBadge;
  onOpen: () => void;
  onUpload: () => void;
  onSetMain: () => void;
}) {
  const thumb = getMapThumbnail(item.id);
  const mode = item.gameMode;
  const localMain = mode != null && getActivePlayMapIdForMode(mode) === item.id;
  const isMain = cloud?.isActive || (!cloud && localMain);
  const status = isMain ? 'MAIN' : cloud?.uploaded ? 'Cloud draft' : 'Local';
  return (
    <div
      className={`rounded-2xl ${PANEL} hover:border-red-400/50 hover:bg-white/[0.03] hover:shadow-[0_0_24px_rgba(226,61,74,0.18)] overflow-hidden transition flex flex-col`}
    >
      <button type="button" onClick={onOpen} className="text-left">
        <div className="h-32 bg-[#070a10] overflow-hidden relative">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600">
              <Monitor className="h-8 w-8" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        </div>
        <div className="px-3 pt-3 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{item.name}</span>
            <Badge className={`text-[10px] shrink-0 ${isMain ? 'bg-red-600/90' : 'bg-slate-800/90'}`}>
              {status}
            </Badge>
            {item.corrupt ? (
              <Badge variant="destructive" className="text-[10px]">
                corrupt
              </Badge>
            ) : null}
          </div>
          <div className="text-[11px] text-slate-400 flex justify-between">
            <span>{mode ? getKilrunModeInfo(mode).shortTitle : 'Map'}</span>
            <span>{formatBytes(item.sizeBytes)}</span>
          </div>
        </div>
      </button>
      <div className="p-3 pt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onOpen}>
          Open
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={onUpload}>
          Upload
        </Button>
        <Button size="sm" className="h-7 text-[11px] bg-red-700 hover:bg-red-600 shadow-lg" onClick={onSetMain}>
          Set MAIN
        </Button>
      </div>
    </div>
  );
}
