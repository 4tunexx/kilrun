import * as THREE from 'three';
import type { EditorEntity, EntityAnimation, PlayerAnimBindings, PlayerAnimSlot } from './map-document';

/**
 * Owns AnimationMixers for placed entities and decides which clip to play
 * based on trigger rules + player proximity / interact / collide / signals.
 */
export class AnimationDirector {
  private mixers = new Map<string, THREE.AnimationMixer>();
  private clips = new Map<string, THREE.AnimationClip[]>();
  private actions = new Map<string, Map<string, THREE.AnimationAction>>();
  private current = new Map<string, string>();
  private activated = new Set<string>(); // play-once latched
  private signals = new Set<string>(); // active signal entity ids / channels
  private roots = new Map<string, THREE.Object3D>();

  register(entityId: string, root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.unregister(entityId);
    this.roots.set(entityId, root);
    this.clips.set(entityId, clips);
    if (!clips.length) return;
    const mixer = new THREE.AnimationMixer(root);
    this.mixers.set(entityId, mixer);
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      map.set(clip.name || '(unnamed)', action);
    }
    this.actions.set(entityId, map);
  }

  unregister(entityId: string) {
    this.mixers.get(entityId)?.stopAllAction();
    this.mixers.delete(entityId);
    this.clips.delete(entityId);
    this.actions.delete(entityId);
    this.current.delete(entityId);
    this.activated.delete(entityId);
    this.roots.delete(entityId);
  }

  clear() {
    Array.from(this.mixers.keys()).forEach((id) => this.unregister(id));
    this.signals.clear();
  }

  fireSignal(entityIdOrChannel: string) {
    this.signals.add(entityIdOrChannel);
  }

  clearSignal(entityIdOrChannel: string) {
    this.signals.delete(entityIdOrChannel);
  }

  private play(entityId: string, clipName: string | undefined, loop: boolean) {
    if (!clipName) return;
    const actionMap = this.actions.get(entityId);
    const mixer = this.mixers.get(entityId);
    if (!actionMap || !mixer) return;
    const next = actionMap.get(clipName);
    if (!next) return;
    const curName = this.current.get(entityId);
    if (curName === clipName) return;
    if (curName) {
      actionMap.get(curName)?.fadeOut(0.15);
    }
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.15).play();
    this.current.set(entityId, clipName);
  }

  /** Start default clip for an entity (editor preview / always). */
  playDefault(ent: EditorEntity) {
    const anim = ent.animation;
    if (!anim?.defaultClip) return;
    this.play(ent.id, anim.defaultClip, anim.loopDefault !== false);
  }

  /** Preview active clip once (editor "Test anim" button). */
  previewActive(ent: EditorEntity) {
    const anim = ent.animation;
    if (!anim?.activeClip) return;
    this.activated.delete(ent.id);
    this.play(ent.id, anim.activeClip, anim.loopActive);
  }

  updatePlayer(
    entityId: string,
    bindings: PlayerAnimBindings | undefined,
    state: {
      moving: boolean;
      sprint: boolean;
      grounded: boolean;
      crouch: boolean;
      moveX: number; // -1 left … +1 right (camera relative wish)
      moveZ: number; // -1 back … +1 forward
      /** When false, play die once. */
      alive?: boolean;
      /** Rising edge of grounded after air time. */
      justLanded?: boolean;
    }
  ) {
    if (!bindings) return;
    if (state.alive === false) {
      const clip = bindings.die || bindings.idle;
      this.play(entityId, clip, false);
      return;
    }
    let slot: PlayerAnimSlot = 'idle';
    if (state.justLanded && bindings.land) {
      slot = 'land';
    } else if (!state.grounded) {
      slot = state.moveZ !== 0 || state.moving ? 'jump' : 'fall';
    } else if (state.crouch) {
      slot = 'crouch';
    } else if (state.moving) {
      if (Math.abs(state.moveX) > Math.abs(state.moveZ) + 0.1) {
        slot = state.moveX < 0 ? 'strafe_left' : 'strafe_right';
      } else if (state.moveZ < -0.2) {
        slot = 'back';
      } else {
        slot = state.sprint ? 'run' : 'walk';
      }
    }
    const clip = bindings[slot] || bindings.idle;
    const loop = slot !== 'land' && slot !== 'jump';
    this.play(entityId, clip, loop);
  }

  /**
   * Evaluate prop triggers vs player world position.
   * `interactPressed` = E this frame. `collidingIds` = entity ids currently overlapping player.
   */
  evaluateTriggers(
    entities: EditorEntity[],
    playerPos: THREE.Vector3,
    interactPressed: boolean,
    collidingIds: Set<string>
  ) {
    for (const ent of entities) {
      const anim = ent.animation;
      if (!anim || !this.mixers.has(ent.id)) continue;
      if (ent.kind === 'player') continue;

      const root = this.roots.get(ent.id);
      if (!root) continue;
      const dist = playerPos.distanceTo(root.position);
      const inRange = dist <= (anim.radius ?? 2.5);

      let shouldActive = false;
      switch (anim.trigger) {
        case 'always':
          this.play(ent.id, anim.defaultClip || anim.activeClip, anim.loopDefault !== false);
          continue;
        case 'none':
          if (anim.defaultClip) this.play(ent.id, anim.defaultClip, anim.loopDefault !== false);
          continue;
        case 'proximity':
          shouldActive = inRange;
          break;
        case 'interact':
          if (inRange && interactPressed) {
            this.activated.add(ent.id);
            if (ent.kind === 'button') {
              this.fireSignal(ent.id);
              if (anim.signalChannel) this.fireSignal(anim.signalChannel);
              for (const tid of anim.activatesEntityIds ?? []) {
                this.activated.add(tid);
                this.fireSignal(tid);
              }
            }
          }
          shouldActive = this.activated.has(ent.id);
          break;
        case 'collide':
          shouldActive = collidingIds.has(ent.id) || (inRange && dist < 1.1);
          if (shouldActive && ent.kind === 'button') {
            this.fireSignal(ent.id);
            if (anim.signalChannel) this.fireSignal(anim.signalChannel);
            for (const tid of anim.activatesEntityIds ?? []) {
              this.activated.add(tid);
              this.fireSignal(tid);
            }
          }
          break;
        case 'signal': {
          const listen = anim.listenToEntityId;
          shouldActive = !!(
            (listen && (this.signals.has(listen) || this.activated.has(listen))) ||
            this.activated.has(ent.id) ||
            this.signals.has(ent.id)
          );
          break;
        }
        default:
          break;
      }

      // Button/activatesEntityIds can latch traps even if they weren't set to signal yet
      if (this.activated.has(ent.id)) shouldActive = true;

      if (shouldActive) {
        this.play(ent.id, anim.activeClip || anim.defaultClip, anim.loopActive);
      } else if (anim.defaultClip) {
        // Only reset if not play-once latch still holding (doors stay open after interact)
        if (anim.trigger === 'proximity' || anim.trigger === 'collide') {
          this.play(ent.id, anim.defaultClip, anim.loopDefault !== false);
        } else if (anim.trigger === 'interact' && !this.activated.has(ent.id)) {
          this.play(ent.id, anim.defaultClip, anim.loopDefault !== false);
        } else if (anim.trigger === 'signal' && !shouldActive) {
          this.play(ent.id, anim.defaultClip, anim.loopDefault !== false);
        }
      }
    }
  }

  update(dt: number) {
    this.mixers.forEach((m) => m.update(dt));
  }

  /** Helper for auto-picking clip names by fuzzy match (doors, etc.) */
  static suggestClips(names: string[]): Pick<EntityAnimation, 'defaultClip' | 'activeClip'> {
    const lower = names.map((n) => ({ n, l: n.toLowerCase() }));
    const find = (...keys: string[]) => lower.find((x) => keys.some((k) => x.l.includes(k)))?.n;
    return {
      defaultClip: find('idle', 'close', 'closed', 'rest') ?? names[0],
      activeClip: find('open', 'opening', 'activate', 'action', 'play') ?? names[1] ?? names[0],
    };
  }
}
