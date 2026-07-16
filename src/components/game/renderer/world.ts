
import { ObstacleData } from '../types';
import { Player } from '../entities/player';
import { spawnRandomObstacle } from '../entities/obstacle';

interface CameraProjection {
  y: number;
  tilt: number;
  fov: number;
}

/** Procedurally generates the obstacle course ahead of the player. */
export class WorldGenerator {
  private lastZ: number = 0;
  private difficulty: number = 1.0;

  public generateAhead(playerZ: number, lookahead = 400): ObstacleData[] {
    const spawned: ObstacleData[] = [];
    while (this.lastZ < playerZ + lookahead) {
      this.lastZ += 15 + (Math.random() * 20) / this.difficulty;
      spawned.push(spawnRandomObstacle(this.lastZ));
    }
    return spawned;
  }
}

/** Draws the receding floor grid, oriented by the current camera projection. */
export function renderFloorGrid(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  player: Player,
  camProjection: CameraProjection
) {
  ctx.save();
  ctx.translate(canvasWidth / 2, camProjection.y);
  ctx.rotate(camProjection.tilt * (Math.PI / 180));

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
  const gridZ = 15;
  const zOff = player.position.z % gridZ;
  for (let i = 0; i < 40; i++) {
    const z = i * gridZ - zOff;
    if (z <= 0) continue;
    const scale = camProjection.fov / z;
    ctx.beginPath();
    ctx.moveTo(-scale * 1000, scale * 50);
    ctx.lineTo(scale * 1000, scale * 50);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws every visible obstacle, back-to-front, relative to the player. */
export function renderObstacles(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  player: Player,
  camProjection: CameraProjection,
  obstacles: ObstacleData[]
) {
  const sorted = [...obstacles]
    .filter((o) => o.position.z > player.position.z)
    .sort((a, b) => b.position.z - a.position.z);

  for (const obs of sorted) {
    const relZ = obs.position.z - player.position.z;
    if (relZ < 0.1 || relZ > 400) continue;

    const scale = camProjection.fov / relZ;
    const screenX = canvasWidth / 2 + (obs.position.x - player.position.x) * scale * 30;
    const screenY = camProjection.y + (50 - obs.position.y * 30) * scale;
    const sw = obs.size.x * scale * 30;
    const sh = obs.size.y * scale * 30;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(camProjection.tilt * (Math.PI / 180));

    ctx.fillStyle = obs.hit ? '#1e293b' : obs.color;
    ctx.shadowBlur = obs.hit ? 0 : 20;
    ctx.shadowColor = obs.color;
    ctx.fillRect(-sw / 2, -sh, sw, sh);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(-sw / 2, -sh, sw, sh);
    ctx.restore();
  }
}
