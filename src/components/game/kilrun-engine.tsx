'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoomState } from './net/use-room-state';
import type { JoinOptions } from './net/connection';
import type { ChatMessage, NetObstacleState, NetPlatformState, NetPlayerState, PlayerInputMessage } from './net/types';
import { InputManager } from './input/input-manager';
import type { DualJoystick } from './input/dual-joystick';
import { createThreeWorld, updateFollowCamera } from './renderer/three-world';
import { SprintParticles } from './effects/sprint-particles';
import { ThreeCharacter } from './entities/three-character';
import { ThreeMap } from './entities/three-map';
import { CustomMapOverlay } from './entities/custom-map-overlay';
import { toThree } from './renderer/coords';
import {
  detectTouchDevice,
  CAMERA_YAW_KEY_SPEED,
  CAMERA_YAW_STICK_SENS,
  NETWORK_SEND_INTERVAL_MS,
  SPAWN_X,
  WORLD_HEIGHT,
} from './utils/constants';
import { HUD } from './ui/hud';
import { GameMenu, LevelUpPopup, useGameProgression } from './ui/game-menu';
import { Scoreboard } from './ui/scoreboard';
import { PauseMenu, useGameFullscreen } from './ui/pause-menu';
import { LobbyOverlay } from './modes/deathrun/lobby-overlay';
import { CountdownOverlay } from './modes/deathrun/countdown-overlay';
import { ResultsScreen } from './modes/deathrun/results-screen';
import { MobilePlayGate } from './ui/mobile-play-gate';
import { WeaponShop, type WeaponPreset, mapShopItemsToPresets, mapPowerUpsToPresets, mapShopSkinsToPresets } from './ui/weapon-shop';
import { JoystickOverlay } from './ui/joystick-overlay';
import { MobileActionButtons } from './ui/mobile-action-buttons';
import { Crosshair } from './ui/crosshair';
import { LiveChatOverlay } from './ui/live-chat-overlay';
import { AdminInGamePanel } from './ui/admin-in-game-panel';
import {
  loadTpsViewSettings,
  mouseSensRadians,
  resolvePlatformTpsView,
  hydrateDefaultTpsViewFromApi,
  TPS_VIEW_STORAGE_KEY,
  type TpsViewSettings,
} from './tps/tps-view-settings';
import { hydrateWeaponCatalogFromApi } from '@/lib/weapon-catalog';
import dynamic from 'next/dynamic';
import {
  findWeaponAttachment,
  resolveWeaponCombat,
} from '@/lib/weapons';
import type { SkinAttachment } from '@/lib/player-skins';
import { parseEquippedSkinsJson } from '@/lib/match-loadout';
import {
  getActivePlayMapIdForMode,
  mapDocSpawnPoints,
  mapDocPlayerSpawns,
  mapDocMonsterSpawns,
  mapDocTeamSpawns,
  mapDocHealthFloors,
  mapDocRedZones,
  mapDocRevivePads,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToSimActions,
  mapDocToSimButtons,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
  mapDocPushPayloads,
  mapDocWaveAnchors,
  prepareDocForPlayTest,
  type SimWorldBounds,
} from './editor/prefab-storage';
import {
  createSimScratch,
  stepPlatformer,
  type SimBody,
  type SimPad,
  type SimPhysicsOpts,
  type SimScratch,
} from '@/lib/platformer-sim';
import { reconcilePredictedBody } from '@/lib/client-prediction';
import { loadMapPlayable } from './editor/map-storage';
import type { MapDocument } from './editor/map-document';
import { ensureEnvironment, shopItemsForMode, shopPowerUpsForMode, shopSkinsForMode, ensureShopSettings, ensureCombatSettings } from './editor/map-document';
import { applyAuthoredEnvironment } from './editor/map-scene-visuals';
import type { KilrunMode } from '@/lib/game-modes';
import { getActiveCloudMapDocument } from '@/lib/game-map-actions';
import { getMyMetricCounts } from '@/lib/actions';
import { HordeLobbyOverlay } from './modes/horde/lobby-overlay';
import { HordeResultsScreen } from './modes/horde/results-screen';
import { CompetitiveLobbyOverlay } from './modes/competitive/lobby-overlay';
import { CompetitiveResultsScreen } from './modes/competitive/results-screen';
import { ModeStatusHud } from './ui/mode-status-hud';
import type { GameRoomName } from './net/connection';

const MapEditor = dynamic(() => import('./editor/map-editor'), { ssr: false });

interface KilrunEngineProps {
  joinOptions: JoinOptions;
  onExit: () => void;
  xpProgress?: number;
  isAdmin?: boolean;
  /** Shop-equipped skin attachments for the local player avatar. */
  equippedSkins?: SkinAttachment[] | null;
  /** Which game mode room to join. */
  mode?: KilrunMode;
  /** Competitive only — casual skips KP; ranked requires Premium. */
  competitiveQueue?: 'casual' | 'ranked';
  /** Fired once after Colyseus connect (party leader publishes room id). */
  onRoomConnected?: (roomId: string) => void;
  /**
   * Map editor "Play Test" only — join this Colyseus room name instead of the
   * one derived from `mode` (e.g. 'deathrun_practice' instead of 'deathrun').
   * The room is private/solo and never grants real rewards; every other
   * gameplay/UI code path (HUD, chat, admin panel, menus) is untouched and
   * keyed off `mode` as normal.
   */
  roomNameOverride?: GameRoomName;
  /**
   * Map editor "Play Test" only — an in-progress, possibly-unsaved map draft
   * to use directly instead of fetching the published Active cloud map. When
   * set, skips the network fetch entirely so editing the map live and hitting
   * Play Test always reflects exactly what's in the editor right now.
   */
  draftDoc?: MapDocument | null;
  /**
   * Map editor "Play Test" only — forces the solo player's role in a
   * 'deathrun_practice' room (no second player to auto-assign trapper to).
   * Ignored by any other room.
   */
  practiceRole?: 'runner' | 'trapper';
}

