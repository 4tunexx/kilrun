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
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
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
import { applyLoadoutToPlayer } from '../sim/loadout.js';
import {
  authenticateJoin,
  claimsFromAuth,
  type GameJoinClaims,
} from '../join-token.js';

interface JoinOptions {
  token?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  /** Staff / map publisher — allowed to push MAIN custom maps. */
  isAdmin?: boolean;
  /** Compact SkinAttachment[] JSON for remote cosmetics. */
  equippedSkinsJson?: string;
  /** Optional weapon combat override (clamped server-side). */
  weaponCombat?: {
    kind?: string;
    range?: number;
    damage?: number;
    cooldownMs?: number;
    coneRadians?: number;
  };
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

interface ActionZone extends ButtonZone {
  trigger: 'proximity' | 'interact' | 'collide' | 'always';
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
  /** Editor MAIN map runner / start spawns (sim space). */
  private customRunnerSpawns: SpawnPoint[] = [];
  /** Editor trapper spawn (sim space). */
  private customTrapperSpawn: SpawnPoint | null = null;
  /** Editor finish trigger volumes. When set, replaces FINISH_X line. */
  private customFinishes: FinishZone[] = [];
  /** Interact buttons that arm linked obstacles. */
  private customButtons: ButtonZone[] = [];
  /** Invisible action zones that can arm linked obstacles. */
  private customActions: ActionZone[] = [];
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
  private matchDurationMs = MATCH_DURATION_MS;
  private lobbyCountdownMs = LOBBY_COUNTDOWN_MS;
  private trapperEnabled = true;
  private maxRunners = 8;

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
          actions?: ActionZone[];
          teleports?: TeleportZone[];
          spawn?: SpawnPoint;
          playerSpawns?: SpawnPoint[];
          trapperSpawn?: SpawnPoint;
          worldBounds?: WorldBounds;
          modeSettings?: {
            deathrun?: {
              warmupSec?: number;
              roundTimeSec?: number;
              maxRunners?: number;
              trapperEnabled?: boolean;
            };
          };
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

        const settings = data.modeSettings?.deathrun;
        if (settings) {
          if (typeof settings.warmupSec === 'number') {
            this.lobbyCountdownMs = Math.max(0, settings.warmupSec) * 1000;
          }
          if (typeof settings.roundTimeSec === 'number') {
            this.matchDurationMs = Math.max(30, settings.roundTimeSec) * 1000;
          }
          if (typeof settings.maxRunners === 'number') {
            this.maxRunners = Math.max(1, Math.min(8, Math.floor(settings.maxRunners)));
            this.maxClients = this.maxRunners;
          }
          if (typeof settings.trapperEnabled === 'boolean') {
            this.trapperEnabled = settings.trapperEnabled;
          }
        }

        this.customFinishes = Array.isArray(data?.finishes) ? data.finishes : [];
        this.customButtons = Array.isArray(data?.buttons) ? data.buttons : [];
        this.customActions = Array.isArray(data.actions) ? data.actions : [];
        this.customTeleports = Array.isArray(data?.teleports) ? data.teleports : [];
        if (Array.isArray(data.playerSpawns) && data.playerSpawns.length) {
          this.customRunnerSpawns = data.playerSpawns
            .map((s) => ({ ...s }))
            .slice(0, this.maxRunners);
        } else if (data.spawn) {
          this.customRunnerSpawns = [{ ...data.spawn }];
        }
        if (data.trapperSpawn) this.customTrapperSpawn = { ...data.trapperSpawn };
        if (data.worldBounds) {
          this.worldBounds = { ...data.worldBounds };
        } else {
          this.worldBounds = { ...DEFAULT_WORLD_BOUNDS };
        }

