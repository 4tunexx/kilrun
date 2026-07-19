import * as THREE from 'three';
import type { EditorEntity, MapDocument } from '../editor/map-document';
import { loadAnimatedPrefab, resolveModelSrc } from '../editor/model-scan';
import { AnimationDirector } from '../editor/animation-director';

/**
 * Renders non-floor editor props (decor, traps, buttons, hazards) into the live
 * Deathrun Three scene. Floor collision still comes from the server platforms.
 */
export class CustomMapOverlay {
  public readonly root = new THREE.Group();
  private director = new AnimationDirector();
  private entityRoots = new Map<string, THREE.Object3D>();
  private disposed = false;

  constructor(private scene: THREE.Scene) {
    this.root.name = 'custom-map-overlay';
    scene.add(this.root);
  }

  async load(doc: MapDocument) {
    this.clear();
    const skip = new Set([
      'spawn_runner',
      'spawn_trapper',
      'player',
    ]);

    for (const ent of doc.entities) {
      if (this.disposed) return;
      if (ent.visible === false) continue;
      if (skip.has(ent.kind)) continue;
      // Floors are represented by server platforms — skip their mesh to avoid doubles
      if (ent.model?.includes('floor') && ent.kind !== 'hazard' && ent.kind !== 'trap') continue;

      const src = resolveModelSrc(ent.model, ent.customModelUrl);
      try {
        let obj: THREE.Object3D;
        let clips: THREE.AnimationClip[] = [];
        if (src) {
          const loaded = await loadAnimatedPrefab(src);
          obj = loaded.root;
          clips = loaded.clips;
        } else if (ent.kind === 'button') {
          obj = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
            new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
          );
        } else if (ent.kind === 'hazard') {
          obj = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.15, 1.5),
            new THREE.MeshStandardMaterial({
              color: 0xef4444,
              transparent: true,
              opacity: 0.55,
              emissive: 0x991111,
              emissiveIntensity: 0.4,
            })
          );
        } else {
          continue;
        }

        obj.position.set(...ent.position);
        obj.rotation.set(
          THREE.MathUtils.degToRad(ent.rotation[0]),
          THREE.MathUtils.degToRad(ent.rotation[1]),
          THREE.MathUtils.degToRad(ent.rotation[2])
        );
        obj.scale.set(...ent.scale);
        obj.userData.entityId = ent.id;
        obj.userData.editorEntity = ent;
        this.root.add(obj);
        this.entityRoots.set(ent.id, obj);
        this.director.register(ent.id, obj, clips);
        if (ent.animation?.defaultClip || ent.animation?.trigger === 'always') {
          this.director.playDefault(ent);
        }
      } catch (err) {
        console.warn('[CustomMapOverlay] skip', ent.name, err);
      }
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
    this.entityRoots.clear();
    while (this.root.children.length) {
      this.root.remove(this.root.children[0]);
    }
  }

  destroy() {
    this.disposed = true;
    this.clear();
    this.root.removeFromParent();
  }
}
