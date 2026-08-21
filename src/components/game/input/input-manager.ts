import { KeyboardHandler } from './keyboard';
import { MouseHandler } from './mouse';
import { DualJoystick } from './dual-joystick';
import { Vector2 } from '../types';
import { DEFAULT_KEY_BINDINGS, mouseButtonFromBind, type KeyBindAction } from '@shared/key-bindings';

/**
 * Owns every input subsystem for a single game session and normalizes them
 * into one PC/mobile-agnostic API: a move vector, an aim angle, and
 * discrete shoot/crouch/interact/jump queries. `kilrun-engine.tsx` converts
 * the move vector from screen-space into world-space (accounting for the
 * isometric camera) before sending it to the server -- this class only
 * ever deals with raw input.
 *
 * Keyboard actions read from `bindings` (defaults to shared/key-bindings.ts's
 * DEFAULT_KEY_BINDINGS until `setBindings` is called with the admin-configured
 * global scheme — see kilrun-engine.tsx / map-play-preview.tsx hydration).
 * Arrow keys and Control remain fixed, non-configurable alternates for
 * movement/crouch (matches the pre-rebinding baseline UX).
 */
export class InputManager {
  public keyboard: KeyboardHandler;
  public mouse: MouseHandler;
  public joystick: DualJoystick;

  private lastAimAngle = 0;
  private abilityWasDown = new Map<string, boolean>();
  private bindings: Record<KeyBindAction, string> = DEFAULT_KEY_BINDINGS;

  constructor(element: HTMLElement, private isMobile: boolean) {
    this.keyboard = new KeyboardHandler();
    // Bind mouse to the canvas host so free-look + pointer-lock work without RMB
    this.mouse = new MouseHandler(isMobile ? window : element);
    this.joystick = new DualJoystick(element);
  }

  /** Applies the admin-configured global key scheme (fetched async at match/
   *  Play Test start) — call once as soon as it resolves. Until then, the
   *  hardcoded defaults above are used so input works immediately. */
  public setBindings(bindings: Record<KeyBindAction, string>) {
    this.bindings = bindings;
  }

  /** Tears down every input subsystem's listeners — call once when the game
   *  session ends. Previously only joystick.destroy() was called at match
   *  teardown, so every match start/leave (or React remount) that
   *  constructed a new InputManager permanently leaked a fresh set of
   *  keydown/keyup/mousemove/mousedown/mouseup/blur/contextmenu listeners. */
  public destroy() {
    this.keyboard.destroy();
    this.mouse.destroy();
    this.joystick.destroy();
  }

  public getMoveVector(): Vector2 {
    if (this.isMobile) return this.joystick.getMoveVector();
    let x = 0;
    let y = 0;
    if (this.keyboard.isPressed(this.bindings.moveLeft) || this.keyboard.isPressed('arrowleft')) x -= 1;
    if (this.keyboard.isPressed(this.bindings.moveRight) || this.keyboard.isPressed('arrowright')) x += 1;
    if (this.keyboard.isPressed(this.bindings.moveForward) || this.keyboard.isPressed('arrowup')) y -= 1;
    if (this.keyboard.isPressed(this.bindings.moveBack) || this.keyboard.isPressed('arrowdown')) y += 1;
    return { x, y };
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
    return (
      this.keyboard.isPressed('control') ||
      this.keyboard.isPressed(this.bindings.crouch)
    );
  }

  public isInteractPressed(): boolean {
    return this.keyboard.isPressed(this.bindings.interact) || this.joystick.isActionHeld();
  }

  public consumeInteractPulse(): boolean {
    return this.joystick.consumeActionPulse();
  }

  public isJumpPressed(): boolean {
    return this.keyboard.isPressed(this.bindings.jump) || this.joystick.isJumpHeld();
  }

  public isSprintPressed(): boolean {
    return this.keyboard.isPressed(this.bindings.sprint) || this.joystick.isSprintHeld();
  }

  /** Back flip (default V). Held state — server/prediction edge-detect it themselves. */
  public isFlipPressed(): boolean {
    return this.keyboard.isPressed(this.bindings.flip);
  }

  /** Slide (default G, hold Sprint + press). Held state — server/prediction
   *  edge-detect it themselves, same pattern as isFlipPressed above. */
  public isSlidePressed(): boolean {
    return this.keyboard.isPressed(this.bindings.slide);
  }

  public isAttackPressed(): boolean {
    return this.isMobile
      ? this.joystick.consumeAttackPulse() || this.joystick.consumeShootPulse()
      : this.mouse.isFiring() || this.joystick.consumeAttackPulse();
  }

  /**
   * Optional keyboard camera turn. E is reserved for Interact — do not yaw with E.
   * Primary look is mouse; this is an accessibility fallback only.
   */
  public getCameraTurnIntent(): number {
    let turn = 0;
    if (this.keyboard.isPressed(this.bindings.cameraTurnLeft)) turn -= 1;
    return turn;
  }

  public consumeMouseLookDeltaX(): number {
    return this.mouse.consumeLookDeltaX();
  }

  public consumeMouseLookDeltaY(): number {
    return this.mouse.consumeLookDeltaY();
  }

  /**
   * GTA-style aim focus: hold the bound Aim control (default RMB) on desktop,
   * or the right look-stick on mobile.
   * While aiming: body faces camera, WASD strafes, crosshair on.
   * Released: free orbit look, body faces walk direction.
   */
  public isAimHeld(): boolean {
    if (this.isMobile) return this.joystick.isAiming();
    const mouseBtn = mouseButtonFromBind(this.bindings.aim);
    if (mouseBtn != null) return this.mouse.isButtonHeld(mouseBtn);
    return this.keyboard.isPressed(this.bindings.aim);
  }

  /** Reload (default R). Edge-triggered via consumeReloadPulse preferred. */
  public isReloadPressed(): boolean {
    return this.keyboard.isPressed(this.bindings.reload);
  }

  private reloadWasDown = false;
  public consumeReloadPulse(): boolean {
    const down = this.isReloadPressed();
    const edge = down && !this.reloadWasDown;
    this.reloadWasDown = down;
    return edge;
  }

  /** @deprecated Use isAimHeld — kept for callers that gated mobile crosshair. */
  public isAiming(): boolean {
    return this.isAimHeld();
  }

  public isCameraLookHeld(): boolean {
    return true;
  }

  public consumeAbilityPulse(
    ability: 'hook' | 'berserk' | 'bullet' | 'thunder' | 'visibility' | 'fly' | 'backflip'
  ): string | null {
    const key = this.bindings[`power_${ability}` as KeyBindAction];
    const down = this.keyboard.isPressed(key);
    const wasDown = this.abilityWasDown.get(ability) ?? false;
    this.abilityWasDown.set(ability, down);

    if (!down || wasDown) {
      return null;
    }

    return ability;
  }
}
