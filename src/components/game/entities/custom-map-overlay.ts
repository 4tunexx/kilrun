import * as THREE from 'three';
import type { EditorEntity, MapDocument } from '../editor/map-document';
import {
  entityExportsAsPlatform,
  HAMMER_SOLID_MODEL,
  isHammerSolidEntity,
  isInvisibleMarkerKind,
} from '../editor/map-document';
import { loadAnimatedPrefab, resolveModelSrc } from '../editor/model-scan';
import { AnimationDirector } from '../editor/animation-director';
import { applyTextureToObject, plantLocalFeet, resolveEntityTextureRepeat } from '../editor/editor-mesh';
import {
  applyEntityOpacity,
  applyEntityGlow,
  tickEntityGlow,
  makeAuthoredLight,
  makeGameplayFallback,
  shouldUseGameplayFallback,
} from '../editor/map-scene-visuals';
import { makeHammerSolidObject, type HammerPrimitive } from '../editor/hammer-shapes';
import { ensurePlatformMotion } from '../editor/map-document';
import { movingPlatformU } from '../../../../shared/moving-platform';

function applyEntTexture(obj: THREE.Object3D, ent: EditorEntity, doc: MapDocument) {
  applyTextureToObject(obj, ent.textureUrl || doc.environment?.defaultTextureUrl, {
    repeat: resolveEntityTextureRepeat(ent),
    offset: ent.textureOffset,
    rotation: ent.textureRotation,
  });
}

/** Release GPU resources for a detached Object3D tree. */
function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      const std = m as THREE.MeshStandardMaterial;
      for (const key of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'emissiveMap',
        'aoMap',
        'alphaMap',
      ] as const) {
        const tex = std[key];
        if (tex) tex.dispose();
      }
      m.dispose();
    }
  });
}

function makeHammerSolid(ent: EditorEntity): THREE.Object3D {
  const size = ent.collisionSize ?? [2, 0.25, 2];
  const shape = (ent.primitive as HammerPrimitive) || 'box';
  return makeHammerSolidObject(shape, size, ent.color || '#64748b');
}

/**
 * Last-resort visible placeholder — used whenever an entity has no kind-specific
 * fallback mesh (makeGameplayFallback returns null) but still needs SOME visual,
 * e.g. a generic solid prop with no model. Mirrors the editor Play Test's own
 * `placeholderForEntity` so live matches never render a real collider as a
 * completely invisible block (see `entityToCollisionPads` / `entityExportsAsPlatform`
 * — collision does not require a model, so an invisible mesh here would still be solid).
 */
function makeGenericBoxPlaceholder(ent: EditorEntity): THREE.Object3D {
  const size = ent.collisionSize ?? [1, 1, 1];
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, size[0]), Math.max(0.2, size[1]), Math.max(0.2, size[2])),
    new THREE.MeshStandardMaterial({ color: ent.color ? new THREE.Color(ent.color) : 0x888888 })
  );
  box.position.y = Math.max(0.2, size[1]) * 0.5;
  return box;
}

/**
 * Renders authored editor visuals into the live Deathrun Three scene.
 * Collision still comes from server platforms/pads.
 */
export class CustomMapOverlay {
  public readonly root = new THREE.Group();
  private director = new AnimationDirector();
  private entityRoots = new Map<string, THREE.Object3D>();
  private restPositions = new Map<string, THREE.Vector3>();
  private motionById = new Map<
    string,
    { offset: [number, number, number]; periodMs: number; phaseMs: number }
  >();
  // Reused every update() call instead of allocating a fresh Set per frame.
  private collidingSet = new Set<string>();
  private disposed = false;
  // Bumped on every load() call so a still-in-flight `await loadAnimatedPrefab`
  // from a superseded call (rapid map switch / re-invoked load) can detect
  // it's stale and bail instead of adding entities into a scene that a newer
  // load() already cleared — without this, the older call's leftover geometry
  // bleeds into the new map and its GPU resources are never disposed.
  private loadToken = 0;

  constructor(private scene: THREE.Scene) {
    this.root.name = 'custom-map-overlay';
    scene.add(this.root);
  }

