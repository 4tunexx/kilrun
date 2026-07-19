import * as THREE from 'three';
import type { NetPlayerState } from '../net/types';
import { loadCharacterPrefab, normalizeCharacter } from '../renderer/asset-loader';
import { toThree } from '../renderer/coords';

function pickClip(clips: THREE.AnimationClip[], patterns: string[]): THREE.AnimationClip | null {
  const lower = clips.map((c) => ({ clip: c, name: c.name.toLowerCase() }));
  for (const pattern of patterns) {
    const hit = lower.find((c) => c.name.includes(pattern));
    if (hit) return hit.clip;
  }
  return null;
}

/** Hide collision / preview meshes so only one visible skinned body remains. */
function pruneExtraMeshes(root: THREE.Object3D) {
  let skinnedCount = 0;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinnedCount += 1;
  });
  if (skinnedCount === 0) return;

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    // Non-skinned meshes on mannequins are usually hulls / LODs → hide them
    mesh.visible = false;
  });

  // If multiple skinned meshes, keep the largest only (avoids double mannequin)
  if (skinnedCount > 1) {
    const skinned: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    });
    skinned.sort((a, b) => {
      const ba = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()).length();
      const bb = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).length();
      return bb - ba;
    });
    skinned.slice(1).forEach((m) => {
      m.visible = false;
    });
  }
}

export class ThreeCharacter {
  public readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private displayPos = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private hasTarget = false;
  private speed = 0;
  private facing = 0;
  private loaded = false;
  private disposed = false;

  constructor(_username: string, _isLocal: boolean) {
    this.root.visible = false;
    void this.load();
  }

  private async load() {
    try {
      const { scene, animations } = await loadCharacterPrefab();
      if (this.disposed) return;

      while (this.root.children.length) {
        this.root.remove(this.root.children[0]);
      }
      normalizeCharacter(scene, 1.8);
      pruneExtraMeshes(scene);
      this.root.add(scene);
      this.loaded = true;
      this.root.visible = true;

      this.mixer = new THREE.AnimationMixer(scene);
      const idle = pickClip(animations, ['idle', 'stand', 'breath']) ?? animations[0];
      const walk = pickClip(animations, ['walk', 'walking']) ?? idle;
      const run = pickClip(animations, ['run', 'sprint', 'running']) ?? walk;
      const jump = pickClip(animations, ['jump', 'fall', 'air']) ?? idle;

      const bind = (key: string, clip: THREE.AnimationClip | null | undefined) => {
        if (!clip || !this.mixer) return;
        const action = this.mixer.clipAction(clip);
        action.enabled = true;
        action.setLoop(THREE.LoopRepeat, Infinity);
        this.actions.set(key, action);
      };
      bind('idle', idle);
      bind('walk', walk);
      bind('run', run);
      bind('jump', jump);

      this.actions.get('idle')?.reset().play();
      this.current = 'idle';
    } catch (err) {
      if (this.disposed) return;
      console.warn('[ThreeCharacter] load failed — using simple mesh', err);
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.95, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 })
      );
      mesh.castShadow = true;
      mesh.position.y = 0.95;
      this.root.add(mesh);
      this.loaded = true;
      this.root.visible = true;
    }
  }

  private play(name: string) {
    if (name === this.current || !this.actions.has(name)) return;
    const next = this.actions.get(name)!;
    const prev = this.actions.get(this.current);
    if (prev) prev.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    this.current = name;
  }

  public update(player: NetPlayerState, dt: number, cameraYaw?: number) {
    if (this.disposed) return;

    const [tx, ty, tz] = toThree(player.x, player.y, player.z ?? 0);
    this.targetPos.set(tx, ty, tz);

    if (!this.hasTarget) {
      this.displayPos.copy(this.targetPos);
      this.hasTarget = true;
    } else {
      // Snap if teleported / huge desync (stops rubber-band glitch trails)
      if (this.displayPos.distanceTo(this.targetPos) > 6) {
        this.displayPos.copy(this.targetPos);
      } else {
        const alpha = 1 - Math.pow(0.001, dt * 14);
        this.displayPos.lerp(this.targetPos, alpha);
      }
      const dx = this.targetPos.x - this.displayPos.x;
      const dz = this.targetPos.z - this.displayPos.z;
      this.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      if (Math.hypot(dx, dz) > 0.002) {
        this.facing = Math.atan2(dx, dz);
      }
    }

    this.root.position.copy(this.displayPos);

    if (this.speed > 1.2) {
      this.root.rotation.y = THREE.MathUtils.lerp(
        this.root.rotation.y,
        this.facing,
        1 - Math.pow(0.001, dt * 10)
      );
    } else if (typeof cameraYaw === 'number') {
      this.root.rotation.y = THREE.MathUtils.lerp(
        this.root.rotation.y,
        cameraYaw,
        1 - Math.pow(0.001, dt * 8)
      );
    }

    this.root.visible = this.loaded && (player.isAlive || player.hasFinished);

    if (!player.isAlive) this.play('idle');
    else if (!player.isGrounded) this.play('jump');
    else if (this.speed > 6 || player.isSprinting) this.play('run');
    else if (this.speed > 0.8) this.play('walk');
    else this.play('idle');

    this.mixer?.update(dt);
  }

  public destroy() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.root.removeFromParent();
  }
}
