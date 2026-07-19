'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { MapDocument } from './map-document';
import { ensureEnvironment, ensureHazard } from './map-document';
import { loadAnimatedPrefab, resolveModelSrc } from './model-scan';
import { AnimationDirector } from './animation-director';

/**
 * Compiles the editor map into a freelook preview with animation triggers.
 * Walk near doors (proximity), press E (interact), step on buttons (collide).
 */
export function MapPlayPreview({ doc, onClose }: { doc: MapDocument; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hp, setHp] = useState(100);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const scene = new THREE.Scene();
    const env = ensureEnvironment(doc);
    scene.background = new THREE.Color(env.skyColor || '#0a1220');
    scene.fog = new THREE.FogExp2(env.fogColor || '#0c1830', env.fogDensity ?? 0.022);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    const runner = doc.entities.find((e) => e.kind === 'spawn_runner' || e.kind === 'player');
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
    let grounded = true;
    let vy = 0;

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
        const src = resolveModelSrc(ent.model, ent.customModelUrl);
        try {
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
            if (ent.kind === 'player') {
              playerRoot = root;
              playerId = ent.id;
              camera.position.set(ent.position[0], ent.position[1] + 1.6, ent.position[2] + 4);
            } else if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
              director.playDefault(ent);
            }
          } else if (ent.kind === 'spawn_runner' || ent.kind === 'spawn_trapper') {
            const color = ent.kind === 'spawn_runner' ? 0x22c55e : 0xef4444;
            const marker = new THREE.Mesh(
              new THREE.ConeGeometry(0.4, 1.2, 10),
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

    const clock = new THREE.Clock();
    const playerPos = new THREE.Vector3();
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = (sprint ? 14 : 8) * dt;
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

      let moveX = 0;
      let moveZ = 0;
      if (keys.has('KeyW')) {
        camera.position.addScaledVector(forward, speed);
        moveZ += 1;
      }
      if (keys.has('KeyS')) {
        camera.position.addScaledVector(forward, -speed);
        moveZ -= 1;
      }
      if (keys.has('KeyA')) {
        camera.position.addScaledVector(right, speed);
        moveX -= 1;
      }
      if (keys.has('KeyD')) {
        camera.position.addScaledVector(right, -speed);
        moveX += 1;
      }

      // Simple jump for player anim testing
      if (keys.has('Space') && grounded) {
        vy = 6;
        grounded = false;
      }
      vy -= 18 * dt;
      camera.position.y += vy * dt;
      if (camera.position.y <= 1.6) {
        camera.position.y = 1.6;
        vy = 0;
        grounded = true;
      }

      camera.lookAt(
        camera.position.x + Math.sin(yaw) * Math.cos(pitch),
        camera.position.y + Math.sin(pitch),
        camera.position.z + Math.cos(yaw) * Math.cos(pitch)
      );

      playerPos.copy(camera.position);
      playerPos.y = 0;

      if (playerRoot && playerId) {
        playerRoot.position.set(camera.position.x, 0, camera.position.z);
        playerRoot.rotation.y = yaw;
        const pe = doc.entities.find((e) => e.id === playerId);
        director.updatePlayer(playerId, pe?.playerAnims, {
          moving: moveX !== 0 || moveZ !== 0,
          sprint,
          grounded,
          crouch: keys.has('ControlLeft') || keys.has('KeyC'),
          moveX,
          moveZ,
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
      if (document.pointerLockElement) document.exitPointerLock?.();
      director.clear();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [doc, onClose]);

  return (
    <div className="fixed inset-0 z-[500] bg-black flex flex-col">
      <div className="h-11 flex items-center gap-3 px-4 bg-black/80 border-b border-white/10">
        <span className="text-sm font-bold text-emerald-300 tracking-wide uppercase">Play Test</span>
        <span className="text-xs text-white/50">
          WASD · Mouse · Space jump · E interact · Esc exit
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
      <div ref={hostRef} className="flex-1 min-h-0" />
      {hp <= 0 && (
        <div className="absolute inset-0 top-11 flex items-center justify-center bg-black/50 pointer-events-none">
          <p className="text-2xl font-black text-red-400 tracking-wide">YOU DIED — exit & retry</p>
        </div>
      )}
    </div>
  );
}
