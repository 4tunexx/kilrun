import { Vector2 } from '../types';

/**
 * Mouse for GTA-style TPS:
 * - LMB = fire / attack
 * - RMB held = aim (strafe, body faces camera, crosshair)
 * - RMB released = free look orbit around player (body faces move)
 * Pointer lock on click so look works.
 */
export class MouseHandler {
  private position: Vector2 = { x: 0, y: 0 };
  private leftDown = false;
  private rightDown = false;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private host: HTMLElement | null = null;

  constructor(target: HTMLElement | Window = typeof window !== 'undefined' ? window : (undefined as never)) {
    if (!target) return;
    this.host = target instanceof HTMLElement ? target : null;

    const el: HTMLElement | Window = target;

    el.addEventListener('mousemove', (e) => {
      const evt = e as MouseEvent;
      this.position = { x: evt.clientX, y: evt.clientY };
      const locked =
        !this.host ||
        document.pointerLockElement === this.host ||
        document.pointerLockElement === document.body;
      if (!locked) return;
      this.lookDeltaX += evt.movementX || 0;
      this.lookDeltaY += evt.movementY || 0;
    });

    el.addEventListener('mousedown', (e) => {
      const evt = e as MouseEvent;
      if (evt.button === 0) this.leftDown = true;
      if (evt.button === 2) this.rightDown = true;
      this.tryLock();
    });

    el.addEventListener('mouseup', (e) => {
      const evt = e as MouseEvent;
      if (evt.button === 0) this.leftDown = false;
      if (evt.button === 2) this.rightDown = false;
    });

    // Lost focus / leave — release buttons so aim doesn't stick
    window.addEventListener('blur', () => {
      this.leftDown = false;
      this.rightDown = false;
    });

    if (this.host) {
      this.host.addEventListener('pointerenter', () => this.tryLock());
    }

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private tryLock() {
    if (!this.host || document.pointerLockElement === this.host) return;
    this.host.requestPointerLock?.().catch(() => {});
  }

  public getPosition(): Vector2 {
    return this.position;
  }

  public isFiring(): boolean {
    return this.leftDown;
  }

  /** GTA aim focus — hold RMB. */
  public isRightHeld(): boolean {
    return this.rightDown;
  }

  public consumeLookDeltaX(): number {
    const d = this.lookDeltaX;
    this.lookDeltaX = 0;
    return d;
  }

  public consumeLookDeltaY(): number {
    const d = this.lookDeltaY;
    this.lookDeltaY = 0;
    return d;
  }
}
