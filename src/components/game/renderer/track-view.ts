import { Container, Graphics } from 'pixi.js';
import { worldToScreen, type IsoCamera } from './iso-camera';

/**
 * Draws the Deathrun corridor's ground plane, lane guide lines, spawn
 * marker, and finish line -- everything that isn't a player or an
 * obstacle. Single static track for Phase 1; future maps swap the
 * constructor args instead of this class's logic.
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

    const corners = [
      worldToScreen(0, 0, camera, screenWidth, screenHeight),
      worldToScreen(0, this.worldHeight, camera, screenWidth, screenHeight),
      worldToScreen(this.worldWidth, this.worldHeight, camera, screenWidth, screenHeight),
      worldToScreen(this.worldWidth, 0, camera, screenWidth, screenHeight),
    ];
    this.ground
      .poly(corners.flatMap((c) => [c.x, c.y]))
      .fill({ color: 0x0f172a });

    const laneCount = 5;
    for (let i = 1; i < laneCount; i++) {
      const laneY = (this.worldHeight / laneCount) * i;
      const start = worldToScreen(0, laneY, camera, screenWidth, screenHeight);
      const end = worldToScreen(this.worldWidth, laneY, camera, screenWidth, screenHeight);
      this.ground.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0x1e293b, width: 2, alpha: 0.6 });
    }

    const finishTop = worldToScreen(this.finishX, 0, camera, screenWidth, screenHeight);
    const finishBottom = worldToScreen(this.finishX, this.worldHeight, camera, screenWidth, screenHeight);
    this.ground
      .moveTo(finishTop.x, finishTop.y)
      .lineTo(finishBottom.x, finishBottom.y)
      .stroke({ color: 0xfacc15, width: 5, alpha: 0.9 });
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
