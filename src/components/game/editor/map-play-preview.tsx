'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { MapDocument } from './map-document';
import { ensureEnvironment, ensureHazard } from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { AnimationDirector } from './animation-director';
import { DualJoystick } from '../input/dual-joystick';
import { JoystickOverlay } from '../ui/joystick-overlay';
import { detectTouchDevice } from '../utils/constants';
import {
  createSimScratch,
  simToThree,
  stepPlatformer,
  type SimBody,
  type SimPad,
} from '@/lib/platformer-sim';
import {
  mapDocSpawnPoints,
  mapDocToSimFinishes,
  mapDocToSimPlatforms,
  mapDocToWorldBounds,
  prepareDocForPlayTest,
} from './prefab-storage';
import { loadPlayerAvatar, getMapPlayerAvatar } from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import { suggestPlayerBindings } from './map-document';
import { updateFollowCamera } from '../renderer/three-world';
import { applySkinAttachments, tickSkinAttachments } from './skin-attachments';
import {
  findWeaponAttachment,
  resolveWeaponCombat,
} from '@/lib/weapons';

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
  if (ent.kind === 'button') {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    );
    btn.position.y = 0.1;
    return btn;
  }
  if (ent.kind === 'hazard' || ent.kind === 'trap') {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.55,
        emissive: 0xaa0000,
        emissiveIntensity: 0.35,
      })
    );
  }
  if (
    ent.kind === 'spawn_runner' ||
    ent.kind === 'spawn_trapper' ||
    ent.kind === 'start' ||
    ent.kind === 'finish' ||
    ent.kind === 'checkpoint'
  ) {
    const color =
      ent.kind === 'finish'
        ? 0xfbbf24
        : ent.kind === 'spawn_trapper'
          ? 0xef4444
          : ent.kind === 'checkpoint'
            ? 0x34d399
            : 0x22c55e;
    if (ent.kind === 'finish' || ent.kind === 'checkpoint') {
      return new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.12, 1.6),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
      );
    }
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.2, 10),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
    );
    cone.position.y = 0.6;
    return cone;
  }
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: ent.color ? new THREE.Color(ent.color) : 0x888888 })
  );
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
 * Camera is a pulled-back 3rd-person platformer chase-cam so the Player Model is visible.
 */
