import { Vector2 } from '../types';

interface StickState {
  active: boolean;
  start: Vector2;
  current: Vector2;
  id: number | null;
}

const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_MAX_DISTANCE = 40;
const STICK_MAX_RADIUS = 45;
const STICK_DEAD_ZONE = 6;

function freshStick(): StickState {
  return { active: false, start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, id: null };
}

/**
 * Mobile control scheme: right half of the screen = movement joystick,
 * left half = aim + camera joystick, double-tapping the left half fires the
 * weapon. Joysticks only exist while a finger is actually down -- they
 * spawn under wherever the touch started and vanish on release.
 */
export class DualJoystick {
  public moveStick: StickState = freshStick();
  public aimStick: StickState = freshStick();

  private shootPulse = false;
  private lastLeftTapAt = 0;
  private lastLeftTapPos: Vector2 = { x: 0, y: 0 };

  constructor(private element: HTMLElement) {
    element.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
    element.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
    element.addEventListener('touchend', (e) => this.handleEnd(e), { passive: false });
    element.addEventListener('touchcancel', (e) => this.handleEnd(e), { passive: false });
  }

  private handleStart(e: TouchEvent) {
    e.preventDefault();
    const width = window.innerWidth;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = { x: touch.clientX, y: touch.clientY };
      const isLeftHalf = pos.x < width / 2;

      if (isLeftHalf && !this.aimStick.active) {
        this.aimStick = { active: true, start: { ...pos }, current: { ...pos }, id: touch.identifier };
        this.registerLeftTap(pos);
      } else if (!isLeftHalf && !this.moveStick.active) {
        this.moveStick = { active: true, start: { ...pos }, current: { ...pos }, id: touch.identifier };
      }
    }
  }

  private registerLeftTap(pos: Vector2) {
    const now = performance.now();
    const dist = Math.hypot(pos.x - this.lastLeftTapPos.x, pos.y - this.lastLeftTapPos.y);
    if (now - this.lastLeftTapAt < DOUBLE_TAP_WINDOW_MS && dist < DOUBLE_TAP_MAX_DISTANCE) {
      this.shootPulse = true;
    }
    this.lastLeftTapAt = now;
    this.lastLeftTapPos = pos;
  }

  private handleMove(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.aimStick.id) {
        this.aimStick.current = { x: touch.clientX, y: touch.clientY };
      } else if (touch.identifier === this.moveStick.id) {
        this.moveStick.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  private handleEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.aimStick.id) {
        this.aimStick = freshStick();
      } else if (touch.identifier === this.moveStick.id) {
        this.moveStick = freshStick();
      }
    }
  }

  private stickVector(stick: StickState): Vector2 {
    if (!stick.active) return { x: 0, y: 0 };
    const dx = stick.current.x - stick.start.x;
    const dy = stick.current.y - stick.start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < STICK_DEAD_ZONE) return { x: 0, y: 0 };
    const clamped = Math.min(dist, STICK_MAX_RADIUS) / STICK_MAX_RADIUS;
    return { x: (dx / dist) * clamped, y: (dy / dist) * clamped };
  }

  public getMoveVector(): Vector2 {
    return this.stickVector(this.moveStick);
  }

  public getAimVector(): Vector2 {
    return this.stickVector(this.aimStick);
  }

  public isAiming(): boolean {
    return this.aimStick.active;
  }

  public isMoving(): boolean {
    return this.moveStick.active;
  }

  /** One-shot: returns true exactly once per double-tap, then clears itself. */
  public consumeShootPulse(): boolean {
    const pulse = this.shootPulse;
    this.shootPulse = false;
    return pulse;
  }

  public destroy() {
    // Listeners are tied to the host element lifetime; no extra cleanup needed
    // beyond releasing stick state when the engine unmounts.
    this.aimStick = freshStick();
    this.moveStick = freshStick();
  }
}
