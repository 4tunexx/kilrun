/** Server sim: x=forward, y=lateral, z=height → Three.js: x=lateral, y=up, z=forward */

export function toThree(x: number, y: number, z: number): [number, number, number] {
  return [y, z, x];
}

export function yawToThreeQuaternionY(serverCameraYaw: number): number {
  // Server yaw 0 looks +X (forward). In Three, +Z is forward → rotate Y by yaw.
  return serverCameraYaw;
}
