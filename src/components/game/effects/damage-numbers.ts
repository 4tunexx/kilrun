import * as THREE from 'three';
import { toThree } from '../renderer/coords';
import { playSound, playSoundOrFallback } from './soundboard';

/**
 * Floating hit-damage number popups — DOM text (not Three.js sprites, no
 * texture generation needed) positioned every frame by projecting a world
 * point through the camera, pooled and reused like SprintParticles/HUD rAF
 * effects elsewhere in this file's neighborhood.
 */
const POOL_SIZE = 20;
const LIFE_SECONDS = 0.85;
const RISE_UNITS = 1.15;

interface Popup {
  active: boolean;
  life: number;
  worldPos: THREE.Vector3;
  el: HTMLDivElement;
}

export class DamageNumberFx {
  private host: HTMLDivElement;
  private pool: Popup[] = [];
  private tmp = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.host = document.createElement('div');
    this.host.style.position = 'absolute';
    this.host.style.inset = '0';
    this.host.style.overflow = 'hidden';
    this.host.style.pointerEvents = 'none';
    this.host.style.zIndex = '150';
    container.appendChild(this.host);

    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.display = 'none';
      el.style.fontFamily = 'var(--font-space-grotesk), "Oswald", Impact, sans-serif';
      el.style.fontWeight = '900';
      el.style.letterSpacing = '0.02em';
      el.style.textShadow = '0 2px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.55)';
      el.style.willChange = 'transform, opacity';
      this.host.appendChild(el);
      this.pool.push({ active: false, life: 0, worldPos: new THREE.Vector3(), el });
    }
  }

  spawn(serverX: number, serverY: number, serverZ: number, amount: number, kind: 'player' | 'monster' = 'player'): void {
    const rounded = Math.max(1, Math.round(amount));
    const slot = this.pool.find((p) => !p.active) ?? this.pool[0];
    const [tx, ty, tz] = toThree(serverX, serverY, serverZ);
    slot.worldPos.set(tx + (Math.random() - 0.5) * 0.5, ty, tz + (Math.random() - 0.5) * 0.5);
    slot.life = 0;
    slot.active = true;
    slot.el.textContent = String(rounded);
    slot.el.style.color = kind === 'monster' ? 'rgba(255,214,110,1)' : 'rgba(255,120,110,1)';
    slot.el.style.fontSize = rounded >= 40 ? '30px' : rounded >= 20 ? '24px' : '19px';
    slot.el.style.display = 'block';
    slot.el.style.opacity = '0';
    if (kind === 'monster') playSoundOrFallback('monster_hit', 'hit_dealt');
    else playSound('hit_dealt');
  }

  update(dt: number, camera: THREE.PerspectiveCamera, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      const t = p.life / LIFE_SECONDS;
      if (t >= 1) {
        p.active = false;
        p.el.style.display = 'none';
        continue;
      }
      this.tmp.copy(p.worldPos);
      this.tmp.y += RISE_UNITS * Math.min(1, t * 1.6);
      this.tmp.project(camera);
      if (this.tmp.z > 1 || this.tmp.z < -1) {
        p.el.style.opacity = '0';
        continue;
      }
      const sx = (this.tmp.x * 0.5 + 0.5) * width;
      const sy = (1 - (this.tmp.y * 0.5 + 0.5)) * height;
      const fadeIn = t < 0.1 ? t / 0.1 : 1;
      const fadeOut = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
      const scale = 0.8 + Math.min(1, t * 6) * 0.3;
      p.el.style.left = `${sx}px`;
      p.el.style.top = `${sy}px`;
      p.el.style.opacity = String(alpha);
      p.el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  dispose(): void {
    this.host.remove();
  }
}
