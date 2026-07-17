import { Vector2 } from '../types';

/**
 * PC aiming for a top-down/isometric shooter is cursor-relative (aim at
 * whatever the mouse is hovering over), not FPS-style relative mouse-look
 * deltas -- so this tracks absolute cursor position + button state instead
 * of accumulating `movementX/Y`.
 */
export class MouseHandler {
  private position: Vector2 = { x: 0, y: 0 };
  private isDown = false;

  constructor(target: HTMLElement | Window = typeof window !== 'undefined' ? window : (undefined as never)) {
    if (!target) return;
    target.addEventListener('mousemove', (e) => {
      const evt = e as MouseEvent;
      this.position = { x: evt.clientX, y: evt.clientY };
    });
    target.addEventListener('mousedown', (e) => {
      if ((e as MouseEvent).button === 0) this.isDown = true;
    });
    target.addEventListener('mouseup', (e) => {
      if ((e as MouseEvent).button === 0) this.isDown = false;
    });
  }

  public getPosition(): Vector2 {
    return this.position;
  }

  public isFiring(): boolean {
    return this.isDown;
  }
}
