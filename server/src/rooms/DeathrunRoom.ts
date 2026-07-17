import { Client, Room } from 'colyseus';
import { PlayerState, RoomState } from '../schema/RoomState.js';
import { createDeathrunObstacles } from '../sim/deathrun-map.js';
import {
  FINISH_X,
  LOBBY_COUNTDOWN_MS,
  MATCH_DURATION_MS,
  MIN_PLAYERS_TO_START,
  OBSTACLE_DAMAGE,
  OBSTACLE_HIT_COOLDOWN_MS,
  HITSCAN_DAMAGE,
  HITSCAN_RANGE,
  SHOOT_COOLDOWN_MS,
  SPAWN_X,
  TICK_DT_MS,
  WORLD_HEIGHT,
} from '../sim/constants.js';
import { applyMovement, defaultInput, PlayerInput } from '../sim/movement.js';
import { isHitByShot, isPlayerHitByObstacle } from '../sim/collision.js';

interface JoinOptions {
  userId?: string;
  username?: string;
  avatarUrl?: string;
}

const RESULTS_DISPLAY_MS = 8000;

/**
 * One Deathrun match: a lobby of players waits for `MIN_PLAYERS_TO_START`,
 * then a random Trapper is chosen and everyone else becomes a Runner.
 * Automatic hazards toggle on their own timers independent of the Trapper;
 * the Trapper can additionally eliminate Runners directly (hitscan). This
 * room owns 100% of the authoritative simulation -- clients only ever send
 * intent (`input` messages), never state.
 */
export class DeathrunRoom extends Room<RoomState> {
  maxClients = 8;

  private latestInputs = new Map<string, PlayerInput>();
  private obstacleTimers: number[] = [];
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private resultsElapsedMs = 0;

