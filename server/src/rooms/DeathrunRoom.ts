import { Client, Room } from 'colyseus';
import { PlayerState, RoomState } from '../schema/RoomState.js';
import { createDeathrunObstacles } from '../sim/deathrun-map.js';
import {
  createDeathrunPlatforms,
  createFromBlueprints,
  createObstaclesFromBlueprints,
  type ObstacleBlueprint,
  type PlatformBlueprint,
} from '../sim/platforms.js';
import {
  FINISH_X,
  LOBBY_COUNTDOWN_MS,
  MATCH_DURATION_MS,
  MAX_ENERGY,
  MIN_PLAYERS_TO_START,
  OBSTACLE_DAMAGE,
  OBSTACLE_HIT_COOLDOWN_MS,
  HITSCAN_DAMAGE,
  HITSCAN_RANGE,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SHOOT_COOLDOWN_MS,
  SPAWN_X,
  SPAWN_Z,
  TICK_DT_MS,
  VOID_Z,
  WORLD_HEIGHT,
} from '../sim/constants.js';
import {
  applyMovement,
  createSimScratch,
  DEFAULT_WORLD_BOUNDS,
  defaultInput,
  type PlayerInput,
  type PlayerSimScratch,
  type WorldBounds,
} from '../sim/movement.js';
import { isHitByShot, isPlayerHitByObstacle } from '../sim/collision.js';

interface JoinOptions {
  userId?: string;
  username?: string;
  avatarUrl?: string;
  /** Staff / map publisher — allowed to push MAIN custom maps. */
  isAdmin?: boolean;
}

interface FinishZone {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

interface ButtonZone {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  activatesObstacleIds: string[];
  holdMs: number;
  cooldownMs: number;
}

interface TeleportZone {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  cooldownMs: number;
}

const RESULTS_DISPLAY_MS = 8000;

/**
 * Deathrun match room — authoritative platformer sim shared by all modes.
 * Clients send intent only (`input`); never trusted position.
 */
export class DeathrunRoom extends Room<RoomState> {
  maxClients = 8;

  private latestInputs = new Map<string, PlayerInput>();
  private simScratch = new Map<string, PlayerSimScratch>();
  private obstacleTimers: number[] = [];
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private resultsElapsedMs = 0;
  /** Editor MAIN map runner / start spawn (sim space). */
  private customRunnerSpawn: SpawnPoint | null = null;
  /** Editor trapper spawn (sim space). */
  private customTrapperSpawn: SpawnPoint | null = null;
  /** Editor finish trigger volumes. When set, replaces FINISH_X line. */
  private customFinishes: FinishZone[] = [];
  /** Interact buttons that arm linked obstacles. */
  private customButtons: ButtonZone[] = [];
  /** Teleporter volumes. */
  private customTeleports: TeleportZone[] = [];
  /** Button-armed obstacle remaining active ms (obstacle id → ms left). */
  private buttonArmRemaining = new Map<string, number>();
  private lastButtonPressAt = new Map<string, number>();
  private lastTeleportAt = new Map<string, number>();
  /** Clamp box — expanded from custom map AABB when loaded. */
  private worldBounds: WorldBounds = { ...DEFAULT_WORLD_BOUNDS };
  /** First joiner — may load MAIN map; admins always may. */
  private hostSessionId: string | null = null;
  private adminSessions = new Set<string>();

  onCreate() {
    this.setState(new RoomState());
    this.state.modeTag = 'deathrun';
    this.state.platforms.push(...createDeathrunPlatforms());
    this.state.obstacles.push(...createDeathrunObstacles());
    this.obstacleTimers = this.state.obstacles.map(() => 0);
    this.state.courseStartX = SPAWN_X;
    this.state.courseFinishX = FINISH_X;

    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.latestInputs.set(client.sessionId, {
        ...defaultInput(),
        ...this.latestInputs.get(client.sessionId),
        ...input,
      });
    });

