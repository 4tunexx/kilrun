import * as THREE from 'three';
import type { NetObstacleState, NetPlatformState } from '../net/types';
import { loadGltf, cloneGltfScene } from '../renderer/asset-loader';
import { toThree } from '../renderer/coords';
import { FINISH_X, WORLD_HEIGHT, WORLD_WIDTH } from '../utils/constants';
import { modelUrl, textureUrl } from '../editor/prototype-catalog';

const HAZARD_MODELS: Record<NetObstacleState['kind'], string> = {
  spike: 'target-a-round',
  saw: 'shape-cylinder-detailed',
  laser: 'column',
  crusher: 'crate-color',
  damage: 'floor-square',
};

const PAD_MODELS = [
  'floor-small-square',
  'floor-square',
  'shape-cylinder',
  'shape-hexagon',
  'floor-thick',
] as const;

/**
 * Prototype-pack platformer course — floating pads, columns, crates over a glowing void.
 * Hardcoded decor is optional and cleared when an active custom map replaces the default course.
 */
export class ThreeMap {
  public readonly root = new THREE.Group();
  private readonly decorRoot = new THREE.Group();
  private platformRoots = new Map<number, THREE.Object3D>();
  private obstacleRoots = new Map<number, THREE.Object3D>();
  private prefabCache = new Map<string, THREE.Group>();
  private atlas: THREE.Texture | null = null;
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private decorEnabled = true;
  private decorToken = 0;

  constructor(private scene: THREE.Scene, opts?: { hardcodedDecor?: boolean }) {
    this.decorRoot.name = 'hardcoded-decor';
    scene.add(this.root);
    this.root.add(this.decorRoot);
    this.buildAtmosphere();
    void this.loadAtlas();
    this.decorEnabled = opts?.hardcodedDecor !== false;
    if (this.decorEnabled) {
      void this.bootstrapDecor();
    }
  }

