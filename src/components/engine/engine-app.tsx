'use client';

import React from 'react';
import { Cloud, Globe, Monitor, Plus, Upload } from 'lucide-react';
import MapEditor from '@/components/game/editor/map-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InteractiveWordmark } from '@/components/interactive-wordmark';
import {
  createNewMap,
  formatBytes,
  getMapThumbnail,
  hydrateCloudMapsIntoLocal,
  importJson,
  listMaps,
  loadMap,
  saveMap,
  setMapThumbnail,
  type MapListItem,
} from '@/components/game/editor/map-storage';
import { getMapGameMode } from '@/components/game/editor/map-document';
import type { EditorRenderStats, EditorViewportApi } from '@/components/game/editor/editor-viewport';
import { getActivePlayMapIdForMode, setActivePlayMapIdForMode } from '@/components/game/editor/prefab-storage';
import { KILRUN_MODE_INFO, KILRUN_MODES, type KilrunMode } from '@/lib/game-modes';
import { listCloudMapDocuments, publishCloudMap } from '@/lib/game-map-actions';
import { useToast } from '@/hooks/use-toast';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';
import { ENGINE_MARK, ENGINE_WORDMARK } from '@/lib/engine/brand';
import {
  desktopEngineInfo,
  startDesktopAuthLoopback,
  hydrateDesktopProjectsIntoLocal,
  openDesktopExternalUrl,
  openDesktopKilrunFolder,
  openDesktopProjectsFolder,
  setDesktopEngineSession,
  setDesktopPlatformUrl,
} from '@/lib/engine/desktop-bridge';
import { parseEngineDeepLink } from '@/lib/engine/protocol';
import { KILRUN_ENGINE_VERSION } from '@/lib/engine/version';
import {
  configureEnginePlatform,
  enginePlatformOrigin,
  fetchEngineSession,
  hasEngineSession,
  probeEngineApi,
  type EngineSessionUser,
} from '@/lib/engine/platform-client';
import { EnginePerfHud } from './engine-perf-hud';
import { EngineBackdrop, EngineSplash } from './engine-splash';

export type EngineUser = {
  username: string;
  role: string;
  avatarUrl?: string | null;
};

type PendingLiveAction =
  | { kind: 'command'; type: string }
  | { kind: 'hub-upload'; mapId: string; setActive: boolean }
  | { kind: 'pull'; mode: KilrunMode };

type CloudBadge = { uploaded: boolean; isActive: boolean };

