import * as THREE from 'three';
import type { NetPlayerState } from '../net/types';
import type { EditorEntity, PlayerAnimBindings, PlayerAnimSlot } from '../editor/map-document';
import { suggestPlayerBindings } from '../editor/map-document';
import { loadPlayerAvatar, fitAvatarLikeEditor } from '../editor/player-avatar';
import { toThree } from '../renderer/coords';
import {
  computeLocomotionFacingYaw,
  stepBodyYaw,
} from '../tps/locomotion-facing';
import { applySkinAttachments, tickSkinAttachments } from '../editor/skin-attachments';
import { resolveModelSrc } from '../editor/model-scan';
import type { SkinAttachment } from '@/lib/player-skins';
import { BODY_COLOR_NONE } from '@/lib/body-colors';
import { applyTeamTint } from '@/lib/premium-skin-config';

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
  /** Purchased/equipped shop skins only (map editor skins are ignored in live play). */
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
  private attackUntil = 0;
  private avatarOpts: CharacterAvatarOptions;
  private avatarScene: THREE.Object3D | null = null;
  private skinTime = 0;
  private isLocal = false;
  private bodyColorIndex = BODY_COLOR_NONE;
  private hasPremiumFullBody = false;
  /** Last remote sync key: `${modelUrl}|${skinId}` */
  public syncedWeaponKey = '';
  private muzzleLight: THREE.PointLight | null = null;
  private muzzleUntil = 0;
  private weaponKick = 0;
  private weaponKickTarget = 0;
  private weaponMixer: THREE.AnimationMixer | null = null;
  private weaponActions = new Map<string, THREE.AnimationAction>();
  private weaponClipNames = { fire: '', reload: '', idle: '' };

  constructor(_username: string, isLocal: boolean, avatar?: CharacterAvatarOptions) {
    this.isLocal = isLocal;
    this.avatarOpts = avatar ?? {};
    this.hasPremiumFullBody = Boolean(
      avatar?.equippedSkins?.some(
        (s) => s.slot === 'fullbody' || (s as { equipSlot?: string }).equipSlot === 'fullbody'
      )
    );
    this.root.visible = false;
    void this.load();
  }

  private async load() {
    try {
      const entity = this.avatarOpts.avatarEntity ?? null;
      const allSkins: SkinAttachment[] = [...(this.avatarOpts.equippedSkins ?? [])];

      // Decide which premium fullbody skin (if any) actually has a loadable source.
      // We MUST guard against malformed / stripped skins where slot==='fullbody' but
      // model/customModelUrl are empty (e.g. oversized data URLs were stripped by
      // compactSkinsForMatch or the Colyseus join payload caps options). Setting
      // hasPremiumFullBody=true for such a skin would make applyTeamTint flip the
      // base body to emissive blending even though the premium model didn't load.
      const loadableFullbody =
        allSkins.find(
          (skin) =>
            (skin.slot === 'fullbody' ||
              (skin as { equipSlot?: string }).equipSlot === 'fullbody') &&
            Boolean(resolveModelSrc(skin.model, skin.customModelUrl))
        ) ?? null;
      this.hasPremiumFullBody = Boolean(loadableFullbody);

      // Avatar base: always the pack default. Fullbody costumes layer OVER it
      // via applySkinAttachments (never replace / hide the default body).
      // Body-slot meshes may hide the default after a successful rebind.
      const { scene, animations, clipNames, isDefaultMannequin } =
        await loadPlayerAvatar(entity, null);
      if (this.disposed) return;

      while (this.root.children.length) {
        this.root.remove(this.root.children[0]);
      }
      const fitted = fitAvatarLikeEditor(scene, entity, isDefaultMannequin);
      pruneExtraMeshes(fitted);

      // Ensure base skinned meshes start visible; applySkinAttachments may
      // hide them only for a successful body-slot mesh swap (not fullbody).
      fitted.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) mesh.visible = true;
        else if ((o as THREE.Mesh).isMesh) {
          // Keep collision/preview meshes hidden (they're not the drawable body).
          const name = String(o.name || '').toLowerCase();
          if (/collis|preview|hitbox|trigger/.test(name)) {
            (o as THREE.Mesh).visible = false;
          }
        }
      });

      this.root.add(fitted);
      this.avatarScene = scene;

      // Layer equipped skins (fullbody overlays + clothing + body swaps).
      if (allSkins.length > 0) {
        await applySkinAttachments(scene, allSkins);
        if (this.disposed) return;
        const wep = allSkins.find((s) => s.slot === 'weapon');
        this.rebindWeaponMixer({
          fire: wep?.weapon?.fireClip,
          reload: wep?.weapon?.reloadClip,
        });
      }

      if (this.bodyColorIndex !== BODY_COLOR_NONE) {
        applyTeamTint(scene, this.bodyColorIndex, {
          preferEmissive: this.hasPremiumFullBody,
        });
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
      bindSlot('attack', ['attack', 'slash', 'swing', 'shoot', 'fire', 'punch', 'hit'], false);
      bindSlot('punch', ['punch', 'hit', 'jab', 'melee'], false);
      bindSlot('die', ['die', 'death', 'dead'], false);

      this.actions.get('idle')?.reset().play();
      this.current = 'idle';
      this.loaded = true;
      this.root.visible = true;
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

  /** Play weapon / punch swing (client visual — combat damage is server-side). */
  public triggerAttack(style: 'attack' | 'punch' = 'attack') {
    const slot = style === 'punch' && this.actions.has('punch') ? 'punch' : 'attack';
    const fallback = this.actions.has(slot) ? slot : this.actions.has('punch') ? 'punch' : null;
    if (!fallback) return;
    this.attackUntil = performance.now() + 480;
    this.play(fallback, false);
  }

  /** Brief muzzle flash + optional weapon push-back (local feel). */
  public pulseMuzzle(kickZ = 0.06) {
    if (!this.avatarScene) return;
    if (!this.muzzleLight) {
      this.muzzleLight = new THREE.PointLight(0xffcc88, 0, 2.5, 2);
      this.muzzleLight.position.set(0.15, 1.2, 0.35);
      this.root.add(this.muzzleLight);
    }
    this.muzzleLight.intensity = 2.4;
    this.muzzleUntil = performance.now() + 55;
    this.weaponKickTarget = Math.max(this.weaponKickTarget, kickZ);
  }

  /** Bind AnimationMixer to the hand weapon mesh (uses GLB clips if present). */
  private rebindWeaponMixer(clipHints?: { fire?: string; reload?: string; idle?: string }) {
    this.weaponMixer?.stopAllAction();
    this.weaponMixer = null;
    this.weaponActions.clear();
    if (!this.avatarScene) return;
    let holderFound: THREE.Object3D | null = null;
    this.avatarScene.traverse((o) => {
      if (holderFound) return;
      if (o.userData?.isWeaponSkin) holderFound = o;
    });
    const holder = holderFound as THREE.Object3D | null;
    if (!holder) return;
    const found: THREE.AnimationClip[] = [];
    const pushClips = (o: THREE.Object3D) => {
      const nested = o.userData?.gltfClips as THREE.AnimationClip[] | undefined;
      if (nested?.length) found.push(...nested);
    };
    pushClips(holder);
    holder.traverse(pushClips);
    if (!found.length) return;
    const target =
      holder.children[0] && !holder.children[0].userData?.isWeaponSkin
        ? holder.children[0]
        : holder;
    this.weaponMixer = new THREE.AnimationMixer(target);
    for (const clip of found) {
      const action = this.weaponMixer.clipAction(clip);
      this.weaponActions.set((clip.name || 'clip').toLowerCase(), action);
      if (clip.name) this.weaponActions.set(clip.name, action);
    }
    this.weaponClipNames = {
      fire: clipHints?.fire || '',
      reload: clipHints?.reload || '',
      idle: clipHints?.idle || '',
    };
    const idleName = this.weaponClipNames.idle;
    if (idleName) this.playWeaponClip(idleName, true);
  }

  /**
   * Play a clip on the equipped weapon mesh.
   * Falls back to fuzzy match (name includes "fire" / "reload").
   */
  public playWeaponClip(preferred?: string, loop = false) {
    if (!this.weaponMixer || this.weaponActions.size === 0) return false;
    let action: THREE.AnimationAction | undefined;
    if (preferred) {
      action =
        this.weaponActions.get(preferred) ||
        this.weaponActions.get(preferred.toLowerCase());
    }
    if (!action && preferred) {
      const want = preferred.toLowerCase();
      for (const [name, a] of this.weaponActions) {
        if (name.toLowerCase().includes(want)) {
          action = a;
          break;
        }
      }
    }
    if (!action) {
      // Fuzzy defaults
      const hint = (preferred || '').toLowerCase();
      const fuzzy =
        hint.includes('reload') || hint === 'reload'
          ? 'reload'
          : hint.includes('idle')
            ? 'idle'
            : 'fire';
      for (const [name, a] of this.weaponActions) {
        if (name.toLowerCase().includes(fuzzy)) {
          action = a;
          break;
        }
      }
    }
    if (!action) return false;
    this.weaponMixer.stopAllAction();
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.05).play();
    return true;
  }

  public playWeaponFireClip() {
    const name = this.weaponClipNames.fire || 'fire';
    if (!this.playWeaponClip(name, false)) {
<<<<<<< HEAD
      if (!this.playWeaponClip('shoot', false)) {
        this.playWeaponClip('attack', false);
      }
=======
      this.playWeaponClip('shoot', false) || this.playWeaponClip('attack', false);
>>>>>>> origin/main
    }
  }

  public playWeaponReloadClip() {
    const name = this.weaponClipNames.reload || 'reload';
    this.playWeaponClip(name, false);
  }

  /** Apply gameplay body color (Deathrun / Horde / Competitive). Safe to call before/after load. */
  public setBodyColor(index: number) {
    const next = Number.isFinite(index) ? Math.trunc(index) : BODY_COLOR_NONE;
    if (next === this.bodyColorIndex) return;
    this.bodyColorIndex = next;
    if (!this.avatarScene) return;
    applyTeamTint(this.avatarScene, this.bodyColorIndex, {
      preferEmissive: this.hasPremiumFullBody,
    });
  }

  /** Hot-swap hand weapon mesh after Horde/Competitive shop buy. */
  public async equipWeaponMesh(
    modelUrl: string,
    combat?: {
      kind?: string;
      damage?: number;
      range?: number;
      cooldownMs?: number;
      coneRadians?: number;
      textureUrl?: string;
      fireClip?: string;
      reloadClip?: string;
      idleClip?: string;
    }
  ) {
    if (this.disposed || !this.avatarScene) return;
    const prevWeapon = (this.avatarOpts.equippedSkins ?? []).find((s) => s.slot === 'weapon');
    // Match shop skin overrides VP texture; otherwise keep prior / VP texture.
    const textureUrl = combat?.textureUrl || prevWeapon?.textureUrl;
    const weaponAtt: SkinAttachment = {
      id: `shop-weapon-${Date.now()}`,
      slot: 'weapon',
      customModelUrl: modelUrl,
      textureUrl,
      attachMode: 'bone',
      bone: 'hand_r',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      weapon: combat
        ? {
            kind: (combat.kind as 'melee' | 'hitscan' | 'cosmetic') || 'hitscan',
            damage: combat.damage ?? 25,
            range: combat.range ?? 14,
            cooldownMs: combat.cooldownMs ?? 350,
            coneRadians: combat.coneRadians ?? 0.18,
            fireClip: combat.fireClip,
            reloadClip: combat.reloadClip,
          }
        : undefined,
    };
    const rest = (this.avatarOpts.equippedSkins ?? []).filter((s) => s.slot !== 'weapon');
    const next = [...rest, weaponAtt];
    this.avatarOpts.equippedSkins = next;
    await applySkinAttachments(this.avatarScene, next);
    if (this.disposed) return;
    this.rebindWeaponMixer({
      fire: combat?.fireClip || prevWeapon?.weapon?.fireClip,
      reload: combat?.reloadClip || prevWeapon?.weapon?.reloadClip,
      idle: combat?.idleClip,
    });
  }

  /** Paint an equipped weapon skin (texture) onto the current hand weapon mesh. */
  public async applyWeaponSkinTexture(textureUrl: string) {
    if (this.disposed || !this.avatarScene || !textureUrl) return;
    const skins = this.avatarOpts.equippedSkins ?? [];
    const weapon = skins.find((s) => s.slot === 'weapon');
    if (!weapon) {
      // No shop weapon yet — stash texture on a placeholder weapon slot attachment.
      const stash: SkinAttachment = {
        id: `weapon-skin-${Date.now()}`,
        slot: 'weapon',
        textureUrl,
        attachMode: 'bone',
        bone: 'hand_r',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };
      this.avatarOpts.equippedSkins = [...skins.filter((s) => s.slot !== 'weapon'), stash];
      await applySkinAttachments(this.avatarScene, this.avatarOpts.equippedSkins);
      return;
    }
    const nextWeapon: SkinAttachment = { ...weapon, textureUrl };
    const next = [...skins.filter((s) => s.slot !== 'weapon'), nextWeapon];
    this.avatarOpts.equippedSkins = next;
    await applySkinAttachments(this.avatarScene, next);
    if (this.disposed) return;
    this.rebindWeaponMixer({
      fire: nextWeapon.weapon?.fireClip,
      reload: nextWeapon.weapon?.reloadClip,
    });
  }

  public update(
    player: NetPlayerState,
    dt: number,
    cameraYaw?: number,
    moveWish?: { fwd: number; strafe: number },
    /** GTA aim: face camera and strafe — ignore locomotion turn. */
    aimHeld?: boolean
  ) {
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
        // Local player: sharper follow (light client prediction feel).
        // Remotes: softer interpolate for lag smoothing.
        const sharpness = this.isLocal ? 28 : 14;
        const alpha = 1 - Math.pow(0.001, dt * sharpness);
        this.displayPos.lerp(this.targetPos, alpha);
      }
      const dx = this.targetPos.x - this.displayPos.x;
      const dz = this.targetPos.z - this.displayPos.z;
      this.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      if (Math.hypot(dx, dz) > 0.002) {
        this.facing = Math.atan2(dx, dz);
      }
    }

    // Local prediction lead: nudge display along wish dir while grounded.
    if (this.isLocal && moveWish && player.isGrounded && player.isAlive) {
      const lead = 0.085;
      const yaw = typeof cameraYaw === 'number' ? cameraYaw : player.cameraYaw;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const fx = moveWish.fwd * sin + moveWish.strafe * -cos;
      const fz = moveWish.fwd * cos + moveWish.strafe * sin;
      this.displayPos.x += fx * lead;
      this.displayPos.z += fz * lead;
    }

    this.root.position.copy(this.displayPos);

    // Weapon kick recovery (visual only)
    this.weaponKick += (this.weaponKickTarget - this.weaponKick) * Math.min(1, dt * 18);
    this.weaponKickTarget *= Math.max(0, 1 - dt * 10);
    if (this.avatarScene && Math.abs(this.weaponKick) > 0.0005) {
      this.avatarScene.position.z = -this.weaponKick;
    } else if (this.avatarScene) {
      this.avatarScene.position.z = 0;
    }
    if (this.muzzleLight && performance.now() > this.muzzleUntil) {
      this.muzzleLight.intensity = 0;
    }

    const aimYaw = typeof cameraYaw === 'number' ? cameraYaw : player.cameraYaw;
    const lookYaw =
      typeof aimYaw === 'number' && Number.isFinite(aimYaw) ? aimYaw : this.facing;

    // Match Map Editor Play Test:
    // - mouse only orbits the camera while idle
    // - body faces camera only while aiming (RMB / look-stick)
    // - otherwise body faces walk direction (or keeps last yaw when standing still)
    let wantYaw = this.isLocal ? this.root.rotation.y : this.facing;
    if (aimHeld) {
      wantYaw = lookYaw;
    } else if (moveWish && Math.hypot(moveWish.fwd, moveWish.strafe) > 0.12) {
      wantYaw = computeLocomotionFacingYaw(
        lookYaw,
        moveWish.fwd,
        moveWish.strafe,
        this.root.rotation.y
      );
    }

    this.root.rotation.y = stepBodyYaw(
      this.root.rotation.y,
      wantYaw,
      dt,
      aimHeld ? 18 : this.speed > 1.2 ? 16 : 12
    );
    this.facing = this.root.rotation.y;

    const justLanded = !this.wasGrounded && player.isGrounded;
    this.wasGrounded = player.isGrounded;
    if (justLanded) this.landUntil = performance.now() + 280;

    // Always show loaded mesh (die clip needs corpse visible)
    this.root.visible = this.loaded;

    const wishFwd = moveWish?.fwd ?? 0;
    const wishStrafe = moveWish?.strafe ?? 0;
    const moving = Math.abs(wishFwd) + Math.abs(wishStrafe) > 0.05;

    // Use EXACT state machine copied from animation-director.ts →
    // updatePlayer() so Live matches behave 1:1 with Play Test.
    if (!player.isAlive) {
      const slot = this.actions.has('die') ? 'die' : 'idle';
      this.play(slot, false);
    } else if (performance.now() < this.attackUntil) {
      // attack / punch keeps playing until finished
    } else if (performance.now() < this.landUntil && this.actions.has('land')) {
      this.play('land', false);
    } else if (!player.isGrounded) {
      // Play Test: airborne AND any horizontal input => jump, else fall.
      // vz threshold is NOT used — otherwise the anim flips to fall at apex
      // (vz ~0 → negative) before player has visually left the ground.
      this.play(moving || wishFwd !== 0 ? 'jump' : 'fall', false);
    } else if (player.isCrouching) {
      this.play('crouch');
    } else if (moving) {
      // Aim-hold: body faces camera, use directional strafe/back clips.
      if (aimHeld) {
        if (
          Math.abs(wishStrafe) > Math.abs(wishFwd) + 0.15 &&
          (wishStrafe < 0 ? this.actions.has('strafe_left') : this.actions.has('strafe_right'))
        ) {
          this.play(wishStrafe < 0 ? 'strafe_left' : 'strafe_right');
        } else if (wishFwd < -0.5 && Math.abs(wishStrafe) < 0.35) {
          this.play(this.actions.has('back') ? 'back' : player.isSprinting ? 'run' : 'walk');
        } else {
          this.play(player.isSprinting ? 'run' : 'walk');
        }
      } else {
        // Play Test: yaw faces travel direction. Use dedicated back clip
        // only for pure backpedal (S alone); otherwise walk/run based on sprint.
        if (wishFwd < -0.5 && Math.abs(wishStrafe) < 0.35 && this.actions.has('back')) {
          this.play('back');
        } else {
          this.play(player.isSprinting ? 'run' : 'walk');
        }
      }
    } else {
      this.play('idle');
    }

    this.mixer?.update(dt);
    this.weaponMixer?.update(dt);
    this.skinTime += dt;
    if (this.avatarScene) tickSkinAttachments(this.avatarScene, dt, this.skinTime);
  }

  public destroy() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.weaponMixer?.stopAllAction();
    this.weaponMixer = null;
    this.weaponActions.clear();
    this.actions.clear();
    this.root.removeFromParent();
  }
}
