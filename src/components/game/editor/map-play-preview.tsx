'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { MapDocument } from './map-document';
import { ensureCombatSettings, ensurePlatformMotion, DEFAULT_WEAPON_DEF } from './map-document';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '@shared/sim-constants';
import { isPlayerOverlappingObstacle } from '@shared/obstacle-hit';
import { emitPlaytest, runEntityPluginScripts } from '@/lib/engine/plugin-sdk';
import {
  HAMMER_SOLID_MODEL,
  ensureEnvironment,
  entityExportsAsPlatform,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
  suggestPlayerBindings,
  sanitizePlayerBindings,
} from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { AnimationDirector } from './animation-director';
import {
  applyTextureToObject,
  disposeClonedMaterials,
  disposeOwnedGeometry,
  markOwnsGpuResources,
  plantLocalFeet,
  resolveEntityTextureRepeat,
  shouldHideEntityInPlay,
} from './editor-mesh';
import {
  applyAuthoredEnvironment,
  applyEntityOpacity,
  applyEntityColor,
  applyEntityGlow,
  applyEntitySurfaceStyle,
  tickEntityGlow,
  tickSpinHazardVisual,
  makeAuthoredLight,
  makeGameplayFallback,
  shouldUseGameplayFallback,
} from './map-scene-visuals';
import { makeHammerSolidObject, defaultSizeForHammer, type HammerPrimitive } from './hammer-shapes';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';
import { playSound, playLoopedSound, stopLoopedSound, preloadSoundboard, setMasterVolume } from '../effects/soundboard';
import { PauseMenu, useGameFullscreen } from '../ui/pause-menu';
import {
  loadPlayerMatchSettings,
  savePlayerMatchSettings,
  type PlayerMatchSettings,
} from '../player-match-settings';
import {
  createSimScratch,
  invalidatePadSpatialCache,
  simToThree,
  stepPlatformer,
  type SimBody,
  type SimPad,
  type SimPhysicsOpts,
} from '@/lib/platformer-sim';
import { advanceMovingPads, applyPadCarry, movingPlatformU } from '@shared/moving-platform';
import {
  applyGhostPose,
  createGhostMesh,
  sampleGhostAt,
} from './ghost-replay';
import type { GhostSample } from '@/lib/ghost-actions';
import {
  mapDocSpawnPoints,
  mapDocToSimActions,
  mapDocToSimButtons,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
  prepareDocForPlayTest,
  getActivePlayMapIdForMode,
} from './prefab-storage';
import { loadMapPlayable } from './map-storage';
import { loadPlayerAvatar, getMapPlayerAvatar, fitAvatarLikeEditor, avatarAuthoredScale } from './player-avatar';
import { applyTeamTint } from '@/lib/premium-skin-config';
import { BODY_COLOR_RED, BODY_COLOR_BLUE } from '@/lib/body-colors';
import { updateFollowCamera } from '../renderer/three-world';
import { createBloomComposer } from '../renderer/bloom-composer';
import { applySkinAttachments, tickSkinAttachments } from './skin-attachments';
import { applyArmsOnlyMeshVisibility } from '../entities/arms-only';
import {
  findWeaponAttachment,
  resolveWeaponCombat,
} from '@/lib/weapons';
import { Crosshair } from '../ui/crosshair';
import {
  activateAbility,
  tickActiveAbilityTimers,
  isFlyActive,
  isBerserkActive,
  isUnlimitedAmmoActive,
  isInvisibleActive,
  defaultAbilityHostState,
  type AbilityHost,
} from '@shared/active-abilities';
import {
  getActivePowerDefinitions,
  applyDynamicPowerDefinitions,
  getAbilitySlotKind,
  getEnergyCostForAbility,
  getCooldownForAbility,
  type AbilitySlotKind,
} from '@shared/power-definitions';
import { AbilityRingIcon } from '../ui/ability-hud';
import { getKeyBindings } from '@/lib/key-bindings-config';
import { DEFAULT_KEY_BINDINGS, eventMatchesBind, formatBindKey, keyBindToCodes, type KeyBindAction } from '@shared/key-bindings';
import { customMoveSoundKey } from '@shared/custom-moves';

const ABILITY_UI_FIELDS: Record<AbilitySlotKind, { endsAt: string; cooldownEndsAt: string }> = {
  visibility: { endsAt: 'visibilityEndsAt', cooldownEndsAt: 'visibilityCooldownEndsAt' },
  fly: { endsAt: 'flyEndsAt', cooldownEndsAt: 'flyCooldownEndsAt' },
  berserk: { endsAt: 'berserkEndsAt', cooldownEndsAt: 'berserkCooldownEndsAt' },
  bullet: { endsAt: 'bulletEndsAt', cooldownEndsAt: 'bulletCooldownEndsAt' },
  hook: { endsAt: 'hookEndsAt', cooldownEndsAt: 'hookCooldownEndsAt' },
  backflip: { endsAt: 'backflipEndsAt', cooldownEndsAt: 'backflipCooldownEndsAt' },
  thunder: { endsAt: 'thunderEndsAt', cooldownEndsAt: 'thunderCooldownEndsAt' },
};
import {
  mouseSensRadians,
  resolvePlatformTpsView,
  sanitizeTpsView,
  type TpsViewSettings,
} from '../tps/tps-view-settings';
import {
  computeLocomotionFacingYaw,
  stepBodyYaw,
} from '../tps/locomotion-facing';

const SHOW_COLLISION_DEBUG = false;

function applyWeaponSlotPose(
  root: THREE.Object3D,
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number]
) {
  const hits: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData?.isWeaponSkin) hits.push(o);
  });
  const holder = hits[0];
  if (!holder) return;
  holder.position.set(...position);
  const mesh =
    holder.children[0] && !holder.children[0].userData?.isWeaponSkin
      ? holder.children[0]
      : holder;
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rotation[0]),
    THREE.MathUtils.degToRad(rotation[1]),
    THREE.MathUtils.degToRad(rotation[2])
  );
  mesh.scale.set(...scale);
}

function addCollisionPadMeshes(scene: THREE.Scene, pads: SimPad[]) {
  const group = new THREE.Group();
  group.name = '__play_pads__';
  for (const pad of pads) {
    const h = Math.max(0.18, pad.height ?? 0.25);
    const [tx, ty, tz] = simToThree(pad.x, pad.y, pad.z);
    // sim width → Three Z, sim depth → Three X; pad.z is the standable top
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(pad.depth, h, pad.width),
      new THREE.MeshStandardMaterial({
        color:
          pad.kind === 'jumpPad'
            ? 0xf59e0b
            : pad.kind === 'checkpoint'
              ? 0x34d399
              : pad.kind === 'finish'
                ? 0xfbbf24
                : 0x4b6b8a,
        roughness: 0.85,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
      })
    );
    mesh.position.set(tx, ty - h * 0.5, tz);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

function placeholderForEntity(ent: MapDocument['entities'][number]): THREE.Object3D {
  return (
    makeGameplayFallback(ent) ??
    (() => {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
          color: ent.color ? new THREE.Color(ent.color) : 0x888888,
        })
      );
      box.position.y = 0.5;
      return box;
    })()
  );
}

function shouldUsePlaceholder(
  ent: MapDocument['entities'][number],
  reason: 'missing-model' | 'load-failed'
): boolean {
  if (isInvisibleMarkerKind(ent.kind)) return false;
  return shouldUseGameplayFallback(ent, reason);
}

function snapBodyToPads(body: SimBody, pads: SimPad[]) {
  if (!pads.length) return;
  let best: SimPad | null = null;
  let bestDist = Infinity;
  for (const pad of pads) {
    if (pad.doorControlled && pad.open) continue;
    const dx = body.x - pad.x;
    const dy = body.y - pad.y;
    const planar = Math.hypot(dx, dy);
    const halfW = pad.width / 2 + 0.5;
    const halfD = pad.depth / 2 + 0.5;
    if (Math.abs(dx) > halfW || Math.abs(dy) > halfD) {
      if (planar < bestDist) {
        bestDist = planar;
        best = pad;
      }
      continue;
    }
    body.z = pad.z;
    body.vz = 0;
    body.isGrounded = true;
    return;
  }
  if (best) {
    body.x = best.x;
    body.y = best.y;
    body.z = best.z;
    body.vz = 0;
    body.isGrounded = true;
  }
}

/**
 * Play Test uses the same pad export + platformer step as Deathrun match.
 * Camera is Fortnite-style TPS: body visible, screen-center crosshair = aim.
 */
