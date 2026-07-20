import * as THREE from 'three';
import type { NetPlayerState } from '../net/types';
import type { EditorEntity, PlayerAnimBindings, PlayerAnimSlot } from '../editor/map-document';
import { suggestPlayerBindings } from '../editor/map-document';
import { loadPlayerAvatar } from '../editor/player-avatar';
import { normalizeCharacter } from '../renderer/asset-loader';
import { toThree } from '../renderer/coords';
import { applySkinAttachments, tickSkinAttachments } from '../editor/skin-attachments';
import type { SkinAttachment } from '@/lib/player-skins';

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
    mesh.visible = false;
  });

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

export interface CharacterAvatarOptions {
  /** Map player entity — drives custom GLB + clip bindings. */
  avatarEntity?: EditorEntity | null;
  /** Equipped shop skins (merged with entity.playerSkins). */
  equippedSkins?: SkinAttachment[] | null;
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
  private bindings: PlayerAnimBindings = {};
  private wasGrounded = true;
  private landUntil = 0;
  private avatarOpts: CharacterAvatarOptions;
  private avatarScene: THREE.Object3D | null = null;
  private skinTime = 0;

  constructor(_username: string, _isLocal: boolean, avatar?: CharacterAvatarOptions) {
    this.avatarOpts = avatar ?? {};
    this.root.visible = false;
    void this.load();
  }

  private async load() {
    try {
      const entity = this.avatarOpts.avatarEntity ?? null;
      const { scene, animations, clipNames } = await loadPlayerAvatar(entity);
      if (this.disposed) return;

      while (this.root.children.length) {
        this.root.remove(this.root.children[0]);
      }
      normalizeCharacter(scene, 1.8);
      pruneExtraMeshes(scene);
      const scale = entity?.scale?.[1];
      if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
        scene.scale.multiplyScalar(scale);
      }
      this.root.add(scene);
      this.avatarScene = scene;
      this.loaded = true;
      this.root.visible = true;

      const skins: SkinAttachment[] = [
        ...(entity?.playerSkins ?? []),
        ...(this.avatarOpts.equippedSkins ?? []),
      ];
      if (skins.length) {
        void applySkinAttachments(scene, skins);
      }

      this.mixer = new THREE.AnimationMixer(scene);
      const byName = new Map(animations.map((c) => [c.name || '(unnamed)', c]));

      const authored =
        entity?.playerAnims && Object.keys(entity.playerAnims).length > 0
          ? entity.playerAnims
          : suggestPlayerBindings(clipNames);
      this.bindings = authored;

      const bindSlot = (slot: PlayerAnimSlot, fallbackPatterns: string[], loop = true) => {
        if (!this.mixer) return;
        const clipName = authored[slot];
        let clip = clipName ? byName.get(clipName) : undefined;
        if (!clip) clip = pickClip(animations, fallbackPatterns) ?? undefined;
        if (!clip && animations[0]) clip = animations[0];
        if (!clip) return;
        const action = this.mixer.clipAction(clip);
        action.enabled = true;
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        this.actions.set(slot, action);
      };

      bindSlot('idle', ['idle', 'stand', 'breath']);
      bindSlot('walk', ['walk', 'walking']);
      bindSlot('run', ['run', 'sprint', 'running']);
      bindSlot('jump', ['jump', 'hop'], false);
      bindSlot('fall', ['fall', 'air', 'falling']);
      bindSlot('land', ['land', 'landing'], false);
      bindSlot('crouch', ['crouch', 'sneak', 'duck']);
      bindSlot('strafe_left', ['left', 'strafe']);
      bindSlot('strafe_right', ['right', 'strafe']);
      bindSlot('back', ['back', 'backward']);
      bindSlot('die', ['die', 'death', 'dead'], false);

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

  private play(name: string, loop = true) {
    if (!this.actions.has(name)) {
      if (name !== 'idle' && this.actions.has('idle')) {
        this.play('idle', true);
      }
      return;
    }
    if (name === this.current) return;
    const next = this.actions.get(name)!;
    const prev = this.actions.get(this.current);
    if (prev) prev.fadeOut(0.12);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.12).play();
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

    const justLanded = !this.wasGrounded && player.isGrounded;
    this.wasGrounded = player.isGrounded;
    if (justLanded) this.landUntil = performance.now() + 280;

    // Always show loaded mesh (die clip needs corpse visible)
    this.root.visible = this.loaded;

    if (!player.isAlive) {
      this.play('die', false);
    } else if (performance.now() < this.landUntil && this.actions.has('land')) {
      this.play('land', false);
    } else if (!player.isGrounded) {
      this.play(player.vz > 0.5 ? 'jump' : 'fall', false);
    } else if (player.isCrouching) {
      this.play('crouch');
    } else if (this.speed > 6 || player.isSprinting) {
      this.play('run');
    } else if (this.speed > 0.8) {
      this.play('walk');
    } else {
      this.play('idle');
    }

    this.mixer?.update(dt);
    this.skinTime += dt;
    if (this.avatarScene) tickSkinAttachments(this.avatarScene, dt, this.skinTime);
  }

  public destroy() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions.clear();
    this.root.removeFromParent();
  }
}
