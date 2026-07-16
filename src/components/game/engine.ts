
import { InputManager } from './input/input-manager';
import { Player } from './entities/player';
import { Camera } from './renderer/camera';
import { WorldGenerator, renderFloorGrid, renderObstacles } from './renderer/world';
import { checkCollisions } from './physics/collision';
import { GameState, ObstacleData } from './types';

/**
 * Composition root for a single Kilrun deathrun session. Everything the
 * loop needs (input, player, camera, world) is owned as an instance member
 * -- constructed fresh per `KilrunEngine` -- rather than as module-level
 * globals, so multiple sessions can coexist for future multiplayer/replay
 * support.
 */
export class KilrunEngine {
  public player: Player;
  public input: InputManager;
  public camera: Camera;
  public world: WorldGenerator;
  public obstacles: ObstacleData[] = [];
  public state: GameState;

  private lastTime: number = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isRunning: boolean = false;
  private onStateChange: (state: GameState) => void;

  constructor(canvas: HTMLCanvasElement, onStateChange: (state: GameState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.onStateChange = onStateChange;

    this.input = new InputManager(canvas);
    this.player = new Player();
    this.camera = new Camera();
    this.world = new WorldGenerator();

    this.state = {
      score: 0,
      distance: 0,
      health: 3,
      status: 'playing',
      speed: 0,
      combo: 0,
      maxCombo: 0,
      checkpointZ: 0
    };
  }

  public start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  public stop() {
    this.isRunning = false;
    this.input.pointerLock.dispose();
  }

  private loop(timestamp: number) {
    if (!this.isRunning || this.state.status !== 'playing') return;

    // Clamp dt so a dropped frame / tab-switch can't cause a physics spike.
    const dt = Math.min(timestamp - this.lastTime, 100);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number) {
    const move = this.input.getMovementVector();
    const cam = this.input.getCameraDelta();
    const jump = this.input.keyboard.isPressed(' ');

    this.player.update(move, cam, dt, jump);
    this.camera.update(this.player, dt);

    const newObstacles = this.world.generateAhead(this.player.position.z);
    if (newObstacles.length > 0) {
      this.obstacles = [...this.obstacles, ...newObstacles].filter(
        (o) => o.position.z > this.player.position.z - 50
      );
    }

    const { damage } = checkCollisions(this.player, this.obstacles);
    if (damage > 0) {
      this.player.health -= damage;
      this.state.health = this.player.health;
      if (this.player.health <= 0) {
        this.state.status = 'gameover';
        this.isRunning = false;
      }
    }

    this.state.distance = Math.floor(this.player.position.z);
    this.state.speed = Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.z ** 2);
    this.onStateChange({ ...this.state });
  }

  private render() {
    const { ctx, canvas, player } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    const camProjection = this.camera.getProjection(player, h);

    renderFloorGrid(ctx, w, player, camProjection);
    renderObstacles(ctx, w, player, camProjection, this.obstacles);
  }
}