export function MapPlayPreview({ doc, onClose }: { doc: MapDocument; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const [hp, setHp] = useState(100);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStartNote, setAutoStartNote] = useState(false);
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const prepared = prepareDocForPlayTest(doc);
    const playDoc = prepared.doc;
    if (prepared.autoStart) setAutoStartNote(true);

    let disposed = false;
    const scene = new THREE.Scene();
    const env = ensureEnvironment(playDoc);
    scene.background = new THREE.Color(env.skyColor || '#0a1220');
    // Lighter fog so platforms/avatar stay readable on mobile
    const fogDensity = Math.min(env.fogDensity ?? 0.018, 0.014);
    scene.fog = new THREE.FogExp2(env.fogColor || '#0c1830', fogDensity);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    const pads = mapDocToSimPlatforms(playDoc);
    const finishes = mapDocToSimFinishes(playDoc);
    const bounds = mapDocToWorldBounds(playDoc, pads, finishes);
    const spawn = mapDocSpawnPoints(playDoc).runner;

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

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.15);
    sun.position.set(10, 22, 8);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x88aacc, 0x1a2740, 0.45));

    // Always keep a readable ground reference (even if env.floor is void)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({
        color: env.floorColor || '#1a2740',
        transparent: env.floor === 'void',
        opacity: env.floor === 'void' ? 0.25 : 1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    scene.add(floor);

    // Collision pads as visible platforms so Play Test is never an empty void
    // even when GLBs are still loading or failed on mobile.
    addCollisionPadMeshes(scene, pads);

    const director = new AnimationDirector();
    const roots = new Map<string, THREE.Object3D>();
    let playerRoot: THREE.Object3D | null = null;
    let playerId: string | null = null;
    let hpLocal = 100;
    const lastDamageAt = new Map<string, number>();

    const keys = new Set<string>();
    let yaw = 0;
    let pitch = -0.28; // look slightly down so body + floor frame correctly
    let interactPulse = false;
    let attackPulse = false;
    let lastAttackAt = 0;
    let raf = 0;
    const scratch = createSimScratch();
    let finishedLocal = false;
    let checkpoint: { x: number; y: number; z: number } | null = null;
    let wasGrounded = true;
    let landUntil = 0;
    let avatarEntity = getMapPlayerAvatar(playDoc) ?? null;
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
        const root = loaded.scene;
        normalizeCharacter(root, 1.75);
        const scaleY = avatarEntity?.scale?.[1] || 1;
        root.scale.multiplyScalar(scaleY);
        const [px, py, pz] = simToThree(body.x, body.y, body.z);
        root.position.set(px, py, pz);
        root.userData.entityId = avatarEntity?.id ?? '__play_avatar__';
        root.userData.isPlayAvatar = true;
        scene.add(root);
        playerRoot = root;
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
          if (avatarEntity.playerSkins?.length) {
            await applySkinAttachments(root, avatarEntity.playerSkins);
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
        playerId = '__play_avatar_fallback__';
      }

      for (const ent of playDoc.entities) {
        if (disposed) return;
        // Skip map player entity — controllable avatar already spawned
        if (ent.kind === 'player') continue;
        if (ent.kind === 'light') continue;
        try {
          const src = resolveModelSrc(ent.model, ent.customModelUrl);
          let visual: THREE.Object3D;
          if (src) {
            const { root, clips } = await loadAnimatedPrefab(src);
            root.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(root);
            if (!box.isEmpty()) {
              const center = new THREE.Vector3();
              box.getCenter(center);
              root.position.x -= center.x;
              root.position.z -= center.z;
              root.position.y -= box.min.y;
            }
            const planted = new THREE.Group();
            planted.add(root);
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
            director.register(ent.id, planted, clips);
            if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
              director.playDefault(ent);
            }
            continue;
          }

          visual = placeholderForEntity(ent);
          const planted = new THREE.Group();
          planted.add(visual);
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
        } catch (err) {
          console.warn('[PlayPreview] skip', ent.name, err);
          try {
            const visual = placeholderForEntity(ent);
            const planted = new THREE.Group();
            planted.add(visual);
            planted.position.set(...ent.position);
            planted.scale.set(...ent.scale);
            planted.userData.entityId = ent.id;
            scene.add(planted);
            roots.set(ent.id, planted);
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

    host.requestPointerLock?.().catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'KeyE') interactPulse = true;
      if (e.code === 'KeyF' || e.code === 'Mouse0') attackPulse = true;
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: MouseEvent) => {
      yaw -= (e.movementX || 0) * 0.0022;
      pitch -= (e.movementY || 0) * 0.0018;
      pitch = THREE.MathUtils.clamp(pitch, -0.85, 0.45);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) attackPulse = true;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onMouseDown);

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
        yaw -= lookStick.x * 1.15 * dt;
        pitch -= lookStick.y * 0.85 * dt;
        pitch = THREE.MathUtils.clamp(pitch, -0.85, 0.45);
      }

      const sprint =
        keys.has('ShiftLeft') || keys.has('ShiftRight') || !!joy?.isSprintHeld();
      const crouch = keys.has('ControlLeft') || keys.has('KeyC');

      let wishFwd = 0;
      let wishStrafe = 0;
      if (keys.has('KeyW')) wishFwd += 1;
      if (keys.has('KeyS')) wishFwd -= 1;
      if (keys.has('KeyA')) wishStrafe -= 1;
      if (keys.has('KeyD')) wishStrafe += 1;
      if (moveStick.y || moveStick.x) {
        wishFwd += -moveStick.y;
        wishStrafe += moveStick.x;
      }
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
          },
          dt,
          pads,
          scratch,
          bounds
        );
      }

      for (const pad of pads) {
        if (pad.kind !== 'checkpoint') continue;
        if (
          Math.abs(body.x - pad.x) <= pad.width / 2 + 0.4 &&
          Math.abs(body.y - pad.y) <= pad.depth / 2 + 0.4 &&
          body.z >= pad.z - 0.4 &&
          body.z <= pad.z + 0.6
        ) {
          checkpoint = { x: pad.x, y: pad.y, z: pad.z };
        }
      }
      for (const f of finishes) {
        const halfW = f.width / 2;
        const halfD = f.depth / 2;
        if (
          Math.abs(body.x - f.x) <= halfW + 0.4 &&
          Math.abs(body.y - f.y) <= halfD + 0.4 &&
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

      updateFollowCamera(camera, playerPos, yaw, pitch, dt, 8.2, 'platformer');

      const colliding = new Set<string>();
      roots.forEach((root, id) => {
        if (playerPos.distanceTo(root.position) < 1.2) colliding.add(id);
      });

      if (playerRoot && playerId) {
        playerRoot.position.set(tx, ty, tz);
        playerRoot.rotation.y = yaw;
        const justLanded = !wasGrounded && body.isGrounded;
        wasGrounded = body.isGrounded;
        if (justLanded) landUntil = performance.now() + 280;

        const weaponAtt = findWeaponAttachment(avatarEntity?.playerSkins);
        const combat = resolveWeaponCombat(weaponAtt);
        let attackThisFrame = false;

        if (joy?.consumeAttackPulse()) attackPulse = true;
        if (attackPulse) {
          attackPulse = false;
          if (now - lastAttackAt >= combat.cooldownMs) {
            lastAttackAt = now;
            attackThisFrame = true;
            if (combat.kind !== 'cosmetic') {
              const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
              const reach = Math.max(1.2, combat.range);
              const aimPoint = playerPos
                .clone()
                .addScaledVector(forward, Math.min(reach, combat.kind === 'hitscan' ? 3.2 : 2.2));
              aimPoint.y += 0.9;
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

      for (const ent of playDoc.entities) {
        const hz = ensureHazard(ent);
        if (!hz.enabled && ent.kind !== 'hazard') continue;
        if (ent.kind === 'hazard' && ent.hazard?.enabled === false) continue;
        const root = roots.get(ent.id);
        const pos = root
          ? root.position
          : new THREE.Vector3(ent.position[0], ent.position[1], ent.position[2]);
        const reach = Math.max(1.15, Math.abs(ent.scale[0]) * 0.85);
        if (playerPos.distanceTo(pos) > reach) continue;
        if (hz.instantKill) {
          hpLocal = 0;
          setHp(0);
          continue;
        }
        const last = lastDamageAt.get(ent.id) ?? 0;
        if (now - last >= hz.intervalMs) {
          lastDamageAt.set(ent.id, now);
          hpLocal = Math.max(0, hpLocal - hz.damage);
          setHp(hpLocal);
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
      joy?.destroy();
      joystickRef.current = null;
      if (document.pointerLockElement) document.exitPointerLock?.();
      director.clear();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [doc, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="h-11 flex items-center gap-3 px-4 bg-black/80 border-b border-white/10 relative z-[60]">
        <span className="text-sm font-bold text-emerald-300 tracking-wide uppercase shrink-0">
          Play Test
        </span>
        <span className="text-[10px] sm:text-xs text-white/50 truncate min-w-0">
          {isTouch
            ? '3rd person · Left move · Right look · Jump / Use / Attack'
            : '3rd person · WASD · E use · click attack · mouse look'}
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
        <Button size="sm" variant="destructive" onClick={onClose}>
          <X className="w-4 h-4 mr-1" /> Exit Test
        </Button>
      </div>
      <div className="flex-1 relative min-h-0">
        <div ref={hostRef} className="absolute inset-0 touch-none" />
        {loading && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 pointer-events-none">
            <p className="text-sm font-semibold text-white/80 tracking-wide">Loading play test…</p>
          </div>
        )}
        {autoStartNote && !loading && (
          <div className="absolute top-3 left-3 right-3 z-[70] pointer-events-none">
            <p className="mx-auto max-w-md rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-center text-[11px] text-amber-100">
              No Start spawn found — spawned from your Player avatar. Place a green{' '}
              <span className="font-bold">Start</span> flag on a solid floor next time.
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