export function EngineApp({
  user = { username: 'Editor', role: 'admin' },
  initialMapId,
}: {
  user?: EngineUser;
  initialMapId?: string;
}) {
  const { toast } = useToast();
  const [ready, setReady] = React.useState(false);
  const [splash, setSplash] = React.useState(true);
  const [platformUrl, setPlatformUrl] = React.useState(enginePlatformOrigin());
  const [liveUser, setLiveUser] = React.useState<EngineSessionUser | null>(null);
  const [liveBusy, setLiveBusy] = React.useState(false);
  const [maps, setMaps] = React.useState<MapListItem[]>([]);
  const [query, setQuery] = React.useState('');
  const [editorMapId, setEditorMapId] = React.useState<string | null>(initialMapId ?? null);
  const [stats, setStats] = React.useState<EditorRenderStats | null>(null);
  const [entityCount, setEntityCount] = React.useState(0);
  const [showPerfHud, setShowPerfHud] = React.useState(true);
  const [showAbout, setShowAbout] = React.useState(false);
  const [projectsRoot, setProjectsRoot] = React.useState<string | null>(null);
  const [dataRoot, setDataRoot] = React.useState<string | null>(null);
  const [cloudByLocalId, setCloudByLocalId] = React.useState<Record<string, CloudBadge>>({});
  const viewportApiRef = React.useRef<EditorViewportApi | null>(null);
  const importRef = React.useRef<HTMLInputElement>(null);
  const pendingLiveActionRef = React.useRef<PendingLiveAction | null>(null);
  const desktop = isKilrunEngineDesktop();
  const connected = Boolean(liveUser);

  const refresh = React.useCallback(() => {
    setMaps(listMaps());
  }, []);

  const refreshCloud = React.useCallback(async () => {
    if (!liveUser) {
      setCloudByLocalId({});
      return;
    }
    const next: Record<string, CloudBadge> = {};
    try {
      await Promise.all(
        KILRUN_MODES.map(async (mode) => {
          const rows = await listCloudMapDocuments(mode);
          for (const row of rows) {
            const key = row.localId || row.id;
            next[key] = { uploaded: true, isActive: row.isActive };
          }
        })
      );
      setCloudByLocalId(next);
    } catch {
      setCloudByLocalId({});
    }
  }, [liveUser]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await desktopEngineInfo();
        if (info?.projectsRoot) setProjectsRoot(info.projectsRoot);
        if (info?.dataRoot) setDataRoot(info.dataRoot);
        if (info?.platformUrl) {
          setPlatformUrl(info.platformUrl);
          configureEnginePlatform({ origin: info.platformUrl, token: info.sessionToken ?? null });
        } else if (info?.sessionToken) {
          configureEnginePlatform({ token: info.sessionToken });
        }
        if (info?.sessionToken) {
          try {
            const session = await fetchEngineSession();
            if (!cancelled) setLiveUser(session);
          } catch {
            if (!cancelled) setLiveUser(null);
          }
        }
        await hydrateDesktopProjectsIntoLocal({
          loadMap,
          saveMap,
          setMapThumbnail,
        });
      } catch (err) {
        console.warn('[kilrun-engine] desktop hydrate failed', err);
      }
      if (!cancelled) {
        refresh();
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  React.useEffect(() => {
    void refreshCloud();
  }, [refreshCloud]);

  React.useEffect(() => {
    const id = window.setTimeout(() => setSplash(false), 2200);
    return () => window.clearTimeout(id);
  }, []);

  const siteHost = platformUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'kilrun.vercel.app';

  const uploadHubMap = React.useCallback(
    async (mapId: string, setActive: boolean) => {
      const doc = loadMap(mapId);
      if (!doc) {
        toast({ title: 'Map not found', variant: 'destructive' });
        return;
      }
      const mode = getMapGameMode(doc);
      try {
        const row = await publishCloudMap({
          localId: mapId,
          name: doc.name,
          mode,
          document: doc,
          thumbnailDataUrl: getMapThumbnail(mapId),
          setActive,
        });
        if (setActive) setActivePlayMapIdForMode(mode, mapId);
        await refreshCloud();
        refresh();
        toast({
          title: setActive || row.isActive
            ? `This is now the MAIN map for ${KILRUN_MODE_INFO[mode].shortTitle}`
            : `Uploaded to ${siteHost} as a draft`,
          description: setActive || row.isActive
            ? `Players load “${doc.name}” on the live web game.`
            : `“${doc.name}” is on the website. Set as MAIN when it is ready for players.`,
        });
      } catch (err) {
        toast({
          title: setActive ? 'Could not set MAIN' : 'Upload failed',
          description: err instanceof Error ? err.message : 'Staff live-link required',
          variant: 'destructive',
        });
      }
    },
    [refresh, refreshCloud, siteHost, toast]
  );

  const connectLiveGame = React.useCallback(async () => {
    const origin = platformUrl.replace(/\/$/, '') || enginePlatformOrigin();
    setLiveBusy(true);
    try {
      configureEnginePlatform({ origin });
      await setDesktopPlatformUrl(origin);
      const probe = await probeEngineApi();
      if (probe === 'missing') {
        toast({
          title: 'Live login is not on the website yet',
          description: 'Deploy /api/engine to Vercel, then try Link live game again.',
          variant: 'destructive',
        });
        pendingLiveActionRef.current = null;
        return;
      }
      const port = await startDesktopAuthLoopback();
      const login =
        port != null
          ? `${origin}/api/engine/desktop-login?loopback=${encodeURIComponent(
              `http://127.0.0.1:${port}/engine-auth`
            )}`
          : `${origin}/api/engine/desktop-login`;
      await openDesktopExternalUrl(login);
      toast({
        title: 'Link live game',
        description: 'Finish Steam in the browser, then return to Kilrun Engine. Keep this window open.',
      });
    } catch (err) {
      toast({
        title: 'Could not open live-game login',
        description: err instanceof Error ? err.message : 'Check the website URL',
        variant: 'destructive',
      });
    } finally {
      setLiveBusy(false);
    }
  }, [platformUrl, toast]);

  const requireLiveThen = React.useCallback(
    (action: PendingLiveAction) => {
      if (liveUser) {
        if (action.kind === 'command') {
          window.dispatchEvent(new CustomEvent('kilrun-engine-command', { detail: { type: action.type } }));
        } else {
          void uploadHubMap(action.mapId, action.setActive);
        }
        return;
      }
      pendingLiveActionRef.current = action;
      void connectLiveGame();
    },
    [connectLiveGame, liveUser, uploadHubMap]
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onDeep = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== 'string') return;
      const parsed = parseEngineDeepLink(detail);
      if (parsed.token) {
        void (async () => {
          try {
            await setDesktopEngineSession(parsed.token!);
            configureEnginePlatform({ token: parsed.token });
            const session = await fetchEngineSession();
            setLiveUser(session);
            toast({
              title: session ? `Live linked · ${session.username}` : 'Live linked',
              description: 'Upload draft and Set as MAIN now push maps onto the live web game.',
            });
            const pending = pendingLiveActionRef.current;
            pendingLiveActionRef.current = null;
            if (pending?.kind === 'hub-upload') {
              await uploadHubMap(pending.mapId, pending.setActive);
            } else if (pending?.kind === 'pull') {
              await syncCloud(pending.mode, { alreadyLinked: true });
            } else if (pending?.kind === 'command') {
              window.dispatchEvent(
                new CustomEvent('kilrun-engine-command', { detail: { type: pending.type } })
              );
            }
          } catch (err) {
            toast({
              title: 'Live game login failed',
              description: err instanceof Error ? err.message : 'Could not store session',
              variant: 'destructive',
            });
          }
        })();
      }
      if (parsed.mapId) setEditorMapId(parsed.mapId);
    };
    window.addEventListener('kilrun-engine-deep-link', onDeep as EventListener);
    let unlisten: (() => void) | undefined;
    if (desktop) {
      void import('@tauri-apps/api/event')
        .then(({ listen }) =>
          listen<string>('kilrun-engine-deep-link', (event) => {
            window.dispatchEvent(
              new CustomEvent('kilrun-engine-deep-link', { detail: event.payload })
            );
          })
        )
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener('kilrun-engine-deep-link', onDeep as EventListener);
      unlisten?.();
    };
  }, [desktop, toast, uploadHubMap]);

  React.useEffect(() => {
    if (!editorMapId) return;
    const id = window.setInterval(() => {
      const api = viewportApiRef.current;
      if (!api?.getRenderStats) return;
      setStats(api.getRenderStats());
      try {
        setEntityCount(api.getDoc()?.entities?.length ?? 0);
      } catch {
        /* viewport torn down */
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [editorMapId]);

  const filtered = maps.filter(
    (m) => !query.trim() || m.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const syncCloud = async (mode: KilrunMode, opts?: { alreadyLinked?: boolean }) => {
    if (!opts?.alreadyLinked && !hasEngineSession()) {
      pendingLiveActionRef.current = { kind: 'pull', mode };
      toast({
        title: 'Link live game first',
        description: 'Pull copies maps from the website. Sign in with a staff Steam account.',
        variant: 'destructive',
      });
      void connectLiveGame();
      return;
    }
    try {
      const rows = await listCloudMapDocuments(mode);
      const { pulled } = hydrateCloudMapsIntoLocal(rows, mode, setActivePlayMapIdForMode, {
        force: true,
      });
      refresh();
      await refreshCloud();
      if (!rows.length) {
        toast({
          title: `No ${KILRUN_MODE_INFO[mode].shortTitle} maps on the live site`,
          description: 'Create or upload a map, then Pull again.',
        });
        return;
      }
      toast({
        title: pulled
          ? `Pulled ${pulled} ${KILRUN_MODE_INFO[mode].shortTitle} map${pulled === 1 ? '' : 's'}`
          : `${KILRUN_MODE_INFO[mode].shortTitle} maps already in Engine`,
        description: `From ${siteHost}`,
      });
    } catch (err) {
      toast({
        title: 'Could not pull maps',
        description: err instanceof Error ? err.message : 'Staff live-link required',
        variant: 'destructive',
      });
    }
  };

  const disconnectLiveGame = async () => {
    configureEnginePlatform({ token: null });
    setLiveUser(null);
    setCloudByLocalId({});
    await setDesktopEngineSession(null);
    toast({ title: 'Disconnected from live game' });
  };

  const createMap = (mode: KilrunMode) => {
    const { id } = createNewMap(`Untitled ${KILRUN_MODE_INFO[mode].shortTitle}`, mode);
    refresh();
    setEditorMapId(id);
  };

  const runCommand = (type: string) => {
    window.dispatchEvent(new CustomEvent('kilrun-engine-command', { detail: { type } }));
  };

  const handleCommand = (type: string) => {
    if (type === 'connect-live') {
      void connectLiveGame();
      return;
    }
    if (type === 'disconnect-live') {
      void disconnectLiveGame();
      return;
    }
    if (type === 'new-deathrun') {
      createMap('deathrun');
      return;
    }
    if (type === 'new-horde') {
      createMap('horde');
      return;
    }
    if (type === 'new-competitive') {
      createMap('competitive');
      return;
    }
    if (type === 'import') {
      if (editorMapId) runCommand('import');
      else importRef.current?.click();
      return;
    }
    if (type === 'open-folder') {
      void openDesktopProjectsFolder();
      return;
    }
    if (type === 'open-assets') {
      void openDesktopKilrunFolder('Assets');
      return;
    }
    if (type === 'open-plugins') {
      void openDesktopKilrunFolder('Plugins');
      return;
    }
    if (type === 'open-prefabs') {
      void openDesktopKilrunFolder('Prefabs');
      return;
    }
    if (type === 'toggle-perf-hud') {
      setShowPerfHud((v) => !v);
      return;
    }
    if (type === 'about') {
      setShowAbout(true);
      return;
    }
    if (type === 'upload-draft' || type === 'publish') {
      requireLiveThen({ kind: 'command', type });
      return;
    }
    runCommand(type);
  };

  const showSplash = splash || !ready;
  const shell = (
    <>
      <EngineSplash visible={showSplash} />
      <EngineMenuBar
        userName={liveUser?.username ?? user.username}
        desktop={desktop}
        connected={connected}
        inEditor={Boolean(editorMapId)}
        liveUser={liveUser}
        liveBusy={liveBusy}
        platformUrl={platformUrl}
        onUrlChange={setPlatformUrl}
        onConnect={() => void connectLiveGame()}
        onDisconnect={() => void disconnectLiveGame()}
        onCommand={handleCommand}
        onBack={() => {
          setEditorMapId(null);
          refresh();
          void refreshCloud();
        }}
      />
    </>
  );

  if (editorMapId && ready) {
    return (
      <div className="h-screen w-screen bg-[#080b12] text-white flex flex-col overflow-hidden">
        {shell}
        <div className="flex-1 min-h-0 relative">
          <MapEditor
            isAdmin
            variant="engine"
            initialMapId={editorMapId}
            onClose={() => {
              setEditorMapId(null);
              refresh();
              void refreshCloud();
            }}
            onViewportReady={(api) => {
              viewportApiRef.current = api;
            }}
          />
        </div>
        <EnginePerfHud
          hidden={!showPerfHud}
          stats={stats}
          entityCount={entityCount}
          collisionBoxes={0}
        />
        <AboutDialog
          open={showAbout}
          onClose={() => setShowAbout(false)}
          projectsRoot={projectsRoot}
          dataRoot={dataRoot}
          platformUrl={platformUrl}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#080b12] text-white flex flex-col overflow-hidden">
      {shell}
      <div className="flex-1 min-h-0 overflow-auto relative">
        <div className="absolute inset-0 pointer-events-none">
          <EngineBackdrop />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-10 space-y-10">
          <header className="flex flex-col items-center text-center gap-5 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ENGINE_MARK}
              alt=""
              className="h-20 w-20 object-contain drop-shadow-[0_0_28px_rgba(226,61,74,0.55)]"
            />
            <InteractiveWordmark
              src={ENGINE_WORDMARK}
              alt="Kilrun"
              className="h-16 sm:h-24 md:h-28 w-auto max-w-[min(90vw,640px)]"
            />
            <p className="text-sm sm:text-base text-slate-200 max-w-xl">
              Create maps in the Engine. Upload a draft to the website, then Set as MAIN when
              players should load it.
            </p>
          </header>

          <section>
            <p className="text-[11px] uppercase tracking-[0.28em] text-red-300/80 mb-3">New file</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {KILRUN_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => createMap(mode)}
                  className="group relative overflow-hidden rounded-2xl border border-red-500/25 bg-[#121821]/80 px-5 py-6 text-left transition hover:border-red-400/70 hover:shadow-[0_0_28px_rgba(226,61,74,0.25)]"
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-br from-red-600/20 to-transparent" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/20 text-red-300">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-lg">{KILRUN_MODE_INFO[mode].shortTitle}</span>
                      <span className="block text-[12px] text-slate-400 mt-1">
                        {KILRUN_MODE_INFO[mode].editorBlurb}
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
                onClick={() => importRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Import JSON
              </Button>
              {KILRUN_MODES.map((mode) => (
                <Button
                  key={`cloud-${mode}`}
                  size="sm"
                  variant="ghost"
                  className="text-slate-300"
                  onClick={() => void syncCloud(mode)}
                >
                  <Cloud className="h-3.5 w-3.5 mr-1" />
                  Pull {KILRUN_MODE_INFO[mode].shortTitle}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-4 mb-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-red-300/80">Maps</p>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search maps…"
                className="max-w-xs bg-slate-950/70 border-red-500/20"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-400">No maps yet. Start a new file above.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((item) => (
                  <ProjectCard
                    key={item.id}
                    item={item}
                    cloud={cloudByLocalId[item.id]}
                    onOpen={() => setEditorMapId(item.id)}
                    onUpload={() => requireLiveThen({ kind: 'hub-upload', mapId: item.id, setActive: false })}
                    onSetMain={() => requireLiveThen({ kind: 'hub-upload', mapId: item.id, setActive: true })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const doc = importJson(await file.text());
            const created = createNewMap(
              doc.name || file.name.replace(/\.json$/i, ''),
              getMapGameMode(doc)
            );
            saveMap(created.id, doc);
            refresh();
            setEditorMapId(created.id);
          } catch (err) {
            toast({
              title: 'Import failed',
              description: err instanceof Error ? err.message : 'Invalid map JSON',
              variant: 'destructive',
            });
          }
        }}
      />
      <EnginePerfHud hidden={!showPerfHud} stats={null} entityCount={0} collisionBoxes={0} />
      <AboutDialog
        open={showAbout}
        onClose={() => setShowAbout(false)}
        projectsRoot={projectsRoot}
        dataRoot={dataRoot}
        platformUrl={platformUrl}
      />
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 hover:border-red-400/50 hover:shadow-[0_0_24px_rgba(226,61,74,0.18)] overflow-hidden transition flex flex-col">
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#080b12] to-transparent opacity-70" />
        </div>
        <div className="px-3 pt-3 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">{item.name}</span>
            <Badge className={`text-[10px] shrink-0 ${isMain ? 'bg-red-600/90' : 'bg-slate-800'}`}>
              {status}
            </Badge>
            {item.corrupt ? (
              <Badge variant="destructive" className="text-[10px]">
                corrupt
              </Badge>
            ) : null}
          </div>
          <div className="text-[11px] text-slate-400 flex justify-between">
            <span>{mode ? KILRUN_MODE_INFO[mode].shortTitle : 'Map'}</span>
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
        <Button size="sm" className="h-7 text-[11px] bg-red-700 hover:bg-red-600" onClick={onSetMain}>
          Set MAIN
        </Button>
      </div>
    </div>
  );
}

type MenuItem = {
  label?: string;
  shortcut?: string;
  onSelect?: () => void;
  separator?: boolean;
  disabled?: boolean;
};

function EngineMenuBar({
  userName,
  desktop,
  connected,
  inEditor,
  liveUser,
  liveBusy,
  platformUrl,
  onUrlChange,
  onConnect,
  onDisconnect,
  onCommand,
  onBack,
}: {
  userName: string;
  desktop: boolean;
  connected: boolean;
  inEditor: boolean;
  liveUser: EngineSessionUser | null;
  liveBusy: boolean;
  platformUrl: string;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onCommand: (type: string) => void;
  onBack: () => void;
}) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const run = (type: string) => {
    setOpenMenu(null);
    onCommand(type);
  };

  return (
    <div
      ref={barRef}
      className="relative z-[200] shrink-0 border-b border-red-500/20 bg-[#090c14]/95 backdrop-blur-md"
    >
      <div className="h-11 px-3 flex items-center gap-2 text-[12px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ENGINE_MARK} alt="" className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(226,61,74,0.6)]" />
        <span className="font-black tracking-[0.22em] text-red-200">ENGINE</span>
        <span className="text-[10px] text-slate-500">{KILRUN_ENGINE_VERSION}</span>
        <nav className="flex items-center gap-0.5 text-slate-200">
          <MenuDrop
            label="File"
            open={openMenu === 'File'}
            onOpen={() => setOpenMenu((m) => (m === 'File' ? null : 'File'))}
            items={[
              { label: 'New Deathrun', onSelect: () => run('new-deathrun') },
              { label: 'New Horde', onSelect: () => run('new-horde') },
              { label: 'New Competitive', onSelect: () => run('new-competitive') },
              { separator: true },
              { label: 'Open maps', onSelect: () => { setOpenMenu(null); onBack(); } },
              ...(desktop ? [{ label: 'Open Projects folder', onSelect: () => run('open-folder') }] : []),
              { separator: true },
              { label: 'Save', shortcut: 'Ctrl+S', onSelect: () => run('save'), disabled: !inEditor },
              { label: 'Import JSON', onSelect: () => run('import') },
              { label: 'Export JSON', onSelect: () => run('export'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="Edit"
            open={openMenu === 'Edit'}
            onOpen={() => setOpenMenu((m) => (m === 'Edit' ? null : 'Edit'))}
            items={[
              { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => run('undo'), disabled: !inEditor },
              { label: 'Redo', shortcut: 'Ctrl+Y', onSelect: () => run('redo'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="View"
            open={openMenu === 'View'}
            onOpen={() => setOpenMenu((m) => (m === 'View' ? null : 'View'))}
            items={[
              { label: 'Reset camera', onSelect: () => run('reset-camera'), disabled: !inEditor },
              { label: 'Hide UI', onSelect: () => run('hide-ui'), disabled: !inEditor },
              { label: 'Toggle perf HUD', onSelect: () => run('toggle-perf-hud') },
            ]}
          />
          <MenuDrop
            label="Assets"
            open={openMenu === 'Assets'}
            onOpen={() => setOpenMenu((m) => (m === 'Assets' ? null : 'Assets'))}
            items={[
              { label: 'Asset sidebar', onSelect: () => run('tab-assets'), disabled: !inEditor },
              ...(desktop
                ? [
                    { label: 'Open Assets folder', onSelect: () => run('open-assets') },
                    { label: 'Open Prefabs folder', onSelect: () => run('open-prefabs') },
                    { label: 'Open Plugins folder', onSelect: () => run('open-plugins') },
                  ]
                : []),
            ]}
          />
          <MenuDrop
            label="Build"
            open={openMenu === 'Build'}
            onOpen={() => setOpenMenu((m) => (m === 'Build' ? null : 'Build'))}
            items={[
              { label: 'Validate map', onSelect: () => run('validate'), disabled: !inEditor },
              {
                label: 'Upload draft to live',
                onSelect: () => run('upload-draft'),
                disabled: !inEditor,
              },
              {
                label: 'Set as MAIN for players',
                onSelect: () => run('publish'),
                disabled: !inEditor,
              },
              { separator: true },
              connected
                ? { label: 'Unlink live game', onSelect: () => run('disconnect-live') }
                : { label: 'Link live game…', onSelect: () => run('connect-live') },
            ]}
          />
          <MenuDrop
            label="Play"
            open={openMenu === 'Play'}
            onOpen={() => setOpenMenu((m) => (m === 'Play' ? null : 'Play'))}
            items={[
              { label: 'Play Test', onSelect: () => run('play'), disabled: !inEditor },
              { label: 'Play Test (Live)', onSelect: () => run('play-live'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="Help"
            open={openMenu === 'Help'}
            onOpen={() => setOpenMenu((m) => (m === 'Help' ? null : 'Help'))}
            items={[
              { label: 'Editor help', onSelect: () => run('help'), disabled: !inEditor },
              { label: 'About Kilrun Engine', onSelect: () => run('about') },
            ]}
          />
        </nav>
        <div className="flex-1" />
        {desktop ? (
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-3.5 w-3.5 text-red-300 shrink-0" />
            <Input
              value={platformUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://kilrun.vercel.app"
              className="h-7 w-[190px] bg-slate-950/80 border-red-500/20 text-[11px]"
            />
            {liveUser ? (
              <>
                <Badge className="bg-red-700/80 text-[10px] max-w-[160px] truncate">
                  Live linked · {liveUser.username}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onDisconnect}>
                  Unlink
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-7 text-[11px] shadow-[0_0_16px_rgba(226,61,74,0.35)]"
                disabled={liveBusy}
                onClick={onConnect}
              >
                {liveBusy ? 'Opening Steam…' : 'Link live game'}
              </Button>
            )}
          </div>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.18em] text-red-300/80">Browser</span>
        )}
        <span className="text-[11px] text-slate-400 shrink-0">{userName}</span>
      </div>
    </div>
  );
}

function MenuDrop({
  label,
  open,
  onOpen,
  items,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  items: MenuItem[];
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className={`px-2.5 py-1.5 rounded-md transition ${
          open ? 'bg-red-600/20 text-white' : 'hover:bg-white/10 hover:text-white'
        }`}
        onClick={onOpen}
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[210] min-w-[240px] origin-top rounded-xl border border-red-500/30 bg-[#10151e] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(226,61,74,0.15)]">
          {items.map((item, index) =>
            item.separator ? (
              <div key={`sep-${index}`} className="my-1 h-px bg-red-500/20" />
            ) : (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                className="w-full text-left px-3 py-1.5 hover:bg-red-600/25 hover:text-white transition border-l-2 border-transparent hover:border-red-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between gap-6"
                onClick={() => item.onSelect?.()}
              >
                <span>{item.label}</span>
                {item.shortcut ? (
                  <span className="text-[10px] text-slate-500">{item.shortcut}</span>
                ) : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function AboutDialog({
  open,
  onClose,
  projectsRoot,
  dataRoot,
  platformUrl,
}: {
  open: boolean;
  onClose: () => void;
  projectsRoot: string | null;
  dataRoot: string | null;
  platformUrl: string;
}) {
  if (!open) return null;
  const mapsPath = projectsRoot || (dataRoot ? `${dataRoot}\\Projects` : 'Documents\\Kilrun\\Projects');
  return (
    <div className="fixed inset-0 z-[400] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#10151e] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ENGINE_MARK} alt="" className="h-10 w-10 object-contain" />
          <div>
            <p className="font-black tracking-[0.18em] text-red-200">KILRUN ENGINE</p>
            <p className="text-[11px] text-slate-400">Version {KILRUN_ENGINE_VERSION}</p>
          </div>
        </div>
        <p className="text-sm text-slate-300 mb-3">
          Maps save on this PC. Link live game (Steam staff) to upload drafts and Set as MAIN for
          players.
        </p>
        <dl className="text-[12px] space-y-2 text-slate-400">
          <div>
            <dt className="uppercase tracking-wider text-[10px] text-red-300/80">Maps folder</dt>
            <dd className="font-mono text-slate-200 break-all">{mapsPath}</dd>
          </div>
          {dataRoot ? (
            <div>
              <dt className="uppercase tracking-wider text-[10px] text-red-300/80">Engine data</dt>
              <dd className="font-mono text-slate-200 break-all">{dataRoot}</dd>
            </div>
          ) : null}
          <div>
            <dt className="uppercase tracking-wider text-[10px] text-red-300/80">Live website</dt>
            <dd className="font-mono text-slate-200 break-all">{platformUrl}</dd>
          </div>
        </dl>
        <Button className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
