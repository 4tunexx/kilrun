import * as THREE from 'three';
import type { EditorEntity, MapDocument } from '../editor/map-document';
import { ensureLight, isInvisibleMarkerKind } from '../editor/map-document';
import { loadAnimatedPrefab, resolveModelSrc } from '../editor/model-scan';
import { AnimationDirector } from '../editor/animation-director';
import { applyTextureToObject, plantLocalFeet } from '../editor/editor-mesh';

/**
 * Renders authored editor visuals into the live Deathrun Three scene.
 * Collision still comes from server platforms/pads.
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

  private makeLight(ent: EditorEntity): THREE.Group {
    const cfg = ensureLight(ent);
    const group = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 10),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.color),
        emissive: new THREE.Color(cfg.color),
        emissiveIntensity: 1.1,
      })
    );
    const point = new THREE.PointLight(
      new THREE.Color(cfg.color),
      cfg.intensity,
      cfg.distance,
      2
    );
    group.add(bulb);
    group.add(point);
    return group;
  }

  private makeFinishFallback(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.14, 1.8),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.65,
      })
    );
  }

  private makeButtonFallback(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    );
  }

  private makeHazardFallback(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.15, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.55,
        emissive: 0x991111,
        emissiveIntensity: 0.4,
      })
    );
  }

  private makeJumpPadFallback(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.12, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0369a1,
        emissiveIntensity: 0.55,
      })
    );
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
          obj = this.makeLight(ent);
        } else if (src) {
          const loaded = await loadAnimatedPrefab(src);
          plantLocalFeet(loaded.root);
          const wrap = new THREE.Group();
          wrap.add(loaded.root);
          obj = wrap;
          clips = loaded.clips;
          applyTextureToObject(obj, ent.textureUrl || doc.environment?.defaultTextureUrl);
        } else if (ent.kind === 'finish') {
          obj = this.makeFinishFallback();
        } else if (ent.kind === 'button') {
          obj = this.makeButtonFallback();
        } else if (ent.kind === 'hazard') {
          obj = this.makeHazardFallback();
        } else if (ent.kind === 'jump_pad' || ent.jumpPad?.enabled) {
          obj = this.makeJumpPadFallback();
        } else {
          continue;
        }

        if (ent.kind !== 'light' && !src) {
          applyTextureToObject(obj, ent.textureUrl || doc.environment?.defaultTextureUrl);
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
