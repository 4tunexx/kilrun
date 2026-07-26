'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadPlayerAvatar } from './game/editor/player-avatar';
import { suggestPlayerBindings } from './game/editor/map-document';
import { applySkinAttachments, sanitizePackSkinMaterials, tickSkinAttachments } from './game/editor/skin-attachments';
import { normalizeCharacter } from './game/renderer/asset-loader';
import type { SkinAttachment } from '@/lib/player-skins';

type Props = {
  className?: string;
  attachments: SkinAttachment[];
  /** Optional model URL override (admin inventory config). Empty = default pack body. */
  modelUrl?: string | null;
  /** Exact clip name to play; defaults to first clip containing "idle" (case-insensitive). */
  defaultClipName?: string;
  /** Rotation speed in rad/s. Default ~0.4 */
  spinSpeed?: number;
};

/**
 * Standalone three.js turntable preview that loads the configured (or default)
 * body mesh, applies equipped skin attachments, plays the idle/clip animation
 * and slowly auto-spins. Used inside the inventory dialog.
 */
export function InventoryAvatarPreview({
  className,
  attachments,
  modelUrl,
  defaultClipName,
  spinSpeed = 0.4,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const attachmentsRef = useRef<SkinAttachment[]>(attachments);
  attachmentsRef.current = attachments;
  const spinRef = useRef(spinSpeed);
  spinRef.current = spinSpeed;

  // Remount when model / clip changes so the admin site-wide preview updates live.
  const bootKey = `${modelUrl?.trim() || ''}|${defaultClipName?.trim() || ''}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const fixColorSpaces = (root: THREE.Object3D) => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial;
          if (!mat || typeof mat !== 'object') continue;
          const map = (mat as { map?: THREE.Texture | null }).map;
          if (map && map.colorSpace !== THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
          const emissiveMap = (mat as { emissiveMap?: THREE.Texture | null }).emissiveMap;
          if (emissiveMap && emissiveMap.colorSpace !== THREE.SRGBColorSpace) {
            emissiveMap.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
    };

    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
    });
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    // Soft env — strong RoomEnvironment + FBX metalness made skins chrome-grey.
    scene.environment = env.texture;
    scene.environmentIntensity = 0.35;

    const camera = new THREE.PerspectiveCamera(35, w / h, 0.05, 50);
    camera.position.set(0, 1.35, 3.2);
    camera.lookAt(0, 0.85, 0);

    const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x1a1520, 1.1);
    const key = new THREE.DirectionalLight(0xfff2dd, 1.2);
    key.position.set(2, 4, 3);
    const fill = new THREE.DirectionalLight(0x9fb9ff, 0.5);
    fill.position.set(-2.5, 2.2, -1.8);
    scene.add(hemi, key, fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 40),
      new THREE.MeshStandardMaterial({
        color: 0x141c2c,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.6,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    scene.add(floor);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.4, 60),
      new THREE.MeshBasicMaterial({
        color: 0x4c8bff,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.002;
    scene.add(glow);

    const timer = new THREE.Timer();
    timer.connect(document);
    let mixer: THREE.AnimationMixer | null = null;
    let avatarScene: THREE.Object3D | null = null;
    let skinsAppliedVersion = 0;
    let cancelled = false;
    let raf = 0;

    const reapplySkins = async (next: SkinAttachment[]) => {
      if (!avatarScene) return;
      await applySkinAttachments(avatarScene, next);
      fixColorSpaces(avatarScene);
      sanitizePackSkinMaterials(avatarScene);
    };

    let reapplyTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReapply = () => {
      if (reapplyTimer) clearTimeout(reapplyTimer);
      const snapshot = [...attachmentsRef.current];
      const targetVersion = ++skinsAppliedVersion;
      reapplyTimer = setTimeout(() => {
        void reapplySkins(snapshot).then(() => {
          if (targetVersion !== skinsAppliedVersion) return;
        });
      }, 0);
    };

    (async () => {
      try {
        const override = modelUrl?.trim() || null;
        const loaded = await loadPlayerAvatar(null, override);
        if (cancelled) return;
        normalizeCharacter(loaded.scene, 1.75);
        pivot.add(loaded.scene);
        avatarScene = loaded.scene;
        sanitizePackSkinMaterials(loaded.scene);
        fixColorSpaces(loaded.scene);

        const clips = loaded.animations;
        mixer = new THREE.AnimationMixer(loaded.scene);
        const byName = new Map(clips.map((c) => [c.name || '(unnamed)', c]));
        const bindings = suggestPlayerBindings(loaded.clipNames ?? clips.map((c) => c.name || ''));
        const desiredName =
          defaultClipName?.trim() ||
          bindings.idle ||
          clips.find((c) => /idle/i.test(c.name || ''))?.name ||
          clips.find((c) => /stand/i.test(c.name || ''))?.name ||
          clips.find((c) => /breath/i.test(c.name || ''))?.name ||
          null;
        const pick = desiredName ? byName.get(desiredName) ?? null : null;
        const fallback =
          pick ||
          clips.find((c) => /idle/i.test(c.name || '')) ||
          clips.find((c) => /stand/i.test(c.name || '')) ||
          clips.find((c) => /breath/i.test(c.name || '')) ||
          clips.find((c) => /relax/i.test(c.name || '')) ||
          clips[0] ||
          null;
        if (fallback) {
          mixer.stopAllAction();
          const action = mixer.clipAction(fallback);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.enabled = true;
          action.play();
        }

        await reapplySkins([...attachmentsRef.current]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[InventoryAvatarPreview] failed to load', e);
      }
    })();

    const ro = new ResizeObserver(() => {
      const nw = Math.max(1, host.clientWidth);
      const nh = Math.max(1, host.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    });
    ro.observe(host);

    const prevAttachmentsKey = { v: JSON.stringify(attachmentsRef.current) };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      pivot.rotation.y += dt * spinRef.current;
      mixer?.update(dt);
      if (avatarScene) tickSkinAttachments(avatarScene, dt);
      const nextKey = JSON.stringify(attachmentsRef.current);
      if (nextKey !== prevAttachmentsKey.v) {
        prevAttachmentsKey.v = nextKey;
        scheduleReapply();
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (reapplyTimer) clearTimeout(reapplyTimer);
      mixer?.stopAllAction();
      if (avatarScene) pivot.remove(avatarScene);
      ro.disconnect();
      timer.disconnect();
      env.texture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [bootKey, defaultClipName, modelUrl]);

  return <div ref={hostRef} className={className} />;
}
