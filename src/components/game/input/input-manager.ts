
import { KeyboardHandler } from './keyboard';
import { MouseHandler } from './mouse';
import { TouchHandler } from './touch';
import { PointerLockManager } from './pointerlock';
import { Vector2 } from '../types';

/**
 * Owns every input subsystem for a single game session. Instances are
 * created per `KilrunEngine`, never shared as module-level globals, so
 * multiple concurrent sessions (e.g. future local multiplayer/spectator
 * views) can each track their own input state independently.
 */
export class InputManager {
  public keyboard: KeyboardHandler;
  public mouse: MouseHandler;
  public touch: TouchHandler;
  public pointerLock: PointerLockManager;

  constructor(canvas: HTMLCanvasElement) {
    this.keyboard = new KeyboardHandler();
    this.mouse = new MouseHandler();
    this.touch = new TouchHandler(canvas);
    this.pointerLock = new PointerLockManager(canvas);
  }

  public getMovementVector(): Vector2 {
    let move = this.keyboard.getAxis();

    // Right touch joystick overrides for movement.
    if (this.touch.rightStick.active) {
      const dx = this.touch.rightStick.current.x - this.touch.rightStick.start.x;
      const dy = this.touch.rightStick.current.y - this.touch.rightStick.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const max = 40;
      if (dist > 5) {
        move.x = (dx / dist) * Math.min(dist / max, 1);
        move.y = (dy / dist) * Math.min(dist / max, 1);
      }
    }

    return move;
  }

  public getCameraDelta(): Vector2 {
    let delta = this.mouse.consumeDelta();

    // Left touch joystick overrides for camera.
    if (this.touch.leftStick.active) {
      const dx = this.touch.leftStick.current.x - this.touch.leftStick.start.x;
      const dy = this.touch.leftStick.current.y - this.touch.leftStick.start.y;
      delta.x += dx * 0.005;
      delta.y += dy * 0.005;
    }

    return delta;
  }
}
