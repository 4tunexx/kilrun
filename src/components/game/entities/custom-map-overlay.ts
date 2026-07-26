import * as THREE from 'three';
import type { EditorEntity, MapDocument } from '../editor/map-document';
import { HAMMER_SOLID_MODEL, isHammerSolidEntity, isInvisibleMarkerKind } from '../editor/map-document';
import { loadAnimatedPrefab, resolveModelSrc } from '../editor/model-scan';
import { AnimationDirector } from '../editor/animation-director';
import { applyTextureToObject, plantLocalFeet, resolveEntityTextureRepeat } from '../editor/editor-mesh';
import { applyEntityOpacity, makeAuthoredLight, makeGameplayFallback } from '../editor/map-scene-visuals';
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
  private disposed = false;

  constructor(private scene: THREE.Scene) {
    this.root.name = 'custom-map-overlay';
    scene.add(this.root);
  }

  async load(doc: MapDocument) {
    this.clear();
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
      if (this.disposed) return;
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
          plantLocalFeet(loaded.root);
          const wrap = new THREE.Group();
          wrap.add(loaded.root);
          obj = wrap;
          clips = loaded.clips;
          applyEntTexture(obj, ent, doc);
        } else {
          const fallback = makeGameplayFallback(ent);
          if (!fallback) continue;
          obj = fallback;
          applyEntTexture(obj, ent, doc);
        }

        obj.position.set(...ent.position);
        obj.rotation.set(
          THREE.MathUtils.degToRad(ent.rotation[0]),
          THREE.MathUtils.degToRad(ent.rotation[1]),
          THREE.MathUtils.degToRad(ent.rotation[2])
        );
        obj.scale.set(...ent.scale);
        applyEntityOpacity(obj, ent.opacity);
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
      }
    }

    // Invisible Action markers: register empty roots so AnimationDirector can fire signals.
    for (const ent of doc.entities) {
      if (this.disposed) return;
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
    if (!playerThreePos) {
      this.director.update(dt);
      return;
    }
    const colliding = new Set<string>();
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

  clear() {
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