  async load(doc: MapDocument) {
    this.clear();
    const token = ++this.loadToken;
    const skipKinds = new Set<EditorEntity['kind']>([
      'player',
      'spawn_runner',
      'spawn_trapper',
      'spawn_team_a',
      'spawn_team_b',
      'spawn_monster',
      'wave_anchor',
      'action',
      'checkpoint',
      'start',
    ]);

    for (const ent of doc.entities) {
      if (this.disposed || token !== this.loadToken) return;
      if (ent.visible === false) continue;
      if (isInvisibleMarkerKind(ent.kind) || skipKinds.has(ent.kind)) continue;

      const src = resolveModelSrc(ent.model, ent.customModelUrl);
      try {
        let obj: THREE.Object3D;
        let clips: THREE.AnimationClip[] = [];
        if (ent.kind === 'light') {
          obj = makeAuthoredLight(ent);
          // makeAuthoredLight already sets position; still apply rotation/scale below.
        } else if (isHammerSolidEntity(ent) || ent.model === HAMMER_SOLID_MODEL) {
          obj = makeHammerSolid(ent);
          applyEntTexture(obj, ent, doc);
        } else if (src) {
          const loaded = await loadAnimatedPrefab(src);
          // A newer load() call (rapid map switch) may have already cleared
          // and superseded this one while the fetch above was in flight.
          if (token !== this.loadToken) return;
          plantLocalFeet(loaded.root);
          const wrap = new THREE.Group();
          wrap.add(loaded.root);
          obj = wrap;
          clips = loaded.clips;
          applyEntTexture(obj, ent, doc);
        } else {
          // Even with no model assigned, an entity authored as solid collision
          // (mapDocToSimPlatforms / entityExportsAsPlatform don't require a
          // model) must still get SOME visible mesh, or it becomes an
          // invisible-but-solid block players get stuck on in a real match.
          const fallback = makeGameplayFallback(ent);
          if (!fallback) {
            if (!shouldUseGameplayFallback(ent, 'missing-model')) continue;
            obj = makeGenericBoxPlaceholder(ent);
            applyEntTexture(obj, ent, doc);
          } else {
            obj = fallback;
            applyEntTexture(obj, ent, doc);
          }
        }

        obj.position.set(...ent.position);
        obj.rotation.set(
          THREE.MathUtils.degToRad(ent.rotation[0]),
          THREE.MathUtils.degToRad(ent.rotation[1]),
          THREE.MathUtils.degToRad(ent.rotation[2])
        );
        obj.scale.set(...ent.scale);
        applyEntityOpacity(obj, ent.opacity);
        applyEntityGlow(obj, ent.glow, ent.color);
        obj.userData.entityId = ent.id;
        obj.userData.editorEntity = ent;
        this.root.add(obj);
        this.entityRoots.set(ent.id, obj);
        this.restPositions.set(ent.id, new THREE.Vector3(...ent.position));
        const motion = ensurePlatformMotion(ent);
        if (motion.enabled) {
          this.motionById.set(ent.id, {
            offset: motion.offset,
            periodMs: motion.periodMs,
            phaseMs: motion.phaseMs,
          });
        }
        this.director.register(ent.id, obj, clips);
        if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
          this.director.playDefault(ent);
        }
      } catch (err) {
        console.warn('[CustomMapOverlay] skip', ent.name, err);
        // A GLB fetch failure (e.g. 404) must not leave a solid entity totally
        // invisible — same class of bug as a modelless solid prop above.
        if (!shouldUseGameplayFallback(ent, 'load-failed')) continue;
        try {
          const placeholder = makeGameplayFallback(ent) ?? makeGenericBoxPlaceholder(ent);
          applyEntTexture(placeholder, ent, doc);
          placeholder.position.set(...ent.position);
          placeholder.rotation.set(
            THREE.MathUtils.degToRad(ent.rotation[0]),
            THREE.MathUtils.degToRad(ent.rotation[1]),
            THREE.MathUtils.degToRad(ent.rotation[2])
          );
          placeholder.scale.set(...ent.scale);
          applyEntityOpacity(placeholder, ent.opacity);
          applyEntityGlow(placeholder, ent.glow, ent.color);
          placeholder.userData.entityId = ent.id;
          placeholder.userData.editorEntity = ent;
          this.root.add(placeholder);
          this.entityRoots.set(ent.id, placeholder);
          this.restPositions.set(ent.id, new THREE.Vector3(...ent.position));
          this.director.register(ent.id, placeholder, []);
        } catch (fallbackErr) {
          console.warn('[CustomMapOverlay] fallback placeholder failed', ent.name, fallbackErr);
        }
      }
    }

