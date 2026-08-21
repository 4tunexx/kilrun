'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Globe } from 'lucide-react';
import MapEditor from '@/components/game/editor/map-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  createNewMap,
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
import { setActivePlayMapIdForMode } from '@/components/game/editor/prefab-storage';
import { getKilrunModeInfo, listKilrunModes, type KilrunMode } from '@/lib/game-modes';
import { listCloudMapDocuments, publishCloudMap } from '@/lib/game-map-actions';
import { attachPluginRuntimeToDoc } from '@/lib/engine/plugin-runtime-store';
import { useToast } from '@/hooks/use-toast';
import { isKilrunEngineDesktop } from '@/lib/engine/runtime';
import { ENGINE_MARK } from '@/lib/engine/brand';
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
import { EngineSplash } from './engine-splash';
import { HelpGuideOverlay, KeyboardShortcutsOverlay } from '@/components/game/editor/editor-help';
import { EngineHome, type CloudBadge } from './engine-home';
import { PluginManagerDialog } from './plugin-manager';
import { loadDesktopPlugins } from '@/lib/engine/plugin-loader';
import { DEFAULT_EDITOR_PERF_MODE, type EditorPerfMode, type EditorViewLayout } from '@/components/game/editor/editor-viewport';
import { getSidebarPlugins } from '@/components/game/editor/engine/registry';
import '@/components/game/editor/engine/builtins';
import { shortcutKeys } from '@/components/game/editor/editor-shortcuts';

export type EngineUser = {
  username: string;
  role: string;
  avatarUrl?: string | null;
};

type EngineEditorUiState = {
  uiCollapsed: boolean;
  sidebarOpen: boolean;
  toolsOpen: boolean;
  propsOpen: boolean;
  gridVisible: boolean;
  showAllCollisionGizmos: boolean;
  viewLayout: EditorViewLayout;
  freeFly: boolean;
  editorPerf: EditorPerfMode;
  showHelp: boolean;
};

const DEFAULT_EDITOR_UI: EngineEditorUiState = {
  uiCollapsed: false,
  sidebarOpen: true,
  toolsOpen: true,
  propsOpen: true,
  gridVisible: true,
  showAllCollisionGizmos: false,
  viewLayout: 'single',
  freeFly: false,
  editorPerf: { ...DEFAULT_EDITOR_PERF_MODE },
  showHelp: false,
};

