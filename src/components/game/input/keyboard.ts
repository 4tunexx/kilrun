
export class KeyboardHandler {
  private keys: Record<string, boolean> = {};
  private onKeyDown = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = true; };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };
  // A held key never gets its keyup when focus leaves the window (alt-tab,
  // clicking a browser dialog, OS focus steal) — without this, that key stays
  // latched "down" and the character keeps sprinting/moving/using an ability
  // after refocus until the same physical key is pressed again. Mirrors
  // MouseHandler's identical onBlur reset for its button state.
  private onBlur = () => { this.keys = {}; };

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Every match start / editor remount that constructs a new KeyboardHandler
   *  without this would permanently accumulate window listeners. */
  public destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  public isPressed(key: string): boolean {
    return !!this.keys[key.toLowerCase()];
  }
}