        this.state.courseStartX = this.customRunnerSpawns[0]?.x ?? SPAWN_X;
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
          `[DeathrunRoom] MAIN map loaded by ${client.sessionId}: ${platforms.length} platforms, ${hazards.length} hazards, ${this.customButtons.length} buttons, ${this.customActions.length} actions, ${this.customTeleports.length} teles`
        );
      }
    );

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  onAuth(_client: Client, options: JoinOptions): GameJoinClaims {
    return authenticateJoin(options);
  }

  onJoin(client: Client, options: JoinOptions) {
    const claims = claimsFromAuth(client.auth, options);
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (claims.isAdmin) this.adminSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = claims.userId || client.sessionId;
    player.username =
      claims.username || `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = claims.avatarUrl || '';
    applyLoadoutToPlayer(player, options);
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
    if (player.role === 'trapper' && this.customTrapperSpawn) {
      player.x = this.customTrapperSpawn.x;
      player.y = this.customTrapperSpawn.y;
      player.z = this.customTrapperSpawn.z;
      return;
    }

    if (player.role !== 'trapper' && this.customRunnerSpawns.length > 0) {
      const spawn = this.customRunnerSpawns[laneIndex % this.customRunnerSpawns.length];
      const repeatedLaneOffset = Math.floor(laneIndex / this.customRunnerSpawns.length) * 0.15;
      player.x = spawn.x;
      player.y = spawn.y + repeatedLaneOffset;
      player.z = spawn.z;
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
      this.state.countdownMs = this.lobbyCountdownMs;
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

    if (!this.trapperEnabled || sessionIds.length === 1) {
      sessionIds.forEach((sessionId, i) => {
        const player = this.state.players.get(sessionId)!;
        player.role = 'runner';
        this.resetPlayerOnSpawn(player, i);
        this.simScratch.set(sessionId, createSimScratch());
      });
      this.state.trapperSessionId = '';
    } else {
      const trapperIndex = Math.floor(Math.random() * sessionIds.length);
      const trapperSessionId = sessionIds[trapperIndex];
      this.state.trapperSessionId = trapperSessionId;

      let runnerLaneIndex = 0;
      sessionIds.forEach((sessionId, i) => {
        const player = this.state.players.get(sessionId)!;
        player.role = sessionId === trapperSessionId ? 'trapper' : 'runner';
        this.resetPlayerOnSpawn(
          player,
          player.role === 'runner' ? runnerLaneIndex++ : i
        );
        this.simScratch.set(sessionId, createSimScratch());
      });
    }

    this.obstacleTimers = this.state.obstacles.map(() => 0);
    this.state.obstacles.forEach((o) => {
      o.active = !!o.alwaysActive;
    });

    this.state.phase = 'playing';
    this.state.matchTimeRemainingMs = this.matchDurationMs;
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

        if (input.interactPressed) this.tryPressButtons(player, sessionId, now);
        this.tryTriggerActions(player, sessionId, now, input.interactPressed);
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
        if (player.weaponKind !== 'cosmetic') {
          const lastShot = this.lastShotAt.get(sessionId) ?? 0;
          const cooldown = player.weaponCooldownMs > 0 ? player.weaponCooldownMs : 350;
          if (now - lastShot >= cooldown) {
            this.lastShotAt.set(sessionId, now);
            this.resolveTrapperShot(player);
          }
        }
      }
    });
  }

  private resolveTrapperShot(trapper: PlayerState) {
    if (trapper.weaponKind === 'cosmetic') return;
    const range = trapper.weaponRange > 0 ? trapper.weaponRange : 14;
    const damage = trapper.weaponDamage > 0 ? trapper.weaponDamage : 25;
    const cone = trapper.weaponConeRadians > 0 ? trapper.weaponConeRadians : 0.18;
    for (const target of this.state.players.values()) {
      if (target.role !== 'runner' || !target.isAlive || target.hasFinished) continue;
      if (
        isHitByShot(trapper.x, trapper.y, trapper.aimAngle, target.x, target.y, range, cone, {
          shooterZ: trapper.z,
          aimPitch: trapper.aimPitch,
          targetZ: target.z,
        })
      ) {
        this.damagePlayer(target, damage);
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
      if (!this.isPlayerInActivationRadius(player, btn)) continue;
      this.activateObstacleZone(btn, `button:${sessionId}:${btn.id}`, now);
    }
  }

  private tryTriggerActions(
    player: PlayerState,
    sessionId: string,
    now: number,
    interactPressed: boolean
  ) {
    for (const action of this.customActions) {
      if (action.trigger === 'interact' && !interactPressed) continue;
      if (!this.isPlayerInActivationRadius(player, action)) continue;
      this.activateObstacleZone(action, `action:${sessionId}:${action.id}`, now);
    }
  }

  private isPlayerInActivationRadius(player: PlayerState, zone: ButtonZone): boolean {
    const dx = player.x - zone.x;
    const dy = player.y - zone.y;
    const dz = player.z - zone.z;
    return Math.hypot(dx, dy) <= zone.radius + PLAYER_RADIUS && Math.abs(dz) <= 2.2;
  }

  private activateObstacleZone(zone: ButtonZone, cooldownKey: string, now: number) {
    const last = this.lastButtonPressAt.get(cooldownKey) ?? 0;
    if (now - last < zone.cooldownMs) return;
    this.lastButtonPressAt.set(cooldownKey, now);
    for (const oid of zone.activatesObstacleIds) {
      const obs = this.state.obstacles.find((o) => o.id === oid);
      if (!obs) continue;
      obs.active = true;
      const hold = zone.holdMs > 0 ? zone.holdMs : obs.activeMs || 1500;
      this.buttonArmRemaining.set(oid, hold);
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
      Array.from(this.state.players.values()).forEach((player, index) => {
        player.role = 'runner';
        player.health = 100;
        player.energy = MAX_ENERGY;
        player.isAlive = true;
        player.hasFinished = false;
        this.applySpawnPosition(player, index);
        player.vz = 0;
      });
    }
  }
}
