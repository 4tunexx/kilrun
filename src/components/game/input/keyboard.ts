
export class KeyboardHandler {
  private keys: Record<string, boolean> = {};

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
  }

  public isPressed(key: string): boolean {
    return !!this.keys[key.toLowerCase()];
  }

  public getAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isPressed('a') || this.isPressed('arrowleft')) x -= 1;
    if (this.isPressed('d') || this.isPressed('arrowright')) x += 1;
    if (this.isPressed('w') || this.isPressed('arrowup')) y -= 1;
    if (this.isPressed('s') || this.isPressed('arrowdown')) y += 1;
    return { x, y };
  }
}
