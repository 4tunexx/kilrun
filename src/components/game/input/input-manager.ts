import { KeyboardHandler } from './keyboard';
import { MouseHandler } from './mouse';
import { DualJoystick } from './dual-joystick';
import { Vector2 } from '../types';

/**
 * Owns every input subsystem for a single game session and normalizes them
 * into one PC/mobile-agnostic API: a move vector, an aim angle, and
 * discrete shoot/crouch/interact/jump queries. `kilrun-engine.tsx` converts
 * the move vector from screen-space into world-space (accounting for the
 * isometric camera) before sending it to the server -- this class only
 * ever deals with raw input.
 */
export class InputManager {
  public keyboard: KeyboardHandler;
  public mouse: MouseHandler;
  public joystick: DualJoystick;

  private lastAimAngle = 0;

  constructor(element: HTMLElement, private isMobile: boolean) {
    this.keyboard = new KeyboardHandler();
    this.mouse = new MouseHandler(window);
    this.joystick = new DualJoystick(element);
  }

  public getMoveVector(): Vector2 {
    if (this.isMobile) return this.joystick.getMoveVector();
    return this.keyboard.getAxis();
  }

  /** `playerScreenPos` is only used on desktop, where aim = direction from the player's sprite to the cursor. */
  public getAimAngle(playerScreenPos: Vector2): number {
    if (this.isMobile) {
      const aim = this.joystick.getAimVector();
      if (aim.x !== 0 || aim.y !== 0) {
        this.lastAimAngle = Math.atan2(aim.y, aim.x);
      }
      return this.lastAimAngle;
    }

    const cursor = this.mouse.getPosition();
    this.lastAimAngle = Math.atan2(cursor.y - playerScreenPos.y, cursor.x - playerScreenPos.x);
    return this.lastAimAngle;
  }

  public isShootPressed(): boolean {
    return this.isMobile ? this.joystick.consumeShootPulse() : this.mouse.isFiring();
  }

  public isCrouchPressed(): boolean {
    return this.keyboard.isPressed('control');
  }

  public isInteractPressed(): boolean {
    return this.keyboard.isPressed('e');
  }

  public isJumpPressed(): boolean {
    return this.keyboard.isPressed(' ');
  }

  /** Crosshair visibility: always on desktop, only while the aim stick is actively held on mobile. */
  public isAiming(): boolean {
    return this.isMobile ? this.joystick.isAiming() : true;
  }
}
