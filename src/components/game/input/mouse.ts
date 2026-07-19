import { Vector2 } from '../types';

/**
 * Free-look mouse — move the mouse to orbit the camera. No RMB hold.
 * Pointer lock engages on first click into the canvas (browser requirement),
 * then look keeps working with zero buttons held.
 */
export class MouseHandler {
  private position: Vector2 = { x: 0, y: 0 };
  private isDown = false;
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
      // Always free-look — no button hold
      this.lookDeltaX += evt.movementX || 0;
      this.lookDeltaY += evt.movementY || 0;
    });

    el.addEventListener('mousedown', (e) => {
      const evt = e as MouseEvent;
      if (evt.button === 0) this.isDown = true;
      // Any click focuses free-look lock (then mouse moves alone)
      this.tryLock();
    });

    el.addEventListener('mouseup', (e) => {
      if ((e as MouseEvent).button === 0) this.isDown = false;
    });

    // If play CTA already gave a user-gesture, lock ASAP on enter
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
    return this.isDown;
  }

  /** Free look is always active. */
  public isRightHeld(): boolean {
    return true;
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