export function MapPlayPreview({
  doc,
  onClose,
  embedded = false,
  tpsViewOverride,
  previewSkins = true,
  mapId,
  playTestRole,
}: {
  doc: MapDocument;
  onClose?: () => void;
  embedded?: boolean;
  tpsViewOverride?: TpsViewSettings | null;
  previewSkins?: boolean;
  /** Stable id for ghost WR (local or cloud map id). */
  mapId?: string;
  /** Which spawn to test from — Deathrun runner/trapper, Competitive team A/B.
   * Falls back to the runner/default spawn when omitted (Horde has no roles). */
  playTestRole?: 'runner' | 'trapper' | 'team_a' | 'team_b';
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [matchSettings, setMatchSettings] = useState<PlayerMatchSettings>(() => loadPlayerMatchSettings());
  const matchSettingsRef = useRef(matchSettings);
  matchSettingsRef.current = matchSettings;
  const { toggle: toggleFullscreen } = useGameFullscreen(shellRef, false);
  useEffect(() => {
    emitPlaytest('ready', { mapId });
    return () => emitPlaytest('exit', { mapId });
  }, [mapId]);
  const joystickRef = useRef<DualJoystick | null>(null);
  // Admin-configured global scheme (Map Editor → Controls) — same source
  // live matches use (kilrun-engine.tsx), so Play Test never drifts.
  // Defaults apply until the async fetch resolves.
  const [bindings, setBindings] = useState<Record<KeyBindAction, string>>(DEFAULT_KEY_BINDINGS);
  const bindingsRef = useRef<Record<KeyBindAction, string>>(DEFAULT_KEY_BINDINGS);
  bindingsRef.current = bindings;
  useEffect(() => {
    let cancelled = false;
    getKeyBindings()
      .then((b) => {
        if (!cancelled) setBindings(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setMasterVolume(matchSettings.masterVolume);
  }, [matchSettings.masterVolume]);

  useEffect(() => {
    if (paused && document.pointerLockElement) document.exitPointerLock?.();
  }, [paused]);
  const physOpts = useMemo<SimPhysicsOpts>(() => {
    const cs = ensureCombatSettings(doc);
    return {
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
      customMoves: doc.customMoves,
    };
  }, [doc]);
  const physOptsRef = useRef(physOpts);
  physOptsRef.current = physOpts;
  const resolvedTps = useMemo(() => {
    if (tpsViewOverride) return sanitizeTpsView(tpsViewOverride);
    const deathrunId = getActivePlayMapIdForMode('deathrun');
    const deathrunDoc = deathrunId ? loadMapPlayable(deathrunId) : null;
    return resolvePlatformTpsView({
      modeMapOverride: doc.tpsView as TpsViewSettings | null | undefined,
      deathrunMapOverride: deathrunDoc?.tpsView ?? null,
    });
  }, [doc.tpsView, tpsViewOverride]);
  const tpsRef = useRef<TpsViewSettings>(resolvedTps);
  const onCloseRef = useRef(onClose);
  const [hp, setHp] = useState(100);
  const [energyUi, setEnergyUi] = useState(100);
  const [abilityUi, setAbilityUi] = useState(() => defaultAbilityHostState());
  // Live text readout of player Z vs. the nearest collision pad's top —
  // lets you SEE the exact sink/float amount on screen (e.g. "legs inside
  // the mesh") without needing DevTools open. Remove once collision
  // accuracy issues are resolved.
  const [debugHud, setDebugHud] = useState('');
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStartNote, setAutoStartNote] = useState(false);
  const [tpsHud, setTpsHud] = useState<TpsViewSettings>(() => resolvedTps);
  const [aimingHud, setAimingHud] = useState(false);
  const [showGhost, setShowGhost] = useState(true);
  const [ghostLabel, setGhostLabel] = useState<string | null>(null);
  const [ghostResult, setGhostResult] = useState<string | null>(null);
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();
  const showGhostRef = useRef(showGhost);
  showGhostRef.current = showGhost;

  useEffect(() => {
    tpsRef.current = resolvedTps;
    setTpsHud(resolvedTps);
  }, [resolvedTps]);

  // Hydrate the shared power-definitions registry with live (admin-tuned)
  // data once, so Play Test's power activations use the same numbers a real
  // match would instead of the static fallback defaults. Best-effort — the
  // static fallback (already loaded at module init) covers powers fine if
  // this fetch fails.
  useEffect(() => {
    let cancelled = false;
    import('@/lib/game-progression-actions')
      .then(({ getPowerDefinitionsForMenu }) => getPowerDefinitionsForMenu())
      .then((records) => {
        if (!cancelled && Array.isArray(records) && records.length > 0) {
          applyDynamicPowerDefinitions(records);
        }
      })
      .catch(() => {
        /* keep static fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    preloadSoundboard();
    setHp(100);
    setFinished(false);
    setLoading(true);
    setAutoStartNote(false);
    setAimingHud(false);
    setGhostLabel(null);
    setGhostResult(null);

    const prepared = prepareDocForPlayTest(doc);
    const playDoc = prepared.doc;
    if (prepared.autoStart) setAutoStartNote(true);

    const initialTps = tpsRef.current;
    setTpsHud(initialTps);

    let disposed = false;
    const scene = new THREE.Scene();
    const env = ensureEnvironment(playDoc);

    // near/far match createThreeWorld's live-engine camera (three-world.ts)
    // so Play Test's close-clip and fog/far cutoff preview what live
    // actually looks like instead of a slightly different render volume.
    const camera = new THREE.PerspectiveCamera(initialTps.camera.fov, 1, 0.15, 220);
    const pads = mapDocToSimPlatforms(playDoc).map((p, i) => ({
      ...p,
      id: p.entityId || `pad_${i}`,
      homeX: p.x,
      homeY: p.y,
      homeZ: p.z,
      open: false,
    }));
    const buttons = mapDocToSimButtons(playDoc);
    const actions = mapDocToSimActions(playDoc);
    const lastZonePressAt = new Map<string, number>();
    const armedUntil = new Map<string, number>();
    if (SHOW_COLLISION_DEBUG) {
      // eslint-disable-next-line no-console
      console.table(
        pads.map((p) => ({
          id: p.id,
          kind: p.kind,
          x: +p.x.toFixed(2),
          y: +p.y.toFixed(2),
          z: +p.z.toFixed(2),
          width: +p.width.toFixed(2),
          depth: +p.depth.toFixed(2),
          height: +(p.height ?? 0).toFixed(2),
        }))
      );
    }
    const finishes = mapDocToSimFinishes(playDoc);
    const hazards = mapDocToSimHazards(playDoc);
    const teleports = mapDocToSimTeleports(playDoc);
    const bounds = mapDocToWorldBounds(playDoc, pads, finishes);
    const spawnPoints = mapDocSpawnPoints(playDoc);
    const roleSpawn =
      playTestRole === 'trapper'
        ? spawnPoints.trapper
        : playTestRole === 'team_a'
          ? spawnPoints.teamA
          : playTestRole === 'team_b'
            ? spawnPoints.teamB
            : null;
    // Fall back to the runner/default spawn if the chosen role has no
    // dedicated spawn placed on this map yet — never a hard failure.
    const spawn = roleSpawn ?? spawnPoints.runner;
    const teleportCooldownUntil = new Map<string, number>();
    // Mirrors DeathrunRoom's obstacleTimers: an ms-in-current-phase counter
    // driven by fixed sim dt (not wall clock), so a hazard flips on/off at
    // the same simulated moment in Play Test as it does in the live match —
    // wall-clock timing would drift out of sync with match-time-driven
    // systems (moving platforms, matchElapsedMs-based ghost sampling) any
    // time a frame hitches.
    const hazardTimers = new Map<string, number>();
    const hazardActive = new Map<string, boolean>();
    for (const h of hazards) {
      if (h.alwaysActive || h.buttonControlled) continue;
      hazardTimers.set(h.id, 0);
      hazardActive.set(h.id, false);
    }

    const body: SimBody = {
      x: spawn?.x ?? 0,
      y: spawn?.y ?? 0,
      z: spawn?.z ?? 0,
      vz: 0,
      isGrounded: true,
      energy: 100,
    };
    snapBodyToPads(body, pads);
    // Fixed-timestep interpolation state (see FIXED_DT / accumulator below):
    // the pose from the tick BEFORE the most recently completed one, so the
    // render can smoothly blend between two known simulated poses instead of
    // snapping straight to `body` — which only actually moves once per 30Hz
    // physics tick and reads as a stutter/slideshow on higher-refresh
    // displays, worse the faster you move (sprint covers more distance per
    // stuck-then-jump step).
    let lastDebugAt = 0;
    let prevSimX = body.x;
    let prevSimY = body.y;
    let prevSimZ = body.z;

    {
      const [sx, sy, sz] = simToThree(body.x, body.y, body.z);
      camera.position.set(sx, sy + 6.5, sz - 9);
      camera.lookAt(sx, sy + 1.1, sz);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated in this three.js version — the renderer
    // already silently substitutes PCFShadowMap for it (with a console
    // warning every frame setup). Request PCFShadowMap directly: identical
    // rendered result, no warning.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

    const bloom = createBloomComposer(renderer, scene, camera);

    const ambient = new THREE.AmbientLight(0xffffff, env.ambientIntensity ?? 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2d6, env.sunIntensity ?? 1.15);
    sun.position.set(10, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    // Without a bias, a 2048px map spread over a 90-unit shadow frustum is
    // coarse enough (~0.044 world units/texel) that large flat surfaces
    // self-shadow into visible banding/striping ("shadow acne") — exactly
    // what large flat prop faces (walls, archways) showed. normalBias offsets
    // the shadow sample along the surface normal rather than view depth, so
    // it doesn't introduce the peter-panning (shadow detaching from its
    // caster) a plain depth bias this large would.
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.045;
    scene.add(sun);
    const hemi = new THREE.HemisphereLight(0x88aacc, 0x1a2740, 0.45);
    scene.add(hemi);

    // Match editor floor semantics (grid/solid/water/void) — no fake opaque plane over void.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: env.floorColor || '#1a2740',
        roughness: 1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    markOwnsGpuResources(floor);
    scene.add(floor);

    const envHandle = applyAuthoredEnvironment(scene, env, {
      lights: { ambient, sun, hemi },
      floorMesh: floor,
      // Cap fog only for non-void floors so World-tab void fog/shadow settings
      // still match the editor. Non-void playtest keeps a lighter fog for
      // readability on dense maps.
      maxFogDensity: env.floor === 'void' ? undefined : 0.014,
    });

    // Collision pads are sim-only; enable this when debugging exported platform volumes.
    if (SHOW_COLLISION_DEBUG) addCollisionPadMeshes(scene, pads);

    const director = new AnimationDirector();
    const roots = new Map<string, THREE.Object3D>();
    // TPS camera wall-avoidance raycast target list (see updateFollowCamera's
    // `collidables` option) — built once after entity placement finishes
    // below, filtered to genuinely solid entities only.
    let cameraCollidables: THREE.Object3D[] = [];
    const motionVisual = new Map<
      string,
      {
        rest: [number, number, number];
        offset: [number, number, number];
        periodMs: number;
        phaseMs: number;
      }
    >();
    const ghostMesh = createGhostMesh();
    markOwnsGpuResources(ghostMesh);
    scene.add(ghostMesh);
    let wrSamples: GhostSample[] = [];
    const recordedSamples: GhostSample[] = [];
    let lastGhostSampleAt = 0;
    let ghostSubmitted = false;
    let matchElapsedMs = 0;
    let playerRoot: THREE.Object3D | null = null;
    let playerId: string | null = null;
    let playerBaseScale: [number, number, number] = [1, 1, 1];
    let bodyYaw = 0;
    let aimHeld = false;
    let aimHeldUi = false;
    let hpLocal = 100;
    // Set every frame inside the powers block below, read by the void-fall
    // check further down (out of that block's scope) so Fly's free-form
    // descent doesn't trip the "fell off the map" handler.
    let flyActiveNow = false;
    const lastDamageAt = new Map<string, number>();

    // Powers (visibility/fly/hook/berserk/bullet/thunder/backflip-dash) —
    // Play Test intentionally treats every power as unlocked at max level
    // (no real account/skill-tree context here) so a map author can freely
    // test all of them, per product decision. Shares the exact same
    // activation/cooldown/effect logic as live matches via
    // shared/active-abilities.ts — only the "host" object differs (plain
    // object here vs. the Colyseus PlayerState schema in a real match).
    const abilityHost: AbilityHost = {
      isAlive: true,
      hasFinished: false,
      energy: 100,
      x: 0,
      y: 0,
      vz: 0,
      aimAngle: 0,
      isInvisible: false,
      ability: defaultAbilityHostState(),
    };
    const ABILITY_KEYS = ['hook', 'berserk', 'bullet', 'thunder', 'visibility', 'fly', 'backflip'] as const;
    const abilityWasHeld = new Map<string, boolean>();
    // Play Test = every power "unlocked" at max level (no skill-tree context
    // here). Recomputed each call (not cached) since the power-definitions
    // hydration fetch (separate effect) can resolve after this sim starts.
    const abilityLevelsMaxed = (): Record<string, number> =>
      Object.fromEntries(getActivePowerDefinitions().map((def) => [def.key, def.maxLevel]));
    let abilityHudCounter = 0;
    const pushAbilityUiState = () => {
      setEnergyUi(Math.round(body.energy));
      setAbilityUi({ ...abilityHost.ability });
    };

    const keys = new Set<string>();
    let yaw = 0;
    let pitch = initialTps.camera.defaultPitch;
    let interactPulse = false;
    let attackPulse = false;
    let lastAttackAt = 0;
    let raf = 0;
    const scratch = createSimScratch();
    let finishedLocal = false;
    let checkpoint: { x: number; y: number; z: number } | null = null;
    let wasGrounded = true;
    let wasSprintingForSound = false;
    let wasFlippingForSound = false;
    let wasSlidingForSound = false;
    let wasCrouchingForSound = false;
    let wasAliveForSound = true;
    let lastFootstepAt = 0;
    let wasInvisibleForMaterial = false;
    let lastCustomMoveId = '';
    let landUntil = 0;
    let meleeUntil = 0;
    let recoilPitch = 0;
    let shakeAmp = 0;
    let weaponKick = 0;
    let lastHpForShake = hpLocal;
    const avatarEntity = getMapPlayerAvatar(playDoc) ?? null;
    let avatarBindings = avatarEntity?.playerAnims;
    let worldReady = false;

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      bloom.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const loadAll = async () => {
      try {
        const previewAttachments = (
          previewSkins && avatarEntity?.playerSkins?.length ? avatarEntity.playerSkins : []
        ).map((a) => {
          const def = playDoc.weaponDef;
          if (!def || a.slot !== 'weapon') return a;
          const merged = { ...DEFAULT_WEAPON_DEF, ...def };
          return {
            ...a,
            attachMode: 'body' as const,
            position: merged.holdPosition,
            rotation: merged.holdRotation,
            scale: merged.holdScale,
          };
        });
        // Always keep the default pack player as the base. Body / fullbody /
        // clothing skins layer via applySkinAttachments — fullbody must never
        // replace the whole avatar (it stays over the default model).
        const loaded = await loadPlayerAvatar(avatarEntity, null);
        if (disposed) return;
        if (previewAttachments.length) {
          await applySkinAttachments(loaded.scene, previewAttachments);
          if (disposed) return;
        }
        // Trapper/team_a render red, runner/team_b (and default solo) render blue —
        // matches server-assigned bodyColorIndex behavior in live Deathrun/Competitive.
        applyTeamTint(
          loaded.scene,
          playTestRole === 'trapper' || playTestRole === 'team_a' ? BODY_COLOR_RED : BODY_COLOR_BLUE,
          { preferEmissive: false }
        );
        // Same 1.75m planted fit used by player and skin studios.
        const root = fitAvatarLikeEditor(loaded.scene, avatarEntity, loaded.isDefaultMannequin);
        if (ensureCombatSettings(playDoc).armsOnlyMode) {
          applyArmsOnlyMeshVisibility(root, true);
        }
        const [px, py, pz] = simToThree(body.x, body.y, body.z);
        root.position.set(px, py, pz);
        root.userData.entityId = avatarEntity?.id ?? '__play_avatar__';
        root.userData.isPlayAvatar = true;
        scene.add(root);
        playerRoot = root;
        playerBaseScale = avatarAuthoredScale(avatarEntity);
        playerId = avatarEntity?.id ?? '__play_avatar__';
        director.register(playerId, root, loaded.animations);
        if (!avatarBindings || Object.keys(avatarBindings).length === 0) {
          avatarBindings = suggestPlayerBindings(loaded.clipNames);
        } else {
          avatarBindings = sanitizePlayerBindings(avatarBindings, loaded.clipNames);
        }
        if (avatarEntity) {
          if (!avatarEntity.playerAnims || Object.keys(avatarEntity.playerAnims).length === 0) {
            avatarEntity.playerAnims = avatarBindings;
          }
          if (!avatarEntity.animation?.availableClips?.length) {
            avatarEntity.animation = {
              ...(avatarEntity.animation ?? {
                availableClips: [],
                trigger: 'none',
                radius: 2.5,
                loopActive: false,
                loopDefault: true,
              }),
              availableClips: loaded.clipNames,
            };
          }
        }
      } catch (err) {
        console.warn('[PlayPreview] avatar load failed', err);
        // Guaranteed visible body so Play Test never feels empty / first-person
        const fallback = new THREE.Mesh(
          new THREE.CapsuleGeometry(PLAYER_RADIUS, 0.95, 4, 10),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
        );
        fallback.position.y = 0.85;
        const wrap = new THREE.Group();
        wrap.add(fallback);
        markOwnsGpuResources(wrap);
        const [px, py, pz] = simToThree(body.x, body.y, body.z);
        wrap.position.set(px, py, pz);
        scene.add(wrap);
        playerRoot = wrap;
        playerBaseScale = [1, 1, 1];
        playerId = '__play_avatar_fallback__';
      }

      for (const ent of playDoc.entities) {
        if (disposed) return;
        if (shouldHideEntityInPlay(ent) || isInvisibleMarkerKind(ent.kind)) continue;
        if (ent.kind === 'light') {
          scene.add(makeAuthoredLight(ent));
          continue;
        }
        const placeVisual = (visual: THREE.Object3D, clips: THREE.AnimationClip[] = []) => {
          const planted = new THREE.Group();
          planted.add(visual);
          applyTextureToObject(
            planted,
            ent.textureUrl || playDoc.environment?.defaultTextureUrl,
            {
              repeat: resolveEntityTextureRepeat(ent),
              offset: ent.textureOffset,
              rotation: ent.textureRotation,
              onApplied: () => applyEntitySurfaceStyle(planted, ent),
            }
          );
          applyEntityOpacity(planted, ent.opacity);
          applyEntityColor(planted, ent.color);
          applyEntityGlow(planted, ent.glow, ent.color);
          planted.position.set(...ent.position);
          planted.rotation.set(
            THREE.MathUtils.degToRad(ent.rotation[0]),
            THREE.MathUtils.degToRad(ent.rotation[1]),
            THREE.MathUtils.degToRad(ent.rotation[2])
          );
          planted.scale.set(...ent.scale);
          planted.userData.entityId = ent.id;
          // Lets the camera wall-avoidance raycast below filter to only
          // genuinely solid entities (entityExportsAsPlatform) once
          // placement finishes, same convention as CustomMapOverlay's live
          // equivalent.
          planted.userData.editorEntity = ent;
          scene.add(planted);
          roots.set(ent.id, planted);
          const motion = ensurePlatformMotion(ent);
          if (motion.enabled) {
            motionVisual.set(ent.id, {
              rest: [...ent.position] as [number, number, number],
              offset: [...(motion.offset ?? [0, 0, 4])] as [number, number, number],
              periodMs: motion.periodMs,
              phaseMs: motion.phaseMs,
            });
          }
          if (clips.length) {
            director.register(ent.id, planted, clips);
            if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
              director.playDefault(ent);
            }
          }
        };

        if (isHammerSolidEntity(ent) || ent.model === HAMMER_SOLID_MODEL) {
          const shape = (ent.primitive as HammerPrimitive) || 'box';
          const size = ent.collisionSize ?? defaultSizeForHammer(shape);
          const hammerVisual = makeHammerSolidObject(shape, size, ent.color || '#64748b');
          markOwnsGpuResources(hammerVisual);
          placeVisual(hammerVisual);
          continue;
        }

        const src = resolveModelSrc(ent.model, ent.customModelUrl);
        try {
          if (src) {
            // NOT tagged __ownsGpuResources — geometry is shared with
            // loadAnimatedPrefab's module-level cache, never safe to dispose.
            const { root, clips } = await loadAnimatedPrefab(src);
            // Closing Play Test (or a rapid doc/map switch) mid-load lands
            // here after teardown already ran — the avatar load above already
            // guards this same race, this path didn't. Without it, this adds
            // fresh geometry into a scene nothing will ever dispose again.
            if (disposed) return;
            plantLocalFeet(root);
            placeVisual(root, clips);
            continue;
          }

          if (!shouldUsePlaceholder(ent, 'missing-model')) continue;
          const placeholder = placeholderForEntity(ent);
          markOwnsGpuResources(placeholder);
          placeVisual(placeholder);
        } catch (err) {
          console.warn('[PlayPreview] skip', ent.name, err);
          if (!shouldUsePlaceholder(ent, 'load-failed')) continue;
          try {
            const placeholder = placeholderForEntity(ent);
            markOwnsGpuResources(placeholder);
            placeVisual(placeholder);
          } catch {
            /* ignore */
          }
        }
      }

      for (const ent of playDoc.entities) {
        if (ent.visible === false || ent.kind !== 'action') continue;
        const ghost = new THREE.Group();
        ghost.visible = false;
        ghost.position.set(...ent.position);
        ghost.userData.entityId = ent.id;
        scene.add(ghost);
        roots.set(ent.id, ghost);
        director.register(ent.id, ghost, []);
      }

      cameraCollidables = [];
      roots.forEach((root) => {
        const ent = root.userData.editorEntity as MapDocument['entities'][number] | undefined;
        if (ent && entityExportsAsPlatform(ent)) cameraCollidables.push(root);
      });

      if (!disposed) {
        worldReady = true;
        setLoading(false);
        if (mapId) {
          void (async () => {
            try {
              const { getMapWorldRecord } = await import('@/lib/ghost-actions');
              const wr = await getMapWorldRecord(mapId);
              if (disposed || !wr?.samples?.length) return;
              wrSamples = wr.samples;
              const sec = (wr.finishMs / 1000).toFixed(2);
              setGhostLabel(`WR ${wr.username} · ${sec}s`);
            } catch {
              /* guest / no table yet */
            }
          })();
        }
      }
    };
    void loadAll();

    if (!embedded) host.requestPointerLock?.().catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      // Embedded mode (TpsViewStudio) renders this next to native <input
      // type="range"> sliders — without this, arrow-keying a slider also
      // moved the player, and Escape force-closed the preview out from under
      // whatever else on the page had focus. Only guards keydown (new
      // actions); keyup below always clears so a key held before the input
      // gained focus can't get stuck "down" once it's released.
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const isRangeSlider = tag === 'INPUT' && (active as HTMLInputElement).type === 'range';
      // A focused <input type="range"> (TpsViewStudio's sliders, right next
      // to the embedded canvas) only actually conflicts with Left/Right/
      // Up/Down — those also nudge the slider's value. Blocking ALL keys
      // here (as before) meant that after dragging any slider, Space/G/WASD
      // silently did nothing — not because the game ignored them, but
      // because this guard never even added them to `keys` — until the
      // player clicked back onto the canvas to steal focus. Real text
      // inputs/textareas still block everything (typing would otherwise
      // fight with movement).
      if (isRangeSlider) {
        if (e.code.startsWith('Arrow')) return;
      } else if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) {
        return;
      }
      // Space/arrows default to page-scroll, and Space additionally
      // re-clicks whatever <button> last had focus (e.g. the "Play Test"
      // trigger, or a role-prompt button) since browsers treat Space as
      // "activate the focused control" for buttons. Both silently eat the
      // jump/slide/move keypress before the game ever sees it register as
      // a *problem* — the key event still reaches this handler and `keys`
      // still gets the code, but the browser's side effect (scroll, or a
      // stray re-click) makes it look like the action "did nothing".
      if (tag === 'BUTTON' || tag === 'A') active?.blur();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!embedded && eventMatchesBind(e, bindingsRef.current.pause)) {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      if (pausedRef.current) return;
      keys.add(e.code);
      if (keyBindToCodes(bindingsRef.current.interact).includes(e.code)) interactPulse = true;
      if (e.code === 'KeyF' || e.code === 'Mouse0') attackPulse = true;
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: MouseEvent) => {
      // Mouse looks only while locked — WASD/Space/Ctrl never touch the camera.
      if (document.pointerLockElement !== host && document.pointerLockElement !== document.body) {
        return;
      }
      const liveTps = tpsRef.current;
      const mouseSens = mouseSensRadians(liveTps) * matchSettingsRef.current.mouseSensMult;
      yaw -= (e.movementX || 0) * mouseSens;
      pitch -= (e.movementY || 0) * mouseSens;
      pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (embedded && e.target instanceof Node && !host.contains(e.target)) return;
      // Clicking into the canvas reclaims keyboard focus from a still-
      // focused slider (see onKeyDown's range-slider carve-out above) —
      // without this, clicking the canvas after dragging a slider left the
      // slider focused, so the very first Space/G press after that click
      // could still be swallowed even though the click itself lands on
      // the game.
      (document.activeElement as HTMLElement | null)?.blur();
      if (e.button === 0) {
        attackPulse = true;
        host.requestPointerLock?.().catch(() => {});
      }
      if (e.button === 2) {
        aimHeld = true;
        host.requestPointerLock?.().catch(() => {});
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) aimHeld = false;
    };
    const onBlur = () => {
      aimHeld = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    host.addEventListener('contextmenu', onContextMenu);

    let joy: DualJoystick | null = null;
    if (detectTouchDevice()) {
      joy = new DualJoystick(host);
      joystickRef.current = joy;
    }

    // THREE.Clock is deprecated in this three.js version in favor of Timer —
    // same getDelta()-in-seconds contract, but Timer requires an explicit
    // update() call per frame before reading it (see tick() below).
    const clock = new THREE.Timer();
    const playerPos = new THREE.Vector3();
    let smoothCamY: number | null = null;
    // Separate from smoothCamY: that softening was written for the old
    // stepped-shelf ramp approximation to keep the CAMERA from feeling
    // jerky hopping between shelves. Ramps are now true continuous analytic
    // slopes, so the softening is no longer needed for correctness — but it
    // was also being applied to the PLAYER MESH's own rendered height,
    // which made the visible character lag behind the real (already
    // correct) ramp height while walking uphill, sinking the legs into the
    // ramp. The camera can keep its cinematic lag; the mesh must not.
    let meshY: number | null = null;
    // Fixed 30 Hz physics timestep, matching the Colyseus server tick — see
    // TICK_DT_MS in shared/sim-constants.ts. Play Test used to step physics
    // once per *rendered* frame with a variable dt (0-50ms depending on
    // framerate), which is a different simulation than the server's fixed
    // 33.33ms steps: jump arcs, coyote/buffer windows, and platform carry all
    // integrate differently at a variable rate, so a course that cleared here
    // could play differently live. Rendering (camera, mesh smoothing,
    // animation) still runs every frame for visual smoothness — only the
    // simulation itself is decoupled onto the fixed-rate accumulator below.
    const FIXED_DT = 1 / 30;
    let accumulator = 0;
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      clock.update();
      const frameDt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      if (pausedRef.current) {
        if (matchSettingsRef.current.bloom) bloom.render();
        else renderer.render(scene, camera);
        return;
      }

      for (const ent of playDoc.entities) {
        if (ent.glow?.enabled && ent.glow.pulse && ent.glow.pulse !== 'none') {
          const r = roots.get(ent.id);
          if (r) tickEntityGlow(r, ent.glow, now);
        }
        const spinRoot = roots.get(ent.id);
        if (spinRoot) tickSpinHazardVisual(spinRoot, ent, frameDt);
      }

      const moveStick = joy?.getMoveVector() ?? { x: 0, y: 0 };
      const lookStick = joy?.getAimVector() ?? { x: 0, y: 0 };
      if (lookStick.x || lookStick.y) {
        const liveTps = tpsRef.current;
        yaw -= lookStick.x * 1.2 * frameDt;
        pitch -= lookStick.y * 0.95 * frameDt;
        pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);
      }
      // Mobile: holding look stick = aim focus (same as RMB)
      const aimNow = joy ? Math.hypot(lookStick.x, lookStick.y) > 0.25 : aimHeld;
      if (aimNow !== aimHeldUi) {
        aimHeldUi = aimNow;
        setAimingHud(aimNow);
      }

      const sprint =
        keyBindToCodes(bindingsRef.current.sprint).some((c) => keys.has(c)) || !!joy?.isSprintHeld();
      const crouch =
        keys.has('ControlLeft') ||
        keys.has('ControlRight') ||
        keyBindToCodes(bindingsRef.current.crouch).some((c) => keys.has(c));
      const flipPressed = keyBindToCodes(bindingsRef.current.flip).some((c) => keys.has(c));
      const slidePressed = keyBindToCodes(bindingsRef.current.slide).some((c) => keys.has(c));
      const customMoveKeysHeld = (playDoc.customMoves ?? [])
        .filter((m) => keyBindToCodes(m.key).some((c) => keys.has(c)))
        .map((m) => m.id);

      let wishFwd = 0;
      let wishStrafe = 0;
      if (keyBindToCodes(bindingsRef.current.moveForward).some((c) => keys.has(c)) || keys.has('ArrowUp')) wishFwd += 1;
      if (keyBindToCodes(bindingsRef.current.moveBack).some((c) => keys.has(c)) || keys.has('ArrowDown')) wishFwd -= 1;
      if (keyBindToCodes(bindingsRef.current.moveLeft).some((c) => keys.has(c)) || keys.has('ArrowLeft')) wishStrafe -= 1;
      if (keyBindToCodes(bindingsRef.current.moveRight).some((c) => keys.has(c)) || keys.has('ArrowRight')) wishStrafe += 1;
      if (moveStick.y || moveStick.x) {
        wishFwd += -moveStick.y;
        wishStrafe += moveStick.x;
      }
      const sprintingNow = sprint && wasGrounded && (wishFwd !== 0 || wishStrafe !== 0);
      if (sprintingNow && !wasSprintingForSound) playLoopedSound('sprint_start');
      else if (!sprintingNow && wasSprintingForSound) stopLoopedSound('sprint_start');
      wasSprintingForSound = sprintingNow;
      const flippingNow = scratch.flipMs > 0;
      if (flippingNow && !wasFlippingForSound) playSound('flip');
      wasFlippingForSound = flippingNow;
      if (crouch && !wasCrouchingForSound) playSound('crouch');
      wasCrouchingForSound = crouch;
      const slidingNow = scratch.slideMs > 0;
      if (slidingNow && !wasSlidingForSound) playSound('slide');
      wasSlidingForSound = slidingNow;
      if (
        body.isGrounded &&
        (wishFwd !== 0 || wishStrafe !== 0) &&
        now - lastFootstepAt > (sprintingNow ? 280 : 420)
      ) {
        lastFootstepAt = now;
        playSound('footstep');
      }
      if (scratch.customMoveActiveId && scratch.customMoveActiveId !== lastCustomMoveId) {
        playSound(customMoveSoundKey(scratch.customMoveActiveId));
      }
      lastCustomMoveId = scratch.customMoveActiveId;
      // Camera-relative: W into look, A = screen-left, D = screen-right.
      // Look flat = (sinYaw, cosYaw) in Three XZ; screen-right = (−cosYaw, sinYaw).
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const moveX = wishFwd * c + wishStrafe * s;
      const moveY = wishFwd * s - wishStrafe * c;
      const jumpPressed =
        keyBindToCodes(bindingsRef.current.jump).some((c) => keys.has(c)) || !!joy?.isJumpHeld();

      // --- Fixed-rate simulation: platforms, stepPlatformer, hazards,
      // checkpoints, finish/void — identical cadence to the server tick, run
      // as many (or zero) times as needed to catch this frame's real elapsed
      // time up to sim time. Input above is sampled once per frame (same as
      // a client polling its keyboard once before sending a tick) and reused
      // for every catch-up tick this frame produces.
      accumulator = Math.min(accumulator + frameDt, FIXED_DT * 6);
      while (accumulator >= FIXED_DT) {
        accumulator -= FIXED_DT;
        const dt = FIXED_DT;
        // Snapshot BEFORE stepping — this becomes the "previous" pose to
        // interpolate from once this loop ends, so even a frame with zero
        // ticks still has a valid prev→current pair to blend toward.
        prevSimX = body.x;
        prevSimY = body.y;
        prevSimZ = body.z;

        if (worldReady && hpLocal > 0 && !finishedLocal) {
          matchElapsedMs += dt * 1000;

          const interactNow =
            interactPulse ||
            keyBindToCodes(bindingsRef.current.interact).some((c) => keys.has(c)) ||
            !!joy?.isActionHeld();
          const inActivationRadius = (
            zone: { x: number; y: number; z: number; radius: number }
          ) => {
            const dx = body.x - zone.x;
            const dy = body.y - zone.y;
            const dz = body.z - zone.z;
            return Math.hypot(dx, dy) <= zone.radius + PLAYER_RADIUS && Math.abs(dz) <= 2.2;
          };
          const activateZone = (
            zone: { id: string; cooldownMs: number; holdMs: number; activatesObstacleIds: string[] },
            cooldownKey: string
          ) => {
            const last = lastZonePressAt.get(cooldownKey) ?? 0;
            if (matchElapsedMs - last < zone.cooldownMs) return;
            lastZonePressAt.set(cooldownKey, matchElapsedMs);
            const hold = zone.holdMs > 0 ? zone.holdMs : 1500;
            for (const oid of zone.activatesObstacleIds) {
              armedUntil.set(oid, matchElapsedMs + hold);
              director.fireSignal(oid);
            }
            playSound('button_press');
          };
          for (const [oid, until] of Array.from(armedUntil.entries())) {
            if (matchElapsedMs >= until) {
              armedUntil.delete(oid);
              director.clearSignal(oid);
            }
          }
          for (const btn of buttons) {
            if (inActivationRadius(btn)) activateZone(btn, `button:${btn.id}`);
          }
          for (const action of actions) {
            if (action.trigger === 'interact' && !interactNow) continue;
            if (!inActivationRadius(action)) continue;
            activateZone(action, `action:${action.id}`);
          }
          for (const pad of pads) {
            if (pad.doorControlled && pad.entityId) {
              pad.open = (armedUntil.get(pad.entityId) ?? 0) > matchElapsedMs;
            }
          }

          const platformDeltas = advanceMovingPads(pads, matchElapsedMs);
          if (platformDeltas.length) invalidatePadSpatialCache();
          applyPadCarry(body, scratch.supportPadId, platformDeltas);

          const prevJumpCount = scratch.jumpCount;
          const prevWallLock = scratch.wallJumpLockoutMs;
          const prevExhausted = scratch.exhausted;
          stepPlatformer(
            body,
            {
              moveX,
              moveY,
              jumpPressed,
              sprint,
              crouch,
              meleeActive: performance.now() < meleeUntil,
              flipPressed,
              slidePressed,
              customMoveKeysHeld,
              cameraYaw: yaw,
            },
            dt,
            pads,
            scratch,
            bounds,
            physOptsRef.current
          );
          if (scratch.wallJumpLockoutMs > 0 && prevWallLock <= 0) playSound('wall_jump');
          else if (scratch.jumpCount === 2 && prevJumpCount < 2) playSound('double_jump');
          if (scratch.exhausted && !prevExhausted) playSound('energy_exhausted');

          if (scratch.fallDamageThisTick > 0) {
            hpLocal = Math.max(0, hpLocal - scratch.fallDamageThisTick);
            setHp(hpLocal);
          }

          // Powers — sync the local ability host from the sim body, process
          // activations, tick timers, then write position/vz changes (hook
          // pull, backflip dash) back to the body.
          {
            const nowMs = Date.now();
            abilityHost.x = body.x;
            abilityHost.y = body.y;
            abilityHost.vz = body.vz;
            abilityHost.aimAngle = yaw;
            abilityHost.energy = body.energy;
            abilityHost.isAlive = hpLocal > 0;
            abilityHost.hasFinished = finishedLocal;
            let abilityChanged = false;
            for (const abilityKey of ABILITY_KEYS) {
              const codes = keyBindToCodes(bindingsRef.current[`power_${abilityKey}` as KeyBindAction]);
              const isHeld = codes.some((c) => keys.has(c));
              const wasHeld = abilityWasHeld.get(abilityKey) ?? false;
              abilityWasHeld.set(abilityKey, isHeld);
              if (isHeld && !wasHeld) {
                const activated = activateAbility(abilityHost, abilityKey, nowMs, abilityLevelsMaxed());
                if (activated) {
                  abilityChanged = true;
                  playSound(`power_${abilityKey}`);
                }
              }
            }
            tickActiveAbilityTimers(abilityHost, nowMs);
            body.x = abilityHost.x;
            body.y = abilityHost.y;
            body.vz = abilityHost.vz;
            body.energy = abilityHost.energy;
            flyActiveNow = isFlyActive(abilityHost, nowMs);
            if (flyActiveNow) {
              body.isGrounded = false;
              body.vz = 0;
              body.z += (jumpPressed ? 1.4 : crouch ? -1.4 : 0) * dt;
            }
            abilityHudCounter += 1;
            if (abilityChanged || abilityHudCounter % 10 === 0) pushAbilityUiState();
          }

          if (matchElapsedMs - lastGhostSampleAt >= 80) {
            lastGhostSampleAt = matchElapsedMs;
            recordedSamples.push({
              t: Math.round(matchElapsedMs),
              x: body.x,
              y: body.y,
              z: body.z,
            });
          }
        }

        for (const pad of pads) {
          if (pad.kind !== 'checkpoint') continue;
          if (
            Math.abs(body.x - pad.x) <= pad.width / 2 + 0.35 &&
            Math.abs(body.y - pad.y) <= pad.depth / 2 + 0.35 &&
            body.z >= pad.z - 0.35 &&
            body.z <= pad.z + 0.6
          ) {
            const isNewCheckpoint =
              !checkpoint || checkpoint.x !== pad.x || checkpoint.y !== pad.y || checkpoint.z !== pad.z;
            checkpoint = { x: pad.x, y: pad.y, z: pad.z };
            if (isNewCheckpoint) playSound('checkpoint');
          }
        }
        for (const f of finishes) {
          const halfW = f.width / 2;
          const halfD = f.depth / 2;
          if (
            Math.abs(body.x - f.x) <= halfW + 0.35 &&
            Math.abs(body.y - f.y) <= halfD + 0.35 &&
            body.z >= f.z - 0.35 &&
            body.z <= f.z + Math.max(f.height, 1.2)
          ) {
            if (!finishedLocal) {
              finishedLocal = true;
              playSound('finish_line');
              setFinished(true);
              if (mapId && !ghostSubmitted && recordedSamples.length > 2) {
                ghostSubmitted = true;
                const finishMs = Math.round(matchElapsedMs);
                void (async () => {
                  try {
                    const { submitGhostRun } = await import('@/lib/ghost-actions');
                    const res = await submitGhostRun({
                      mapId,
                      finishMs,
                      samples: recordedSamples,
                    });
                    if (disposed) return;
                    if (res.worldRecord) setGhostResult(`New WR · ${(finishMs / 1000).toFixed(2)}s`);
                    else if (res.personalBest) setGhostResult(`PB · ${(finishMs / 1000).toFixed(2)}s`);
                  } catch {
                    /* not signed in */
                  }
                })();
              }
            }
          }
        }
        // Void/hazard/teleport checks used to run unconditionally every
        // tick regardless of worldReady/hpLocal/finishedLocal — a player who
        // finished while standing in an active hazard zone could still be
        // dropped to 0 HP afterward, and the HUD only shows "FINISH" while
        // hp > 0, so "YOU DIED" silently overwrote a legitimate finish. Gated
        // with the same condition as the movement/ability step above so
        // nothing here can fire once the run is over (or before it started,
        // or while dead).
        if (worldReady && hpLocal > 0 && !finishedLocal) {
        if (body.z < -4 && !flyActiveNow) {
          playSound('void_fall');
          if (checkpoint) {
            body.x = checkpoint.x;
            body.y = checkpoint.y;
            body.z = checkpoint.z + 0.05;
            body.vz = 0;
            body.isGrounded = true;
            hpLocal = Math.max(hpLocal, 60);
            setHp(hpLocal);
          } else if (spawn) {
            body.x = spawn.x;
            body.y = spawn.y;
            body.z = spawn.z;
            snapBodyToPads(body, pads);
            body.vz = 0;
            hpLocal = Math.max(1, hpLocal - 25);
            setHp(hpLocal);
          } else if (hpLocal > 0) {
            hpLocal = 0;
            setHp(0);
          }
        }

        // Timed hazard pulses — same off(intervalMs)/on(activeMs) accumulator
        // as DeathrunRoom.tickObstacles, driven by fixed tick dt.
        for (const h of hazards) {
          if (h.alwaysActive || h.buttonControlled) continue;
          const elapsed = (hazardTimers.get(h.id) ?? 0) + dt * 1000;
          const active = hazardActive.get(h.id) ?? false;
          const intervalMs = Math.max(100, h.intervalMs);
          const activeMs = Math.max(100, h.activeMs ?? 900);
          if (!active && elapsed >= intervalMs) {
            hazardActive.set(h.id, true);
            hazardTimers.set(h.id, 0);
          } else if (active && elapsed >= activeMs) {
            hazardActive.set(h.id, false);
            hazardTimers.set(h.id, 0);
          } else {
            hazardTimers.set(h.id, elapsed);
          }
        }

        // Authoritative-style AABB hazards (sim space).
        for (const h of hazards) {
          // Button-controlled traps start disarmed and only deal damage once
          // a wired Button has activated them (director.activated mirrors the
          // same latch used for the trap's own activeClip animation). This
          // was previously skipped unconditionally, so button-armed traps
          // animated on trigger but never actually hurt the player.
          if (h.buttonControlled && (armedUntil.get(h.id) ?? 0) <= matchElapsedMs) continue;
          const pulsing = !h.alwaysActive && !h.buttonControlled && (hazardActive.get(h.id) ?? false);
          if (!h.alwaysActive && !h.buttonControlled && !pulsing) continue;
          const active =
            h.alwaysActive || h.buttonControlled || pulsing;
          if (
            !isPlayerOverlappingObstacle(
              body,
              {
                x: h.x,
                y: h.y,
                z: h.z,
                width: h.width,
                depth: h.depth,
                height: h.height,
                active,
              },
              PLAYER_RADIUS,
              PLAYER_HEIGHT
            )
          ) {
            continue;
          }
          // Berserk = damage immunity while active (mirrors the server's
          // damagePlayer() early-return on isBerserkActive).
          if (isBerserkActive(abilityHost, Date.now())) continue;
          if (h.instantKill) {
            if (hpLocal > 0) playSound('trap_trigger');
            hpLocal = 0;
            setHp(0);
            continue;
          }
          const last = lastDamageAt.get(h.id) ?? 0;
          if (now - last >= Math.max(120, h.intervalMs * 0.35)) {
            lastDamageAt.set(h.id, now);
            hpLocal = Math.max(0, hpLocal - h.damage);
            setHp(hpLocal);
            playSound('trap_trigger');
          }
        }

        runEntityPluginScripts({
          entities: playDoc.entities,
          player: { x: body.x, y: body.y, z: body.z },
          dt,
          damage: (amount) => {
            hpLocal = Math.max(0, hpLocal - amount);
            setHp(hpLocal);
          },
        });
        emitPlaytest('tick', {
          dt,
          hp: hpLocal,
          x: body.x,
          y: body.y,
          z: body.z,
          mapId,
        });

        // Teleporters
        for (const t of teleports) {
          const cd = teleportCooldownUntil.get(t.id) ?? 0;
          if (now < cd) continue;
          const halfW = t.width / 2 + 0.3;
          const halfD = t.depth / 2 + 0.3;
          if (
            Math.abs(body.x - t.x) <= halfW &&
            Math.abs(body.y - t.y) <= halfD &&
            body.z >= t.z - 0.4 &&
            body.z <= t.z + Math.max(t.height, 1.2)
          ) {
            body.x = t.targetX;
            body.y = t.targetY;
            body.z = t.targetZ;
            body.vz = 0;
            snapBodyToPads(body, pads);
            teleportCooldownUntil.set(t.id, now + t.cooldownMs);
            playSound('teleport');
          }
        }
        }
      }

      // Gated behind the same dev-only flag as addCollisionPadMeshes above —
      // this telemetry (raw z/grounded/support-alignment) was rendering
      // unconditionally for every Play Test session regardless of the flag.
      if (SHOW_COLLISION_DEBUG && now - lastDebugAt > 150) {
        lastDebugAt = now;
        // Show the pad actually holding the player up (scratch.supportPadId),
        // not just whatever's nearest by XY distance — a nearby-but-unrelated
        // pad reads as a false "sunk" warning even when you're standing
        // correctly on a different one right next to it.
        const support = scratch.supportPadId ? pads.find((p) => p.id === scratch.supportPadId) : undefined;
        const delta = support ? body.z - support.z : NaN;
        setDebugHud(
          support
            ? `z=${body.z.toFixed(2)}  grounded=${body.isGrounded}  support=${support.id}  supportTopZ=${support.z.toFixed(2)}  Δ(z-top)=${delta.toFixed(2)}${Math.abs(delta) > 0.02 ? '  ⚠ MISALIGNED' : '  ✓ flush'}`
            : `z=${body.z.toFixed(2)}  grounded=${body.isGrounded}  support=none (airborne)`
        );
      }

      // --- Variable-rate rendering: camera, mesh smoothing, animation —
      // runs once per rendered frame regardless of how many physics ticks
      // the accumulator ran above, using the body's latest simulated state.
      for (const [id, motion] of motionVisual) {
        const root = roots.get(id);
        if (!root) continue;
        const u = movingPlatformU(matchElapsedMs, motion.periodMs, motion.phaseMs);
        root.position.set(
          motion.rest[0] + motion.offset[0] * u,
          motion.rest[1] + motion.offset[1] * u,
          motion.rest[2] + motion.offset[2] * u
        );
      }

      if (wrSamples.length && showGhostRef.current) {
        const pose = sampleGhostAt(wrSamples, matchElapsedMs);
        if (pose) applyGhostPose(ghostMesh, pose);
        else ghostMesh.visible = false;
      } else {
        ghostMesh.visible = false;
      }

      // Blend between the previous and current simulated tick using the
      // leftover accumulator time, instead of snapping straight to `body`
      // (which only changes once per 30Hz tick) — see prevSimX/Y/Z above.
      // Skip the blend on a teleport/respawn-sized jump so the character
      // doesn't visibly slide across the map for one frame.
      const tickAlpha = FIXED_DT > 0 ? Math.min(1, Math.max(0, accumulator / FIXED_DT)) : 1;
      const jumpDist = Math.hypot(body.x - prevSimX, body.y - prevSimY, body.z - prevSimZ);
      const simX = jumpDist > 8 ? body.x : prevSimX + (body.x - prevSimX) * tickAlpha;
      const simY = jumpDist > 8 ? body.y : prevSimY + (body.y - prevSimY) * tickAlpha;
      const simZ = jumpDist > 8 ? body.z : prevSimZ + (body.z - prevSimZ) * tickAlpha;
      const [tx, ty, tz] = simToThree(simX, simY, simZ);
      // Soften visual/camera height on stepped ramps so Play Test matches live feel.
      if (smoothCamY === null || Math.abs(smoothCamY - ty) > 3.5) {
        smoothCamY = ty;
      } else {
        const yLerp = 1 - Math.pow(0.001, frameDt * 16);
        smoothCamY += (ty - smoothCamY) * Math.min(1, yLerp);
      }
      playerPos.set(tx, smoothCamY, tz);

      // Player mesh height: sharp snap while grounded (matches the true
      // continuous ramp surface instead of lagging into it), softer while
      // airborne so jumps/falls still look smooth. See `meshY` comment above.
      if (meshY === null || Math.abs(meshY - ty) > 3.5) {
        meshY = ty;
      } else {
        const meshSharpness = body.isGrounded ? 40 : 16;
        const meshLerp = 1 - Math.pow(0.001, frameDt * meshSharpness);
        meshY += (ty - meshY) * Math.min(1, meshLerp);
      }

      const liveTps = tpsRef.current;
      if (camera.fov !== liveTps.camera.fov) {
        camera.fov = liveTps.camera.fov;
        camera.updateProjectionMatrix();
      }
      pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);

      const combatFeel = ensureCombatSettings(playDoc);
      const justLanded = !wasGrounded && body.isGrounded;
      if (justLanded) shakeAmp = Math.max(shakeAmp, combatFeel.shakeOnLand ?? 0);
      if (hpLocal < lastHpForShake) shakeAmp = Math.max(shakeAmp, combatFeel.shakeOnHit ?? 0);
      lastHpForShake = hpLocal;
      const recover = (combatFeel.recoilRecoverySpeed * Math.PI) / 180;
      recoilPitch = Math.max(0, recoilPitch - recover * frameDt);
      shakeAmp *= Math.max(0, 1 - frameDt * 8);
      weaponKick *= Math.max(0, 1 - frameDt * 12);
      const shakeX = (Math.random() - 0.5) * 2 * shakeAmp;
      const shakeY = (Math.random() - 0.5) * 2 * shakeAmp;

      updateFollowCamera(
        camera,
        playerPos,
        yaw + shakeX * 0.35,
        pitch + recoilPitch + shakeY * 0.5,
        frameDt,
        aimNow
          ? {
              ...liveTps.camera,
              boomDistance: Math.max(2.2, liveTps.camera.boomDistance * 0.72),
              shoulder:
                liveTps.camera.shoulder === 0
                  ? 0.42
                  : liveTps.camera.shoulder + Math.sign(liveTps.camera.shoulder) * 0.35,
              followSharpness: liveTps.camera.followSharpness + 8,
              collidables: cameraCollidables,
            }
          : { ...liveTps.camera, collidables: cameraCollidables }
      );

      const colliding = new Set<string>();
      roots.forEach((root, id) => {
        if (playerPos.distanceTo(root.position) < 1.2) colliding.add(id);
      });

      if (playerRoot && playerId) {
        playerRoot.visible = !(
          liveTps.player.hideWhenClose && liveTps.camera.boomDistance < liveTps.player.hideDistance
        );
        playerRoot.position.set(tx, (meshY ?? ty) + liveTps.player.offsetY, tz);
        const tpsScale = liveTps.player.scale || 1;
        playerRoot.scale.set(
          playerBaseScale[0] * tpsScale,
          playerBaseScale[1] * tpsScale,
          playerBaseScale[2] * tpsScale
        );
        // GTA: RMB aim = face camera + strafe; free = face walk direction
        const targetYaw = aimNow
          ? yaw
          : computeLocomotionFacingYaw(yaw, wishFwd, wishStrafe, bodyYaw);
        bodyYaw = stepBodyYaw(bodyYaw, targetYaw, frameDt, aimNow ? 18 : 16);
        playerRoot.rotation.y =
          bodyYaw + (liveTps.player.yawOffsetDeg * Math.PI) / 180;
        // Visibility power: fade the local model so a map author can
        // confirm it's actually toggling (no other players in solo Play
        // Test to actually hide it from, so this is a visual self-check).
        const invisibleNow = isInvisibleActive(abilityHost, Date.now());
        if (invisibleNow !== wasInvisibleForMaterial) {
          wasInvisibleForMaterial = invisibleNow;
          playerRoot.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || !mesh.material) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              const std = m as THREE.MeshStandardMaterial;
              std.transparent = true;
              std.opacity = invisibleNow ? 0.25 : 1;
              std.needsUpdate = true;
            }
          });
        }
        const justLandedVis = justLanded;
        if (justLandedVis) playSound('land');
        else if (wasGrounded && !body.isGrounded && body.vz > 0.5) playSound('jump');
        wasGrounded = body.isGrounded;
        if (justLandedVis) landUntil = performance.now() + 280;
        if (hpLocal <= 0 && wasAliveForSound) playSound('player_death');
        wasAliveForSound = hpLocal > 0;

        const weaponAtt = findWeaponAttachment(previewSkins ? avatarEntity?.playerSkins : undefined);
        const combat = resolveWeaponCombat(weaponAtt);
        const wepDef = playDoc.weaponDef
          ? { ...DEFAULT_WEAPON_DEF, ...playDoc.weaponDef }
          : null;
        let attackThisFrame = false;

        if (joy?.consumeAttackPulse()) attackPulse = true;
        if (attackPulse) {
          attackPulse = false;
          // Bullet power: Play Test doesn't track ammo/reload at all, so
          // "unlimited ammo" stands in as a rapid-fire cooldown bypass —
          // the closest testable proxy for its real effect.
          const effectiveCooldownMs = isUnlimitedAmmoActive(abilityHost, Date.now())
            ? Math.min(combat.cooldownMs, 80)
            : combat.cooldownMs;
          if (now - lastAttackAt >= effectiveCooldownMs) {
            lastAttackAt = now;
            attackThisFrame = true;
            playSound(combat.kind === 'melee' ? 'melee_punch' : 'weapon_fire');
            if (combat.kind === 'melee') meleeUntil = now + 500;
            const kickDeg = wepDef?.recoilKickDeg || combatFeel.recoilKickDeg || 2;
            recoilPitch += (kickDeg * Math.PI) / 180;
            shakeAmp = Math.max(shakeAmp, combatFeel.shakeOnFire ?? 0.015);
            weaponKick = Math.max(
              weaponKick,
              wepDef?.weaponKickZ ?? combatFeel.weaponKickZ ?? 0
            );
            if (combat.kind !== 'cosmetic') {
              // Foundry: melee_direction = direction_to(camera aim point)
              const cosP = Math.cos(pitch);
              const sinP = Math.sin(pitch);
              const forward = new THREE.Vector3(
                Math.sin(yaw) * cosP,
                sinP,
                Math.cos(yaw) * cosP
              );
              const reach = Math.max(1.2, combat.range);
              const eye = playerPos.clone().add(new THREE.Vector3(0, 1.5, 0));
              const aimPoint = eye
                .clone()
                .addScaledVector(forward, Math.min(reach, combat.kind === 'hitscan' ? 3.2 : 2.4));
              const hitRadius = combat.kind === 'hitscan' ? 1.6 : Math.max(1.35, reach * 0.55);
              roots.forEach((root, id) => {
                if (root.position.distanceTo(aimPoint) > hitRadius) return;
                const ent = playDoc.entities.find((e) => e.id === id);
                if (!ent) return;
                if (ent.animation?.trigger === 'interact' || ent.kind === 'button') {
                  colliding.add(id);
                  director.evaluateTriggers([ent], playerPos, true, colliding);
                }
              });
            }
          }
        }

        if (wepDef) {
          const drawn = aimNow || attackThisFrame || now < meleeUntil;
          const [hx, hy, hz] = drawn ? wepDef.holdPosition : wepDef.backPosition;
          applyWeaponSlotPose(
            playerRoot,
            drawn ? [hx, hy, hz + weaponKick] : [hx, hy, hz],
            drawn ? wepDef.holdRotation : wepDef.backRotation,
            drawn ? wepDef.holdScale : wepDef.backScale
          );
        }

        director.updatePlayer(playerId, avatarBindings ?? avatarEntity?.playerAnims, {
          moving: Math.abs(moveX) + Math.abs(moveY) > 0.05,
          sprint,
          grounded: body.isGrounded,
          crouch,
          sliding: scratch.slideMs > 0,
          flipping: scratch.flipMs > 0,
          moveX: wishStrafe,
          moveZ: wishFwd,
          alive: hpLocal > 0,
          justLanded: performance.now() < landUntil,
          attack: attackThisFrame,
          attackStyle: combat.attackStyle ?? 'attack',
          customMoveClipName: scratch.customMoveActiveId
            ? (playDoc.customMoves ?? []).find((m) => m.id === scratch.customMoveActiveId)?.clipName
            : undefined,
        });
      }

      director.evaluateTriggers(playDoc.entities, playerPos, interactPulse, colliding);
      interactPulse = false;
      if (joy?.consumeActionPulse()) {
        director.evaluateTriggers(playDoc.entities, playerPos, true, colliding);
      }

      director.update(frameDt);
      if (playerRoot) {
        const swayCombat = ensureCombatSettings(playDoc);
        tickSkinAttachments(playerRoot, frameDt, now * 0.001, {
          enabled: swayCombat.swayEnabled,
          amplitudeDeg: swayCombat.swayAmplitudeDeg,
          speedHz: swayCombat.swaySpeedHz,
          moveMult: swayCombat.swayMoveMult,
          moving: Math.abs(wishFwd) + Math.abs(wishStrafe) > 0.05,
        });
      }

      if (matchSettingsRef.current.bloom) bloom.render();
      else renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stopLoopedSound('sprint_start');
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      host.removeEventListener('contextmenu', onContextMenu);
      joy?.destroy();
      joystickRef.current = null;
      if (document.pointerLockElement) document.exitPointerLock?.();
      envHandle.dispose();
      director.clear();
      // Every entity mesh here mixes uniquely-created geometry (hammer
      // solids, placeholders, the fallback capsule, floor, ghost) with
      // cache-derived GLB parts (loadAnimatedPrefab / loadPlayerAvatar —
      // geometry shared with a module-level cache, see
      // disposeClonedMaterials's doc comment). renderer.dispose() alone only
      // frees renderer-owned GPU state, not per-object geometry/material/
      // texture buffers — without disposeClonedMaterials, every Play Test
      // open/close leaked the whole loaded scene's materials, and without
      // disposeOwnedGeometry it additionally leaked every uniquely-built
      // mesh's vertex/index buffers (GLB-cached geometry is deliberately
      // left alone — see disposeOwnedGeometry's doc comment).
      if (playerRoot) {
        disposeClonedMaterials(playerRoot);
        disposeOwnedGeometry(playerRoot);
      }
      disposeClonedMaterials(ghostMesh);
      disposeOwnedGeometry(ghostMesh);
      disposeClonedMaterials(floor);
      disposeOwnedGeometry(floor);
      roots.forEach((root) => {
        disposeClonedMaterials(root);
        disposeOwnedGeometry(root);
      });
      bloom.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [doc, previewSkins, embedded, mapId, playTestRole]);

  return (
    <div
      ref={shellRef}
      className={`${embedded ? 'absolute inset-0 z-0' : 'fixed inset-0 z-[9999]'} bg-black flex flex-col`}
    >
      <div className={`${embedded ? 'h-9 px-3' : 'h-11 px-4'} flex items-center gap-3 bg-black/80 border-b border-white/10 relative z-[60]`}>
        <span className="text-sm font-bold text-emerald-300 tracking-wide uppercase shrink-0">
          {embedded ? 'Map Preview' : 'Play Test'}
        </span>
        <span className="text-[10px] sm:text-xs text-white/50 truncate min-w-0">
          {isTouch
            ? '3rd person · Left move · Right look · Jump / Use / Attack'
            : `RMB aim · Mouse look · ${formatBindKey(bindings.pause)} pause`}
        </span>
        <div className="ml-4 flex items-center gap-2 text-xs">
          <span className="text-white/50">HP</span>
          <div className="w-28 h-2 rounded bg-white/10 overflow-hidden">
            <div
              className={`h-full ${hp <= 25 ? 'bg-red-500' : hp <= 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${hp}%` }}
            />
          </div>
          <span className={hp <= 0 ? 'text-red-400 font-bold' : 'text-white/70'}>{hp}</span>
          <span className="text-white/50 ml-2">EN</span>
          <div className="w-24 h-2 rounded bg-white/10 overflow-hidden">
            <div className="h-full bg-sky-400" style={{ width: `${energyUi}%` }} />
          </div>
          <span className="text-white/70">{energyUi}</span>
        </div>
        <div className="ml-3 flex items-end gap-1.5">
          {getActivePowerDefinitions()
            .filter((def) => getAbilitySlotKind(def.key) !== null)
            .map((def) => {
              const slot = getAbilitySlotKind(def.key)!;
              const fields = ABILITY_UI_FIELDS[slot];
              return (
                <AbilityRingIcon
                  key={def.key}
                  icon={def.icon}
                  cooldownMs={getCooldownForAbility(def.key)}
                  cooldownEndsAt={(abilityUi as unknown as Record<string, number>)[fields.cooldownEndsAt] ?? 0}
                  buffEndsAt={(abilityUi as unknown as Record<string, number>)[fields.endsAt] ?? 0}
                  energyCost={getEnergyCostForAbility(def.key)}
                  playerEnergy={energyUi}
                />
              );
            })}
        </div>
        <div className="flex-1" />
        {ghostLabel && (
          <button
            type="button"
            className={`mr-2 text-[10px] sm:text-xs px-2 py-1 rounded border ${
              showGhost
                ? 'border-sky-400/50 text-sky-200 bg-sky-500/15'
                : 'border-white/15 text-white/40'
            }`}
            onClick={() => setShowGhost((v) => !v)}
            title="Toggle WR ghost"
          >
            Ghost {showGhost ? 'ON' : 'OFF'} · {ghostLabel}
          </button>
        )}
        {ghostResult && (
          <span className="mr-2 text-[10px] sm:text-xs text-amber-300 font-semibold">{ghostResult}</span>
        )}
        {onClose && (
          <Button size="sm" variant="destructive" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> {embedded ? 'Close' : 'Exit Test'}
          </Button>
        )}
      </div>
      <div className="flex-1 relative min-h-0">
        <div ref={hostRef} className="absolute inset-0 touch-none" />
        <Crosshair visible={aimingHud} style={tpsHud.crosshair} />
        {debugHud && (
          <div className="absolute top-2 left-2 z-[80] pointer-events-none rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-lime-300">
            {debugHud}
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 pointer-events-none">
            <p className="text-sm font-semibold text-white/80 tracking-wide">Loading play test…</p>
          </div>
        )}
        {autoStartNote && !loading && (
          <div className="absolute top-3 left-3 right-3 z-[70] pointer-events-none">
            <p className="mx-auto max-w-md rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-center text-[11px] text-amber-100">
              Auto-spawned on a solid floor (no Start marker needed). Optional: place a green Start
              if you want a specific spawn spot.
            </p>
          </div>
        )}
        {isTouch && (
          <>
            <JoystickOverlay joystickRef={joystickRef} enabled />
            <div className="absolute bottom-16 right-3 z-[120] flex flex-col gap-2 pointer-events-auto items-end">
              <button
                type="button"
                className="w-12 h-12 rounded-full border-2 border-amber-400/70 bg-amber-500/35 text-white font-black text-[10px] uppercase tracking-wider active:scale-95"
                onTouchStart={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setAttackHeld(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setAttackHeld(false);
                }}
                onTouchCancel={() => joystickRef.current?.setAttackHeld(false)}
              >
                Attack
              </button>
              <button
                type="button"
                className="w-12 h-12 rounded-full border-2 border-violet-400/70 bg-violet-500/35 text-white font-black text-[10px] uppercase tracking-wider active:scale-95"
                onTouchStart={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setActionHeld(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setActionHeld(false);
                }}
                onTouchCancel={() => joystickRef.current?.setActionHeld(false)}
              >
                Use
              </button>
              <button
                type="button"
                className="w-14 h-14 rounded-full border-2 border-emerald-400/70 bg-emerald-500/35 text-white font-black text-[10px] uppercase tracking-wider active:scale-95"
                onTouchStart={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setJumpHeld(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setJumpHeld(false);
                }}
                onTouchCancel={() => joystickRef.current?.setJumpHeld(false)}
              >
                Jump
              </button>
              <button
                type="button"
                className="w-14 h-14 rounded-full border-2 border-sky-400/70 bg-sky-500/35 text-white font-black text-[10px] uppercase tracking-wider active:scale-95"
                onTouchStart={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setSprintHeld(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  joystickRef.current?.setSprintHeld(false);
                }}
                onTouchCancel={() => joystickRef.current?.setSprintHeld(false)}
              >
                Sprint
              </button>
            </div>
          </>
        )}
      </div>
      <PauseMenu
        open={!embedded && paused}
        onResume={() => {
          setPaused(false);
          hostRef.current?.requestPointerLock?.().catch(() => {});
        }}
        onOpenEditor={() => setPaused(false)}
        onToggleFullscreen={toggleFullscreen}
        onExit={() => onClose?.()}
        matchSettings={matchSettings}
        onMatchSettingsChange={(next) => {
          const saved = savePlayerMatchSettings(next);
          setMatchSettings(saved);
          setMasterVolume(saved.masterVolume);
        }}
        pauseHint={formatBindKey(bindings.pause)}
      />
      {hp <= 0 && (
        <div className="absolute inset-0 top-11 flex items-center justify-center bg-black/50 pointer-events-none px-4">
          <p className="text-xl sm:text-2xl font-black text-red-400 tracking-wide text-center">
            YOU DIED — exit & retry
          </p>
        </div>
      )}
      {finished && hp > 0 && (
        <div className="absolute inset-0 top-11 flex items-center justify-center bg-black/45 pointer-events-none px-4">
          <p className="text-xl sm:text-2xl font-black text-amber-300 tracking-wide text-center">
            FINISH — course cleared
          </p>
        </div>
      )}
    </div>
  );
}
