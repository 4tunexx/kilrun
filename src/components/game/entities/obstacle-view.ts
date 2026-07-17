import { Container, Graphics } from 'pixi.js';
import type { NetObstacleState } from '../net/types';
import { depthZIndex, worldExtentToScreen, type IsoCamera } from '../renderer/iso-camera';

const KIND_COLORS: Record<NetObstacleState['kind'], { active: number; idle: number }> = {
  spike: { active: 0xef4444, idle: 0x7f1d1d },
  saw: { active: 0xe5e7eb, idle: 0x6b7280 },
  laser: { active: 0xf472b6, idle: 0x831843 },
  crusher: { active: 0x7c3aed, idle: 0x3b0764 },
};

/** Client-side visual for one automatic hazard. Shape/animation vary by `kind`; toggling color+glow by `active` is what tells the player "danger now" vs "safe for a moment". */
export class ObstacleView {
  public readonly container: Container;
  private graphic: Graphics;
  private rotation = 0;

  constructor(private kind: NetObstacleState['kind']) {
    this.container = new Container();
    this.graphic = new Graphics();
    this.container.addChild(this.graphic);
  }

  public update(obstacle: NetObstacleState, camera: IsoCamera, screenWidth: number, screenHeight: number, dtSeconds: number): void {
    const extent = worldExtentToScreen(
      obstacle.x,
      obstacle.y,
      obstacle.width / 2,
      obstacle.height / 2,
      camera,
      screenWidth,
      screenHeight
    );
    this.container.x = extent.x;
    this.container.y = extent.y;
    this.container.zIndex = depthZIndex(obstacle.x) - 0.5; // hazards render just behind players standing on them

    const colors = KIND_COLORS[this.kind];
    const color = obstacle.active ? colors.active : colors.idle;
    const alpha = obstacle.active ? 0.95 : 0.45;

    this.graphic.clear();
    switch (this.kind) {
      case 'saw':
        this.rotation += dtSeconds * (obstacle.active ? 10 : 3);
        this.drawSaw(extent.halfWidth, color, alpha);
        break;
      case 'laser':
        this.drawLaser(extent.halfWidth, extent.halfHeight, color, alpha);
        break;
      case 'crusher':
        this.drawCrusher(extent.halfWidth, extent.halfHeight, color, alpha, obstacle.active);
        break;
      default:
        this.drawSpikes(extent.halfWidth, extent.halfHeight, color, alpha);
    }
  }

  private drawSpikes(halfWidth: number, halfHeight: number, color: number, alpha: number) {
    const spikeCount = Math.max(3, Math.round((halfHeight * 2) / 14));
    const step = (halfHeight * 2) / spikeCount;
    for (let i = 0; i < spikeCount; i++) {
      const cx = -halfHeight + step * i + step / 2;
      this.graphic
        .moveTo(cx - step / 2.4, halfWidth * 0.5)
        .lineTo(cx, -halfWidth * 0.8)
        .lineTo(cx + step / 2.4, halfWidth * 0.5)
        .closePath()
        .fill({ color, alpha });
    }
  }

  private drawSaw(radius: number, color: number, alpha: number) {
    const teeth = 8;
    this.graphic.circle(0, 0, radius * 0.7).fill({ color, alpha });
    for (let i = 0; i < teeth; i++) {
      const angle = this.rotation + (i / teeth) * Math.PI * 2;
      const cx = Math.cos(angle) * radius * 0.7;
      const cy = Math.sin(angle) * radius * 0.7;
      this.graphic.circle(cx, cy, radius * 0.18).fill({ color, alpha });
    }
    this.graphic.circle(0, 0, radius * 0.25).fill({ color: 0x1f2937, alpha });
  }

  private drawLaser(halfWidth: number, halfHeight: number, color: number, alpha: number) {
    this.graphic.roundRect(-halfWidth * 0.35, -halfHeight, halfWidth * 0.7, halfHeight * 2, 3).fill({ color, alpha });
  }

  private drawCrusher(halfWidth: number, halfHeight: number, color: number, alpha: number, active: boolean) {
    const scaleY = active ? 1 : 0.5;
    this.graphic
      .roundRect(-halfWidth, -halfHeight * scaleY, halfWidth * 2, halfHeight * scaleY * 2, 6)
      .fill({ color, alpha })
      .stroke({ color: 0x000000, width: 2, alpha: 0.4 });
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
