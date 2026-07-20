'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoomState } from './net/use-room-state';
import type { JoinOptions } from './net/connection';
import type { NetObstacleState, NetPlatformState, PlayerInputMessage } from './net/types';
import { InputManager } from './input/input-manager';
import type { DualJoystick } from './input/dual-joystick';
import { createThreeWorld, updateFollowCamera } from './renderer/three-world';
import { ThreeCharacter } from './entities/three-character';
import { ThreeMap } from './entities/three-map';
import { CustomMapOverlay } from './entities/custom-map-overlay';
import { toThree } from './renderer/coords';
import {
  detectTouchDevice,
  CAMERA_YAW_KEY_SPEED,
  CAMERA_YAW_MOUSE_SENS,
  CAMERA_YAW_STICK_SENS,
  NETWORK_SEND_INTERVAL_MS,
  SPAWN_X,
  WORLD_HEIGHT,
} from './utils/constants';
import { HUD } from './ui/hud';
import { PauseMenu, useGameFullscreen } from './ui/pause-menu';
import { LobbyOverlay } from './modes/deathrun/lobby-overlay';
import { CountdownOverlay } from './modes/deathrun/countdown-overlay';
import { ResultsScreen } from './modes/deathrun/results-screen';
import { MobilePlayGate } from './ui/mobile-play-gate';
import { JoystickOverlay } from './ui/joystick-overlay';
import { MobileActionButtons } from './ui/mobile-action-buttons';
import { Crosshair } from './ui/crosshair';
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
  mapDocToSimButtons,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
} from './editor/prefab-storage';
import { loadMapPlayable } from './editor/map-storage';
import type { MapDocument } from './editor/map-document';
import type { KilrunMode } from '@/lib/game-modes';
import { getActiveCloudMapDocument } from '@/lib/game-map-actions';
import { HordeLobbyOverlay } from './modes/horde/lobby-overlay';
import { HordeResultsScreen } from './modes/horde/results-screen';
import { CompetitiveLobbyOverlay } from './modes/competitive/lobby-overlay';
import { CompetitiveResultsScreen } from './modes/competitive/results-screen';
import { ModeStatusHud } from './ui/mode-status-hud';
import type { GameRoomName } from './net/connection';

const MapEditor = dynamic(() => import('./editor/map-editor'), { ssr: false });

const PITCH_SENS = 0.0026;
const ZOOM = 5.8;

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
}