export default function KilrunEngine({
  joinOptions,
  onExit,
  xpProgress: _xpProgress = 0,
  isAdmin = false,
  equippedSkins = null,
  mode = 'deathrun',
  competitiveQueue = 'casual',
  onRoomConnected,
  roomNameOverride,
  draftDoc = null,
  practiceRole,
}: KilrunEngineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sprintFxRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const pausedRef = useRef(false);
  const gameMenuOpenRef = useRef(false);
  const roomName: GameRoomName =
    roomNameOverride ??
    (mode === 'competitive'
      ? competitiveQueue === 'ranked'
        ? 'competitive_ranked'
        : 'competitive'
      : mode);
  const {
    connectionRef,
    playersRef,
    obstaclesRef,
    platformsRef,
    rendererCallbacksRef,
    room,
    localPlayer,
    playerCount,
    connectionError,
    connectionState,
  } = useRoomState(joinOptions, roomName);

  const sendChatToRoom = useCallback(
    (text: string, scope: 'all' | 'team') => {
      connectionRef.current?.sendChat(text, scope);
    },
    [connectionRef]
  );

  const registerOnChat = useCallback(
    (cb: (msg: ChatMessage) => void) => {
      connectionRef.current?.onChat(cb);
    },
    [connectionRef]
  );

  useEffect(() => {
    if (!onRoomConnected) return;
    let published = false;
    const publish = () => {
      if (published) return;
      const rid = connectionRef.current?.roomId;
      if (!rid) return;
      published = true;
      onRoomConnected(rid);
    };
    publish();
    const t = setInterval(publish, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRoomConnected]);

  const isMobile = detectTouchDevice();
  const [assetsReady, setAssetsReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  useEffect(() => {
    gameMenuOpenRef.current = gameMenuOpen;
  }, [gameMenuOpen]);
  const gameProgression = useGameProgression(joinOptions.userId);
  useEffect(() => {
    if (room.phase === 'results') gameProgression.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.phase]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiming, setAiming] = useState(false);
  const aimingRef = useRef(false);
  const [tpsHud, setTpsHud] = useState<TpsViewSettings>(() => loadTpsViewSettings());
  const tpsRef = useRef(tpsHud);
  tpsRef.current = tpsHud;

  // Hydrate admin-tunable global weapon stats + camera default from the DB
  // once per page load. Both are safe no-ops on any network/DB failure — the
  // hardcoded static catalog / DEFAULT_TPS_VIEW keep working either way.
  useEffect(() => {
    hydrateWeaponCatalogFromApi();
    hydrateDefaultTpsViewFromApi().then((changed) => {
      if (
        changed &&
        typeof window !== 'undefined' &&
        !window.localStorage.getItem(TPS_VIEW_STORAGE_KEY)
      ) {
        // Only refresh the HUD default if the player hasn't set their own
        // per-browser camera preference (that always takes priority).
        setTpsHud(loadTpsViewSettings());
      }
    });
  }, []);
  const { toggle: toggleFullscreen } = useGameFullscreen(rootRef, true);
  const customDocRef = useRef<MapDocument | null>(null);
  const customLoadedRef = useRef(false);
  const cloudDocRef = useRef<MapDocument | null>(null);
  /** Deathrun MAIN map 3rd View — overrides camera for every game mode. */
  const deathrunTpsRef = useRef<unknown | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [shopMetricCounts, setShopMetricCounts] = useState<Record<string, number>>({});
  const equippedSkinsRef = useRef<SkinAttachment[] | null>(equippedSkins ?? null);
  equippedSkinsRef.current = equippedSkins ?? null;
  const charactersRef = useRef<Map<string, ThreeCharacter>>(new Map());
  const localSessionRef = useRef<string | null>(null);
  const roomPhaseRef = useRef(room.phase);
  roomPhaseRef.current = room.phase;
  const matchRemainingRef = useRef(room.matchTimeRemainingMs ?? 0);
  matchRemainingRef.current = room.matchTimeRemainingMs ?? 0;
  const matchDurationRef = useRef(180_000);

  // Prefer cloud Active map for this mode (works for all clients), fall back to localStorage.
  // Deathrun MAIN 3rd View always wins camera/crosshair for Horde / Comp / Deathrun.
  useEffect(() => {
    let cancelled = false;
    setCloudReady(false);
    if (draftDoc) {
      // Play Test from the map editor — use the in-progress draft exactly as
      // authored, skip the Active-cloud-map network fetch entirely so this
      // always reflects what's currently in the editor, saved or not.
      cloudDocRef.current = draftDoc;
      customLoadedRef.current = false;
      deathrunTpsRef.current = draftDoc.tpsView ?? null;
      const applied = resolvePlatformTpsView({
        modeMapOverride: draftDoc.tpsView ?? null,
        deathrunMapOverride: deathrunTpsRef.current,
      });
      tpsRef.current = applied;
      setTpsHud(applied);
      setCloudReady(true);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([
      getActiveCloudMapDocument(mode),
      mode === 'deathrun'
        ? Promise.resolve(null)
        : getActiveCloudMapDocument('deathrun').catch(() => null),
    ])
      .then(([cloud, deathrunCloud]) => {
        if (cancelled) return;
        const localDeathrunId = getActivePlayMapIdForMode('deathrun');
        const localDeathrun = localDeathrunId ? loadMapPlayable(localDeathrunId) : null;
        deathrunTpsRef.current =
          deathrunCloud?.document?.tpsView ??
          (mode === 'deathrun' ? cloud?.document?.tpsView : null) ??
          localDeathrun?.tpsView ??
          null;

        if (cloud?.document) {
          cloudDocRef.current = cloud.document;
          // Allow lobby effect to re-push if we already short-circuited on local-only miss.
          customLoadedRef.current = false;
        }

        const applied = resolvePlatformTpsView({
          modeMapOverride: cloud?.document?.tpsView ?? null,
          deathrunMapOverride: deathrunTpsRef.current,
        });
        tpsRef.current = applied;
        setTpsHud(applied);
      })
      .catch(() => {
        /* local fallback only */
        const localDeathrunId = getActivePlayMapIdForMode('deathrun');
        const localDeathrun = localDeathrunId ? loadMapPlayable(localDeathrunId) : null;
        deathrunTpsRef.current = localDeathrun?.tpsView ?? null;
        const applied = resolvePlatformTpsView({
          deathrunMapOverride: deathrunTpsRef.current,
        });
        tpsRef.current = applied;
        setTpsHud(applied);
      })
      .finally(() => {
        if (!cancelled) setCloudReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, draftDoc]);

  // Load progression metrics for weapon unlock gates in the buy shop.
  useEffect(() => {
    if (mode !== 'horde' && mode !== 'competitive') return;
    let cancelled = false;
    const items = shopItemsForMode(
      customDocRef.current ?? cloudDocRef.current,
      mode === 'competitive' ? 'competitive' : 'horde'
    );
    const metrics = items
      .map((it) => it.unlockMetric)
      .filter((m): m is string => typeof m === 'string' && m.length > 0);
    if (metrics.length === 0) {
      setShopMetricCounts({});
      return;
    }
    void getMyMetricCounts(metrics)
      .then((counts) => {
        if (!cancelled) setShopMetricCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setShopMetricCounts({});
      });
    return () => {
      cancelled = true;
    };
  }, [mode, cloudReady, room.buyPhaseMs]);

  // Push Active editor map for this mode to the server when lobby is ready
  useEffect(() => {
    if (!cloudReady) return;
    if (room.phase === 'results') {
      customLoadedRef.current = false;
      return;
    }
    if (room.phase !== 'lobby' && room.phase !== 'countdown') return;
    if (customLoadedRef.current) return;
    if (!connectionRef.current?.sessionId) return;

    let cancelled = false;

    const resolveDoc = async (): Promise<MapDocument | null> => {
      // Play Test (draftDoc) always reflects the live editor state already —
      // no network round trip needed. Otherwise, refetch the cloud Active map
      // fresh instead of trusting the mount-time cache: an admin who publishes
      // a map edit in another tab and returns to an already-open game tab
      // must not have their host push re-send the stale doc it loaded at
      // mount (which would clobber the server's own fresh fetch and bring
      // back the old wall heights / geometry).
      if (draftDoc) return prepareDocForPlayTest(draftDoc).doc;
      const fresh = await getActiveCloudMapDocument(mode).catch(() => null);
      if (fresh?.document) {
        cloudDocRef.current = fresh.document;
        return prepareDocForPlayTest(fresh.document).doc;
      }
      const raw =
        cloudDocRef.current ??
        (() => {
          const mapId = getActivePlayMapIdForMode(mode);
          if (!mapId) return null;
          return loadMapPlayable(mapId);
        })();
      if (!raw) return null;
      return prepareDocForPlayTest(raw).doc;
    };

    const pushCustomMap = (doc: MapDocument) => {
      // Re-check: the network refetch above may have outlived a disconnect,
      // a phase change, or a race with another push that already landed.
      if (cancelled || customLoadedRef.current || !connectionRef.current?.sessionId) return;
      const platforms = mapDocToSimPlatforms(doc);
      if (!platforms.length) return;

      const obstacles = mapDocToSimHazards(doc);
      const finishes = mapDocToSimFinishes(doc);
      const buttons = mapDocToSimButtons(doc);
      const actions = mapDocToSimActions(doc);
      const teleports = mapDocToSimTeleports(doc);
      const spawns = mapDocSpawnPoints(doc);
      const playerSpawns = mapDocPlayerSpawns(doc);
      const monsterSpawns = mapDocMonsterSpawns(doc);
      const waveAnchors = mapDocWaveAnchors(doc);
      const teams = mapDocTeamSpawns(doc);
      const healthFloors = mapDocHealthFloors(doc);
      const redZones = mapDocRedZones(doc);
      const revivePads = mapDocRevivePads(doc);
      const pushPayloads = mapDocPushPayloads(doc);
      const worldBounds = mapDocToWorldBounds(doc, platforms, finishes);
      customDocRef.current = doc;
      customLoadedRef.current = true;
      connectionRef.current.sendLoadCustomMap({
        platforms,
        obstacles,
        finishes,
        buttons,
        actions,
        teleports,
        spawn: spawns.runner ?? playerSpawns[0] ?? undefined,
        trapperSpawn: spawns.trapper ?? undefined,
        playerSpawns,
        monsterSpawns,
        waveAnchors,
        teamASpawns: teams.teamA,
        teamBSpawns: teams.teamB,
        healthFloors,
        redZones,
        revivePads,
        pushPayloads,
        worldBounds,
        modeSettings: doc.modeSettings as Record<string, unknown> | undefined,
        combatSettings: doc.combatSettings as Record<string, unknown> | undefined,
        ...(mode === 'horde' || mode === 'competitive'
          ? {
              shopSettings: ensureShopSettings(doc) as unknown as Record<string, unknown>,
            }
          : {}),
      });
      if (practiceRole) {
        connectionRef.current.sendPracticeSetRole(practiceRole);
      }
    };

    void resolveDoc().then((doc) => {
      if (cancelled || !doc) return;
      pushCustomMap(doc);
    });

    return () => {
      cancelled = true;
    };
  }, [cloudReady, room.phase, connectionRef, playerCount, connectionError, mode, practiceRole, draftDoc]);

  useEffect(() => {
    pausedRef.current = paused || editorOpen;
    if (paused || editorOpen || gameMenuOpen || scoreboardOpen) {
      if (document.pointerLockElement) document.exitPointerLock?.();
    }
  }, [paused, editorOpen, gameMenuOpen, scoreboardOpen]);

  useEffect(() => {
    const onTps = (ev: Event) => {
      const detail = (ev as CustomEvent<TpsViewSettings>).detail;
      if (!detail) return;
      // Live editor saves still apply, but Deathrun MAIN map override stays on top.
      const clean = resolvePlatformTpsView({
        modeMapOverride: detail,
        deathrunMapOverride: deathrunTpsRef.current,
      });
      tpsRef.current = clean;
      setTpsHud(clean);
    };
    window.addEventListener('kilrun:tps-view', onTps as EventListener);
    return () => window.removeEventListener('kilrun:tps-view', onTps as EventListener);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (editorOpen) return; // editor handles its own Esc
      setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen]);

  // In-game leveling / power upgrade menu (separate from Esc pause menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm') return;
      if (editorOpen || paused) return;
      e.preventDefault();
      setGameMenuOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen, paused]);

  // Admin panel — press X to open (admin-only). Guard against stealing the
  // keystroke while the chat box (or any other input) is focused, same as
  // the live-chat overlay's own Enter guard.
  useEffect(() => {
    if (!isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'x') return;
      if (editorOpen || paused) return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
      e.preventDefault();
      setAdminPanelOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editorOpen, paused, isAdmin]);

  // Scoreboard: classic FPS hold-Tab pattern (show while held, hide on release).
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (editorOpen || paused || gameMenuOpen) return;
      e.preventDefault();
      setScoreboardOpen(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      setScoreboardOpen(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [editorOpen, paused, gameMenuOpen]);

  useEffect(() => {
    if (!cloudReady) return;
    const hostElement = hostRef.current;
    if (!hostElement) return;

    let disposed = false;
    let raf = 0;
    const world = createThreeWorld(hostElement);
    const activeId = getActivePlayMapIdForMode(mode);
    const localDoc = activeId ? loadMapPlayable(activeId) : null;
    const rawDoc = cloudDocRef.current ?? localDoc;
    // Same spawn / play prep as Deathrun editor Play Test so live movement matches.
    const playDoc = rawDoc ? prepareDocForPlayTest(rawDoc).doc : null;
    const hasCustomMap = Boolean(playDoc);
    const map = new ThreeMap(world.scene, {
      hardcodedDecor: !hasCustomMap,
      hidePlatformMeshes: hasCustomMap,
      // Custom maps own sky/fog/mood — skip default cyan glow void.
      atmosphere: !hasCustomMap,
    });
    const overlay = new CustomMapOverlay(world.scene);
    const characters = new Map<string, ThreeCharacter>();
    charactersRef.current = characters;
    const inputManager = new InputManager(hostElement, isMobile);
    joystickRef.current = inputManager.joystick;
    let envHandle: { dispose: () => void } | null = null;
    let envFloor: THREE.Mesh | null = null;

    if (playDoc) {
      customDocRef.current = playDoc;
      map.clearHardcodedDecor();
      const env = ensureEnvironment(playDoc);
      envFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: env.floorColor || '#1a2740', roughness: 1 })
      );
      envFloor.rotation.x = -Math.PI / 2;
      envFloor.position.y = -0.02;
      world.scene.add(envFloor);
      envHandle = applyAuthoredEnvironment(world.scene, env, {
        lights: { ambient: world.ambient, sun: world.sun, hemi: world.hemi },
        floorMesh: envFloor,
      });
      // Match editor cavern default lights a bit warmer when map uses authored env.
      world.ambient.color.set(0xffffff);
      void overlay.load(playDoc);
      {
        const localDeathrunId = getActivePlayMapIdForMode('deathrun');
        const localDeathrun = localDeathrunId ? loadMapPlayable(localDeathrunId) : null;
        deathrunTpsRef.current =
          deathrunTpsRef.current ??
          (mode === 'deathrun' ? playDoc.tpsView : null) ??
          localDeathrun?.tpsView ??
          null;
        // Prefer freshest Deathrun / mode map values when available
        if (mode === 'deathrun' && playDoc.tpsView) {
          deathrunTpsRef.current = playDoc.tpsView;
        } else if (!deathrunTpsRef.current && localDeathrun?.tpsView) {
          deathrunTpsRef.current = localDeathrun.tpsView;
        }
        const applied = resolvePlatformTpsView({
          modeMapOverride: playDoc.tpsView ?? null,
          deathrunMapOverride: deathrunTpsRef.current,
        });
        tpsRef.current = applied;
        setTpsHud(applied);
      }
    }

    let cameraYaw = 0;
    let cameraPitch = tpsRef.current.camera.defaultPitch;
    let sendAccumulatorMs = 0;
    let shootHeld = false;
    let wasShootEdge = false;
    let meleeUntil = 0;
    let interactPulse = false;
    /** Visual-only recoil (does not corrupt aimPitch sent to server). */
    let recoilPitch = 0;
    let shakeAmp = 0;
    let wasGroundedForShake = false;
    let lastHealthForShake: number | null = null;
    /** Sprint/slide screen FX intensity, eased toward 0/1 each frame. */
    let sprintFx = 0;
    const sprintParticles = new SprintParticles(world.camera);
    const targetPos = new THREE.Vector3(WORLD_HEIGHT / 2, 1, SPAWN_X);
    const overlayPlayerPos = new THREE.Vector3();
    // Smoothed local player position for the camera — follows the interpolated
    // mesh, NOT the raw (20 Hz) server snapshot, so the world doesn't stutter.
    const smoothCamTarget = new THREE.Vector3(WORLD_HEIGHT / 2, 1, SPAWN_X);
    let hasSmoothCamTarget = false;

    // --- Local-player client-side prediction (movement only) ---
    // Mirrors the map editor's fully-local `stepPlatformer` sim so the local
    // player's own movement feels instant instead of waiting on the 30Hz
    // server round-trip. Remote players are entirely unaffected — they keep
    // using ThreeCharacter's existing server-snapshot smoothing path.
    let predictedPads: SimPad[] = [];
    let predictedBounds: SimWorldBounds = { minX: -200, maxX: 200, minY: -200, maxY: 200 };
    let predictedPhysOpts: SimPhysicsOpts = {};
    try {
      if (playDoc) {
        // Match map-play-preview.tsx's pad shape: stamp id/home* so moving
        // platforms have a stable identity for stepPlatformer's carry logic
        // (`supportPadId`), even though we don't animate motion client-side.
        predictedPads = mapDocToSimPlatforms(playDoc).map((p, i) => ({
          ...p,
          id: p.entityId || `pad_${i}`,
          homeX: p.x,
          homeY: p.y,
          homeZ: p.z,
        }));
        const finishes = mapDocToSimFinishes(playDoc);
        predictedBounds = mapDocToWorldBounds(playDoc, predictedPads, finishes);
        const cs = ensureCombatSettings(playDoc);
        predictedPhysOpts = {
          gravity: cs.gravity,
          jumpVelocity: cs.jumpVelocity,
          doubleJumpVelocity: cs.doubleJumpVelocity,
          doubleJumpEnabled: cs.doubleJumpEnabled,
          jumpCutMult: cs.jumpCutMult,
          coyoteMs: cs.coyoteMs,
          jumpBufferMs: cs.jumpBufferMs,
          walkSpeed: cs.walkSpeed,
          sprintMult: cs.sprintMult,
          crouchMult: cs.crouchMult,
          maxFallSpeed: cs.maxFallSpeed,
          apexGravMult: cs.apexGravMult,
          slideEnabled: cs.slideEnabled,
          slideMult: cs.slideMult,
          slideDurationMs: cs.slideDurationMs,
          slideCooldownMs: cs.slideCooldownMs,
          wallJumpEnabled: cs.wallJumpEnabled,
          wallJumpHorizVel: cs.wallJumpHorizVel,
          wallJumpVertVel: cs.wallJumpVertVel,
          wallSlideGravMult: cs.wallSlideGravMult,
        };
      }
    } catch (err) {
      console.warn('[kilrun-engine] prediction pad/bounds setup failed — falling back to server-only movement', err);
      predictedPads = [];
    }
    let predictedBody: SimBody | null = null;
    const predictedScratch: SimScratch = createSimScratch();
    let predictionFailed = false;

    const spawnCharacter = (sessionId: string, username: string) => {
      if (characters.has(sessionId)) return;
      const avatarEntity = customDocRef.current?.entities.find((e) => e.kind === 'player');
      // Keep map avatar model/anims, but never apply unpaid editor skins in live matches.
      const avatarForPlay = avatarEntity
        ? { ...avatarEntity, playerSkins: undefined }
        : undefined;
      const isLocal = sessionId === connectionRef.current?.sessionId;
      const netPlayer = playersRef.current.get(sessionId);
      const remoteSkins = !isLocal
        ? parseEquippedSkinsJson(netPlayer?.equippedSkinsJson)
        : null;
      const view = new ThreeCharacter(username, isLocal, {
        avatarEntity: avatarForPlay,
        // Local: purchased/equipped. Remotes: synced loadout from join.
        equippedSkins: isLocal ? equippedSkinsRef.current : remoteSkins,
      });
      if (typeof netPlayer?.bodyColorIndex === 'number') {
        view.setBodyColor(netPlayer.bodyColorIndex);
      }
      characters.set(sessionId, view);
      world.scene.add(view.root);
    };

    rendererCallbacksRef.current = {
      onPlayerAdd: (player, sessionId) => spawnCharacter(sessionId, player.username),
      onPlayerRemove: (sessionId) => {
        characters.get(sessionId)?.destroy();
        characters.delete(sessionId);
      },
      onObstacleAdd: (obstacle, index) => {
        // Custom map overlay owns visuals; net obstacles are sim-only (avoids
        // prototype saws/lasers drawing on top of the Active map).
        if (hasCustomMap) return;
        void map.upsertObstacle(index, obstacle);
      },
      onObstacleChange: (obstacle, index) => {
        if (hasCustomMap) return;
        void map.upsertObstacle(index, obstacle);
      },
      onObstacleRemove: (index) => {
        if (hasCustomMap) return;
        map.removeObstacle(index);
      },
      onPlatformAdd: (platform, index) => {
        if (hasCustomMap) return;
        void map.upsertPlatform(index, platform);
      },
      onPlatformChange: (platform, index) => {
        if (hasCustomMap) return;
        void map.upsertPlatform(index, platform);
      },
      onPlatformRemove: (index) => {
        if (hasCustomMap) return;
        map.removePlatform(index);
      },
    };

    playersRef.current.forEach((p, id) => spawnCharacter(id, p.username));
    if (!hasCustomMap) {
      platformsRef.current.forEach((p, i) => void map.upsertPlatform(i, p as NetPlatformState));
      obstaclesRef.current.forEach((o, i) => void map.upsertObstacle(i, o as NetObstacleState));
    }

    const syncTimer = window.setInterval(() => {
      if (!hasCustomMap) {
        map.prunePlatforms(platformsRef.current.keys());
        map.pruneObstacles(obstaclesRef.current.keys());
        platformsRef.current.forEach((p, i) => void map.upsertPlatform(i, p));
        obstaclesRef.current.forEach((o, i) => void map.upsertObstacle(i, o));
      }
      const live = new Set(playersRef.current.keys());
      characters.forEach((view, id) => {
        if (!live.has(id)) {
          view.destroy();
          characters.delete(id);
        }
      });
      playersRef.current.forEach((p, id) => spawnCharacter(id, p.username));
      setAssetsReady(true);
    }, 400);

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(world.clock.getDelta(), 0.05);
      const dtMs = dt * 1000;
      const frozen = pausedRef.current;

      if (!frozen) {
        const tps = tpsRef.current;
        const lookSens = mouseSensRadians(tps);
        // Mouse / stick always orbit camera (GTA free look + aim look)
        cameraYaw += inputManager.getCameraTurnIntent() * CAMERA_YAW_KEY_SPEED * dt;
        cameraYaw -= inputManager.consumeMouseLookDeltaX() * lookSens;
        cameraPitch -= inputManager.consumeMouseLookDeltaY() * lookSens;
        if (isMobile) {
          const aim = inputManager.joystick.getAimVector();
          if (aim.x || aim.y) {
            cameraYaw -= aim.x * CAMERA_YAW_STICK_SENS * dt;
            cameraPitch -= aim.y * 0.95 * dt;
          }
        }
        // RMB (or mobile look-stick) = aim focus — drives crosshair + body lock
        const nowAim = inputManager.isAimHeld();
        if (nowAim !== aimingRef.current) {
          aimingRef.current = nowAim;
          setAiming(nowAim);
        }
      } else {
        // Drain deltas so resume doesn't snap
        inputManager.consumeMouseLookDeltaX();
        inputManager.consumeMouseLookDeltaY();
      }
      {
        const tps = tpsRef.current;
        cameraPitch = THREE.MathUtils.clamp(
          cameraPitch,
          tps.camera.pitchMin,
          tps.camera.pitchMax
        );
      }

      const localSessionId = connectionRef.current?.sessionId;
      localSessionRef.current = localSessionId ?? null;
      const localState = localSessionId ? playersRef.current.get(localSessionId) : undefined;

      const stick = inputManager.getMoveVector();
      const wishFwd = -stick.y;
      const wishStrafe = stick.x;
      const aimHeld = !frozen && inputManager.isAimHeld();

      // --- Advance local-player prediction this frame (render-rate, not 30Hz) ---
      if (localState) {
        if (!predictedBody) {
          // First snapshot for the local player — seed prediction from server
          // state rather than starting at the origin.
          predictedBody = {
            x: localState.x,
            y: localState.y,
            z: localState.z ?? 0,
            vz: localState.vz ?? 0,
            isGrounded: localState.isGrounded,
            energy: localState.energy ?? 100,
          };
          predictionFailed = false;
        } else {
          try {
            if (predictedPads.length > 0 && !frozen) {
              const cos = Math.cos(cameraYaw);
              const sin = Math.sin(cameraYaw);
              const moveX = wishFwd * cos + wishStrafe * sin;
              const moveY = wishFwd * sin - wishStrafe * cos;
              stepPlatformer(
                predictedBody,
                {
                  moveX,
                  moveY,
                  jumpPressed: inputManager.isJumpPressed(),
                  sprint: inputManager.isSprintPressed(),
                  crouch: inputManager.isCrouchPressed(),
                  meleeActive: performance.now() < meleeUntil,
                },
                dt,
                predictedPads,
                predictedScratch,
                predictedBounds,
                predictedPhysOpts
              );
            }
            // Reconcile toward the latest authoritative snapshot — soft pull
            // for small errors, hard snap only for large desyncs (teleport/
            // respawn). Never fight the server; never diverge permanently.
            reconcilePredictedBody(predictedBody, {
              x: localState.x,
              y: localState.y,
              z: localState.z ?? 0,
              vz: localState.vz,
              isGrounded: localState.isGrounded,
            });
            predictionFailed = false;
          } catch (err) {
            if (!predictionFailed) {
              console.warn('[kilrun-engine] local prediction step failed — falling back to server snapshot', err);
            }
            predictionFailed = true;
            // Fall back to the server snapshot outright so a bad pad/physics
            // state can't strand or teleport the player.
            predictedBody.x = localState.x;
            predictedBody.y = localState.y;
            predictedBody.z = localState.z ?? 0;
            predictedBody.vz = localState.vz ?? 0;
            predictedBody.isGrounded = localState.isGrounded;
          }
        }
      } else {
        predictedBody = null;
      }

      // Sprint/slide screen FX — eases in while actually moving fast with
      // sprint held (or sliding), eases back out otherwise.
      {
        const horizSpeed = Math.hypot(predictedScratch.velX, predictedScratch.velY);
        const sprinting =
          !frozen &&
          inputManager.isSprintPressed() &&
          (predictedBody?.isGrounded ?? true) &&
          horizSpeed > 4.5;
        const sliding = predictedScratch.slideMs > 0;
        const targetFx = sliding ? 1 : sprinting ? Math.min(1, horizSpeed / 9) : 0;
        const rate = targetFx > sprintFx ? 7 : 3.2;
        sprintFx += (targetFx - sprintFx) * Math.min(1, dt * rate);
        if (sprintFx < 0.001) sprintFx = 0;
        sprintParticles.update(dt, sprintFx);
        if (sprintFxRef.current) {
          sprintFxRef.current.style.opacity = String(sprintFx);
        }
      }

      const swayCombat = ensureCombatSettings(
        customDocRef.current ?? ({ combatSettings: {} } as MapDocument)
      );
      const weaponSway = {
        enabled: swayCombat.swayEnabled,
        amplitudeDeg: swayCombat.swayAmplitudeDeg,
        speedHz: swayCombat.swaySpeedHz,
        moveMult: swayCombat.swayMoveMult,
      };
      // Camera shake on landing / taking damage (shakeOnFire already fires
      // from the shoot-handling block below) — local player only.
      if (localSessionId && localState) {
        const groundedNow = predictedBody?.isGrounded ?? localState.isGrounded;
        if (!wasGroundedForShake && groundedNow) {
          shakeAmp = Math.max(shakeAmp, swayCombat.shakeOnLand ?? 0);
        }
        wasGroundedForShake = groundedNow;

        if (lastHealthForShake !== null && localState.health < lastHealthForShake) {
          shakeAmp = Math.max(shakeAmp, swayCombat.shakeOnHit ?? 0);
        }
        lastHealthForShake = localState.health;
      }
      characters.forEach((view, sessionId) => {
        const player = playersRef.current.get(sessionId);
        if (!player) return;
        if (typeof player.bodyColorIndex === 'number') {
          view.setBodyColor(player.bodyColorIndex);
        }
        const isLocal = sessionId === localSessionId;
        // Remote (and late local) weapon mesh/skin sync from authoritative state.
        {
          const modelUrl = player.weaponModelUrl || '';
          const skinId = player.weaponSkinId || '';
          const syncKey = `${modelUrl}|${skinId}|${player.weaponId || ''}`;
          if (syncKey !== view.syncedWeaponKey && (modelUrl || skinId)) {
            view.syncedWeaponKey = syncKey;
            const shopMode = mode === 'competitive' ? 'competitive' : 'horde';
            const skinTex = skinId
              ? shopSkinsForMode(customDocRef.current, shopMode).find((s) => s.id === skinId)
                  ?.textureUrl
              : undefined;
            if (modelUrl && !modelUrl.startsWith('data:')) {
              const vpTex =
                !skinTex && isLocal
                  ? findWeaponAttachment(equippedSkinsRef.current)?.textureUrl
                  : !skinTex
                    ? findWeaponAttachment(
                        parseEquippedSkinsJson(player.equippedSkinsJson)
                      )?.textureUrl
                    : undefined;
              const mapWep = customDocRef.current?.weaponDef;
              void view.equipWeaponMesh(modelUrl, {
                kind: player.weaponKind,
                damage: player.weaponDamage,
                range: player.weaponRange,
                cooldownMs: player.weaponCooldownMs,
                coneRadians: player.weaponConeRadians,
                // Match buy-menu skin overrides VP cosmetic texture.
                textureUrl: skinTex || vpTex,
                fireClip: mapWep?.fireClip,
                reloadClip: mapWep?.reloadClip,
                idleClip: mapWep?.idleClip,
              });
            } else if (skinTex) {
              void view.applyWeaponSkinTexture(skinTex);
            }
          }
        }
        // Local player: feed the PREDICTED body (instant, render-rate movement)
        // into the character instead of the raw (30Hz) server snapshot. Remote
        // players are untouched — they keep using `player` as-is, which drives
        // ThreeCharacter's existing server-snapshot smoothing path unchanged.
        const renderPlayer: NetPlayerState =
          isLocal && predictedBody
            ? {
                ...player,
                x: predictedBody.x,
                y: predictedBody.y,
                z: predictedBody.z,
                vz: predictedBody.vz,
                isGrounded: predictedBody.isGrounded,
                isSliding: predictedScratch.slideMs > 0,
              }
            : player;
        view.update(
          renderPlayer,
          dt,
          isLocal ? cameraYaw : player.cameraYaw,
          isLocal && !frozen ? { fwd: wishFwd, strafe: wishStrafe } : undefined,
          isLocal ? aimHeld : false,
          weaponSway
        );
        if (isLocal) {
          const pl = tpsRef.current.player;
          const cam = tpsRef.current.camera;
          view.root.scale.setScalar(
            Number.isFinite(pl.scale) && pl.scale > 0 ? pl.scale : 1
          );
          // Capture the smoothed ground position for the camera BEFORE the
          // visual Y offset so camera height matches the old behavior.
          smoothCamTarget.copy(view.root.position);
          hasSmoothCamTarget = true;
          view.root.position.y += Number.isFinite(pl.offsetY) ? pl.offsetY : 0;
          if (Number.isFinite(pl.yawOffsetDeg) && pl.yawOffsetDeg !== 0) {
            view.root.rotation.y += (pl.yawOffsetDeg * Math.PI) / 180;
          }
          if (pl.hideWhenClose && cam.boomDistance < pl.hideDistance) {
            view.root.visible = false;
          }
        }
      });
      map.update(dt);

      if (roomPhaseRef.current === 'playing') {
        const remain = matchRemainingRef.current;
        const elapsed = Math.max(0, matchDurationRef.current - remain);
        overlay.tickMotion(elapsed);
      } else {
        overlay.tickMotion(0);
      }

      if (!frozen && (inputManager.isInteractPressed() || inputManager.consumeInteractPulse())) {
        interactPulse = true;
      }

      if (localState) {
        const [tx, ty, tz] = toThree(localState.x, localState.y, localState.z ?? 0);
        targetPos.set(tx, ty, tz);
        overlayPlayerPos.set(tx, ty, tz);
        const doc = customDocRef.current;
        if (doc) {
          overlay.update(dt, overlayPlayerPos, interactPulse, doc.entities);
        } else {
          overlay.update(dt, null, false, []);
        }
        interactPulse = false;
      } else {
        overlay.update(dt, null, false, []);
      }
      // GTA: free orbit always; RMB aim pulls camera tighter + optional weapon FOV zoom
      {
        const cam = tpsRef.current.camera;
        const localWep = localSessionId ? playersRef.current.get(localSessionId) : undefined;
        const zoomFov = localWep?.weaponAdsZoomFov ?? 0;
        const combat = ensureCombatSettings(
          customDocRef.current ?? ({ combatSettings: {} } as MapDocument)
        );
        // Decay visual recoil / shake
        const recover = (combat.recoilRecoverySpeed * Math.PI) / 180;
        if (recoilPitch > 0) {
          recoilPitch = Math.max(0, recoilPitch - recover * dt);
        }
        shakeAmp *= Math.max(0, 1 - dt * 8);
        const shakeX = (Math.random() - 0.5) * 2 * shakeAmp;
        const shakeY = (Math.random() - 0.5) * 2 * shakeAmp;
        const aimCam = aimHeld
          ? {
              ...cam,
              boomDistance: Math.max(
                zoomFov > 0 ? 1.6 : 2.2,
                cam.boomDistance * (zoomFov > 0 ? 0.45 : 0.72)
              ),
              shoulder:
                cam.shoulder === 0
                  ? 0.42
                  : cam.shoulder + Math.sign(cam.shoulder) * 0.35,
              followSharpness: cam.followSharpness + 8,
              fov:
                zoomFov > 0
                  ? THREE.MathUtils.lerp(cam.fov, zoomFov, 0.92)
                  : cam.fov,
            }
          : cam;
        const camFollow = hasSmoothCamTarget ? smoothCamTarget : targetPos;
        updateFollowCamera(
          world.camera,
          camFollow,
          cameraYaw + shakeX * 0.35,
          cameraPitch + recoilPitch + shakeY * 0.5,
          dt,
          aimCam
        );
      }

      if (!frozen) {
        const mapWeaponDef = customDocRef.current?.weaponDef;
        if (inputManager.consumeReloadPulse()) {
          connectionRef.current?.sendReload();
          const localView = localSessionId ? characters.get(localSessionId) : undefined;
          localView?.triggerAttack('punch');
          if (mapWeaponDef?.reloadClip) {
            localView?.playWeaponClip(mapWeaponDef.reloadClip, false);
          } else {
            localView?.playWeaponReloadClip();
          }
        }
        const abilityPulse =
          inputManager.consumeAbilityPulse('hook') ??
          inputManager.consumeAbilityPulse('berserk') ??
          inputManager.consumeAbilityPulse('bullet') ??
          inputManager.consumeAbilityPulse('thunder') ??
          inputManager.consumeAbilityPulse('visibility') ??
          inputManager.consumeAbilityPulse('fly') ??
          inputManager.consumeAbilityPulse('backflip');
        if (abilityPulse && !gameMenuOpenRef.current && localSessionId && localState) {
          connectionRef.current?.sendActivateAbility(abilityPulse);
        }
        const shootNow = inputManager.isShootPressed() || inputManager.isAttackPressed();
        const localWep = localSessionId ? playersRef.current.get(localSessionId) : undefined;
        const fireMode = (localWep?.weaponFireMode || 'semi') as string;
        const isAuto = fireMode === 'auto';
        const edge = shootNow && !wasShootEdge;
        const combatFeel = ensureCombatSettings(
          customDocRef.current ?? ({ combatSettings: {} } as MapDocument)
        );
        const canLocalFireVisual =
          (localWep?.weaponMagSize ?? 0) <= 0 || (localWep?.ammoInMag ?? 1) > 0;
        const reloading =
          (localWep?.reloadEndsAt ?? 0) > 0 &&
          Date.now() < (localWep?.reloadEndsAt ?? 0);
        if (edge && localSessionId && canLocalFireVisual && !reloading) {
          const weaponAtt = findWeaponAttachment(equippedSkinsRef.current);
          const combat = resolveWeaponCombat(weaponAtt);
          const localView = characters.get(localSessionId);
          localView?.triggerAttack(combat.attackStyle ?? 'attack');
          const kickDeg = combatFeel.recoilKickDeg ?? 2;
          recoilPitch += (kickDeg * Math.PI) / 180;
          shakeAmp = Math.max(shakeAmp, combatFeel.shakeOnFire ?? 0.015);
          localView?.pulseMuzzle(combatFeel.weaponKickZ ?? 0.06);
          // Prefer authored map weaponDef clip names, then attachment combat.
          if (mapWeaponDef?.fireClip) {
            localView?.playWeaponClip(mapWeaponDef.fireClip, false);
          } else {
            localView?.playWeaponFireClip();
          }
          if (combat.kind === 'melee' || localWep?.weaponKind === 'melee') {
            meleeUntil = performance.now() + 500;
          }
        }
        wasShootEdge = shootNow;
        // auto = hold-to-fire · semi/bolt = one shot per click edge
        if (isAuto) {
          shootHeld = shootHeld || shootNow;
        } else {
          shootHeld = shootHeld || edge;
        }
        sendAccumulatorMs += dtMs;
        if (sendAccumulatorMs >= NETWORK_SEND_INTERVAL_MS && localState) {
          sendAccumulatorMs = 0;
          if (
            isAuto &&
            shootNow &&
            localSessionId &&
            canLocalFireVisual &&
            !reloading
          ) {
            const kickDeg = (combatFeel.recoilKickDeg ?? 2) * 0.55;
            recoilPitch += (kickDeg * Math.PI) / 180;
            shakeAmp = Math.max(shakeAmp, (combatFeel.shakeOnFire ?? 0.015) * 0.7);
            characters.get(localSessionId)?.pulseMuzzle((combatFeel.weaponKickZ ?? 0.06) * 0.7);
          }
          // Camera-relative: W into look, A = left, D = right (screen space).
          // Look flat (sin,cos) in Three XZ → sim; screen-right = (−cos, sin).
          const stick = inputManager.getMoveVector();
          const wishFwd = -stick.y;
          const wishStrafe = stick.x;
          const cos = Math.cos(cameraYaw);
          const sin = Math.sin(cameraYaw);
          const moveX = wishFwd * cos + wishStrafe * sin;
          const moveY = wishFwd * sin - wishStrafe * cos;

          const message: PlayerInputMessage = {
            moveX,
            moveY,
            aimAngle: cameraYaw,
            aimPitch: cameraPitch,
            cameraYaw,
            crouch: inputManager.isCrouchPressed(),
            sprint: inputManager.isSprintPressed(),
            jumpPressed: inputManager.isJumpPressed(),
            shootPressed: shootHeld,
            aimHeld,
            interactPressed: inputManager.isInteractPressed(),
            meleeActive: performance.now() < meleeUntil,
          };
          connectionRef.current?.sendInput(message);
          shootHeld = false;
        }
      }

      world.render();
    };

    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(syncTimer);
      if (document.pointerLockElement) document.exitPointerLock?.();
      characters.forEach((c) => c.destroy());
      sprintParticles.dispose();
      overlay.destroy();
      map.destroy();
      envHandle?.dispose();
      if (envFloor) {
        envFloor.removeFromParent();
        envFloor.geometry.dispose();
        (envFloor.material as THREE.Material).dispose();
      }
      world.destroy();
      joystickRef.current = null;
      inputManager.joystick.destroy();
    };
    // Wait for Active cloud map so live play uses the same document as editor Play Test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, mode, isMobile]);

  const runnersLeft = useMemo(() => {
    let n = 0;
    playersRef.current.forEach((p) => {
      if (mode === 'competitive') {
        if (p.isAlive) n += 1;
      } else if (mode === 'horde') {
        if ((p.role === 'survivor' || p.role === 'runner') && p.isAlive) n += 1;
      } else if (p.role === 'runner' && p.isAlive) {
        n += 1;
      }
    });
    if (n === 0 && localPlayer?.isAlive) return 1;
    return n;
    // playerCount and room.phase are not used directly in this callback but are
    // included as deps to force recomputation when Colyseus state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPlayer, playerCount, room.phase, playersRef, mode]);

  const resume = () => {
    setPaused(false);
    hostRef.current?.requestPointerLock?.().catch(() => {});
  };

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-[200] bg-[#0a1220] overflow-hidden touch-none select-none ${
        paused || editorOpen ? 'cursor-default' : 'cursor-none'
      }`}
    >
      <MobilePlayGate containerRef={rootRef}>
        <div ref={hostRef} className="absolute inset-0 w-full h-full" />

        <div
          ref={sprintFxRef}
          className="pointer-events-none absolute inset-0 z-[119]"
          aria-hidden
          style={{
            opacity: 0,
            background:
              'radial-gradient(ellipse at center, rgba(90,170,255,0) 38%, rgba(50,120,255,0.16) 72%, rgba(6,16,40,0.6) 100%)',
            boxShadow: 'inset 0 0 160px 50px rgba(60,140,255,0.35)',
            mixBlendMode: 'screen',
          }}
        />

        {!assetsReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 z-[105] pointer-events-none">
            <p className="text-white font-bold tracking-wide animate-pulse">Loading map & character…</p>
          </div>
        )}

        {room.phase === 'playing' && localPlayer && !editorOpen && (
          <>
            <HUD
              player={localPlayer}
              room={room}
              gameProgress={gameProgression.progression}
              runnersLeft={runnersLeft}
              weaponKind={resolveWeaponCombat(findWeaponAttachment(equippedSkins)).kind}
            />
            <ModeStatusHud mode={mode} room={room} />
          </>
        )}
        {room.phase === 'lobby' &&
          (mode === 'horde' ? (
            <HordeLobbyOverlay
              playerCount={playerCount}
              isAdmin={isAdmin}
              onForceStart={
                isAdmin
                  ? () => connectionRef.current?.sendForceStart()
                  : undefined
              }
            />
          ) : mode === 'competitive' ? (
            <CompetitiveLobbyOverlay
              playerCount={playerCount}
              queue={competitiveQueue}
              isAdmin={isAdmin}
              searching={room.phase === 'lobby'}
              onForceStart={
                isAdmin
                  ? () => connectionRef.current?.sendForceStart()
                  : undefined
              }
            />
          ) : (
            <LobbyOverlay
              playerCount={playerCount}
              isAdmin={isAdmin}
              onForceStart={
                isAdmin
                  ? () => connectionRef.current?.sendForceStart()
                  : undefined
              }
            />
          ))}
        {room.phase === 'countdown' && (
          <>
            <CountdownOverlay
              countdownMs={room.countdownMs}
              mode={mode}
            />
          </>
        )}
        {(mode === 'competitive' || mode === 'horde') &&
          (room.buyPhaseMs ?? 0) > 0 &&
          !paused &&
          !editorOpen && (
            <WeaponShop
              buySecondsLeft={Math.max(0, Math.ceil((room.buyPhaseMs ?? 0) / 1000))}
              currentWeaponId={localPlayer?.weaponId}
              currentWeaponKind={localPlayer?.weaponKind}
              currentSkinId={localPlayer?.weaponSkinId}
              credits={localPlayer?.credits ?? 0}
              items={mapShopItemsToPresets(
                shopItemsForMode(
                  customDocRef.current,
                  mode === 'competitive' ? 'competitive' : 'horde'
                ),
                shopMetricCounts
              )}
              skins={mapShopSkinsToPresets(
                shopSkinsForMode(
                  customDocRef.current,
                  mode === 'competitive' ? 'competitive' : 'horde'
                )
              )}
              powerUps={mapPowerUpsToPresets(
                shopPowerUpsForMode(
                  customDocRef.current,
                  mode === 'competitive' ? 'competitive' : 'horde'
                )
              )}
              onBuy={(preset: WeaponPreset) => {
                connectionRef.current?.sendBuyWeapon({
                  itemId: preset.id,
                  kind: preset.kind,
                  damage: preset.damage,
                  range: preset.range,
                  cooldownMs: preset.cooldownMs,
                  coneRadians: preset.coneRadians,
                  fireMode: preset.fireMode,
                  pellets: preset.pellets,
                  adsZoomFov: preset.adsZoomFov,
                  adsConeScale: preset.adsConeScale,
                  hipfireConeScale: preset.hipfireConeScale,
                  magSize: preset.magSize,
                  reserveAmmo: preset.reserveAmmo,
                  reloadMs: preset.reloadMs,
                  modelUrl: preset.modelUrl?.startsWith('data:') ? undefined : preset.modelUrl,
                });
                const sid = localSessionRef.current;
                if (preset.modelUrl && sid) {
                  const view = charactersRef.current.get(sid);
                  const shopMode = mode === 'competitive' ? 'competitive' : 'horde';
                  const skinId = localPlayer?.weaponSkinId;
                  const equippedSkin = skinId
                    ? shopSkinsForMode(customDocRef.current, shopMode).find((s) => s.id === skinId)
                    : undefined;
                  void view?.equipWeaponMesh(preset.modelUrl, {
                    kind: preset.kind,
                    damage: preset.damage,
                    range: preset.range,
                    cooldownMs: preset.cooldownMs,
                    coneRadians: preset.coneRadians,
                    // Equipped weapon skin wins over the weapon's default texture.
                    textureUrl: equippedSkin?.textureUrl || preset.textureUrl,
                  });
                  if (view) {
                    view.syncedWeaponKey = `${preset.modelUrl}|${skinId || ''}|${preset.id}`;
                  }
                }
              }}
              onBuySkin={(skin) => {
                connectionRef.current?.sendBuyWeaponSkin(skin.id);
                const sid = localSessionRef.current;
                if (sid && skin.textureUrl) {
                  const view = charactersRef.current.get(sid);
                  void view?.applyWeaponSkinTexture(skin.textureUrl);
                }
              }}
              onBuyPowerUp={(pu) => {
                connectionRef.current?.sendBuyPowerUp(pu.id);
              }}
            />
          )}
        {room.phase === 'results' && localPlayer && (
          mode === 'horde' ? (
            <HordeResultsScreen room={room} player={localPlayer} onContinue={onExit} />
          ) : mode === 'competitive' ? (
            <CompetitiveResultsScreen
              room={room}
              player={localPlayer}
              players={playersRef.current}
              queue={competitiveQueue}
              onContinue={onExit}
            />
          ) : (
            <ResultsScreen room={room} player={localPlayer} onContinue={onExit} />
          )
        )}

        {room.phase === 'playing' && room.adminPaused && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-black/60 pointer-events-none">
            <div className="text-center">
              <p className="text-3xl font-black text-white tracking-wide drop-shadow-lg">
                MATCH PAUSED
              </p>
              <p className="text-sm text-white/70 mt-1">An admin has paused this match.</p>
            </div>
          </div>
        )}

        <JoystickOverlay joystickRef={joystickRef} enabled={isMobile && !paused} />
        <MobileActionButtons
          joystickRef={joystickRef}
          enabled={isMobile && room.phase === 'playing' && !paused}
        />
        {room.phase === 'playing' && !paused && !editorOpen && (
          <>
            <Crosshair visible={aiming && !paused && !editorOpen} style={tpsHud.crosshair} />
            {aiming && (localPlayer?.weaponAdsZoomFov ?? 0) > 20 && (
              <div
                className="pointer-events-none absolute inset-0 z-[120]"
                aria-hidden
                style={{
                  background:
                    'radial-gradient(circle at center, transparent 14%, rgba(0,0,0,0.55) 22%, rgba(0,0,0,0.88) 48%)',
                }}
              />
            )}
            <LiveChatOverlay
              registerOnChat={registerOnChat}
              sendChat={sendChatToRoom}
              disabled={gameMenuOpen || adminPanelOpen}
              adminMessage={room.adminMessage}
              adminMessageSeq={room.adminMessageSeq}
            />
          </>
        )}

        <GameMenu
          open={gameMenuOpen && !paused && !editorOpen}
          onClose={() => setGameMenuOpen(false)}
          userId={joinOptions.userId}
          username={joinOptions.username}
          avatarUrl={joinOptions.avatarUrl}
          progression={gameProgression.progression}
          loading={gameProgression.loading}
          upgrading={gameProgression.upgrading}
          error={gameProgression.error}
          onUpgrade={gameProgression.upgrade}
          powers={gameProgression.powers}
        />

        {!paused && !editorOpen && (
          <LevelUpPopup
            event={gameProgression.levelUpEvent}
            onDismiss={gameProgression.dismissLevelUp}
          />
        )}

        <Scoreboard
          open={scoreboardOpen && !paused && !editorOpen}
          playersRef={playersRef}
          localSessionIdRef={localSessionRef}
        />

        {isAdmin && (
          <AdminInGamePanel
            open={adminPanelOpen && !paused && !editorOpen}
            onClose={() => setAdminPanelOpen(false)}
            playersRef={playersRef}
            localSessionIdRef={localSessionRef}
            onKick={(sid) => connectionRef.current?.sendAdminKick(sid)}
            onMute={(sid, minutes) => connectionRef.current?.sendAdminMute(sid, minutes)}
            onBan={(sid) => connectionRef.current?.sendAdminBan(sid)}
          />
        )}

        {!paused && !editorOpen && !gameMenuOpen && gameProgression.hasUnspentPoints && (
          <div className="absolute top-3 right-16 pointer-events-auto z-[200]">
            <button
              onClick={() => setGameMenuOpen(true)}
              aria-label="Upgrade powers"
              title="Skill Points available — press M"
              className="w-11 h-11 rounded-xl shadow-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-2xl flex items-center justify-center animate-pulse"
            >
              +
            </button>
          </div>
        )}

        <PauseMenu
          open={paused && !editorOpen}
          isAdmin={isAdmin}
          onResume={resume}
          onOpenEditor={() => {
            setPaused(false);
            setEditorOpen(true);
          }}
          onToggleFullscreen={toggleFullscreen}
          onExit={onExit}
        />

        {editorOpen && isAdmin && (
          <MapEditor
            isAdmin={isAdmin}
            onClose={() => {
              setEditorOpen(false);
              setPaused(true);
            }}
          />
        )}

        {connectionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-[300]">
            <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center max-w-md mx-4">
              <h3 className="text-2xl font-black text-red-400 mb-2">Connection Failed</h3>
              <p className="text-slate-400 mb-6">{connectionError}</p>
              <Button variant="destructive" onClick={onExit}>
                Back to Menu
              </Button>
            </div>
          </div>
        )}

        {!paused && !editorOpen && (
          <div className="absolute top-3 right-3 pointer-events-auto z-[200]">
            <Button
              variant="destructive"
              size="icon"
              className="w-11 h-11 rounded-xl shadow-lg cursor-pointer"
              onClick={() => setPaused(true)}
              aria-label="Pause"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {!connectionError && connectionState === 'reconnecting' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[250] pointer-events-none">
            <div className="bg-amber-500/90 text-slate-950 text-sm font-bold px-4 py-1.5 rounded-full shadow-lg">
              Reconnecting to game server…
            </div>
          </div>
        )}
      </MobilePlayGate>
    </div>
  );
}
