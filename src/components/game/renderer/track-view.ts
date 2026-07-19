import { Container, Graphics } from 'pixi.js';
import { worldToScreen, type IsoCamera } from './iso-camera';

/**
 * Backdrop / void under the floating platforms. Platforms themselves are
 * drawn by PlatformView — this only paints atmosphere + finish marker.
 */
export class TrackView {
  public readonly container: Container;
  private ground: Graphics;

  constructor(private worldWidth: number, private worldHeight: number, private finishX: number) {
    this.container = new Container();
    this.ground = new Graphics();
    this.container.addChild(this.ground);
    this.container.zIndex = -100000;
  }

  public update(camera: IsoCamera, screenWidth: number, screenHeight: number): void {
    this.ground.clear();

    // Soft void / sky gradient plane
    const corners = [
      worldToScreen(-2, -2, camera, screenWidth, screenHeight, -1.5),
      worldToScreen(-2, this.worldHeight + 2, camera, screenWidth, screenHeight, -1.5),
      worldToScreen(this.worldWidth + 2, this.worldHeight + 2, camera, screenWidth, screenHeight, -1.5),
      worldToScreen(this.worldWidth + 2, -2, camera, screenWidth, screenHeight, -1.5),
    ];
    this.ground.poly(corners.flatMap((c) => [c.x, c.y])).fill({ color: 0x0b1220, alpha: 0.95 });

    // Horizon haze bands
    for (let i = 0; i < 6; i++) {
      const x = (this.worldWidth / 6) * i;
      const a = worldToScreen(x, 0, camera, screenWidth, screenHeight, -0.8);
      const b = worldToScreen(x, this.worldHeight, camera, screenWidth, screenHeight, -0.8);
      this.ground.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0x1e293b, width: 1, alpha: 0.35 });
    }

    const finishTop = worldToScreen(this.finishX, 0, camera, screenWidth, screenHeight, 0.2);
    const finishBottom = worldToScreen(this.finishX, this.worldHeight, camera, screenWidth, screenHeight, 0.2);
    this.ground
      .moveTo(finishTop.x, finishTop.y)
      .lineTo(finishBottom.x, finishBottom.y)
      .stroke({ color: 0xfacc15, width: 6, alpha: 0.9 });
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