export default function KilrunEngine({
  joinOptions,
  onExit,
  xpProgress = 0,
  isAdmin = false,
  equippedSkins = null,
  mode = 'deathrun',
  competitiveQueue = 'casual',
}: KilrunEngineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const pausedRef = useRef(false);
  const roomName: GameRoomName =
    mode === 'competitive'
      ? competitiveQueue === 'ranked'
        ? 'competitive_ranked'
        : 'competitive'
      : mode;
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
  } = useRoomState(joinOptions, roomName);

  const isMobile = detectTouchDevice();
  const [assetsReady, setAssetsReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiming, setAiming] = useState(!detectTouchDevice());
  const aimingRef = useRef(!detectTouchDevice());
  const { toggle: toggleFullscreen } = useGameFullscreen(rootRef, true);
  const customDocRef = useRef<MapDocument | null>(null);
  const customLoadedRef = useRef(false);
  const cloudDocRef = useRef<MapDocument | null>(null);
  const equippedSkinsRef = useRef<SkinAttachment[] | null>(equippedSkins ?? null);
  equippedSkinsRef.current = equippedSkins ?? null;

  // Prefer cloud Active map for this mode (works for all clients), fall back to localStorage.
  useEffect(() => {
    let cancelled = false;
    void getActiveCloudMapDocument(mode)
      .then((cloud) => {
        if (cancelled || !cloud?.document) return;
        cloudDocRef.current = cloud.document;
        // Allow lobby effect to re-push if we already short-circuited on local-only miss.
        customLoadedRef.current = false;
      })
      .catch(() => {
        /* local fallback only */
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Push Active editor map for this mode to the server when lobby is ready
  useEffect(() => {
    if (room.phase === 'results') {
      customLoadedRef.current = false;
      return;
    }
    if (room.phase !== 'lobby' && room.phase !== 'countdown') return;
    if (customLoadedRef.current) return;
    if (!connectionRef.current?.sessionId) return;

    const resolveDoc = (): MapDocument | null => {
      if (cloudDocRef.current) return cloudDocRef.current;
      const mapId = getActivePlayMapIdForMode(mode);
      if (!mapId) return null;
      return loadMapPlayable(mapId);
    };

    const doc = resolveDoc();
    if (!doc) return;

    const platforms = mapDocToSimPlatforms(doc);
    if (!platforms.length) return;

    const obstacles = mapDocToSimHazards(doc);
    const finishes = mapDocToSimFinishes(doc);
    const buttons = mapDocToSimButtons(doc);
    const teleports = mapDocToSimTeleports(doc);
    const spawns = mapDocSpawnPoints(doc);
    const playerSpawns = mapDocPlayerSpawns(doc);
    const monsterSpawns = mapDocMonsterSpawns(doc);
    const teams = mapDocTeamSpawns(doc);
    const healthFloors = mapDocHealthFloors(doc);
    const redZones = mapDocRedZones(doc);
    const revivePads = mapDocRevivePads(doc);
    const worldBounds = mapDocToWorldBounds(doc, platforms, finishes);
    customDocRef.current = doc;
    customLoadedRef.current = true;
    connectionRef.current.sendLoadCustomMap({
      platforms,
      obstacles,
      finishes,
      buttons,
      teleports,
      spawn: spawns.runner ?? playerSpawns[0] ?? undefined,
      trapperSpawn: spawns.trapper ?? undefined,
      playerSpawns,
      monsterSpawns,
      teamASpawns: teams.teamA,
      teamBSpawns: teams.teamB,
      healthFloors,
      redZones,
      revivePads,
      worldBounds,
    });
  }, [room.phase, connectionRef, playerCount, connectionError, mode]);

  useEffect(() => {
    pausedRef.current = paused || editorOpen;
    if (paused || editorOpen) {
      if (document.pointerLockElement) document.exitPointerLock?.();
    }
  }, [paused, editorOpen]);

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

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) return;

    let disposed = false;
    let raf = 0;
    const world = createThreeWorld(hostElement);
    const activeId = getActivePlayMapIdForMode(mode);
    const localDoc = activeId ? loadMapPlayable(activeId) : null;
    const playDoc = cloudDocRef.current ?? localDoc;
    const hasCustomMap = Boolean(playDoc);
    const map = new ThreeMap(world.scene, { hardcodedDecor: !hasCustomMap });
    const overlay = new CustomMapOverlay(world.scene);
    const characters = new Map<string, ThreeCharacter>();
    const inputManager = new InputManager(hostElement, isMobile);
    joystickRef.current = inputManager.joystick;

    let cameraYaw = 0;
    let cameraPitch = 0.08;
    let sendAccumulatorMs = 0;
    let shootHeld = false;
    let wasShootEdge = false;
    let interactPulse = false;
    const targetPos = new THREE.Vector3(WORLD_HEIGHT / 2, 1, SPAWN_X);
    const overlayPlayerPos = new THREE.Vector3();

    if (playDoc) {
      customDocRef.current = playDoc;
      map.clearHardcodedDecor();
      void overlay.load(playDoc);
    }

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
        void map.upsertObstacle(index, obstacle);
      },
      onObstacleChange: (obstacle, index) => {
        void map.upsertObstacle(index, obstacle);
      },
      onObstacleRemove: (index) => {
        map.removeObstacle(index);
      },
      onPlatformAdd: (platform, index) => {
        void map.upsertPlatform(index, platform);
      },
      onPlatformChange: (platform, index) => {
        void map.upsertPlatform(index, platform);
      },
      onPlatformRemove: (index) => {
        map.removePlatform(index);
      },
    };

    playersRef.current.forEach((p, id) => spawnCharacter(id, p.username));
    platformsRef.current.forEach((p, i) => void map.upsertPlatform(i, p as NetPlatformState));
    obstaclesRef.current.forEach((o, i) => void map.upsertObstacle(i, o as NetObstacleState));

    const syncTimer = window.setInterval(() => {
      map.prunePlatforms(platformsRef.current.keys());
      map.pruneObstacles(obstaclesRef.current.keys());
      platformsRef.current.forEach((p, i) => void map.upsertPlatform(i, p));
      obstaclesRef.current.forEach((o, i) => void map.upsertObstacle(i, o));
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
        // Mouse right → look right; A → strafe left (signs verified)
        cameraYaw += inputManager.getCameraTurnIntent() * CAMERA_YAW_KEY_SPEED * dt;
        cameraYaw -= inputManager.consumeMouseLookDeltaX() * CAMERA_YAW_MOUSE_SENS;
        cameraPitch -= inputManager.consumeMouseLookDeltaY() * PITCH_SENS;
        if (isMobile && inputManager.isAiming()) {
          const aim = inputManager.joystick.getAimVector();
          cameraYaw -= aim.x * CAMERA_YAW_STICK_SENS * dt;
          cameraPitch -= aim.y * 0.9 * dt;
          if (!aimingRef.current) {
            aimingRef.current = true;
            setAiming(true);
          }
        } else if (isMobile) {
          if (aimingRef.current) {
            aimingRef.current = false;
            setAiming(false);
          }
        }
      } else {
        // Drain deltas so resume doesn't snap
        inputManager.consumeMouseLookDeltaX();
        inputManager.consumeMouseLookDeltaY();
      }
      cameraPitch = THREE.MathUtils.clamp(cameraPitch, -1.0, 0.78);

      const localSessionId = connectionRef.current?.sessionId;
      const localState = localSessionId ? playersRef.current.get(localSessionId) : undefined;

      characters.forEach((view, sessionId) => {
        const player = playersRef.current.get(sessionId);
        if (!player) return;
        view.update(player, dt, sessionId === localSessionId ? cameraYaw : player.cameraYaw);
      });
      map.update(dt);

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
      updateFollowCamera(world.camera, targetPos, cameraYaw, cameraPitch, dt, ZOOM);

      if (!frozen) {
        const shootNow = inputManager.isShootPressed() || inputManager.isAttackPressed();
        if (shootNow && !wasShootEdge && localSessionId) {
          const weaponAtt = findWeaponAttachment(equippedSkinsRef.current);
          const combat = resolveWeaponCombat(weaponAtt);
          characters
            .get(localSessionId)
            ?.triggerAttack(combat.attackStyle ?? 'attack');
        }
        wasShootEdge = shootNow;
        shootHeld = shootHeld || shootNow;
        sendAccumulatorMs += dtMs;
        if (sendAccumulatorMs >= NETWORK_SEND_INTERVAL_MS && localState) {
          sendAccumulatorMs = 0;
          const stick = inputManager.getMoveVector();
          const wishX = -stick.x;
          const wishZ = -stick.y;
          const cos = Math.cos(cameraYaw);
          const sin = Math.sin(cameraYaw);
          const threeMoveX = wishX * cos + wishZ * sin;
          const threeMoveZ = -wishX * sin + wishZ * cos;
          const moveX = threeMoveZ;
          const moveY = threeMoveX;

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
            interactPressed: inputManager.isInteractPressed(),
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
      overlay.destroy();
      map.destroy();
      world.destroy();
      joystickRef.current = null;
      inputManager.joystick.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              xpProgress={xpProgress}
              runnersLeft={runnersLeft}
              coins={Math.floor(xpProgress / 10)}
            />
            <ModeStatusHud mode={mode} room={room} />
          </>
        )}
        {room.phase === 'lobby' &&
          (mode === 'horde' ? (
            <HordeLobbyOverlay playerCount={playerCount} />
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
            <LobbyOverlay playerCount={playerCount} />
          ))}
        {room.phase === 'countdown' && <CountdownOverlay countdownMs={room.countdownMs} />}
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

        <JoystickOverlay joystickRef={joystickRef} enabled={isMobile && !paused} />
        <MobileActionButtons
          joystickRef={joystickRef}
          enabled={isMobile && room.phase === 'playing' && !paused}
        />
        {room.phase === 'playing' && !paused && !editorOpen && (
          <Crosshair visible={aiming || !isMobile} />
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
      </MobilePlayGate>
    </div>
  );
}
