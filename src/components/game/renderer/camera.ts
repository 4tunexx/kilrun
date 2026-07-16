
import { Player } from '../entities/player';

export class Camera {
  public fov: number = 600;
  private targetFov: number = 600;
  private swayY: number = 0;

  public update(player: Player, dt: number) {
    // Dynamic FOV based on speed
    const speed = Math.sqrt(player.velocity.x**2 + player.velocity.z**2);
    this.targetFov = 600 + (speed * 200);
    this.fov += (this.targetFov - this.fov) * 0.1;

    // View Sway
    this.swayY = Math.cos(Date.now() * 0.0015) * 2;
  }

  public getProjection(player: Player, canvasHeight: number) {
    const horizon = canvasHeight / 2 + (player.pitch * 350);
    const headBob = player.isGrounded ? Math.sin(player.bobAmount * 12) * 10 : 0;
    const tilt = player.velocity.x * -15; // Camera tilt when strafing

    return {
      y: horizon + headBob + this.swayY,
      tilt,
      fov: this.fov
    };
  }
}
