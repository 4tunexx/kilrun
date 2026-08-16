
export class KeyboardHandler {
  private keys: Record<string, boolean> = {};
  private onKeyDown = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = true; };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Every match start / editor remount that constructs a new KeyboardHandler
   *  without this would permanently accumulate window listeners. */
  public destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  public isPressed(key: string): boolean {
    return !!this.keys[key.toLowerCase()];
  }
}