    this.onMessage(
      'loadCustomMap',
      (
        client,
        data: {
          platforms?: PlatformBlueprint[];
          obstacles?: ObstacleBlueprint[];
          finishes?: FinishZone[];
          buttons?: ButtonZone[];
          teleports?: TeleportZone[];
          spawn?: SpawnPoint;
          trapperSpawn?: SpawnPoint;
          worldBounds?: WorldBounds;
        }
      ) => {
        if (this.state.phase !== 'lobby' && this.state.phase !== 'countdown') return;
        const allowed =
          this.adminSessions.has(client.sessionId) ||
          client.sessionId === this.hostSessionId;
        if (!allowed) {
          console.warn(
            `[DeathrunRoom] loadCustomMap rejected for ${client.sessionId} (not host/admin)`
          );
          return;
        }
        const platforms = data?.platforms;
        if (!Array.isArray(platforms) || platforms.length === 0) return;

        while (this.state.platforms.length > 0) this.state.platforms.pop();
        this.state.platforms.push(...createFromBlueprints(platforms));

        while (this.state.obstacles.length > 0) this.state.obstacles.pop();
        const hazards = Array.isArray(data?.obstacles) ? data.obstacles : [];
        if (hazards.length > 0) {
          this.state.obstacles.push(...createObstaclesFromBlueprints(hazards));
        }
        this.obstacleTimers = this.state.obstacles.map(() => 0);
        this.buttonArmRemaining.clear();

        this.customFinishes = Array.isArray(data?.finishes) ? data.finishes : [];
        this.customButtons = Array.isArray(data?.buttons) ? data.buttons : [];
        this.customTeleports = Array.isArray(data?.teleports) ? data.teleports : [];
        if (data.spawn) this.customRunnerSpawn = { ...data.spawn };
        if (data.trapperSpawn) this.customTrapperSpawn = { ...data.trapperSpawn };
        if (data.worldBounds) {
          this.worldBounds = { ...data.worldBounds };
        } else {
          this.worldBounds = { ...DEFAULT_WORLD_BOUNDS };
        }

        this.state.courseStartX = data.spawn?.x ?? SPAWN_X;
        if (this.customFinishes.length > 0) {
          this.state.courseFinishX = this.customFinishes[this.customFinishes.length - 1].x;
        } else {
          let maxX = this.state.courseStartX + 10;
          for (const p of this.state.platforms) maxX = Math.max(maxX, p.x);
          this.state.courseFinishX = maxX;
        }

        Array.from(this.state.players.values()).forEach((player, index) => {
          player.hasCheckpoint = false;
          this.applySpawnPosition(player, index);
          player.vz = 0;
        });

        console.log(
          `[DeathrunRoom] MAIN map loaded by ${client.sessionId}: ${platforms.length} platforms, ${hazards.length} hazards, ${this.customButtons.length} buttons, ${this.customTeleports.length} teles`
        );
      }
    );

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  onJoin(client: Client, options: JoinOptions) {
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (options.isAdmin) this.adminSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = options.userId ?? client.sessionId;
    player.username = options.username ?? `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = options.avatarUrl ?? '';
    this.applySpawnPosition(player, this.state.players.size);
    player.energy = MAX_ENERGY;
    player.role = 'runner';

    this.state.players.set(client.sessionId, player);
    this.latestInputs.set(client.sessionId, defaultInput());
    this.simScratch.set(client.sessionId, createSimScratch());
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.latestInputs.delete(client.sessionId);
    this.simScratch.delete(client.sessionId);
    this.lastObstacleHitAt.delete(client.sessionId);
    this.lastShotAt.delete(client.sessionId);
    this.adminSessions.delete(client.sessionId);
    if (this.hostSessionId === client.sessionId) {
      this.hostSessionId = this.state.players.keys().next().value ?? null;
    }

    if (this.state.phase === 'playing' && client.sessionId === this.state.trapperSessionId) {
      this.endRound('runner');
    }
  }

  private applySpawnPosition(player: PlayerState, laneIndex: number) {
    const laneSpread = ((laneIndex % 5) - 2) * 0.55;
    const custom =
      player.role === 'trapper' && this.customTrapperSpawn
        ? this.customTrapperSpawn
        : this.customRunnerSpawn;

    if (custom) {
      player.x = custom.x;
      player.y = custom.y + laneSpread;
      player.z = custom.z;
      return;
    }
    player.x = SPAWN_X;
    player.y = (((laneIndex % 5) + 1) / 6) * WORLD_HEIGHT;
    player.z = SPAWN_Z;
  }

  private isTouchingFinish(player: PlayerState): boolean {
    if (this.customFinishes.length === 0) {
      return player.x >= FINISH_X && player.isGrounded;
    }
    for (const zone of this.customFinishes) {
      const halfW = zone.width / 2;
      const halfD = zone.depth / 2;
      const closestX = Math.min(Math.max(player.x, zone.x - halfW), zone.x + halfW);
      const closestY = Math.min(Math.max(player.y, zone.y - halfD), zone.y + halfD);
      const dx = player.x - closestX;
      const dy = player.y - closestY;
      if (dx * dx + dy * dy >= PLAYER_RADIUS * PLAYER_RADIUS) continue;
      const playerBottom = player.z;
      const playerTop = player.z + PLAYER_HEIGHT;
      const zoneBottom = zone.z - 0.35;
      const zoneTop = zone.z + Math.max(zone.height, 1.2);
      if (playerTop >= zoneBottom && playerBottom <= zoneTop) return true;
    }
    return false;
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

  private resetPlayerOnSpawn(player: PlayerState, laneIndex: number) {
    player.health = 100;
    player.energy = MAX_ENERGY;
    player.isAlive = true;
    player.hasFinished = false;
    this.applySpawnPosition(player, laneIndex);
    player.vz = 0;
    player.isGrounded = true;
    player.isSprinting = false;
    player.isCrouching = false;
  }

  private startRound() {
    const sessionIds = Array.from(this.state.players.keys());

    if (sessionIds.length === 1) {
      const only = sessionIds[0];
      const player = this.state.players.get(only)!;
      player.role = 'runner';
      this.resetPlayerOnSpawn(player, 0);
      this.simScratch.set(only, createSimScratch());
      this.state.trapperSessionId = '';
    } else {
      const trapperIndex = Math.floor(Math.random() * sessionIds.length);
      const trapperSessionId = sessionIds[trapperIndex];
      this.state.trapperSessionId = trapperSessionId;

      sessionIds.forEach((sessionId, i) => {
        const player = this.state.players.get(sessionId)!;
        player.role = sessionId === trapperSessionId ? 'trapper' : 'runner';
        this.resetPlayerOnSpawn(player, i);
        this.simScratch.set(sessionId, createSimScratch());
      });
    }

    this.obstacleTimers = this.state.obstacles.map(() => 0);
    this.state.obstacles.forEach((o) => {
      o.active = !!o.alwaysActive;
    });

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
    for (const [id, remaining] of Array.from(this.buttonArmRemaining.entries())) {
      const next = remaining - dtMs;
      if (next <= 0) {
        this.buttonArmRemaining.delete(id);
        const obs = this.state.obstacles.find((o) => o.id === id);
        if (obs?.buttonControlled) obs.active = false;
      } else {
        this.buttonArmRemaining.set(id, next);
      }
    }

    this.state.obstacles.forEach((obstacle, index) => {
      if (obstacle.alwaysActive) {
        obstacle.active = true;
        return;
      }
      if (obstacle.buttonControlled) {
        if (this.buttonArmRemaining.has(obstacle.id)) {
          obstacle.active = true;
        }
        return;
      }
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
      let scratch = this.simScratch.get(sessionId);
      if (!scratch) {
        scratch = createSimScratch();
        this.simScratch.set(sessionId, scratch);
      }

      applyMovement(
        player,
        input,
        dtSeconds,
        this.state.platforms,
        scratch,
        this.worldBounds
      );

      if (player.role === 'runner' && player.isAlive && !player.hasFinished) {
        for (const obstacle of this.state.obstacles) {
          if (!isPlayerHitByObstacle(player, obstacle)) continue;
          const hitKey = `${sessionId}:${obstacle.id}`;
          const lastHit = this.lastObstacleHitAt.get(hitKey) ?? 0;
          const cooldown =
            obstacle.alwaysActive && obstacle.intervalMs > 0
              ? obstacle.intervalMs
              : OBSTACLE_HIT_COOLDOWN_MS;
          if (now - lastHit < cooldown) continue;
          this.lastObstacleHitAt.set(hitKey, now);
          const amount =
            obstacle.damage > 0 ? obstacle.damage : OBSTACLE_DAMAGE;
          this.damagePlayer(player, amount);
        }

        // Checkpoint touch → save respawn
        for (const platform of this.state.platforms) {
          if (platform.kind !== 'checkpoint') continue;
          const halfW = platform.width / 2 + PLAYER_RADIUS;
          const halfD = platform.depth / 2 + PLAYER_RADIUS;
          if (
            Math.abs(player.x - platform.x) <= halfW &&
            Math.abs(player.y - platform.y) <= halfD &&
            player.z >= platform.z - 0.4 &&
            player.z <= platform.z + 0.6
          ) {
            player.hasCheckpoint = true;
            player.checkpointX = platform.x;
            player.checkpointY = platform.y;
            player.checkpointZ = platform.z;
          }
        }

        if (this.isTouchingFinish(player)) {
          player.hasFinished = true;
        }

        if (input.interactPressed) {
          this.tryPressButtons(player, sessionId, now);
        }
        this.tryTeleport(player, sessionId, now);
      }

      if (player.isAlive && player.z < VOID_Z) {
        if (player.hasCheckpoint) {
          this.respawnAtCheckpoint(player);
        } else {
          player.health = 0;
          player.isAlive = false;
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
        break;
      }
    }
  }

  private respawnAtCheckpoint(player: PlayerState) {
    player.x = player.checkpointX;
    player.y = player.checkpointY;
    player.z = player.checkpointZ + 0.05;
    player.vz = 0;
    player.health = Math.max(player.health, 60);
    player.isAlive = true;
    player.isGrounded = true;
    player.hasFinished = false;
  }

  private tryPressButtons(player: PlayerState, sessionId: string, now: number) {
    for (const btn of this.customButtons) {
      const dx = player.x - btn.x;
      const dy = player.y - btn.y;
      const dz = player.z - btn.z;
      if (Math.hypot(dx, dy) > btn.radius + PLAYER_RADIUS) continue;
      if (Math.abs(dz) > 2.2) continue;
      const key = `${sessionId}:${btn.id}`;
      const last = this.lastButtonPressAt.get(key) ?? 0;
      if (now - last < btn.cooldownMs) continue;
      this.lastButtonPressAt.set(key, now);
      for (const oid of btn.activatesObstacleIds) {
        const obs = this.state.obstacles.find((o) => o.id === oid);
        if (!obs) continue;
        obs.active = true;
        const hold = btn.holdMs > 0 ? btn.holdMs : obs.activeMs || 1500;
        this.buttonArmRemaining.set(oid, hold);
      }
    }
  }

  private tryTeleport(player: PlayerState, sessionId: string, now: number) {
    for (const portal of this.customTeleports) {
      const halfW = portal.width / 2 + PLAYER_RADIUS;
      const halfD = portal.depth / 2 + PLAYER_RADIUS;
      if (Math.abs(player.x - portal.x) > halfW || Math.abs(player.y - portal.y) > halfD) {
        continue;
      }
      if (player.z < portal.z - 0.4 || player.z > portal.z + Math.max(portal.height, 1.2)) {
        continue;
      }
      const key = `${sessionId}:${portal.id}`;
      const last = this.lastTeleportAt.get(key) ?? 0;
      if (now - last < portal.cooldownMs) continue;
      this.lastTeleportAt.set(key, now);
      player.x = portal.targetX;
      player.y = portal.targetY;
      player.z = portal.targetZ;
      player.vz = 0;
      break;
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
        player.energy = MAX_ENERGY;
        player.isAlive = true;
        player.hasFinished = false;
        this.applySpawnPosition(player, 0);
        player.vz = 0;
      });
    }
  }
}