type PendingLiveAction =
  | { kind: 'command'; type: string }
  | { kind: 'hub-upload'; mapId: string; setActive: boolean }
  | { kind: 'pull'; mode: KilrunMode };

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
  const [showPerfHud, setShowPerfHud] = React.useState(false);
  const [showAbout, setShowAbout] = React.useState(false);
  const [showPlugins, setShowPlugins] = React.useState(false);
  const [showGuide, setShowGuide] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [editorUi, setEditorUi] = React.useState<EngineEditorUiState>(DEFAULT_EDITOR_UI);
  const [livePingMs, setLivePingMs] = React.useState<number | null>(null);
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
        listKilrunModes().map(async (mode) => {
          const rows = await listCloudMapDocuments(mode);
          for (const row of rows) {
            const key = row.localId || row.id;
            next[key] = { uploaded: true, isActive: row.isActive };
          }
        })
      );
      setCloudByLocalId(next);
    } catch (err) {
      toast({
        title: 'Could not refresh cloud maps',
        description: err instanceof Error ? err.message : 'Live link may have expired',
        variant: 'destructive',
      });
    }
  }, [liveUser, toast]);

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
        const plugins = await loadDesktopPlugins();
        if (!cancelled && plugins.errors.length) {
          console.warn('[kilrun-engine] plugin load', plugins.errors);
        }
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
    if (!liveUser) {
      setLivePingMs(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const started = performance.now();
      const result = await probeEngineApi();
      if (cancelled) return;
      if (result === 'ok') setLivePingMs(Math.round(performance.now() - started));
    };
    void tick();
    const id = window.setInterval(() => void tick(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveUser, platformUrl]);

  React.useEffect(() => {
    const id = window.setTimeout(() => setSplash(false), 2200);
    return () => window.clearTimeout(id);
  }, []);

  const siteHost = platformUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'kilrun.vercel.app';

  const persistPlatformUrl = React.useCallback(async (url: string) => {
    const origin = url.trim().replace(/\/$/, '') || enginePlatformOrigin();
    setPlatformUrl(origin);
    configureEnginePlatform({ origin });
    try {
      await setDesktopPlatformUrl(origin);
    } catch (err) {
      toast({
        title: 'Could not save website URL',
        description: err instanceof Error ? err.message : 'Use kilrun.vercel.app or localhost',
        variant: 'destructive',
      });
    }
  }, [toast]);

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
          document: attachPluginRuntimeToDoc(doc),
          thumbnailDataUrl: getMapThumbnail(mapId),
          setActive,
        });
        if (setActive) setActivePlayMapIdForMode(mode, mapId);
        await refreshCloud();
        refresh();
        toast({
          title: setActive || row.isActive
            ? `This is now the MAIN map for ${getKilrunModeInfo(mode).shortTitle}`
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

  const pullCloudMaps = React.useCallback(
    async (mode: KilrunMode) => {
      try {
        const rows = await listCloudMapDocuments(mode);
        const { pulled } = hydrateCloudMapsIntoLocal(rows, mode, setActivePlayMapIdForMode, {
          force: true,
        });
        refresh();
        await refreshCloud();
        if (!rows.length) {
          toast({
            title: `No ${getKilrunModeInfo(mode).shortTitle} maps on the live site`,
            description: 'Create or upload a map, then Pull again.',
          });
          return;
        }
        toast({
          title: pulled
            ? `Pulled ${pulled} ${getKilrunModeInfo(mode).shortTitle} map${pulled === 1 ? '' : 's'}`
            : `${getKilrunModeInfo(mode).shortTitle} maps already in Engine`,
          description: `From ${siteHost}`,
        });
      } catch (err) {
        toast({
          title: 'Could not pull maps',
          description: err instanceof Error ? err.message : 'Staff live-link required',
          variant: 'destructive',
        });
      }
    },
    [refresh, refreshCloud, siteHost, toast]
  );

  const runLiveAction = React.useCallback(
    async (action: PendingLiveAction) => {
      switch (action.kind) {
        case 'command':
          window.dispatchEvent(new CustomEvent('kilrun-engine-command', { detail: { type: action.type } }));
          return;
        case 'hub-upload':
          await uploadHubMap(action.mapId, action.setActive);
          return;
        case 'pull':
          await pullCloudMaps(action.mode);
          return;
        default: {
          const _exhaustive: never = action;
          return _exhaustive;
        }
      }
    },
    [pullCloudMaps, uploadHubMap]
  );

  const requireLiveThen = React.useCallback(
    (action: PendingLiveAction) => {
      if (liveUser) {
        void runLiveAction(action);
        return;
      }
      pendingLiveActionRef.current = action;
      void connectLiveGame();
    },
    [connectLiveGame, liveUser, runLiveAction]
  );

  const syncCloud = React.useCallback(
    async (mode: KilrunMode) => {
      if (!hasEngineSession()) {
        pendingLiveActionRef.current = { kind: 'pull', mode };
        toast({
          title: 'Link live game first',
          description: 'Pull copies maps from the website. Sign in with a staff Steam account.',
          variant: 'destructive',
        });
        void connectLiveGame();
        return;
      }
      await pullCloudMaps(mode);
    },
    [connectLiveGame, pullCloudMaps, toast]
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
            if (pending) await runLiveAction(pending);
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
  }, [desktop, runLiveAction, toast]);

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

  const disconnectLiveGame = async () => {
    configureEnginePlatform({ token: null });
    setLiveUser(null);
    setCloudByLocalId({});
    await setDesktopEngineSession(null);
    toast({ title: 'Disconnected from live game' });
  };

  const createMap = (mode: KilrunMode) => {
    const { id } = createNewMap(`Untitled ${getKilrunModeInfo(mode).shortTitle}`, mode);
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
    if (type === 'shortcuts') {
      if (editorMapId) runCommand(type);
      else setShowShortcuts(true);
      return;
    }
    if (type === 'help' || type === 'tips' || type === 'tutorial') {
      if (editorMapId) runCommand(type);
      else setShowGuide(true);
      return;
    }
    if (type === 'plugins-manage') {
      setShowPlugins(true);
      return;
    }
    if (type === 'plugins-reload') {
      void loadDesktopPlugins().then((result) => {
        toast({
          title: result.loaded.length
            ? `Loaded ${result.loaded.length} plugin${result.loaded.length === 1 ? '' : 's'}`
            : 'Plugins reloaded',
          description: result.errors.length
            ? result.errors.map((row) => `${row.id}: ${row.error}`).join(' · ')
            : undefined,
          variant: result.errors.length ? 'destructive' : undefined,
        });
      });
      return;
    }
    if (type === 'upload-draft' || type === 'publish') {
      requireLiveThen({ kind: 'command', type });
      return;
    }
    runCommand(type);
  };

  React.useEffect(() => {
    const onUi = (event: Event) => {
      const detail = (event as CustomEvent<EngineEditorUiState>).detail;
      if (!detail) return;
      setEditorUi(detail);
    };
    window.addEventListener('kilrun-engine-ui-state', onUi);
    return () => window.removeEventListener('kilrun-engine-ui-state', onUi);
  }, []);

  React.useEffect(() => {
    if (!editorMapId) setEditorUi(DEFAULT_EDITOR_UI);
  }, [editorMapId]);

  const showSplash = splash || !ready;
  const shell = (
    <>
      <EngineSplash visible={showSplash} />
      <EngineMenuBar
        userName={liveUser?.username ?? user.username}
        desktop={desktop}
        connected={connected}
        inEditor={Boolean(editorMapId)}
        editorUi={editorUi}
        showPerfHud={showPerfHud}
        liveUser={liveUser}
        liveBusy={liveBusy}
        livePingMs={livePingMs}
        platformUrl={platformUrl}
        onUrlChange={setPlatformUrl}
        onUrlCommit={() => void persistPlatformUrl(platformUrl)}
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
      <div className="h-screen w-screen bg-[#080b12] text-white font-sans antialiased flex flex-col overflow-hidden">
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
        <PluginManagerDialog open={showPlugins} onClose={() => setShowPlugins(false)} />
        <HelpGuideOverlay open={showGuide} onClose={() => setShowGuide(false)} />
        <KeyboardShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#080b12] text-white font-sans antialiased flex flex-col overflow-hidden">
      {shell}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <EngineHome
          maps={maps}
          filtered={filtered}
          query={query}
          onQueryChange={setQuery}
          cloudByLocalId={cloudByLocalId}
          liveUser={liveUser}
          siteHost={siteHost}
          livePingMs={livePingMs}
          desktop={desktop}
          onCreateMap={createMap}
          onImport={() => importRef.current?.click()}
          onPull={(mode) => void syncCloud(mode)}
          onOpenProjects={() => void openDesktopProjectsFolder()}
          onOpenPlugins={() => setShowPlugins(true)}
          onOpenMap={setEditorMapId}
          onUpload={(mapId) => requireLiveThen({ kind: 'hub-upload', mapId, setActive: false })}
          onSetMain={(mapId) => requireLiveThen({ kind: 'hub-upload', mapId, setActive: true })}
          onConnect={() => void connectLiveGame()}
          onDisconnect={() => void disconnectLiveGame()}
        />
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
      <AboutDialog
        open={showAbout}
        onClose={() => setShowAbout(false)}
        projectsRoot={projectsRoot}
        dataRoot={dataRoot}
        platformUrl={platformUrl}
      />
      <PluginManagerDialog open={showPlugins} onClose={() => setShowPlugins(false)} />
      <HelpGuideOverlay open={showGuide} onClose={() => setShowGuide(false)} />
      <KeyboardShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

type MenuItem = {
  label?: string;
  shortcut?: string;
  onSelect?: () => void;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
};

function EngineMenuBar({
  userName,
  desktop,
  connected,
  inEditor,
  editorUi,
  showPerfHud,
  liveUser,
  liveBusy,
  livePingMs,
  platformUrl,
  onUrlChange,
  onUrlCommit,
  onConnect,
  onDisconnect,
  onCommand,
  onBack,
}: {
  userName: string;
  desktop: boolean;
  connected: boolean;
  inEditor: boolean;
  editorUi: EngineEditorUiState;
  showPerfHud: boolean;
  liveUser: EngineSessionUser | null;
  liveBusy: boolean;
  livePingMs: number | null;
  platformUrl: string;
  onUrlChange: (url: string) => void;
  onUrlCommit: () => void;
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
      className="relative z-[200] shrink-0 border-b border-slate-700/40 bg-[#090c14]/95 backdrop-blur-md shadow-[0_1px_0_rgba(226,61,74,0.28)]"
    >
      <div className="h-12 px-3 flex items-center gap-2 text-[12px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ENGINE_MARK} alt="" className="h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(226,61,74,0.6)]" />
        <span className="font-black tracking-[0.22em] text-red-200">ENGINE</span>
        <span className="text-[10px] text-slate-500">{KILRUN_ENGINE_VERSION}</span>
        <div className="h-5 w-px bg-slate-700/50 mx-1" />
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
              { label: 'Save', shortcut: shortcutKeys('save'), onSelect: () => run('save'), disabled: !inEditor },
              { label: 'Import JSON', onSelect: () => run('import') },
              { label: 'Export JSON', onSelect: () => run('export'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="Edit"
            open={openMenu === 'Edit'}
            onOpen={() => setOpenMenu((m) => (m === 'Edit' ? null : 'Edit'))}
            items={[
              { label: 'Undo', shortcut: shortcutKeys('undo'), onSelect: () => run('undo'), disabled: !inEditor },
              { label: 'Redo', shortcut: shortcutKeys('redo'), onSelect: () => run('redo'), disabled: !inEditor },
              { separator: true },
              { label: 'Duplicate', shortcut: shortcutKeys('duplicate'), onSelect: () => run('duplicate'), disabled: !inEditor },
              { label: 'Duplicate +Z', shortcut: shortcutKeys('duplicate-z'), onSelect: () => run('duplicate-z'), disabled: !inEditor },
              { label: 'Delete', shortcut: shortcutKeys('delete'), onSelect: () => run('delete'), disabled: !inEditor },
              { separator: true },
              { label: 'Group', shortcut: shortcutKeys('group'), onSelect: () => run('group'), disabled: !inEditor },
              { label: 'Ungroup', shortcut: shortcutKeys('ungroup'), onSelect: () => run('ungroup'), disabled: !inEditor },
              { label: 'Select none', shortcut: shortcutKeys('select-none'), onSelect: () => run('select-none'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="View"
            open={openMenu === 'View'}
            onOpen={() => setOpenMenu((m) => (m === 'View' ? null : 'View'))}
            items={[
              {
                label: editorUi.uiCollapsed ? 'Show UI' : 'Hide UI',
                shortcut: shortcutKeys('toggle-ui'),
                onSelect: () => run('toggle-ui'),
                disabled: !inEditor,
                checked: editorUi.uiCollapsed,
              },
              { label: 'Sidebar', onSelect: () => run('toggle-sidebar'), disabled: !inEditor, checked: inEditor && editorUi.sidebarOpen && !editorUi.uiCollapsed },
              { label: 'Tool bar', onSelect: () => run('toggle-tools'), disabled: !inEditor, checked: inEditor && editorUi.toolsOpen && !editorUi.uiCollapsed },
              { label: 'Properties', onSelect: () => run('toggle-props'), disabled: !inEditor, checked: inEditor && editorUi.propsOpen && !editorUi.uiCollapsed },
              { separator: true },
              { label: 'Editing grid', onSelect: () => run('toggle-grid'), disabled: !inEditor, checked: inEditor && editorUi.gridVisible },
              { label: 'Collision gizmos', onSelect: () => run('toggle-collision-gizmos'), disabled: !inEditor, checked: inEditor && editorUi.showAllCollisionGizmos },
              { label: 'Free fly', onSelect: () => run('toggle-free-fly'), disabled: !inEditor, checked: inEditor && editorUi.freeFly },
              { separator: true },
              { label: 'Reset camera', onSelect: () => run('reset-camera'), disabled: !inEditor },
              { label: 'Top view', onSelect: () => run('camera-top'), disabled: !inEditor },
              { label: 'Side view', onSelect: () => run('camera-side'), disabled: !inEditor },
              { label: 'Front view', onSelect: () => run('camera-front'), disabled: !inEditor },
              { label: 'Focus selection', shortcut: shortcutKeys('focus'), onSelect: () => run('focus-selected'), disabled: !inEditor },
              { separator: true },
              { label: 'Layout: single', onSelect: () => run('layout-single'), disabled: !inEditor, checked: inEditor && editorUi.viewLayout === 'single' },
              { label: 'Layout: split', onSelect: () => run('layout-split'), disabled: !inEditor, checked: inEditor && editorUi.viewLayout === 'split' },
              { label: 'Layout: triple', onSelect: () => run('layout-triple'), disabled: !inEditor, checked: inEditor && editorUi.viewLayout === 'triple' },
              { separator: true },
              { label: 'Perf HUD', onSelect: () => run('toggle-perf-hud'), checked: showPerfHud },
              { label: 'Graphics…', onSelect: () => run('graphics'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="Plugins"
            open={openMenu === 'Plugins'}
            onOpen={() => setOpenMenu((m) => (m === 'Plugins' ? null : 'Plugins'))}
            items={[
              { label: 'Manage plugins…', onSelect: () => run('plugins-manage'), disabled: !desktop },
              { label: 'Reload plugins', onSelect: () => run('plugins-reload'), disabled: !desktop },
              ...(desktop ? [{ label: 'Open Plugins folder', onSelect: () => run('open-plugins') }] : []),
            ]}
          />
          <MenuDrop
            label="Assets"
            open={openMenu === 'Assets'}
            onOpen={() => setOpenMenu((m) => (m === 'Assets' ? null : 'Assets'))}
            items={[
              { label: 'Asset sidebar', onSelect: () => run('tab-assets'), disabled: !inEditor },
              { label: 'Layers', onSelect: () => run('tab-layers'), disabled: !inEditor },
              { label: 'Outliner', onSelect: () => run('tab-outliner'), disabled: !inEditor },
              { label: 'World', onSelect: () => run('tab-world'), disabled: !inEditor },
              { label: 'Prefabs', onSelect: () => run('tab-prefabs'), disabled: !inEditor },
              { label: 'Textures', onSelect: () => run('tab-textures'), disabled: !inEditor },
              ...(desktop
                ? [
                    { separator: true } as MenuItem,
                    { label: 'Open Assets folder', onSelect: () => run('open-assets') },
                    { label: 'Open Prefabs folder', onSelect: () => run('open-prefabs') },
                    { label: 'Open Plugins folder', onSelect: () => run('open-plugins') },
                  ]
                : []),
            ]}
          />
          <MenuDrop
            label="Studios"
            open={openMenu === 'Studios'}
            onOpen={() => setOpenMenu((m) => (m === 'Studios' ? null : 'Studios'))}
            items={getSidebarPlugins()
              .filter((p) => p.studio)
              .map((p) => ({
                label: p.label,
                onSelect: () => run(`tab-${p.id}`),
                disabled: !inEditor,
              }))}
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
            label="Settings"
            open={openMenu === 'Settings'}
            onOpen={() => setOpenMenu((m) => (m === 'Settings' ? null : 'Settings'))}
            items={[
              { label: 'Perf HUD', onSelect: () => run('toggle-perf-hud'), checked: showPerfHud },
              ...(desktop
                ? [
                    { label: 'Open Projects folder', onSelect: () => run('open-folder') },
                    { label: 'Manage plugins…', onSelect: () => run('plugins-manage') },
                  ]
                : []),
              { separator: true },
              { label: 'Graphics…', onSelect: () => run('graphics'), disabled: !inEditor },
              { separator: true },
              {
                label: 'Disable bloom',
                onSelect: () => run('perf-disableBloom'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.disableBloom,
              },
              {
                label: '1× pixel ratio',
                onSelect: () => run('perf-capPixelRatio'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.capPixelRatio,
              },
              {
                label: 'Skip collision wires',
                onSelect: () => run('perf-skipCollisionGizmos'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.skipCollisionGizmos,
              },
              {
                label: 'Hide floor',
                onSelect: () => run('perf-hideFloor'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.hideFloor,
              },
              {
                label: 'Hide sky texture',
                onSelect: () => run('perf-hideSkyTexture'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.hideSkyTexture,
              },
              {
                label: 'Hide void effects',
                onSelect: () => run('perf-hideVoidEffects'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.hideVoidEffects,
              },
              {
                label: 'Hide fog',
                onSelect: () => run('perf-hideFog'),
                disabled: !inEditor,
                checked: inEditor && editorUi.editorPerf.hideFog,
              },
              { separator: true },
              {
                label: 'Show tool bar',
                onSelect: () => run('toggle-tools'),
                disabled: !inEditor,
                checked: inEditor && editorUi.toolsOpen && !editorUi.uiCollapsed,
              },
              { label: 'World panel', onSelect: () => run('tab-world'), disabled: !inEditor },
              { label: 'Match settings', onSelect: () => run('tab-settings'), disabled: !inEditor },
            ]}
          />
          <MenuDrop
            label="Help"
            open={openMenu === 'Help'}
            onOpen={() => setOpenMenu((m) => (m === 'Help' ? null : 'Help'))}
            items={[
              { label: 'Editor guide', onSelect: () => run('help') },
              { label: 'Keyboard shortcuts', onSelect: () => run('shortcuts') },
              { label: 'Quick tips', onSelect: () => run('tips'), checked: inEditor && editorUi.showHelp },
              { label: 'Restart tutorial', onSelect: () => run('tutorial'), disabled: !inEditor },
              { separator: true },
              { label: 'About Kilrun Engine', onSelect: () => run('about') },
            ]}
          />
        </nav>
        <div className="flex-1" />
        {desktop ? (
          <div className="relative z-0 flex items-center gap-2 min-w-0 shrink-0">
            <Globe className="h-3.5 w-3.5 text-red-300 shrink-0" />
            <Input
              value={platformUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              onBlur={onUrlCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="https://kilrun.vercel.app"
              className="h-8 w-[210px] bg-slate-950/80 border-slate-700/40 text-[11px]"
            />
            {liveUser ? (
              <>
                <Badge className="bg-red-700/80 text-[10px] max-w-[200px] truncate">
                  Live linked{livePingMs != null ? ` · ${livePingMs}ms` : ''} · {liveUser.username}
                </Badge>
                <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={onDisconnect}>
                  Unlink
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  className="h-8 text-[11px] shadow-2xl"
                  disabled={liveBusy}
                  onClick={onConnect}
                >
                  {liveBusy ? 'Opening Steam…' : 'Link live game'}
                </Button>
                <span className="text-[11px] text-slate-400 shrink-0">{userName}</span>
              </>
            )}
          </div>
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-[0.18em] text-red-300/80">Browser</span>
            <span className="text-[11px] text-slate-400 shrink-0">{userName}</span>
          </>
        )}
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
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 260;
    const alignRight = r.left > window.innerWidth * 0.42;
    let left = alignRight ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={`px-2.5 py-1.5 rounded-md transition ${
          open ? 'bg-red-600/20 text-white' : 'hover:bg-white/10 hover:text-white'
        }`}
        onClick={onOpen}
      >
        {label}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[5000] min-w-[260px] max-h-[min(70vh,560px)] overflow-y-auto origin-top rounded-xl border border-red-500/30 bg-[#10151e] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(226,61,74,0.15)]"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {items.map((item, index) =>
                item.separator ? (
                  <div key={`sep-${index}`} className="my-1 h-px bg-red-500/20" />
                ) : (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    disabled={item.disabled}
                    className="w-full text-left px-3 py-1.5 hover:bg-red-600/25 hover:text-white transition border-l-2 border-transparent hover:border-red-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between gap-6"
                    onClick={() => item.onSelect?.()}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-3 text-[10px] ${item.checked ? 'text-red-300' : 'text-transparent'}`}>
                        ✓
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.shortcut ? (
                      <span className="text-[10px] text-slate-500 shrink-0">{item.shortcut}</span>
                    ) : null}
                  </button>
                )
              )}
            </div>,
            document.body
          )
        : null}
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
