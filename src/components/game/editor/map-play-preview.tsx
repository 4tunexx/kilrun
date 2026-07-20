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
} from '@/lib/platformer-sim';
import {
  mapDocSpawnPoints,
  mapDocToSimFinishes,
  mapDocToSimPlatforms,
  mapDocToWorldBounds,
} from './prefab-storage';
import { loadPlayerAvatar } from './player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import { suggestPlayerBindings } from './map-document';

/**
 * Play Test uses the same pad export + platformer step as Deathrun match
 * (coyote, jump cut, jump pads, solid wall boxes, finishes).
 */
export function MapPlayPreview({ doc, onClose }: { doc: MapDocument; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<DualJoystick | null>(null);
  const [hp, setHp] = useState(100);
  const [finished, setFinished] = useState(false);
  const isTouch = typeof window !== 'undefined' && detectTouchDevice();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const scene = new THREE.Scene();
    const env = ensureEnvironment(doc);
    scene.background = new THREE.Color(env.skyColor || '#0a1220');
    scene.fog = new THREE.FogExp2(env.fogColor || '#0c1830', env.fogDensity ?? 0.022);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    const runner = doc.entities.find(
      (e) => e.kind === 'start' || e.kind === 'spawn_runner' || e.kind === 'player'
    );
    if (runner) {
      camera.position.set(runner.position[0], runner.position[1] + 1.6, runner.position[2]);
    } else {
      camera.position.set(0, 2, 4);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.1);
    sun.position.set(10, 20, 8);
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: env.floorColor || '#1a2740' })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    if (env.floor !== 'void') scene.add(floor);

    const director = new AnimationDirector();
    const roots = new Map<string, THREE.Object3D>();
    let playerRoot: THREE.Object3D | null = null;
    let playerId: string | null = null;
    let hpLocal = 100;
    const lastDamageAt = new Map<string, number>();

    const keys = new Set<string>();
    let yaw = 0;
    let pitch = 0;
    let interactPulse = false;
    let raf = 0;
    const pads = mapDocToSimPlatforms(doc);
    const finishes = mapDocToSimFinishes(doc);
    const bounds = mapDocToWorldBounds(doc, pads, finishes);
    const spawn = mapDocSpawnPoints(doc).runner;
    const scratch = createSimScratch();
    const body: SimBody = {
      x: spawn?.x ?? 0,
      y: spawn?.y ?? 0,
      z: spawn?.z ?? 0,
      vz: 0,
      isGrounded: true,
      energy: 100,
    };
    if (spawn) {
      const [tx, ty, tz] = simToThree(body.x, body.y, body.z);
      camera.position.set(tx, ty + 1.6, tz);
    }
    let finishedLocal = false;
    let checkpoint: { x: number; y: number; z: number } | null = null;
    let wasGrounded = true;
    let landUntil = 0;

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
      for (const ent of doc.entities) {
        if (disposed) return;
        try {
          if (ent.kind === 'player') {
            const loaded = await loadPlayerAvatar(ent);
            if (disposed) return;
            const root = loaded.scene;
            normalizeCharacter(root, 1.75);
            root.position.set(...ent.position);
            root.rotation.set(
              THREE.MathUtils.degToRad(ent.rotation[0]),
              THREE.MathUtils.degToRad(ent.rotation[1]),
              THREE.MathUtils.degToRad(ent.rotation[2])
            );
            root.scale.multiplyScalar(ent.scale[1] || 1);
            root.userData.entityId = ent.id;
            scene.add(root);
            roots.set(ent.id, root);
            director.register(ent.id, root, loaded.animations);
            // Fill bindings in-memory if empty so locomotion works this session
            if (!ent.playerAnims || Object.keys(ent.playerAnims).length === 0) {
              ent.playerAnims = suggestPlayerBindings(loaded.clipNames);
            }
            if (!ent.animation?.availableClips?.length) {
              ent.animation = {
                ...(ent.animation ?? {
                  availableClips: [],
                  trigger: 'none',
                  radius: 2.5,
                  loopActive: false,
                  loopDefault: true,
                }),
                availableClips: loaded.clipNames,
              };
            }
            playerRoot = root;
            playerId = ent.id;
            continue;
          }

          const src = resolveModelSrc(ent.model, ent.customModelUrl);
          if (src) {
            const { root, clips } = await loadAnimatedPrefab(src);
            root.position.set(...ent.position);
            root.rotation.set(
              THREE.MathUtils.degToRad(ent.rotation[0]),
              THREE.MathUtils.degToRad(ent.rotation[1]),
              THREE.MathUtils.degToRad(ent.rotation[2])
            );
            root.scale.set(...ent.scale);
            root.userData.entityId = ent.id;
            scene.add(root);
            roots.set(ent.id, root);
            director.register(ent.id, root, clips);
            if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
              director.playDefault(ent);
            }
          } else if (
            ent.kind === 'spawn_runner' ||
            ent.kind === 'spawn_trapper' ||
            ent.kind === 'start' ||
            ent.kind === 'finish'
          ) {
            const color =
              ent.kind === 'finish'
                ? 0xfbbf24
                : ent.kind === 'spawn_trapper'
                  ? 0xef4444
                  : 0x22c55e;
            const marker = new THREE.Mesh(
              ent.kind === 'finish'
                ? new THREE.BoxGeometry(1.6, 0.12, 1.6)
                : new THREE.ConeGeometry(0.4, 1.2, 10),
              new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
            );
            marker.position.set(ent.position[0], ent.position[1] + 0.6, ent.position[2]);
            scene.add(marker);
          } else if (ent.kind === 'button') {
            const btn = new THREE.Mesh(
              new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
              new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
            );
            btn.position.set(ent.position[0], ent.position[1] + 0.1, ent.position[2]);
            btn.userData.entityId = ent.id;
            scene.add(btn);
            roots.set(ent.id, btn);
          } else if (ent.kind === 'hazard') {
            const hz = new THREE.Mesh(
              new THREE.BoxGeometry(1.5, 0.12, 1.5),
              new THREE.MeshStandardMaterial({
                color: 0xef4444,
                transparent: true,
                opacity: 0.5,
                emissive: 0xaa0000,
                emissiveIntensity: 0.35,
              })
            );
            hz.position.set(...ent.position);
            hz.scale.set(...ent.scale);
            hz.userData.entityId = ent.id;
            scene.add(hz);
            roots.set(ent.id, hz);
          }
        } catch (err) {
          console.warn('[PlayPreview] skip', ent.name, err);
        }
      }
    };
    void loadAll();

    host.requestPointerLock?.().catch(() => {});

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'KeyE') interactPulse = true;
      if (e.key === 'Escape') onClose();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: MouseEvent) => {
      yaw -= (e.movementX || 0) * 0.0025;
      pitch -= (e.movementY || 0) * 0.0025;
      pitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMove);

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
        yaw -= lookStick.x * 2.2 * dt;
        pitch -= lookStick.y * 1.8 * dt;
        pitch = THREE.MathUtils.clamp(pitch, -1.4, 1.4);
      }

      const sprint =
        keys.has('ShiftLeft') || keys.has('ShiftRight') || !!joy?.isSprintHeld();
      const crouch = keys.has('ControlLeft') || keys.has('KeyC');

      // Camera-relative wishdir → sim axes (x forward, y lateral)
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
      // Three forward is +Z; sim forward is +X after remap
      const moveX = wishFwd * c + wishStrafe * s;
      const moveY = wishFwd * s - wishStrafe * c;

      if (hpLocal > 0 && !finishedLocal) {
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

      // Checkpoint / finish (sim space)
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
        } else {
          hpLocal = 0;
          setHp(0);
        }
      }

      const [tx, ty, tz] = simToThree(body.x, body.y, body.z);
      camera.position.set(tx, ty + 1.55, tz);
      camera.lookAt(
        camera.position.x + Math.sin(yaw) * Math.cos(pitch),
        camera.position.y + Math.sin(pitch),
        camera.position.z + Math.cos(yaw) * Math.cos(pitch)
      );

      playerPos.set(tx, ty, tz);

      if (playerRoot && playerId) {
        playerRoot.position.set(tx, ty, tz);
        playerRoot.rotation.y = yaw;
        const pe = doc.entities.find((e) => e.id === playerId);
        const justLanded = !wasGrounded && body.isGrounded;
        wasGrounded = body.isGrounded;
        if (justLanded) landUntil = performance.now() + 280;
        director.updatePlayer(playerId, pe?.playerAnims, {
          moving: Math.abs(moveX) + Math.abs(moveY) > 0.05,
          sprint,
          grounded: body.isGrounded,
          crouch,
          moveX: wishStrafe,
          moveZ: wishFwd,
          alive: hpLocal > 0,
          justLanded: performance.now() < landUntil,
        });
      }

      const colliding = new Set<string>();
      roots.forEach((root, id) => {
        if (playerPos.distanceTo(root.position) < 1.2) colliding.add(id);
      });

      director.evaluateTriggers(doc.entities, playerPos, interactPulse, colliding);
      interactPulse = false;

      for (const ent of doc.entities) {
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
            ? 'Sticks · Jump/Sprint · match physics'
            : 'WASD · Space jump · E · match physics'}
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
        {isTouch && (
          <>
            <JoystickOverlay joystickRef={joystickRef} enabled />
            <div className="absolute bottom-20 right-3 z-[120] flex flex-col gap-2 pointer-events-auto">
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
