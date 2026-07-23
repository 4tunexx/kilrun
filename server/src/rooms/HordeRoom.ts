import { Client, Room } from 'colyseus';
import { ObstacleState, PlayerState, RoomState } from '../schema/RoomState.js';
import {
  createFromBlueprints,
  createObstaclesFromBlueprints,
  type ObstacleBlueprint,
  type PlatformBlueprint,
} from '../sim/platforms.js';
import {
  HORDE_MIN_PLAYERS_TO_START,
  LOBBY_COUNTDOWN_MS,
  MAX_ENERGY,
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
import {
  applyAwardsByUserId,
  displayHordeOutcome,
  DISPLAY_HORDE_REWARDS,
  reportMatchResults,
} from '../match-report.js';

interface JoinOptions {
  token?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  kp?: number;
  equippedSkinsJson?: string;
  weaponCombat?: {
    kind?: string;
    range?: number;
    damage?: number;
    cooldownMs?: number;
    coneRadians?: number;
  };
}

interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

interface MonsterSpawnBlueprint {
  id: string;
  x: number;
  y: number;
  z: number;
  monsterType?: 'basic' | 'fast' | 'brute' | 'boss' | 'custom';
  displayName?: string;
  modelUrl?: string;
  modelId?: string;
  level?: number;
  hp?: number;
  damage?: number;
  speed?: number;
  radius?: number;
  waveMin?: number;
  waveMax?: number;
  countPerWave?: number;
  spawnIntervalSec?: number;
}

interface PadZone {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  healPerTick?: number;
  intervalMs?: number;
  damagePerTick?: number;
  reviveTimeMs?: number;
}

interface HordeModeSettings {
  warmupSec?: number;
  waveTimeSec?: number;
  intermissionSec?: number;
  maxPlayers?: number;
  startingWave?: number;
  totalWaves?: number;
  waveBuyTimeSec?: number;
  respawnOnWaveClear?: boolean;
  difficultyScale?: number;
}

interface MonsterSim {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  obstacleIndex: number;
}

const RESULTS_DISPLAY_MS = 8000;
const MAX_WAVES = 8;
const WAVE_CLEAR_PAUSE_MS = 2500;
const HORDE_MATCH_MS = 600_000;

const MONSTER_STATS = {
  basic: { hp: 40, speed: 2.4, damage: 12, radius: 0.55 },
  fast: { hp: 28, speed: 3.6, damage: 10, radius: 0.45 },
  brute: { hp: 90, speed: 1.7, damage: 22, radius: 0.75 },
  boss: { hp: 220, speed: 2.0, damage: 30, radius: 1.0 },
} as const;

/**
 * Horde co-op — up to 4 survivors clear escalating waves from map monster spawns.
 */
export class HordeRoom extends Room<RoomState> {
  maxClients = 4;

  private latestInputs = new Map<string, PlayerInput>();
  private simScratch = new Map<string, PlayerSimScratch>();
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private lastHealAt = new Map<string, number>();
  private resultsElapsedMs = 0;
  private worldBounds: WorldBounds = { ...DEFAULT_WORLD_BOUNDS };
  private hostSessionId: string | null = null;
  private adminSessions = new Set<string>();

  private playerSpawns: SpawnPoint[] = [];
  private monsterSpawnPoints: MonsterSpawnBlueprint[] = [];
  private healthFloors: PadZone[] = [];
  private redZones: PadZone[] = [];
  private revivePads: PadZone[] = [];
  private staticHazards: ObstacleBlueprint[] = [];

  private monsters: MonsterSim[] = [];
  private waveSpawnQueue: { point: MonsterSpawnBlueprint; remaining: number; intervalMs: number; nextAt: number }[] =
    [];
  private betweenWavesMs = 0;
  private matchKills = 0;
  private lobbyCountdownMs = LOBBY_COUNTDOWN_MS;
  private matchDurationMs = HORDE_MATCH_MS;
  private waveClearPauseMs = WAVE_CLEAR_PAUSE_MS;
  private maxWaves = MAX_WAVES;
  private startingWave = 1;
  private waveTimeMs = 0;
  private waveElapsedMs = 0;
  private waveBuyTimeMs = 0;
  private respawnOnWaveClear = true;
  private difficultyScale = 1.0;

  onCreate() {
    this.setState(new RoomState());
    this.state.modeTag = 'horde';
    // Small default arena until MAIN map loads
    this.state.platforms.push(
      ...createFromBlueprints([
        { x: 0, y: 0, z: 0, width: 14, depth: 14, kind: 'solid', height: 0.25 },
      ])
    );
    this.playerSpawns = [{ x: 0, y: 0, z: 0.5 }];
    this.monsterSpawnPoints = [
      {
        id: 'default_m1',
        x: 6,
        y: 0,
        z: 0.5,
        monsterType: 'basic',
        waveMin: 1,
        countPerWave: 3,
        spawnIntervalSec: 1.2,
      },
    ];

    this.onMessage('input', (client, input: Partial<PlayerInput>) => {
      if (!this.state.players.get(client.sessionId)) return;
      this.latestInputs.set(client.sessionId, {
        ...defaultInput(),
        ...this.latestInputs.get(client.sessionId),
        ...input,
      });
    });

    this.onMessage('forceStart', (client) => {
      if (this.state.phase !== 'lobby') return;
      if (!this.adminSessions.has(client.sessionId)) return;
      if (this.state.players.size < 1) return;
      // Admin can launch even alone — skip waiting for a full squad of 4.
      this.state.phase = 'countdown';
      this.state.countdownMs = this.lobbyCountdownMs;
      console.log(
        `[HordeRoom] admin forceStart (${this.state.players.size} player(s))`
      );
    });

    this.onMessage('buyWeapon', (client, preset: {
      kind?: string;
      damage?: number;
      range?: number;
      cooldownMs?: number;
      coneRadians?: number;
    }) => {
      // Allowed during lobby countdown or between-waves intermission (playing + betweenWavesMs > 0).
      const canBuy =
        this.state.phase === 'countdown' ||
        (this.state.phase === 'playing' && this.betweenWavesMs > 0 && this.waveBuyTimeMs > 0 &&
          this.betweenWavesMs <= this.waveBuyTimeMs);
      if (!canBuy) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const { sanitizeWeaponCombat } = require('../sim/loadout.js') as typeof import('../sim/loadout.js');
      const sanitized = sanitizeWeaponCombat(preset);
      player.weaponKind = sanitized.kind;
      player.weaponDamage = sanitized.damage;
      player.weaponRange = sanitized.range;
      player.weaponCooldownMs = sanitized.cooldownMs;
      player.weaponConeRadians = sanitized.coneRadians;
    });

    this.onMessage('loadCustomMap', (client, data: Record<string, unknown>) => {
      if (this.state.phase !== 'lobby' && this.state.phase !== 'countdown') return;
      const allowed =
        this.adminSessions.has(client.sessionId) || client.sessionId === this.hostSessionId;
      if (!allowed) return;

      const platforms = data?.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(platforms) || platforms.length === 0) return;

      const settings = (data?.modeSettings as { horde?: HordeModeSettings } | undefined)
        ?.horde;
      if (settings) {
        if (typeof settings.warmupSec === 'number' && Number.isFinite(settings.warmupSec)) {
          this.lobbyCountdownMs = Math.max(0, settings.warmupSec) * 1000;
        }
        if (
          typeof settings.intermissionSec === 'number' &&
          Number.isFinite(settings.intermissionSec)
        ) {
          this.waveClearPauseMs = Math.max(0, settings.intermissionSec) * 1000;
        }
        if (typeof settings.maxPlayers === 'number' && Number.isFinite(settings.maxPlayers)) {
          this.maxClients = Math.max(1, Math.min(4, Math.floor(settings.maxPlayers)));
        }
        if (
          typeof settings.startingWave === 'number' &&
          Number.isFinite(settings.startingWave)
        ) {
          this.startingWave = Math.max(1, Math.floor(settings.startingWave));
          this.maxWaves = Math.max(this.maxWaves, this.startingWave);
        }
        if (typeof settings.waveTimeSec === 'number' && Number.isFinite(settings.waveTimeSec)) {
          this.waveTimeMs = settings.waveTimeSec > 0 ? Math.max(1, settings.waveTimeSec) * 1000 : 0;
        }
        if (typeof settings.totalWaves === 'number' && Number.isFinite(settings.totalWaves)) {
          if (settings.totalWaves > 0) this.maxWaves = Math.max(1, Math.floor(settings.totalWaves));
        }
        if (typeof settings.waveBuyTimeSec === 'number' && Number.isFinite(settings.waveBuyTimeSec)) {
          this.waveBuyTimeMs = Math.max(0, settings.waveBuyTimeSec) * 1000;
        }
        if (typeof settings.respawnOnWaveClear === 'boolean') {
          this.respawnOnWaveClear = settings.respawnOnWaveClear;
        }
        if (typeof settings.difficultyScale === 'number' && Number.isFinite(settings.difficultyScale)) {
          this.difficultyScale = Math.max(0.1, settings.difficultyScale);
        }
      }

      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(platforms));

      this.staticHazards = Array.isArray(data?.obstacles)
        ? (data.obstacles as ObstacleBlueprint[])
        : [];
      this.rebuildStaticObstacles();

      if (Array.isArray(data?.playerSpawns) && (data.playerSpawns as SpawnPoint[]).length) {
        this.playerSpawns = (data.playerSpawns as SpawnPoint[]).map((s) => ({ ...s }));
      } else if (data?.spawn) {
        this.playerSpawns = [{ ...(data.spawn as SpawnPoint) }];
      }

      this.monsterSpawnPoints = Array.isArray(data?.monsterSpawns)
        ? (data.monsterSpawns as MonsterSpawnBlueprint[]).map((m) => ({ ...m }))
        : this.monsterSpawnPoints;

      this.healthFloors = Array.isArray(data?.healthFloors)
        ? (data.healthFloors as PadZone[])
        : [];
      this.redZones = Array.isArray(data?.redZones) ? (data.redZones as PadZone[]) : [];
      this.revivePads = Array.isArray(data?.revivePads) ? (data.revivePads as PadZone[]) : [];

      if (data.worldBounds) {
        this.worldBounds = { ...(data.worldBounds as WorldBounds) };
      }

      Array.from(this.state.players.values()).forEach((player, index) => {
        this.applySpawnPosition(player, index);
        player.vz = 0;
      });

      console.log(
        `[HordeRoom] map loaded: ${platforms.length} pads, ${this.monsterSpawnPoints.length} monster spawns`
      );
    });

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
    player.role = 'survivor';
    player.kp = claims.kp;
    applyLoadoutToPlayer(player, options);
    player.energy = MAX_ENERGY;
    this.applySpawnPosition(player, this.state.players.size);

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
    if (this.state.phase === 'playing') {
      const alive = Array.from(this.state.players.values()).filter((p) => p.isAlive);
      if (alive.length === 0) this.endMatch('horde');
    }
  }

  private applySpawnPosition(player: PlayerState, laneIndex: number) {
    const spawn = this.playerSpawns[laneIndex % Math.max(1, this.playerSpawns.length)];
    const laneSpread = ((laneIndex % 4) - 1.5) * 0.7;
    if (spawn) {
      player.x = spawn.x;
      player.y = spawn.y + laneSpread;
      player.z = spawn.z;
      return;
    }
    player.x = SPAWN_X;
    player.y = (((laneIndex % 4) + 1) / 5) * WORLD_HEIGHT;
    player.z = SPAWN_Z;
  }

  private rebuildStaticObstacles() {
    while (this.state.obstacles.length > 0) this.state.obstacles.pop();
    if (this.staticHazards.length) {
      this.state.obstacles.push(...createObstaclesFromBlueprints(this.staticHazards));
    }
    for (const zone of this.redZones) {
      const o = new ObstacleState();
      o.id = zone.id || `red_${Math.random().toString(36).slice(2, 8)}`;
      o.kind = 'damage';
      o.x = zone.x;
      o.y = zone.y;
      o.z = zone.z;
      o.width = zone.width;
      o.height = Math.max(zone.height, 1.2);
      o.damage = zone.damagePerTick ?? 15;
      o.intervalMs = zone.intervalMs ?? 500;
      o.activeMs = 999999;
      o.alwaysActive = true;
      o.active = true;
      this.state.obstacles.push(o);
    }
  }

  private update(dtMs: number) {
    switch (this.state.phase) {
      case 'lobby':
        if (this.state.players.size >= HORDE_MIN_PLAYERS_TO_START) {
          this.state.phase = 'countdown';
          this.state.countdownMs = this.lobbyCountdownMs;
        }
        break;
      case 'countdown':
        this.state.countdownMs -= dtMs;
        if (this.state.countdownMs <= 0) this.startMatch();
        break;
      case 'playing':
        this.tickPlaying(dtMs);
        break;
      case 'results':
        this.resultsElapsedMs += dtMs;
        if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
          this.state.phase = 'lobby';
          this.state.winnerRole = '';
          this.state.wave = 0;
          this.state.monstersAlive = 0;
          this.state.rewardsReady = false;
          this.clearMonsters();
          for (const player of this.state.players.values()) {
            player.kills = 0;
            player.score = 0;
            player.distance = 0;
            player.xpEarned = 0;
            player.vpEarned = 0;
            player.kpDelta = 0;
          }
        }
        break;
    }
  }

  private startMatch() {
    this.matchKills = 0;
    this.state.teamKills = 0;
    this.state.wave = 0;
    this.state.winnerRole = '';
    this.state.matchId = `${this.roomId}-${Date.now()}`;
    this.state.rewardsReady = false;
    this.clearMonsters();

    Array.from(this.state.players.values()).forEach((player, i) => {
      player.role = 'survivor';
      player.health = 100;
      player.energy = MAX_ENERGY;
      player.isAlive = true;
      player.hasFinished = false;
      player.kills = 0;
      player.score = 0;
      player.distance = 0;
      player.xpEarned = 0;
      player.vpEarned = 0;
      player.kpDelta = 0;
      this.applySpawnPosition(player, i);
      player.vz = 0;
      this.simScratch.set(player.sessionId, createSimScratch());
    });

    this.state.phase = 'playing';
    this.state.matchTimeRemainingMs = this.matchDurationMs;
    this.beginWave(this.startingWave);
  }

  private beginWave(wave: number) {
    this.state.wave = wave;
    this.betweenWavesMs = 0;
    this.waveElapsedMs = 0;
    this.clearMonsters();
    this.waveSpawnQueue = [];

    const points = this.monsterSpawnPoints.filter((p) => {
      const min = p.waveMin ?? 1;
      const max = p.waveMax ?? 0;
      if (wave < min) return false;
      if (max > 0 && wave > max) return false;
      return true;
    });

    // Respawn downed players when a wave begins (after intermission).
    if (this.respawnOnWaveClear && wave > this.startingWave) {
      const players = Array.from(this.state.players.values());
      players.forEach((player, index) => {
        if (!player.isAlive) {
          player.health = 100;
          player.isAlive = true;
          this.applySpawnPosition(player, index);
        }
      });
    }

    const now = Date.now();
    for (const point of points.length ? points : this.monsterSpawnPoints) {
      const base = point.countPerWave ?? 2;
      const scale = 1 + (wave - 1) * 0.35 * this.difficultyScale;
      const count = Math.max(1, Math.round(base * scale));
      const intervalMs = Math.max(400, (point.spawnIntervalSec ?? 1.5) * 1000);
      this.waveSpawnQueue.push({
        point,
        remaining: count,
        intervalMs,
        nextAt: now,
      });
    }

    if (this.waveSpawnQueue.length === 0) {
      // Fallback single spawn
      this.waveSpawnQueue.push({
        point: {
          id: 'fallback',
          x: 5,
          y: 0,
          z: 0.5,
          monsterType: wave >= 5 ? 'brute' : 'basic',
          countPerWave: 3 + wave,
        },
        remaining: 3 + wave,
        intervalMs: 1000,
        nextAt: now,
      });
    }
  }

  private clearMonsters() {
    // Remove monster obstacles (ids starting with mon_)
    for (let i = this.state.obstacles.length - 1; i >= 0; i--) {
      if (this.state.obstacles[i].id.startsWith('mon_')) {
        this.state.obstacles.splice(i, 1);
      }
    }
    this.monsters = [];
    this.state.monstersAlive = 0;
  }

  private spawnMonster(point: MonsterSpawnBlueprint) {
    const type = point.monsterType === 'custom' ? 'basic' : point.monsterType ?? 'basic';
    const base = MONSTER_STATS[type] ?? MONSTER_STATS.basic;
    const level = Math.max(1, point.level ?? 1);
    const levelScale = 1 + (level - 1) * 0.18;
    const waveScaling = 1 + (this.state.wave - 1) * 0.12 * this.difficultyScale;
    const stats = {
      hp: (point.hp && point.hp > 0 ? point.hp : base.hp * levelScale) * waveScaling,
      speed: point.speed && point.speed > 0 ? point.speed : base.speed * (1 + (this.state.wave - 1) * 0.04 * this.difficultyScale),
      damage: point.damage && point.damage > 0 ? point.damage : Math.round(base.damage * levelScale * (1 + (this.state.wave - 1) * 0.08 * this.difficultyScale)),
      radius: point.radius && point.radius > 0 ? point.radius : base.radius,
    };
    const id = `mon_${Math.random().toString(36).slice(2, 9)}`;
    const obs = new ObstacleState();
    obs.id = id;
    obs.kind = type === 'boss' ? 'crusher' : type === 'brute' ? 'saw' : 'damage';
    obs.x = point.x + (Math.random() - 0.5) * 1.2;
    obs.y = point.y + (Math.random() - 0.5) * 1.2;
    obs.z = point.z;
    obs.width = stats.radius * 2;
    obs.height = 1.4;
    obs.damage = stats.damage;
    obs.intervalMs = 450;
    obs.activeMs = 999999;
    obs.alwaysActive = true;
    obs.active = true;
    this.state.obstacles.push(obs);

    this.monsters.push({
      id,
      x: obs.x,
      y: obs.y,
      z: obs.z,
      hp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      radius: stats.radius,
      obstacleIndex: this.state.obstacles.length - 1,
    });
    this.state.monstersAlive = this.monsters.length;
  }

  private tickPlaying(dtMs: number) {
    this.state.matchTimeRemainingMs -= dtMs;
    if (this.state.matchTimeRemainingMs <= 0) {
      this.endMatch('survivor');
      return;
    }

    this.tickSpawnQueue();
    this.tickMonsters(dtMs / 1000);
    this.tickPlayers(dtMs);
    this.tickPads();

    const alivePlayers = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    if (alivePlayers.length === 0) {
      this.endMatch('horde');
      return;
    }

    if (this.waveTimeMs > 0) {
      this.waveElapsedMs += dtMs;
      if (this.waveElapsedMs >= this.waveTimeMs) {
        if (this.state.wave >= this.maxWaves) {
          this.endMatch('survivor');
        } else {
          this.beginWave(this.state.wave + 1);
        }
        return;
      }
    }

    // Wave clear: queue empty and no monsters left
    if (
      this.waveSpawnQueue.every((q) => q.remaining <= 0) &&
      this.monsters.length === 0
    ) {
      if (this.state.wave >= this.maxWaves) {
        this.endMatch('survivor');
        return;
      }
      this.betweenWavesMs += dtMs;
      if (this.betweenWavesMs >= this.waveClearPauseMs) {
        this.beginWave(this.state.wave + 1);
      }
    }
  }

  private tickSpawnQueue() {
    const now = Date.now();
    for (const q of this.waveSpawnQueue) {
      if (q.remaining <= 0) continue;
      if (now < q.nextAt) continue;
      this.spawnMonster(q.point);
      q.remaining -= 1;
      q.nextAt = now + q.intervalMs;
    }
  }

  private tickMonsters(dtSec: number) {
    const players = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    if (!players.length) return;

    const SEPARATION_DIST = 0.9;
    const ATTACK_PAD = 0.7;

    for (const mon of this.monsters) {
      let nearest = players[0];
      let best = Infinity;
      for (const p of players) {
        const d = (p.x - mon.x) ** 2 + (p.y - mon.y) ** 2;
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      const dx = nearest.x - mon.x;
      const dy = nearest.y - mon.y;
      const dist = Math.hypot(dx, dy) || 1;
      const attackRadius = ATTACK_PAD + mon.radius;

      // Approach until within attack range — then stand and deal contact damage only.
      if (dist > attackRadius) {
        mon.x += (dx / dist) * mon.speed * dtSec;
        mon.y += (dy / dist) * mon.speed * dtSec;
      }

      // Separation: push monsters apart so they don't stack on the same spot.
      for (const other of this.monsters) {
        if (other.id === mon.id) continue;
        const ox = mon.x - other.x;
        const oy = mon.y - other.y;
        const od = Math.hypot(ox, oy);
        if (od > 0 && od < SEPARATION_DIST) {
          const push = ((SEPARATION_DIST - od) / SEPARATION_DIST) * mon.speed * dtSec * 0.85;
          mon.x += (ox / od) * push;
          mon.y += (oy / od) * push;
        }
      }

      const obs = this.state.obstacles.find((o) => o.id === mon.id);
      if (obs) {
        obs.x = mon.x;
        obs.y = mon.y;
        obs.z = mon.z;
      }
    }
    this.state.monstersAlive = this.monsters.length;
  }

  private tickPlayers(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    const now = Date.now();

    this.state.players.forEach((player, sessionId) => {
      if (!player.isAlive) {
        // Allow movement only if revived later — keep dead still for MVP
        return;
      }

      const input = this.latestInputs.get(sessionId) ?? defaultInput();
      let scratch = this.simScratch.get(sessionId);
      if (!scratch) {
        scratch = createSimScratch();
        this.simScratch.set(sessionId, scratch);
      }

      applyMovement(player, input, dtSeconds, this.state.platforms, scratch, this.worldBounds);

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
        const amount = obstacle.damage > 0 ? obstacle.damage : OBSTACLE_DAMAGE;
        this.damagePlayer(player, amount);
      }

      if (player.z < VOID_Z) {
        this.damagePlayer(player, 100);
      }

      if (input.shootPressed && player.weaponKind !== 'cosmetic') {
        const lastShot = this.lastShotAt.get(sessionId) ?? 0;
        const cooldown = player.weaponCooldownMs > 0 ? player.weaponCooldownMs : 350;
        if (now - lastShot >= cooldown) {
          this.lastShotAt.set(sessionId, now);
          this.resolveSurvivorShot(player, sessionId);
        }
      }
    });
  }

  private tickPads() {
    const now = Date.now();
    for (const player of this.state.players.values()) {
      if (!player.isAlive) {
        // Revive pad: standing teammate not required for MVP — auto revive if body on pad
        for (const pad of this.revivePads) {
          if (this.isOnPad(player, pad)) {
            player.health = 60;
            player.isAlive = true;
            player.z = pad.z + 0.1;
          }
        }
        continue;
      }
      for (const floor of this.healthFloors) {
        if (!this.isOnPad(player, floor)) continue;
        const key = `${player.sessionId}:${floor.id}`;
        const last = this.lastHealAt.get(key) ?? 0;
        const interval = floor.intervalMs ?? 500;
        if (now - last < interval) continue;
        this.lastHealAt.set(key, now);
        player.health = Math.min(100, player.health + (floor.healPerTick ?? 8));
      }
    }
  }

  private isOnPad(player: PlayerState, pad: PadZone): boolean {
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = pad.depth / 2 + PLAYER_RADIUS;
    if (Math.abs(player.x - pad.x) > halfW || Math.abs(player.y - pad.y) > halfD) return false;
    return player.z >= pad.z - 0.5 && player.z <= pad.z + Math.max(pad.height, 1.2);
  }

  private resolveSurvivorShot(shooter: PlayerState, shooterSessionId: string) {
    if (shooter.weaponKind === 'cosmetic') return;
    const range = shooter.weaponRange > 0 ? shooter.weaponRange : 14;
    const damage = shooter.weaponDamage > 0 ? shooter.weaponDamage : 25;
    const cone = shooter.weaponConeRadians > 0 ? shooter.weaponConeRadians : 0.18;
    let best: MonsterSim | null = null;
    let bestDist = range;
    for (const mon of this.monsters) {
      if (
        !isHitByShot(shooter.x, shooter.y, shooter.aimAngle, mon.x, mon.y, range, cone, {
          shooterZ: shooter.z,
          aimPitch: shooter.aimPitch,
          targetZ: mon.z,
          targetHeight: 1.4,
          targetRadius: mon.radius,
        })
      ) {
        continue;
      }
      const d = Math.hypot(mon.x - shooter.x, mon.y - shooter.y);
      if (d < bestDist) {
        bestDist = d;
        best = mon;
      }
    }
    if (!best) return;
    best.hp -= damage;
    if (best.hp <= 0) {
      this.killMonster(best.id, shooterSessionId);
    }
  }

  private killMonster(id: string, shooterSessionId?: string) {
    this.monsters = this.monsters.filter((m) => m.id !== id);
    const idx = this.state.obstacles.findIndex((o) => o.id === id);
    if (idx >= 0) this.state.obstacles.splice(idx, 1);
    this.matchKills += 1;
    this.state.teamKills = this.matchKills;
    this.state.monstersAlive = this.monsters.length;
    if (shooterSessionId) {
      const shooter = this.state.players.get(shooterSessionId);
      if (shooter) {
        shooter.kills += 1;
        shooter.score = shooter.kills;
      }
    }
  }

  private damagePlayer(player: PlayerState, amount: number) {
    player.health = Math.max(0, player.health - amount);
    if (player.health <= 0) player.isAlive = false;
  }

  private endMatch(winnerRole: 'survivor' | 'horde') {
    if (this.state.phase === 'results') return;
    this.state.phase = 'results';
    this.state.winnerRole = winnerRole;
    this.resultsElapsedMs = 0;
    this.clearMonsters();
    void this.reportRewards(winnerRole);
  }

  private async reportRewards(winnerRole: 'survivor' | 'horde') {
    const matchId = this.state.matchId || `${this.roomId}-${Date.now()}`;
    this.state.matchId = matchId;
    const survived = winnerRole === 'survivor';
    const wavesCleared = Math.max(0, this.state.wave - (survived ? 0 : 1));

    const players = Array.from(this.state.players.values()).map((p) => ({
      userId: p.userId,
      role: p.role,
      isAlive: p.isAlive,
      kills: p.kills,
      score: p.score,
      wavesCleared,
    }));

    const awards = await reportMatchResults({
      matchId,
      mode: 'horde',
      winnerRole,
      room: { wave: this.state.wave, teamKills: this.state.teamKills },
      players,
    });

    if (awards) {
      applyAwardsByUserId(this.state.players.values(), awards.players);
      this.state.rewardsReady = true;
    } else {
      for (const player of this.state.players.values()) {
        const outcome = displayHordeOutcome(winnerRole, player.isAlive);
        const reward = DISPLAY_HORDE_REWARDS[outcome] ?? DISPLAY_HORDE_REWARDS.loss;
        const bonusXp = Math.min(80, wavesCleared * 4);
        player.xpEarned = reward.xp + bonusXp;
        player.vpEarned = reward.vp;
        player.kpDelta = 0;
      }
      this.state.rewardsReady = false;
    }
  }
}
