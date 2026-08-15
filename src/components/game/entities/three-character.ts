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
import {
  applySkinAttachments,
  tickSkinAttachments,
  type WeaponSwayOpts,
} from '../editor/skin-attachments';
import { resolveModelSrc } from '../editor/model-scan';
import { splitTrackName } from '../editor/mixamo-import';
import type { SkinAttachment } from '@/lib/player-skins';
import { PLAYER_RADIUS } from '@shared/sim-constants';
import { BODY_COLOR_NONE } from '@/lib/body-colors';
import { applyTeamTint } from '@/lib/premium-skin-config';

/**
 * Clip names like the Characters_7 pack's "Death_1_(idle)" contain the
 * substring "idle" — a naive `.includes('idle')` match picks that death pose
 * as the standing-idle clip whenever it appears before the real "Idle" clip
 * in the array (exactly what happens for any mode/map whose player entity
 * has no explicitly authored `playerAnims`, e.g. Competitive). Skip
 * death/dead-labeled clips for every slot except the actual 'die' lookup.
 */
const DEATH_CLIP_MARKERS = ['death', 'dead'];

/**
 * Pack rig (Rigify DEF-*) bones that make up the upper body: chest and above,
 * shoulders, arms, hands, fingers. Excludes hips/lower-spine and legs so a
 * filtered clip can play on a second mixer layered over full-body locomotion
 * without touching leg bones.
 */
const UPPER_BODY_BONE_PATTERN =
  /^DEF-(spine\.00[2-6]|shoulder|upper_arm|forearm|hand\.|thumb|f_index|f_middle|f_ring|f_pinky)/i;

/** Keep only the tracks driving upper-body bones, for layered playback. */
function filterClipToUpperBody(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => {
    const parsed = splitTrackName(t.name);
    return parsed ? UPPER_BODY_BONE_PATTERN.test(parsed.boneName) : false;
  });
  return new THREE.AnimationClip(`${clip.name || 'clip'}__upper`, clip.duration, tracks);
}

