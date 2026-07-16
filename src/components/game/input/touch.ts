
import { Vector2 } from '../types';

interface Joystick {
  active: boolean;
  start: Vector2;
  current: Vector2;
  id: number | null;
}

/**
 * Mobile input: dual dynamic joysticks that spawn under whichever finger
 * first touches each screen half (left = camera, right = movement).
 */
export class TouchHandler {
  public leftStick: Joystick = { active: false, start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, id: null };
  public rightStick: Joystick = { active: false, start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, id: null };

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.handleEnd(e), { passive: false });
  }

  private handleStart(e: TouchEvent) {
    e.preventDefault();
    const width = window.innerWidth;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = { x: touch.clientX, y: touch.clientY };

      if (pos.x < width / 2 && !this.leftStick.active) {
        this.leftStick.active = true;
        this.leftStick.start = { ...pos };
        this.leftStick.current = { ...pos };
        this.leftStick.id = touch.identifier;
      } else if (pos.x >= width / 2 && !this.rightStick.active) {
        this.rightStick.active = true;
        this.rightStick.start = { ...pos };
        this.rightStick.current = { ...pos };
        this.rightStick.id = touch.identifier;
      }
    }
  }

  private handleMove(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.leftStick.id) {
        this.leftStick.current = { x: touch.clientX, y: touch.clientY };
      } else if (touch.identifier === this.rightStick.id) {
        this.rightStick.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  private handleEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.leftStick.id) {
        this.leftStick.active = false;
        this.leftStick.id = null;
      } else if (touch.identifier === this.rightStick.id) {
        this.rightStick.active = false;
        this.rightStick.id = null;
      }
    }
  }
}
