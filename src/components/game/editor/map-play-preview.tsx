'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { MapDocument } from './map-document';
import { ensureCombatSettings } from './map-document';
import {
  HAMMER_SOLID_MODEL,
  ensureEnvironment,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
  suggestPlayerBindings,
} from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { AnimationDirector } from './animation-director';
import {
  applyTextureToObject,
  plantLocalFeet,
  resolveEntityTextureRepeat,
  shouldHideEntityInPlay,
} from './editor-mesh';
import {
  applyAuthoredEnvironment,
  applyEntityOpacity,
  makeAuthoredLight,
  makeGameplayFallback,
  shouldUseGameplayFallback,
} from './map-scene-visuals';
import { makeHammerSolidObject, type HammerPrimitive } from './hammer-shapes';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';
import {
  createSimScratch,
  simToThree,
  stepPlatformer,
  type SimBody,
  type SimPad,
  type SimPhysicsOpts,
} from '@/lib/platformer-sim';
import {
  mapDocSpawnPoints,
  mapDocToSimFinishes,
  mapDocToSimHazards,
  mapDocToSimPlatforms,
  mapDocToSimTeleports,
  mapDocToWorldBounds,
  prepareDocForPlayTest,
} from './prefab-storage';
import { loadPlayerAvatar, getMapPlayerAvatar, fitAvatarLikeEditor, avatarAuthoredScale } from './player-avatar';
import { updateFollowCamera } from '../renderer/three-world';
import { applySkinAttachments, tickSkinAttachments } from './skin-attachments';
import {
  findWeaponAttachment,
  resolveWeaponCombat,
} from '@/lib/weapons';
import { Crosshair } from '../ui/crosshair';
import {
  mouseSensRadians,
  resolveTpsView,
  sanitizeTpsView,
  type TpsViewSettings,
} from '../tps/tps-view-settings';
import {
  computeLocomotionFacingYaw,
  stepBodyYaw,
} from '../tps/locomotion-facing';

