import { Container, Graphics } from 'pixi.js';
import type { NetPlayerState } from '../net/types';
import { depthZIndex, worldAngleToScreenAngle, worldToScreen, type IsoCamera } from '../renderer/iso-camera';
import { createGroundShadow, createHealthBar, createNameLabel, setHealthBarFill } from '../renderer/sprites';

const RUNNER_COLOR = 0x22d3ee;
const TRAPPER_COLOR = 0xf97316;
const LOCAL_OUTLINE_COLOR = 0xfacc15;
const DEAD_COLOR = 0x4b5563;

/** Client visual for one networked player — placeholder capsule until models arrive. */
export class PlayerView {
  public readonly container: Container;
  private body: Graphics;
  private aimIndicator: Graphics;
  private nameLabel: ReturnType<typeof createNameLabel>;
  private healthBar: ReturnType<typeof createHealthBar>;
  private shadow: Graphics;
  private lastHealthRatio = 1;

  constructor(username: string, private isLocal: boolean) {
    this.container = new Container();

    this.shadow = createGroundShadow(18, 7);
    this.body = new Graphics();
    this.aimIndicator = new Graphics();
    this.nameLabel = createNameLabel(username);
    this.nameLabel.y = -52;

    this.healthBar = createHealthBar();
    this.healthBar.container.y = -42;

    this.container.addChild(this.shadow, this.body, this.aimIndicator, this.healthBar.container, this.nameLabel);
  }

  public update(player: NetPlayerState, camera: IsoCamera, screenWidth: number, screenHeight: number): void {
    const z = player.z ?? 0;
    const feet = worldToScreen(player.x, player.y, camera, screenWidth, screenHeight, z);
    const ground = worldToScreen(player.x, player.y, camera, screenWidth, screenHeight, 0);

    this.container.x = feet.x;
    this.container.y = feet.y;
    this.container.zIndex = depthZIndex(player.x, z);
    this.container.scale.set(feet.scale / 34);
    this.container.visible = player.isAlive || player.hasFinished;
    this.container.alpha = player.hasFinished ? 0.55 : 1;

    // Shadow stays on the ground under the player.
    this.shadow.x = ground.x - feet.x;
    this.shadow.y = ground.y - feet.y + 4;
    this.shadow.alpha = player.isGrounded ? 0.45 : 0.22;

    const color = !player.isAlive ? DEAD_COLOR : player.role === 'trapper' ? TRAPPER_COLOR : RUNNER_COLOR;
    const crouchScale = player.isCrouching ? 0.75 : 1;
    this.body.clear();
    // Capsule / bean placeholder (Deathrun-style)
    this.body.roundRect(-12, -28 * crouchScale, 24, 32 * crouchScale, 10).fill({ color });
    this.body.circle(0, -30 * crouchScale, 10).fill({ color });
    if (this.isLocal) {
      this.body
        .roundRect(-12, -28 * crouchScale, 24, 32 * crouchScale, 10)
        .stroke({ color: LOCAL_OUTLINE_COLOR, width: 3 });
    }
    if (player.isSprinting) {
      this.body.circle(0, -8, 18).stroke({ color: 0x38bdf8, width: 2, alpha: 0.35 });
    }

    const screenAngle = worldAngleToScreenAngle(player.aimAngle, camera.yaw);
    this.aimIndicator.clear();
    this.aimIndicator
      .moveTo(Math.cos(screenAngle) * 14, Math.sin(screenAngle) * 14 - 12)
      .lineTo(Math.cos(screenAngle) * 26, Math.sin(screenAngle) * 26 - 12)
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