  onCreate() {
    this.setState(new RoomState());
    this.state.obstacles.push(...createDeathrunObstacles());
    this.obstacleTimers = this.state.obstacles.map(() => 0);

    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.latestInputs.set(client.sessionId, {
        ...defaultInput(),
        ...this.latestInputs.get(client.sessionId),
        ...input,
      });
    });

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  onJoin(client: Client, options: JoinOptions) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = options.userId ?? client.sessionId;
    player.username = options.username ?? `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = options.avatarUrl ?? '';
    player.x = SPAWN_X;
    player.y = this.nextSpawnY();
    player.role = 'runner';

    this.state.players.set(client.sessionId, player);
    this.latestInputs.set(client.sessionId, defaultInput());
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.latestInputs.delete(client.sessionId);
    this.lastObstacleHitAt.delete(client.sessionId);
    this.lastShotAt.delete(client.sessionId);

    // If the Trapper disconnects mid-round, end it early so Runners aren't stuck waiting forever.
    if (this.state.phase === 'playing' && client.sessionId === this.state.trapperSessionId) {
      this.endRound('runner');
    }
  }

  private nextSpawnY(): number {
    const count = this.state.players.size;
    const lane = (count % 5) + 1;
    return (lane / 6) * WORLD_HEIGHT;
  }

  private update(dtMs: number) {
    switch (this.state.phase) {
      case 'lobby':
        this.tickLobby();
        break;
      case 'countdown':
        this.tickCountdown(dtMs);
        break;
      case 'playing':
        this.tickPlaying(dtMs);
        break;
      case 'results':
        this.tickResults(dtMs);
        break;
    }
  }

  private tickLobby() {
    if (this.state.players.size >= MIN_PLAYERS_TO_START) {
      this.state.phase = 'countdown';
      this.state.countdownMs = LOBBY_COUNTDOWN_MS;
    }
  }

  private tickCountdown(dtMs: number) {
    this.state.countdownMs -= dtMs;
    if (this.state.countdownMs <= 0) {
      this.startRound();
    }
  }

  private startRound() {
    const sessionIds = Array.from(this.state.players.keys());
    const trapperIndex = Math.floor(Math.random() * sessionIds.length);
    const trapperSessionId = sessionIds[trapperIndex];
    this.state.trapperSessionId = trapperSessionId;

    sessionIds.forEach((sessionId, i) => {
      const player = this.state.players.get(sessionId)!;
      player.role = sessionId === trapperSessionId ? 'trapper' : 'runner';
      player.health = 100;
      player.isAlive = true;
      player.hasFinished = false;
      player.x = SPAWN_X;
      player.y = ((i % 5) + 1) / 6 * WORLD_HEIGHT;
    });

    this.obstacleTimers = this.state.obstacles.map(() => 0);
    this.state.obstacles.forEach((o) => (o.active = false));

    this.state.phase = 'playing';
    this.state.matchTimeRemainingMs = MATCH_DURATION_MS;
    this.state.winnerRole = '';
  }

  private tickPlaying(dtMs: number) {
    this.state.matchTimeRemainingMs -= dtMs;

    this.tickObstacles(dtMs);
    this.tickPlayers(dtMs);

    if (this.state.matchTimeRemainingMs <= 0) {
      this.endRound('runner');
      return;
    }

    const runners = Array.from(this.state.players.values()).filter((p) => p.role === 'runner');
    if (runners.length > 0) {
      if (runners.some((r) => r.hasFinished)) {
        this.endRound('runner');
        return;
      }
      if (runners.every((r) => !r.isAlive)) {
        this.endRound('trapper');
      }
    }
  }

  private tickObstacles(dtMs: number) {
    this.state.obstacles.forEach((obstacle, index) => {
      this.obstacleTimers[index] += dtMs;
      if (!obstacle.active && this.obstacleTimers[index] >= obstacle.intervalMs) {
        obstacle.active = true;
        this.obstacleTimers[index] = 0;
      } else if (obstacle.active && this.obstacleTimers[index] >= obstacle.activeMs) {
        obstacle.active = false;
        this.obstacleTimers[index] = 0;
      }
    });
  }

  private tickPlayers(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    const now = Date.now();

    this.state.players.forEach((player, sessionId) => {
      const input = this.latestInputs.get(sessionId) ?? defaultInput();
      applyMovement(player, input, dtSeconds);

      if (player.role === 'runner' && player.isAlive && !player.hasFinished) {
        for (const obstacle of this.state.obstacles) {
          if (!isPlayerHitByObstacle(player, obstacle)) continue;
          const lastHit = this.lastObstacleHitAt.get(sessionId) ?? 0;
          if (now - lastHit < OBSTACLE_HIT_COOLDOWN_MS) continue;
          this.lastObstacleHitAt.set(sessionId, now);
          this.damagePlayer(player, OBSTACLE_DAMAGE);
        }

        if (player.x >= FINISH_X) {
          player.hasFinished = true;
        }
      }

      if (player.role === 'trapper' && player.isAlive && input.shootPressed) {
        const lastShot = this.lastShotAt.get(sessionId) ?? 0;
        if (now - lastShot >= SHOOT_COOLDOWN_MS) {
          this.lastShotAt.set(sessionId, now);
          this.resolveTrapperShot(player);
        }
      }
    });
  }

  private resolveTrapperShot(trapper: PlayerState) {
    for (const target of this.state.players.values()) {
      if (target.role !== 'runner' || !target.isAlive || target.hasFinished) continue;
      if (isHitByShot(trapper.x, trapper.y, trapper.aimAngle, target.x, target.y, HITSCAN_RANGE)) {
        this.damagePlayer(target, HITSCAN_DAMAGE);
        break; // one target per shot
      }
    }
  }

  private damagePlayer(player: PlayerState, amount: number) {
    player.health = Math.max(0, player.health - amount);
    if (player.health <= 0) {
      player.isAlive = false;
    }
  }

  private endRound(winnerRole: 'trapper' | 'runner') {
    this.state.phase = 'results';
    this.state.winnerRole = winnerRole;
    this.resultsElapsedMs = 0;
  }

  private tickResults(dtMs: number) {
    this.resultsElapsedMs += dtMs;
    if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
      this.state.phase = 'lobby';
      this.state.countdownMs = 0;
      this.state.trapperSessionId = '';
      this.state.winnerRole = '';
      this.state.players.forEach((player) => {
        player.role = 'runner';
        player.health = 100;
        player.isAlive = true;
        player.hasFinished = false;
      });
    }
  }
}
