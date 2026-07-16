
import { Vector3, Vector2 } from '../types';
import { calculateMovement } from '../physics/movement';

export class Player {
  public position: Vector3 = { x: 0, y: 0, z: 0 };
  public velocity: Vector3 = { x: 0, y: 0, z: 0 };
  public yaw: number = 0;
  public pitch: number = 0;
  public bobAmount: number = 0;
  public isGrounded: boolean = true;

  public health: number = 3;
  private jumpCooldown: number = 0;

  public update(moveInput: Vector2, camDelta: Vector2, dt: number, jump: boolean) {
    // 1. Rotation (Yaw/Pitch)
    this.yaw += camDelta.x;
    this.pitch -= camDelta.y;
    this.pitch = Math.max(-Math.PI/2.1, Math.min(Math.PI/2.1, this.pitch));

    // 2. Jump
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    if (jump && this.isGrounded && this.jumpCooldown <= 0) {
      this.velocity.y = 0.38;
      this.isGrounded = false;
      this.jumpCooldown = 200;
    }

    // 3. Movement Physics
    this.velocity = calculateMovement(this.velocity, moveInput, this.yaw, this.isGrounded, dt);

    // 4. Update Position
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.position.z += this.velocity.z;

    // 5. Basic Floor Collision
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    }

    // 6. Head Bobbing
    const horizontalSpeed = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
    if (this.isGrounded && horizontalSpeed > 0.05) {
      this.bobAmount += horizontalSpeed * 0.7;
    } else {
      this.bobAmount *= 0.8;
    }

    // 7. Boundaries
    const limit = 15;
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));
  }
}
