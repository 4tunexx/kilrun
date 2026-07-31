import * as THREE from 'three';

/**
 * Camera-attached speed-line streaks — spawn around the view periphery and
 * fly toward the camera while sprinting/sliding, like a warp-speed effect.
 * Pure LineSegments (true 3D streaks, not billboarded sprites) so they read
 * correctly from any angle without a texture asset.
 */
const MAX_PARTICLES = 48;
const SPAWN_RATE_AT_FULL_INTENSITY = 26; // particles/sec
const BASE_COLOR = new THREE.Color(0x9fd4ff);

interface Streak {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  length: number;
}

export class SprintParticles {
  private lines: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private streaks: Streak[] = [];
  private spawnAccumulator = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.positions = new Float32Array(MAX_PARTICLES * 2 * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.lines = new THREE.LineSegments(this.geometry, material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    camera.add(this.lines);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.streaks.push({
        active: false,
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        dir: new THREE.Vector3(0, 0, 1),
        speed: 0,
        length: 0,
      });
    }
  }

  private spawnOne(): void {
    const s = this.streaks.find((p) => !p.active);
    if (!s) return;
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.1 + Math.random() * 1.6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.62;
    const z = -(6 + Math.random() * 4);
    s.pos.set(x, y, z);
    // Converge slightly toward center while shooting toward the camera —
    // camera looks down -Z, so "toward camera" is +Z.
    s.dir.set(-x * 0.12, -y * 0.12, 1).normalize();
    s.speed = 13 + Math.random() * 9;
    s.length = 0.9 + Math.random() * 1.4;
    s.life = 0;
    s.maxLife = 0.3 + Math.random() * 0.25;
    s.active = true;
  }

  update(dt: number, intensity: number): void {
    const clamped = Math.max(0, Math.min(1, intensity));
    if (clamped > 0.04) {
      this.spawnAccumulator += dt * SPAWN_RATE_AT_FULL_INTENSITY * clamped;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        this.spawnOne();
      }
    } else {
      this.spawnAccumulator = 0;
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = this.streaks[i];
      const base = i * 6;
      if (!s.active) {
        this.positions[base] = this.positions[base + 1] = this.positions[base + 2] = 0;
        this.positions[base + 3] = this.positions[base + 4] = this.positions[base + 5] = 0;
        this.colors[base] = this.colors[base + 1] = this.colors[base + 2] = 0;
        this.colors[base + 3] = this.colors[base + 4] = this.colors[base + 5] = 0;
        continue;
      }
      s.life += dt;
      const t = s.life / s.maxLife;
      if (t >= 1) {
        s.active = false;
        continue;
      }
      s.pos.addScaledVector(s.dir, s.speed * dt);
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const alpha = Math.max(0, fade) * 0.7 * clamped;

      const tailX = s.pos.x - s.dir.x * s.length;
      const tailY = s.pos.y - s.dir.y * s.length;
      const tailZ = s.pos.z - s.dir.z * s.length;

      this.positions[base] = s.pos.x;
      this.positions[base + 1] = s.pos.y;
      this.positions[base + 2] = s.pos.z;
      this.positions[base + 3] = tailX;
      this.positions[base + 4] = tailY;
      this.positions[base + 5] = tailZ;

      this.colors[base] = BASE_COLOR.r * alpha;
      this.colors[base + 1] = BASE_COLOR.g * alpha;
      this.colors[base + 2] = BASE_COLOR.b * alpha;
      // Tail fades to fully transparent for a trailing streak look.
      this.colors[base + 3] = 0;
      this.colors[base + 4] = 0;
      this.colors[base + 5] = 0;
    }

    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.camera.remove(this.lines);
    this.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
