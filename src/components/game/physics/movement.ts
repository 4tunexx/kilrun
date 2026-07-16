
import { Vector3, Vector2 } from '../types';

/**
 * CS/Source style movement physics
 */
export function calculateMovement(
  currentVel: Vector3,
  input: Vector2,
  yaw: number,
  isGrounded: boolean,
  dt: number
): Vector3 {
  const friction = isGrounded ? 0.92 : 0.99;
  const accel = isGrounded ? 0.25 : 0.08;
  const gravity = 0.015;
  const maxSpeed = 0.45;

  let newVel = { ...currentVel };

  // 1. Apply Friction
  newVel.x *= friction;
  newVel.z *= friction;

  // 2. Calculate Directional Vectors
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  // 3. Apply Acceleration
  // Note: input.y is forward/back, input.x is left/right
  const wishDirX = (input.x * rightX) + (-input.y * forwardX);
  const wishDirZ = (input.x * rightZ) + (-input.y * forwardZ);

  newVel.x += wishDirX * accel;
  newVel.z += wishDirZ * accel;

  // 4. Cap Speed (Horizontal)
  const currentSpeed = Math.sqrt(newVel.x**2 + newVel.z**2);
  if (currentSpeed > maxSpeed) {
    const ratio = maxSpeed / currentSpeed;
    newVel.x *= ratio;
    newVel.z *= ratio;
  }

  // 5. Apply Gravity
  if (!isGrounded) {
    newVel.y -= gravity;
  }

  return newVel;
}
