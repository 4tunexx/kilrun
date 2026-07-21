import { Client, Room } from 'colyseus';
import { PlayerState, RoomState } from '../schema/RoomState.js';
import {
  createFromBlueprints,
  createObstaclesFromBlueprints,
  type ObstacleBlueprint,
  type PlatformBlueprint,
} from '../sim/platforms.js';
import {
  COMPETITIVE_MIN_PLAYERS_TO_START,
  LOBBY_COUNTDOWN_MS,
  MAX_ENERGY,
  OBSTACLE_DAMAGE,
  OBSTACLE_HIT_COOLDOWN_MS,
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

interface JoinOptions {
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  kp?: number;
  /** Premium / VIP — required for competitive_ranked (unless free week client flag). */
  isPremium?: boolean;
  /** Hub-granted Ranked access (Premium or free Ranked week). */
  rankedAccess?: boolean;
  /** Matchmaking bracket — tier name or `open`. */
  rankKey?: string;
  mmWaitSec?: number;
  minSameRankPlayers?: number;
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

interface CompetitiveModeSettings {
  warmupSec?: number;
  buyTimeSec?: number;
  roundTimeSec?: number;
  roundCount?: number;
  overtimeSec?: number;
}

const RESULTS_DISPLAY_MS = 10000;
const ROUND_COUNTDOWN_MS = 4000;
const MAX_ROUNDS = 6;
const ROUND_TIME_MS = 120_000;
const DEFAULT_MM_WAIT_MS = 12_000;
const DEFAULT_MIN_SAME_RANK = 4;

/**
 * Competitive 4v4 — best of 6 rounds (first to 4). Team elimination via hitscan.
 * KP is applied client-side via recordCompetitiveResult on the results screen.
 */
export class CompetitiveRoom extends Room<RoomState> {
  maxClients = 8;

  private latestInputs = new Map<string, PlayerInput>();
  private simScratch = new Map<string, PlayerSimScratch>();
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private resultsElapsedMs = 0;
  private worldBounds: WorldBounds = { ...DEFAULT_WORLD_BOUNDS };
  private hostSessionId: string | null = null;
  private adminSessions = new Set<string>();

  private teamASpawns: SpawnPoint[] = [];
  private teamBSpawns: SpawnPoint[] = [];
  private betweenRounds = false;
  private betweenRoundMs = 0;
  private matchStarted = false;
  private overtimeApplied = false;

  private rankKey = 'open';
  private mmWaitMs = DEFAULT_MM_WAIT_MS;
  private minSameRank = DEFAULT_MIN_SAME_RANK;
  private lobbyElapsedMs = 0;
  private openedToAll = false;
  private lobbyCountdownMs = LOBBY_COUNTDOWN_MS;
  private roundCountdownMs = ROUND_COUNTDOWN_MS;
  private roundTimeMs = ROUND_TIME_MS;
  private maxRounds = MAX_ROUNDS;
  private buyTimeMs = 0;
  private overtimeMs = 60_000;

  onCreate(options: JoinOptions = {}) {
    this.setState(new RoomState());
    const named = String((this as unknown as { roomName?: string }).roomName ?? '');
    this.state.modeTag =
      named === 'competitive_ranked' ? 'competitive_ranked' : 'competitive';

    this.rankKey =
      typeof options.rankKey === 'string' && options.rankKey.trim()
        ? options.rankKey.trim()
        : 'open';
    if (typeof options.mmWaitSec === 'number' && options.mmWaitSec > 0) {
      this.mmWaitMs = Math.max(3000, options.mmWaitSec * 1000);
    }
    if (typeof options.minSameRankPlayers === 'number' && options.minSameRankPlayers > 0) {
      this.minSameRank = Math.max(2, Math.floor(options.minSameRankPlayers));
    }

    if (this.state.modeTag === 'competitive_ranked') {
      this.setMetadata({ rankKey: this.rankKey });
    }

    this.state.platforms.push(
      ...createFromBlueprints([
        { x: 0, y: 0, z: 0, width: 18, depth: 22, kind: 'solid', height: 0.25 },
      ])
    );
    // Default arena is centered at origin — Deathrun's [0,W]×[0,H] clamp would
    // shove team spawns into a corner. Custom maps override via loadCustomMap.
    this.worldBounds = { minX: -12, maxX: 12, minY: -12, maxY: 12 };
    this.teamASpawns = [
      { x: -6, y: -3, z: 0.5 },
      { x: -6, y: -1, z: 0.5 },
      { x: -6, y: 1, z: 0.5 },
      { x: -6, y: 3, z: 0.5 },
    ];
    this.teamBSpawns = [
      { x: 6, y: -3, z: 0.5 },
      { x: 6, y: -1, z: 0.5 },
      { x: 6, y: 1, z: 0.5 },
      { x: 6, y: 3, z: 0.5 },
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
      // Admin can launch even alone — skip matchmaking wait.
      this.state.phase = 'countdown';
      this.state.countdownMs = this.lobbyCountdownMs;
      console.log(
        `[CompetitiveRoom] admin forceStart (${this.state.players.size} player(s))`
      );
    });

    this.onMessage('loadCustomMap', (client, data: Record<string, unknown>) => {
      if (this.state.phase !== 'lobby' && this.state.phase !== 'countdown') return;
      const allowed =
        this.adminSessions.has(client.sessionId) || client.sessionId === this.hostSessionId;
      if (!allowed) return;

      const platforms = data?.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(platforms) || platforms.length === 0) return;

      const settings = (
        data?.modeSettings as { competitive?: CompetitiveModeSettings } | undefined
      )?.competitive;
      if (settings) {
        if (typeof settings.warmupSec === 'number' && Number.isFinite(settings.warmupSec)) {
          this.lobbyCountdownMs = Math.max(0, settings.warmupSec) * 1000;
        }
        if (typeof settings.buyTimeSec === 'number' && Number.isFinite(settings.buyTimeSec)) {
          this.buyTimeMs = Math.max(0, settings.buyTimeSec) * 1000;
        }
        if (
          typeof settings.roundTimeSec === 'number' &&
          Number.isFinite(settings.roundTimeSec)
        ) {
          this.roundTimeMs = Math.max(15, settings.roundTimeSec) * 1000;
        }
        if (typeof settings.roundCount === 'number' && Number.isFinite(settings.roundCount)) {
          this.maxRounds = Math.max(1, Math.min(12, Math.floor(settings.roundCount)));
        }
        if (
          typeof settings.overtimeSec === 'number' &&
          Number.isFinite(settings.overtimeSec)
        ) {
          this.overtimeMs = Math.max(0, settings.overtimeSec) * 1000;
        }
      }

      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(platforms));

      while (this.state.obstacles.length > 0) this.state.obstacles.pop();
      const hazards = Array.isArray(data?.obstacles)
        ? (data.obstacles as ObstacleBlueprint[])
        : [];
      if (hazards.length) {
        this.state.obstacles.push(...createObstaclesFromBlueprints(hazards));
      }

      const teamA = data?.teamASpawns as SpawnPoint[] | undefined;
      const teamB = data?.teamBSpawns as SpawnPoint[] | undefined;
      if (Array.isArray(teamA) && teamA.length) {
        this.teamASpawns = teamA.map((s) => ({ ...s }));
      }
      if (Array.isArray(teamB) && teamB.length) {
        this.teamBSpawns = teamB.map((s) => ({ ...s }));
      }

      if (data.worldBounds) {
        this.worldBounds = { ...(data.worldBounds as WorldBounds) };
      }

      this.assignTeamsAndSpawn();
      console.log(
        `[CompetitiveRoom] map loaded: ${platforms.length} pads, A=${this.teamASpawns.length} B=${this.teamBSpawns.length}`
      );
    });

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  onJoin(client: Client, options: JoinOptions) {
    const ranked = this.state.modeTag === 'competitive_ranked';
    const allowed = !!(options.isPremium || options.rankedAccess || options.isAdmin);
    if (ranked && !allowed) {
      throw new Error('Premium required for Ranked Competitive');
    }

    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (options.isAdmin) this.adminSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = options.userId ?? client.sessionId;
    player.username = options.username ?? `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = options.avatarUrl ?? '';
    player.kp = typeof options.kp === 'number' ? options.kp : 1000;
    applyLoadoutToPlayer(player, options);
    player.energy = MAX_ENERGY;

    // Balance by current team sizes
    const aCount = Array.from(this.state.players.values()).filter((p) => p.role === 'team_a').length;
    const bCount = Array.from(this.state.players.values()).filter((p) => p.role === 'team_b').length;
    player.role = aCount <= bCount ? 'team_a' : 'team_b';

    this.applyTeamSpawn(player);
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
    if (this.state.phase === 'playing' && this.matchStarted && !this.betweenRounds) {
      this.checkRoundEnd();
    }
  }

  private assignTeamsAndSpawn() {
    const players = Array.from(this.state.players.values());
    players.forEach((player, i) => {
      if (player.role !== 'team_a' && player.role !== 'team_b') {
        player.role = i % 2 === 0 ? 'team_a' : 'team_b';
      }
      this.applyTeamSpawn(player);
      player.vz = 0;
    });
  }

  private applyTeamSpawn(player: PlayerState) {
    const list = player.role === 'team_b' ? this.teamBSpawns : this.teamASpawns;
    const teammates = Array.from(this.state.players.values()).filter(
      (p) => p.role === player.role && p.sessionId !== player.sessionId
    );
    const index = teammates.length % Math.max(1, list.length);
    const spawn = list[index] ?? list[0];
    if (spawn) {
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      return;
    }
    player.x = player.role === 'team_b' ? 6 : -6;
    player.y = (((index % 4) + 1) / 5) * WORLD_HEIGHT;
    player.z = SPAWN_Z;
  }

  private update(dtMs: number) {
    switch (this.state.phase) {
      case 'lobby':
        this.lobbyElapsedMs += dtMs;
        // Same-rank bracket opens to everyone if not enough peers after wait.
        if (
          this.state.modeTag === 'competitive_ranked' &&
          !this.openedToAll &&
          this.rankKey !== 'open' &&
          this.lobbyElapsedMs >= this.mmWaitMs &&
          this.state.players.size < this.minSameRank
        ) {
          this.openedToAll = true;
          this.rankKey = 'open';
          this.setMetadata({ rankKey: 'open' });
          console.log(
            `[CompetitiveRoom] same-rank underfilled (${this.state.players.size}/${this.minSameRank}) — opened lobby`
          );
        }
        // Same-rank bracket waits for minSameRank; after open (or casual) use 2+.
        const minToStart =
          this.state.modeTag === 'competitive_ranked' &&
          !this.openedToAll &&
          this.rankKey !== 'open'
            ? this.minSameRank
            : COMPETITIVE_MIN_PLAYERS_TO_START;
        if (this.state.players.size >= minToStart) {
          this.state.phase = 'countdown';
          this.state.countdownMs = this.lobbyCountdownMs;
        }
        break;
      case 'countdown':
        this.state.countdownMs -= dtMs;
        if (this.state.countdownMs <= 0) {
          if (!this.matchStarted) this.startMatch();
          else this.startRound();
        }
        break;
      case 'playing':
        if (this.betweenRounds) {
          this.betweenRoundMs -= dtMs;
          if (this.betweenRoundMs <= 0) {
            this.betweenRounds = false;
            this.state.phase = 'countdown';
            this.state.countdownMs = this.roundCountdownMs;
          }
          break;
        }
        this.tickPlaying(dtMs);
        break;
      case 'results':
        this.resultsElapsedMs += dtMs;
        if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
          this.matchStarted = false;
          this.state.phase = 'lobby';
          this.state.winnerRole = '';
          this.state.scoreA = 0;
          this.state.scoreB = 0;
          this.state.roundIndex = 0;
        }
        break;
    }
  }

  private startMatch() {
    this.matchStarted = true;
    this.state.scoreA = 0;
    this.state.scoreB = 0;
    this.state.roundIndex = 0;
    this.state.winnerRole = '';
    this.assignTeamsAndSpawn();
    this.state.phase = 'countdown';
    this.state.countdownMs = this.roundCountdownMs + this.buyTimeMs;
  }

  private startRound() {
    this.state.roundIndex += 1;
    this.betweenRounds = false;
    this.overtimeApplied = false;
    this.state.phase = 'playing';
    this.state.matchTimeRemainingMs = this.roundTimeMs;

    Array.from(this.state.players.values()).forEach((player) => {
      player.health = 100;
      player.energy = MAX_ENERGY;
      player.isAlive = true;
      player.hasFinished = false;
      this.applyTeamSpawn(player);
      player.vz = 0;
      this.simScratch.set(player.sessionId, createSimScratch());
    });
  }

  private tickPlaying(dtMs: number) {
    this.state.matchTimeRemainingMs -= dtMs;
    this.tickPlayers(dtMs);

    if (this.state.matchTimeRemainingMs <= 0) {
      if (!this.overtimeApplied && this.state.scoreA === this.state.scoreB && this.overtimeMs > 0) {
        this.overtimeApplied = true;
        this.state.matchTimeRemainingMs = this.overtimeMs;
        return;
      }
      // Time expired — team with more alive wins; tie → Team A for determinism
      const aAlive = this.countAlive('team_a');
      const bAlive = this.countAlive('team_b');
      if (aAlive >= bAlive) this.endRound('team_a');
      else this.endRound('team_b');
      return;
    }

    this.checkRoundEnd();
  }

  private countAlive(team: 'team_a' | 'team_b') {
    return Array.from(this.state.players.values()).filter(
      (p) => p.role === team && p.isAlive
    ).length;
  }

  private checkRoundEnd() {
    const aAlive = this.countAlive('team_a');
    const bAlive = this.countAlive('team_b');
    const aTotal = Array.from(this.state.players.values()).filter((p) => p.role === 'team_a')
      .length;
    const bTotal = Array.from(this.state.players.values()).filter((p) => p.role === 'team_b')
      .length;

    // If a team has no players at all, don't end (solo testing both roles won't happen)
    if (aTotal > 0 && aAlive === 0) {
      this.endRound('team_b');
      return;
    }
    if (bTotal > 0 && bAlive === 0) {
      this.endRound('team_a');
    }
  }

  private endRound(winner: 'team_a' | 'team_b') {
    if (winner === 'team_a') this.state.scoreA += 1;
    else this.state.scoreB += 1;

    if (
      this.state.scoreA >= this.roundsToWin() ||
      this.state.scoreB >= this.roundsToWin() ||
      this.state.roundIndex >= this.maxRounds
    ) {
      const matchWinner =
        this.state.scoreA === this.state.scoreB
          ? winner
          : this.state.scoreA > this.state.scoreB
            ? 'team_a'
            : 'team_b';
      this.state.phase = 'results';
      this.state.winnerRole = matchWinner;
      this.resultsElapsedMs = 0;
      this.matchStarted = false;
      return;
    }

    // Short pause then countdown for next round
    this.betweenRounds = true;
    this.betweenRoundMs = 2000;
  }

  private roundsToWin() {
    return Math.floor(this.maxRounds / 2) + 1;
  }

  private tickPlayers(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    const now = Date.now();

    this.state.players.forEach((player, sessionId) => {
      if (!player.isAlive) return;

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
          this.resolvePvPShot(player);
        }
      }
    });
  }

  private resolvePvPShot(shooter: PlayerState) {
    if (shooter.weaponKind === 'cosmetic') return;
    const range = shooter.weaponRange > 0 ? shooter.weaponRange : 14;
    const damage = shooter.weaponDamage > 0 ? shooter.weaponDamage : 25;
    const cone = shooter.weaponConeRadians > 0 ? shooter.weaponConeRadians : 0.18;
    for (const target of this.state.players.values()) {
      if (!target.isAlive) continue;
      if (target.role === shooter.role) continue;
      if (
        isHitByShot(
          shooter.x,
          shooter.y,
          shooter.aimAngle,
          target.x,
          target.y,
          range,
          cone,
          {
            shooterZ: shooter.z,
            aimPitch: shooter.aimPitch,
            targetZ: target.z,
          }
        )
      ) {
        this.damagePlayer(target, damage);
        break;
      }
    }
  }

  private damagePlayer(player: PlayerState, amount: number) {
    player.health = Math.max(0, player.health - amount);
    if (player.health <= 0) player.isAlive = false;
  }
}
