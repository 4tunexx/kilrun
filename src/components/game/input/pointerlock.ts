/**
 * Wraps the browser Pointer Lock API for a single canvas, exposing a small
 * subscription model so React components can reflect lock state without
 * each one wiring its own `pointerlockchange` listener.
 */
export class PointerLockManager {
  private canvas: HTMLCanvasElement;
  private listeners: Array<(locked: boolean) => void> = [];

  private handleChange = () => {
    const locked = this.isLocked;
    this.listeners.forEach((cb) => cb(locked));
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', this.handleChange);
    }
  }

  public get isLocked(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.canvas;
  }

  public async request(): Promise<void> {
    try {
      await this.canvas.requestPointerLock();
    } catch {
      // Browsers reject requests made outside a user gesture or while the
      // tab is unfocused; this is expected and non-fatal.
    }
  }

  public exit(): void {
    if (typeof document !== 'undefined' && this.isLocked) {
      document.exitPointerLock();
    }
  }

  public onChange(callback: (locked: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public dispose(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerlockchange', this.handleChange);
    }
    this.listeners = [];
  }
}