    // Invisible Action markers: register empty roots so AnimationDirector can fire signals.
    for (const ent of doc.entities) {
      if (this.disposed || token !== this.loadToken) return;
      if (ent.visible === false) continue;
      if (ent.kind !== 'action') continue;
      const ghost = new THREE.Group();
      ghost.visible = false;
      ghost.position.set(...ent.position);
      ghost.userData.entityId = ent.id;
      ghost.userData.editorEntity = ent;
      this.root.add(ghost);
      this.entityRoots.set(ent.id, ghost);
      this.director.register(ent.id, ghost, []);
    }
  }

  update(
    dt: number,
    playerThreePos: THREE.Vector3 | null,
    interactPressed: boolean,
    entities: EditorEntity[]
  ) {
    const nowMs = performance.now();
    for (const ent of entities) {
      if (ent.glow?.enabled && ent.glow.pulse && ent.glow.pulse !== 'none') {
        const root = this.entityRoots.get(ent.id);
        if (root) tickEntityGlow(root, ent.glow, nowMs);
      }
    }
    if (!playerThreePos) {
      this.director.update(dt);
      return;
    }
    const colliding = this.collidingSet;
    colliding.clear();
    this.entityRoots.forEach((root, id) => {
      if (playerThreePos.distanceTo(root.position) < 1.35) colliding.add(id);
    });
    this.director.evaluateTriggers(entities, playerThreePos, interactPressed, colliding);
    this.director.update(dt);
  }

  /** Hazard damage tick helper for client-side feedback / play overlays. */
  touchingHazards(playerThreePos: THREE.Vector3, entities: EditorEntity[]): EditorEntity[] {
    return entities.filter((e) => {
      const hz = e.hazard;
      if (!hz?.enabled && e.kind !== 'hazard') return false;
      if (e.kind === 'hazard' && hz && hz.enabled === false) return false;
      const root = this.entityRoots.get(e.id);
      if (!root) {
        // Position-only check for floors used as hazards
        const d = playerThreePos.distanceTo(
          new THREE.Vector3(e.position[0], e.position[1], e.position[2])
        );
        return d < Math.max(1.2, Math.abs(e.scale[0]) * 0.9);
      }
      return playerThreePos.distanceTo(root.position) < Math.max(1.2, Math.abs(e.scale[0]) * 0.9);
    });
  }

  /**
   * Solid entity roots only — filtered with the exact same
   * entityExportsAsPlatform() predicate the server uses to decide what
   * actually blocks player movement. For the TPS camera's wall-avoidance
   * raycast (updateFollowCamera's `collidables` option): raycasting against
   * every visible root here (lights, buttons, hazard decals, jump pads —
   * all real Meshes) would pull the camera in whenever it merely passed near
   * a decoration that doesn't actually block anything. Every entity root
   * already carries `userData.editorEntity` (set at creation in load()
   * above), so no separate bookkeeping is needed here.
   */
  getCollidableRoots(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.entityRoots.forEach((root) => {
      const ent = root.userData.editorEntity as EditorEntity | undefined;
      if (ent && entityExportsAsPlatform(ent)) out.push(root);
    });
    return out;
  }

  clear() {
    this.loadToken++;
    this.director.clear();
    for (const obj of this.entityRoots.values()) {
      obj.removeFromParent();
      disposeObjectTree(obj);
    }
    this.entityRoots.clear();
    this.restPositions.clear();
    this.motionById.clear();
    while (this.root.children.length) {
      const child = this.root.children[0];
      this.root.remove(child);
      disposeObjectTree(child);
    }
  }

  /** Drive kinematic platform meshes from match/play elapsed time. */
  tickMotion(elapsedMs: number) {
    for (const [id, motion] of this.motionById) {
      const root = this.entityRoots.get(id);
      const rest = this.restPositions.get(id);
      if (!root || !rest) continue;
      const u = movingPlatformU(elapsedMs, motion.periodMs, motion.phaseMs);
      root.position.set(
        rest.x + motion.offset[0] * u,
        rest.y + motion.offset[1] * u,
        rest.z + motion.offset[2] * u
      );
    }
  }

  destroy() {
    this.disposed = true;
    this.clear();
    this.root.removeFromParent();
  }
}
