
import { Vector2 } from '../types';

export class MouseHandler {
  private delta: Vector2 = { x: 0, y: 0 };
  private sensitivity: number = 0.0025;

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('mousemove', (e) => {
      this.delta.x += e.movementX || 0;
      this.delta.y += e.movementY || 0;
    });
  }

  public setSensitivity(s: number) {
    this.sensitivity = s;
  }

  public consumeDelta(): Vector2 {
    const d = {
      x: this.delta.x * this.sensitivity,
      y: this.delta.y * this.sensitivity
    };
    this.delta = { x: 0, y: 0 };
    return d;
  }
}