function pickClip(clips: THREE.AnimationClip[], patterns: string[]): THREE.AnimationClip | null {
  const lower = clips.map((c) => ({ clip: c, name: c.name.toLowerCase() }));
  const searchingDeath = patterns.some((p) => DEATH_CLIP_MARKERS.includes(p) || p === 'die');
  for (const pattern of patterns) {
    const hit = lower.find(
      (c) =>
        c.name.includes(pattern) &&
        (searchingDeath || !DEATH_CLIP_MARKERS.some((marker) => c.name.includes(marker)))
    );
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
  /** Second mixer layered over the main one — arms/spine only (reload/aim/equip). */
  private upperMixer: THREE.AnimationMixer | null = null;
  private upperActions = new Map<string, THREE.AnimationAction>();
  private currentUpper = '';
  private blendSec = 0.12;
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
  private weaponClipNames = { fire: '', reload: '', idle: '', equip: '' };

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
      this.blendSec = Math.max(0, (entity?.animation?.blendMs ?? 120) / 1000);

      // Layer equipped skins (fullbody overlays + clothing + body swaps).
      if (allSkins.length > 0) {
        await applySkinAttachments(scene, allSkins);
        if (this.disposed) return;
        const wep = allSkins.find((s) => s.slot === 'weapon');
        this.rebindWeaponMixer({
          fire: wep?.weapon?.fireClip,
          reload: wep?.weapon?.reloadClip,
          equip: wep?.weapon?.equipClip,
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
      bindSlot('slide', ['slide', 'sliding', 'slid']);
      bindSlot('flip', ['flip', 'backflip', 'back_flip', 'back flip'], false);
      bindSlot('strafe_left', ['left', 'strafe']);
      bindSlot('strafe_right', ['right', 'strafe']);
      bindSlot('back', ['back', 'backward']);
      bindSlot('attack', ['attack', 'slash', 'swing', 'shoot', 'fire', 'punch', 'hit'], false);
      bindSlot('punch', ['punch', 'hit', 'jab', 'melee'], false);
      bindSlot('die', ['die', 'death', 'dead'], false);

      this.upperMixer = new THREE.AnimationMixer(scene);
      const bindUpperSlot = (slot: 'reload' | 'aim' | 'equip', loop: boolean) => {
        if (!this.upperMixer) return;
        const clipName = authored[slot];
        const clip = clipName ? byName.get(clipName) : undefined;
        if (!clip) return;
        const filtered = filterClipToUpperBody(clip);
        if (!filtered.tracks.length) return;
        const action = this.upperMixer.clipAction(filtered);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        this.upperActions.set(slot, action);
      };
      bindUpperSlot('reload', false);
      bindUpperSlot('aim', true);
      bindUpperSlot('equip', false);

      this.actions.get('idle')?.reset().play();
      this.current = 'idle';
      this.loaded = true;
      this.root.visible = true;
    } catch (err) {
      if (this.disposed) return;
      console.warn('[ThreeCharacter] load failed — using simple mesh', err);
      while (this.root.children.length) this.root.remove(this.root.children[0]);
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(PLAYER_RADIUS, 0.95, 4, 10),
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
    if (prev) prev.fadeOut(this.blendSec);
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(this.blendSec).play();
    this.current = name;
  }

  /** Play weapon / punch swing (client visual — combat damage is server-side). */
  public triggerAttack(style: 'attack' | 'punch' = 'attack') {
    const slot = style === 'punch' && this.actions.has('punch') ? 'punch' : 'attack';
    const fallback = this.actions.has(slot) ? slot : this.actions.has('punch') ? 'punch' : null;
    if (!fallback) return;
    const clipDuration = this.actions.get(fallback)!.getClip().duration;
    this.attackUntil = performance.now() + (clipDuration > 0 ? clipDuration * 1000 : 480);
    this.play(fallback, false);
  }

  /**
   * Play an upper-body-only one-shot (reload/equip) — legs keep running the
   * normal locomotion state machine underneath. Returns clip duration in ms.
   */
  private playUpperOneShot(slot: 'reload' | 'equip'): number {
    const action = this.upperActions.get(slot);
    if (!action) return 0;
    if (this.currentUpper && this.currentUpper !== slot) {
      this.upperActions.get(this.currentUpper)?.fadeOut(this.blendSec);
    }
    action.reset().fadeIn(this.blendSec).play();
    this.currentUpper = slot;
    return action.getClip().duration * 1000;
  }

  /** Upper-body reload pose — plays over locomotion instead of freezing the character. */
  public triggerReload(): number {
    return this.playUpperOneShot('reload');
  }

  /** Upper-body draw/equip pose (weapon switch). */
  public triggerEquip(): number {
    return this.playUpperOneShot('equip');
  }

  /** Hold/release the upper-body aim pose (ADS) — blends with legs, no fixed duration. */
  public setAiming(active: boolean) {
    const action = this.upperActions.get('aim');
    if (!action) return;
    if (active) {
      if (!action.isRunning()) action.reset().fadeIn(this.blendSec).play();
      this.currentUpper = 'aim';
    } else if (this.currentUpper === 'aim') {
      action.fadeOut(this.blendSec);
      this.currentUpper = '';
    }
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
  private rebindWeaponMixer(clipHints?: {
    fire?: string;
    reload?: string;
    idle?: string;
    equip?: string;
  }) {
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
      equip: clipHints?.equip || '',
    };
    if (this.weaponClipNames.equip) {
      this.playWeaponClip(this.weaponClipNames.equip, false);
      const idleName = this.weaponClipNames.idle;
      if (idleName) {
        this.weaponMixer.addEventListener('finished', () => this.playWeaponClip(idleName, true));
      }
    } else if (this.weaponClipNames.idle) {
      this.playWeaponClip(this.weaponClipNames.idle, true);
    }
    this.triggerEquip();
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
      if (!this.playWeaponClip('shoot', false)) {
        this.playWeaponClip('attack', false);
      }
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
      equipClip?: string;
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
            equipClip: combat.equipClip,
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
      equip: combat?.equipClip,
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
      equip: nextWeapon.weapon?.equipClip,
    });
  }

  public update(
    player: NetPlayerState,
    dt: number,
    cameraYaw?: number,
    moveWish?: { fwd: number; strafe: number },
    /** GTA aim: face camera and strafe — ignore locomotion turn. */
    aimHeld?: boolean,
    weaponSway?: Omit<WeaponSwayOpts, 'moving'>
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
        // Height (Three Y == sim z) gets its own, much sharper snap while
        // grounded: the server already computes an exact continuous ramp
        // height every tick (toThree maps sim z -> Three Y), but lerping it
        // at the same soft rate as horizontal lag-hiding meant the display
        // height visibly lagged behind the true ramp surface while walking
        // uphill — legs sinking into the ramp mesh. Ungrounded (falling/
        // jumping) keeps the normal rate so jumps still look smooth.
        const vertSharpness = player.isGrounded ? 40 : sharpness;
        const vertAlpha = 1 - Math.pow(0.001, dt * vertSharpness);
        this.displayPos.x += (this.targetPos.x - this.displayPos.x) * alpha;
        this.displayPos.z += (this.targetPos.z - this.displayPos.z) * alpha;
        this.displayPos.y += (this.targetPos.y - this.displayPos.y) * vertAlpha;
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
    // Remote players never receive moveWish (kilrun-engine.tsx only builds
    // it from local input), so wishFwd/wishStrafe are always 0 for them —
    // without the speed fallback, every remote player was permanently
    // stuck in the idle pose while their (correctly interpolated) position
    // visibly moved: legs never stepped, body just glided — "sliding."
    // this.speed is derived from actual displayPos/targetPos motion, so it
    // reflects real movement regardless of whether moveWish was supplied.
    const moving =
      Math.abs(wishFwd) + Math.abs(wishStrafe) > 0.05 || (!this.isLocal && this.speed > 0.35);

    // Use EXACT state machine copied from animation-director.ts →
    // updatePlayer() so Live matches behave 1:1 with Play Test.
    if (!player.isAlive) {
      const slot = this.actions.has('die') ? 'die' : 'idle';
      this.play(slot, false);
    } else if (performance.now() < this.attackUntil) {
      // attack / punch keeps playing until finished
    } else if (player.isFlipping && this.actions.has('flip')) {
      // Back flip briefly leaves the ground (small hop) — keep the flip
      // pose instead of falling through to the jump/fall branch below.
      this.play('flip', false);
    } else if (performance.now() < this.landUntil && this.actions.has('land')) {
      this.play('land', false);
    } else if (!player.isGrounded) {
      // Play Test: airborne AND any horizontal input => jump, else fall.
      // vz threshold is NOT used — otherwise the anim flips to fall at apex
      // (vz ~0 → negative) before player has visually left the ground.
      this.play(moving || wishFwd !== 0 ? 'jump' : 'fall', false);
    } else if (player.isSliding && this.actions.has('slide')) {
      this.play('slide');
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
    this.upperMixer?.update(dt);
    this.weaponMixer?.update(dt);
    this.skinTime += dt;
    if (this.avatarScene) {
      tickSkinAttachments(
        this.avatarScene,
        dt,
        this.skinTime,
        weaponSway ? { ...weaponSway, moving: this.speed > 0.3 } : undefined
      );
    }
  }

  public destroy() {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.upperMixer?.stopAllAction();
    this.upperMixer = null;
    this.upperActions.clear();
    this.weaponMixer?.stopAllAction();
    this.weaponMixer = null;
    this.weaponActions.clear();
    this.actions.clear();
    this.root.removeFromParent();
  }
}