const SHOW_COLLISION_DEBUG = false;

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
}: {
  doc: MapDocument;
  onClose?: () => void;
  embedded?: boolean;
  tpsViewOverride?: TpsViewSettings | null;
  previewSkins?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
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
    };
  }, [doc]);
  const physOptsRef = useRef(physOpts);
  physOptsRef.current = physOpts;
  const resolvedTps = useMemo(
    () =>
      tpsViewOverride
        ? sanitizeTpsView(tpsViewOverride)
        : resolveTpsView(doc.tpsView as TpsViewSettings | null | undefined),
    [doc.tpsView, tpsViewOverride]
  );
  const tpsRef = useRef<TpsViewSettings>(resolvedTps);
  const onCloseRef = useRef(onClose);
  const [hp, setHp] = useState(100);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStartNote, setAutoStartNote] = useState(false);
  const [tpsHud, setTpsHud] = useState<TpsViewSettings>(() => resolvedTps);
  const [aimingHud, setAimingHud] = useState(false);
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();

  useEffect(() => {
    tpsRef.current = resolvedTps;
    setTpsHud(resolvedTps);
  }, [resolvedTps]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setHp(100);
    setFinished(false);
    setLoading(true);
    setAutoStartNote(false);
    setAimingHud(false);

    const prepared = prepareDocForPlayTest(doc);
    const playDoc = prepared.doc;
    if (prepared.autoStart) setAutoStartNote(true);

    const initialTps = tpsRef.current;
    setTpsHud(initialTps);

    let disposed = false;
    const scene = new THREE.Scene();
    const env = ensureEnvironment(playDoc);

    const camera = new THREE.PerspectiveCamera(initialTps.camera.fov, 1, 0.1, 300);
    const pads = mapDocToSimPlatforms(playDoc);
    const finishes = mapDocToSimFinishes(playDoc);
    const hazards = mapDocToSimHazards(playDoc);
    const teleports = mapDocToSimTeleports(playDoc);
    const bounds = mapDocToWorldBounds(playDoc, pads, finishes);
    const spawn = mapDocSpawnPoints(playDoc).runner;
    const teleportCooldownUntil = new Map<string, number>();
    const hazardPulseUntil = new Map<string, number>();
    const hazardNextToggle = new Map<string, number>();
    for (const h of hazards) {
      if (h.alwaysActive || h.buttonControlled) continue;
      hazardNextToggle.set(h.id, performance.now() + (h.intervalMs || 1500));
      hazardPulseUntil.set(h.id, 0);
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

    {
      const [sx, sy, sz] = simToThree(body.x, body.y, body.z);
      camera.position.set(sx, sy + 6.5, sz - 9);
      camera.lookAt(sx, sy + 1.1, sz);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

    const ambient = new THREE.AmbientLight(0xffffff, env.ambientIntensity ?? 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2d6, env.sunIntensity ?? 1.15);
    sun.position.set(10, 22, 8);
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
    scene.add(floor);

    const envHandle = applyAuthoredEnvironment(scene, env, {
      lights: { ambient, sun, hemi },
      floorMesh: floor,
      // Slightly lighter fog on mobile playtest for readability.
      maxFogDensity: 0.014,
    });

    // Collision pads are sim-only; enable this when debugging exported platform volumes.
    if (SHOW_COLLISION_DEBUG) addCollisionPadMeshes(scene, pads);

    const director = new AnimationDirector();
    const roots = new Map<string, THREE.Object3D>();
    let playerRoot: THREE.Object3D | null = null;
    let playerId: string | null = null;
    let playerBaseScale: [number, number, number] = [1, 1, 1];
    let bodyYaw = 0;
    let aimHeld = false;
    let aimHeldUi = false;
    let hpLocal = 100;
    const lastDamageAt = new Map<string, number>();

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
    let landUntil = 0;
    let meleeUntil = 0;
    const avatarEntity = getMapPlayerAvatar(playDoc) ?? null;
    let avatarBindings = avatarEntity?.playerAnims;
    let worldReady = false;

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const loadAll = async () => {
      try {
        const loaded = await loadPlayerAvatar(avatarEntity);
        if (disposed) return;
        // Same plant + authored scale as the map editor (no forced 1.75m height).
        const root = fitAvatarLikeEditor(loaded.scene, avatarEntity, loaded.isDefaultMannequin);
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
          if (previewSkins && avatarEntity.playerSkins?.length) {
            await applySkinAttachments(loaded.scene, avatarEntity.playerSkins);
          }
        }
      } catch (err) {
        console.warn('[PlayPreview] avatar load failed', err);
        // Guaranteed visible body so Play Test never feels empty / first-person
        const fallback = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 0.95, 4, 10),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
        );
        fallback.position.y = 0.85;
        const wrap = new THREE.Group();
        wrap.add(fallback);
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
            }
          );
          applyEntityOpacity(planted, ent.opacity);
          planted.position.set(...ent.position);
          planted.rotation.set(
            THREE.MathUtils.degToRad(ent.rotation[0]),
            THREE.MathUtils.degToRad(ent.rotation[1]),
            THREE.MathUtils.degToRad(ent.rotation[2])
          );
          planted.scale.set(...ent.scale);
          planted.userData.entityId = ent.id;
          scene.add(planted);
          roots.set(ent.id, planted);
          if (clips.length) {
            director.register(ent.id, planted, clips);
            if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
              director.playDefault(ent);
            }
          }
        };

        if (isHammerSolidEntity(ent) || ent.model === HAMMER_SOLID_MODEL) {
          const size = ent.collisionSize ?? [2, 0.25, 2];
          const shape = (ent.primitive as HammerPrimitive) || 'box';
          placeVisual(makeHammerSolidObject(shape, size, ent.color || '#64748b'));
          continue;
        }

        const src = resolveModelSrc(ent.model, ent.customModelUrl);
        try {
          if (src) {
            const { root, clips } = await loadAnimatedPrefab(src);
            plantLocalFeet(root);
            placeVisual(root, clips);
            continue;
          }

          if (!shouldUsePlaceholder(ent, 'missing-model')) continue;
          placeVisual(placeholderForEntity(ent));
        } catch (err) {
          console.warn('[PlayPreview] skip', ent.name, err);
          if (!shouldUsePlaceholder(ent, 'load-failed')) continue;
          try {
            placeVisual(placeholderForEntity(ent));
          } catch {
            /* ignore */
          }
        }
      }

      if (!disposed) {
        worldReady = true;
        setLoading(false);
      }
    };
    void loadAll();

    if (!embedded) host.requestPointerLock?.().catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'KeyE') interactPulse = true;
      if (e.code === 'KeyF' || e.code === 'Mouse0') attackPulse = true;
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: MouseEvent) => {
      // Mouse looks only while locked — WASD/Space/Ctrl never touch the camera.
      if (document.pointerLockElement !== host && document.pointerLockElement !== document.body) {
        return;
      }
      const liveTps = tpsRef.current;
      const mouseSens = mouseSensRadians(liveTps);
      yaw -= (e.movementX || 0) * mouseSens;
      pitch -= (e.movementY || 0) * mouseSens;
      pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (embedded && e.target instanceof Node && !host.contains(e.target)) return;
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

    const clock = new THREE.Clock();
    const playerPos = new THREE.Vector3();
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      const moveStick = joy?.getMoveVector() ?? { x: 0, y: 0 };
      const lookStick = joy?.getAimVector() ?? { x: 0, y: 0 };
      if (lookStick.x || lookStick.y) {
        const liveTps = tpsRef.current;
        yaw -= lookStick.x * 1.2 * dt;
        pitch -= lookStick.y * 0.95 * dt;
        pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);
      }
      // Mobile: holding look stick = aim focus (same as RMB)
      const aimNow = joy ? Math.hypot(lookStick.x, lookStick.y) > 0.25 : aimHeld;
      if (aimNow !== aimHeldUi) {
        aimHeldUi = aimNow;
        setAimingHud(aimNow);
      }

      const sprint =
        keys.has('ShiftLeft') || keys.has('ShiftRight') || !!joy?.isSprintHeld();
      const crouch = keys.has('ControlLeft') || keys.has('KeyC');

      let wishFwd = 0;
      let wishStrafe = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) wishFwd += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) wishFwd -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) wishStrafe -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) wishStrafe += 1;
      if (moveStick.y || moveStick.x) {
        wishFwd += -moveStick.y;
        wishStrafe += moveStick.x;
      }
      // Camera-relative: W into look, A = screen-left, D = screen-right.
      // Look flat = (sinYaw, cosYaw) in Three XZ; screen-right = (−cosYaw, sinYaw).
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const moveX = wishFwd * c + wishStrafe * s;
      const moveY = wishFwd * s - wishStrafe * c;

      if (worldReady && hpLocal > 0 && !finishedLocal) {
        stepPlatformer(
          body,
          {
            moveX,
            moveY,
            jumpPressed: keys.has('Space') || !!joy?.isJumpHeld(),
            sprint,
            crouch,
            meleeActive: performance.now() < meleeUntil,
          },
          dt,
          pads,
          scratch,
          bounds,
          physOptsRef.current
        );
      }

      for (const pad of pads) {
        if (pad.kind !== 'checkpoint') continue;
        if (
          Math.abs(body.x - pad.x) <= pad.width / 2 + 0.35 &&
          Math.abs(body.y - pad.y) <= pad.depth / 2 + 0.35 &&
          body.z >= pad.z - 0.35 &&
          body.z <= pad.z + 0.6
        ) {
          checkpoint = { x: pad.x, y: pad.y, z: pad.z };
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
            setFinished(true);
          }
        }
      }
      if (body.z < -4) {
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

      const [tx, ty, tz] = simToThree(body.x, body.y, body.z);
      playerPos.set(tx, ty, tz);

      const liveTps = tpsRef.current;
      if (camera.fov !== liveTps.camera.fov) {
        camera.fov = liveTps.camera.fov;
        camera.updateProjectionMatrix();
      }
      pitch = THREE.MathUtils.clamp(pitch, liveTps.camera.pitchMin, liveTps.camera.pitchMax);

      updateFollowCamera(
        camera,
        playerPos,
        yaw,
        pitch,
        dt,
        aimNow
          ? {
              ...liveTps.camera,
              boomDistance: Math.max(2.2, liveTps.camera.boomDistance * 0.72),
              shoulder:
                liveTps.camera.shoulder === 0
                  ? 0.42
                  : liveTps.camera.shoulder + Math.sign(liveTps.camera.shoulder) * 0.35,
              followSharpness: liveTps.camera.followSharpness + 8,
            }
          : liveTps.camera
      );

      const colliding = new Set<string>();
      roots.forEach((root, id) => {
        if (playerPos.distanceTo(root.position) < 1.2) colliding.add(id);
      });

      if (playerRoot && playerId) {
        playerRoot.visible = !(
          liveTps.player.hideWhenClose && liveTps.camera.boomDistance < liveTps.player.hideDistance
        );
        playerRoot.position.set(tx, ty + liveTps.player.offsetY, tz);
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
        bodyYaw = stepBodyYaw(bodyYaw, targetYaw, dt, aimNow ? 18 : 16);
        playerRoot.rotation.y =
          bodyYaw + (liveTps.player.yawOffsetDeg * Math.PI) / 180;
        const justLanded = !wasGrounded && body.isGrounded;
        wasGrounded = body.isGrounded;
        if (justLanded) landUntil = performance.now() + 280;

        const weaponAtt = findWeaponAttachment(previewSkins ? avatarEntity?.playerSkins : undefined);
        const combat = resolveWeaponCombat(weaponAtt);
        let attackThisFrame = false;

        if (joy?.consumeAttackPulse()) attackPulse = true;
        if (attackPulse) {
          attackPulse = false;
          if (now - lastAttackAt >= combat.cooldownMs) {
            lastAttackAt = now;
            attackThisFrame = true;
            if (combat.kind === 'melee') meleeUntil = now + 500;
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

        director.updatePlayer(playerId, avatarBindings ?? avatarEntity?.playerAnims, {
          moving: Math.abs(moveX) + Math.abs(moveY) > 0.05,
          sprint,
          grounded: body.isGrounded,
          crouch,
          moveX: wishStrafe,
          moveZ: wishFwd,
          alive: hpLocal > 0,
          justLanded: performance.now() < landUntil,
          attack: attackThisFrame,
          attackStyle: combat.attackStyle ?? 'attack',
        });
      }

      director.evaluateTriggers(playDoc.entities, playerPos, interactPulse, colliding);
      interactPulse = false;
      if (joy?.consumeActionPulse()) {
        director.evaluateTriggers(playDoc.entities, playerPos, true, colliding);
      }

      // Timed hazard pulses (match-like: interval off → activeMs on).
      for (const h of hazards) {
        if (h.alwaysActive || h.buttonControlled) continue;
        const nextAt = hazardNextToggle.get(h.id) ?? now;
        if (now >= nextAt) {
          const activeMs = Math.max(100, h.activeMs ?? 900);
          hazardPulseUntil.set(h.id, now + activeMs);
          hazardNextToggle.set(h.id, now + activeMs + Math.max(100, h.intervalMs));
        }
      }

      // Authoritative-style AABB hazards (sim space).
      for (const h of hazards) {
        if (h.buttonControlled) continue;
        const pulsing = !h.alwaysActive && (hazardPulseUntil.get(h.id) ?? 0) > now;
        if (!h.alwaysActive && !pulsing) continue;
        const halfW = h.width / 2 + 0.35;
        const halfD = h.width / 2 + 0.35;
        const halfH = h.height / 2;
        if (
          Math.abs(body.x - h.x) > halfW ||
          Math.abs(body.y - h.y) > halfD ||
          Math.abs(body.z - h.z) > halfH + 0.4
        ) {
          continue;
        }
        if (h.instantKill) {
          hpLocal = 0;
          setHp(0);
          continue;
        }
        const last = lastDamageAt.get(h.id) ?? 0;
        if (now - last >= Math.max(120, h.intervalMs * 0.35)) {
          lastDamageAt.set(h.id, now);
          hpLocal = Math.max(0, hpLocal - h.damage);
          setHp(hpLocal);
        }
      }

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
        }
      }

      director.update(dt);
      if (playerRoot) tickSkinAttachments(playerRoot, dt, now * 0.001);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
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
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [doc, previewSkins, embedded]);

  return (
    <div className={`${embedded ? 'absolute inset-0 z-0' : 'fixed inset-0 z-[9999]'} bg-black flex flex-col`}>
      <div className={`${embedded ? 'h-9 px-3' : 'h-11 px-4'} flex items-center gap-3 bg-black/80 border-b border-white/10 relative z-[60]`}>
        <span className="text-sm font-bold text-emerald-300 tracking-wide uppercase shrink-0">
          {embedded ? 'Map Preview' : 'Play Test'}
        </span>
        <span className="text-[10px] sm:text-xs text-white/50 truncate min-w-0">
          {isTouch
            ? '3rd person · Left move · Right look · Jump / Use / Attack'
            : 'RMB aim · Mouse look · WASD / arrows · Space jump · Shift sprint · E use'}
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
        </div>
        <div className="flex-1" />
        {onClose && (
          <Button size="sm" variant="destructive" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> {embedded ? 'Close' : 'Exit Test'}
          </Button>
        )}
      </div>
      <div className="flex-1 relative min-h-0">
        <div ref={hostRef} className="absolute inset-0 touch-none" />
        <Crosshair visible={aimingHud} style={tpsHud.crosshair} />
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
