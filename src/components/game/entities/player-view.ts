import { Container, Graphics } from 'pixi.js';
import type { NetPlayerState } from '../net/types';
import { depthZIndex, worldAngleToScreenAngle, worldToScreen, type IsoCamera } from '../renderer/iso-camera';
import { createGroundShadow, createHealthBar, createNameLabel, setHealthBarFill } from '../renderer/sprites';

const RUNNER_COLOR = 0x22d3ee;
const TRAPPER_COLOR = 0xf97316;
const LOCAL_OUTLINE_COLOR = 0xfacc15;
const DEAD_COLOR = 0x4b5563;

/** The client-side visual representation of one networked player -- purely presentational, never mutates gameplay state. */
export class PlayerView {
  public readonly container: Container;
  private body: Graphics;
  private aimIndicator: Graphics;
  private nameLabel: ReturnType<typeof createNameLabel>;
  private healthBar: ReturnType<typeof createHealthBar>;
  private lastHealthRatio = 1;

  constructor(username: string, private isLocal: boolean) {
    this.container = new Container();

    const shadow = createGroundShadow(18, 7);
    shadow.y = 4;

    this.body = new Graphics();
    this.aimIndicator = new Graphics();
    this.nameLabel = createNameLabel(username);
    this.nameLabel.y = -46;

    this.healthBar = createHealthBar();
    this.healthBar.container.y = -38;

    this.container.addChild(shadow, this.body, this.aimIndicator, this.healthBar.container, this.nameLabel);
  }

  public update(player: NetPlayerState, camera: IsoCamera, screenWidth: number, screenHeight: number): void {
    const screenPoint = worldToScreen(player.x, player.y, camera, screenWidth, screenHeight);
    this.container.x = screenPoint.x;
    this.container.y = screenPoint.y;
    this.container.zIndex = depthZIndex(player.x);
    this.container.scale.set(screenPoint.scale / 34);
    this.container.visible = player.isAlive || player.hasFinished;
    this.container.alpha = player.hasFinished ? 0.55 : 1;

    const color = !player.isAlive ? DEAD_COLOR : player.role === 'trapper' ? TRAPPER_COLOR : RUNNER_COLOR;
    this.body.clear();
    this.body.circle(0, 0, 16).fill({ color });
    if (this.isLocal) {
      this.body.circle(0, 0, 16).stroke({ color: LOCAL_OUTLINE_COLOR, width: 3 });
    }

    const screenAngle = worldAngleToScreenAngle(player.aimAngle);
    this.aimIndicator.clear();
    this.aimIndicator
      .moveTo(Math.cos(screenAngle) * 16, Math.sin(screenAngle) * 16)
      .lineTo(Math.cos(screenAngle) * 28, Math.sin(screenAngle) * 28)
      .stroke({ color: 0xffffff, width: 3, alpha: 0.85 });

    const healthRatio = player.health / 100;
    if (healthRatio !== this.lastHealthRatio) {
      setHealthBarFill(this.healthBar.fill, healthRatio);
      this.lastHealthRatio = healthRatio;
    }
    this.healthBar.container.visible = player.isAlive;
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