  private async loadAtlas() {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(textureUrl('a'));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      this.atlas = tex;
    } catch (err) {
      console.warn('[ThreeMap] atlas load failed', err);
    }
  }

  private buildAtmosphere() {
    this.scene.background = new THREE.Color(0x0a1220);
    this.scene.fog = new THREE.FogExp2(0x0c1830, 0.024);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshBasicMaterial({ color: 0x1a6a8a, transparent: true, opacity: 0.42 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -4.5;
    this.root.add(glow);

    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(0x33bbdd, 2.0, 16, 2);
      const [x, , z] = toThree(4 + i * 7, WORLD_HEIGHT / 2, -2);
      light.position.set(x, -1.2, z);
      this.root.add(light);
    }
  }

  private async getPrefab(name: string): Promise<THREE.Group> {
    let proto = this.prefabCache.get(name);
    if (!proto) {
      const gltf = await loadGltf(modelUrl(name));
      proto = cloneGltfScene(gltf);
      this.prefabCache.set(name, proto);
    }
    return proto.clone(true) as THREE.Group;
  }

  private tintWithAtlas(root: THREE.Object3D) {
    if (!this.atlas) return;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        if (!o.material.map) {
          o.material.map = this.atlas;
          o.material.needsUpdate = true;
        }
      }
    });
  }

  /** Drop default Deathrun props so an active custom map fully replaces them. */
  public clearHardcodedDecor() {
    this.decorEnabled = false;
    this.decorToken += 1;
    while (this.decorRoot.children.length) {
      this.decorRoot.remove(this.decorRoot.children[0]);
    }
  }

  private async bootstrapDecor() {
    const token = this.decorToken;
    try {
      // Flanking columns
      for (let x = 4; x < WORLD_WIDTH; x += 6) {
        for (const side of [1.2, WORLD_HEIGHT - 1.2] as const) {
          if (!this.decorEnabled || token !== this.decorToken) return;
          const col = await this.getPrefab(x % 12 === 0 ? 'column-rounded' : 'column');
          const [tx, , tz] = toThree(x, side, 0);
          col.position.set(tx, 0, tz);
          col.scale.setScalar(1.15);
          this.tintWithAtlas(col);
          this.decorRoot.add(col);
        }
      }

      // Finish flag + thick pad
      if (!this.decorEnabled || token !== this.decorToken) return;
      const finishPad = await this.getPrefab('floor-thick');
      const [fx, , fz] = toThree(FINISH_X, WORLD_HEIGHT / 2, 0);
      finishPad.position.set(fx, -0.05, fz);
      finishPad.scale.set(2.2, 1, 2.2);
      this.tintWithAtlas(finishPad);
      this.decorRoot.add(finishPad);

      const flag = await this.getPrefab('flag');
      flag.position.set(fx, 0.2, fz);
      this.decorRoot.add(flag);

      const archMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x0891b2,
        emissiveIntensity: 1.35,
      });
      this.glowMats.push(archMat);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.1, 8, 28, Math.PI), archMat);
      arch.position.set(fx, 2.2, fz);
      arch.rotation.y = Math.PI / 2;
      this.decorRoot.add(arch);

      // Scatter props along the path for platformer feel
      const props = ['crate', 'crate-color', 'pipe-section', 'coin', 'ladder', 'button-floor-round'] as const;
      for (let i = 0; i < props.length; i++) {
        if (!this.decorEnabled || token !== this.decorToken) return;
        const p = await this.getPrefab(props[i]);
        const [px, , pz] = toThree(8 + i * 5.5, WORLD_HEIGHT / 2 + (i % 2 === 0 ? 2.4 : -2.4), 0.6);
        p.position.set(px, 0.15, pz);
        p.scale.setScalar(props[i] === 'coin' ? 1.4 : 1);
        this.tintWithAtlas(p);
        this.decorRoot.add(p);
      }
    } catch (err) {
      console.warn('[ThreeMap] decor failed', err);
    }
  }

  public removePlatform(index: number) {
    const node = this.platformRoots.get(index);
    if (node) {
      node.removeFromParent();
      this.platformRoots.delete(index);
    }
  }

  public clearPlatforms() {
    this.platformRoots.forEach((node) => node.removeFromParent());
    this.platformRoots.clear();
  }

  public removeObstacle(index: number) {
    const node = this.obstacleRoots.get(index);
    if (node) {
      node.removeFromParent();
      this.obstacleRoots.delete(index);
    }
  }

  public clearObstacles() {
    this.obstacleRoots.forEach((node) => node.removeFromParent());
    this.obstacleRoots.clear();
  }

  /** Remove platform meshes whose indices are no longer in the live set. */
  public prunePlatforms(liveIndices: Iterable<number>) {
    const live = new Set(liveIndices);
    for (const index of [...this.platformRoots.keys()]) {
      if (!live.has(index)) this.removePlatform(index);
    }
  }

  /** Remove obstacle meshes whose indices are no longer in the live set. */
  public pruneObstacles(liveIndices: Iterable<number>) {
    const live = new Set(liveIndices);
    for (const index of [...this.obstacleRoots.keys()]) {
      if (!live.has(index)) this.removeObstacle(index);
    }
  }

  public async upsertPlatform(index: number, platform: NetPlatformState) {
    let node = this.platformRoots.get(index);
    if (!node) {
      const model = PAD_MODELS[index % PAD_MODELS.length];
      try {
        node = await this.getPrefab(model);
        this.tintWithAtlas(node);
      } catch {
        node = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1.05, 0.35, 20),
          new THREE.MeshStandardMaterial({ color: 0x5b6574, flatShading: true })
        );
      }
      this.platformRoots.set(index, node);
      this.root.add(node);
    }

    const [tx, ty, tz] = toThree(platform.x, platform.y, platform.z);
    const span = Math.max(platform.width, platform.depth);
    const s = Math.max(0.85, span * 0.55);
    node.scale.set(s, 1, s);
    node.position.set(tx, ty, tz);
  }

  public async upsertObstacle(index: number, obstacle: NetObstacleState) {
    let node = this.obstacleRoots.get(index);
    if (!node) {
      const name = HAZARD_MODELS[obstacle.kind] ?? 'crate';
      try {
        node = await this.getPrefab(name);
      } catch {
        node = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 1.1, 12),
          new THREE.MeshStandardMaterial({ color: 0xef4444 })
        );
      }
      this.obstacleRoots.set(index, node);
      this.root.add(node);
    }

    const [tx, ty, tz] = toThree(obstacle.x, obstacle.y, obstacle.z ?? 0);
    node.position.set(tx, ty + 0.15, tz);
    node.scale.setScalar(obstacle.active ? 1.15 : 0.95);
    node.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material.emissive = new THREE.Color(obstacle.active ? 0xff2222 : 0x000000);
        o.material.emissiveIntensity = obstacle.active ? 0.55 : 0;
      }
    });
  }

  public update(dt: number) {
    this.obstacleRoots.forEach((node) => {
      node.rotation.y += dt * 0.55;
    });
  }

  public destroy() {
    this.root.removeFromParent();
    this.glowMats.forEach((m) => m.dispose());
    this.atlas?.dispose();
  }
}
