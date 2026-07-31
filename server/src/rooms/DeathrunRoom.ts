import { Client, Room } from 'colyseus';
import { PlayerState, RoomState } from '../schema/RoomState.js';
import {
  createFromBlueprints,
  createObstaclesFromBlueprints,
  type ObstacleBlueprint,
  type PlatformBlueprint,
} from '../sim/platforms.js';
import {
  FINISH_X,
  LOBBY_COUNTDOWN_MS,
  MATCH_DURATION_MS,
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
  type MovementPhysicsOpts,
  type PlayerInput,
  type PlayerSimScratch,
  type WorldBounds,
} from '../sim/movement.js';
import { isHitByShot, isPlayerHitByObstacle } from '../sim/collision.js';
import {
  applyLoadoutToPlayer,
  tryStartReload,
  finishReloadIfDue,
  tryConsumeShotAmmo,
} from '../sim/loadout.js';
import {
  applyPlatformCarry,
  tickMovingPlatforms,
} from '../sim/moving-platforms.js';
import { fetchTrustedLoadout } from '../trusted-loadout.js';
import { applyAbilityStatsToPlayer, getMaxHealth, getMaxEnergyFor } from '../sim/ability-stats.js';
import {
  activateAbility,
  applyAbilityLevelsToPlayer,
  isBerserkActive,
  tickActiveAbilityTimers,
} from '../sim/active-abilities.js';
import { getBurstEffectStatsByKey } from '../../../shared/ability-progression.js';
import { assignDeathrunColors, BODY_COLOR_NONE } from '../lib/body-colors.js';
import {
  authenticateJoin,
  claimsFromAuth,
  type GameJoinClaims,
} from '../join-token.js';
import {
  applyAwardsByUserId,
  displayDeathrunOutcome,
  DISPLAY_DEATHRUN_REWARDS,
  reportMatchResults,
} from '../match-report.js';
import { fetchActiveMapPayload } from '../active-map.js';
import { ensurePowerDefinitionsLoaded } from '../power-defs.js';
import {
  detectPlayerCommand,
  detectStaffMention,
  reportChatFlag,
  sanitizeChatText,
} from '../lib/chat.js';
import { reportAdminBan } from '../lib/admin-actions.js';

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
/** @timeout / @surrender player commands — see handle*Command below. */
const MAX_TIMEOUTS_PER_TEAM = 3;
const TIMEOUT_DURATION_MS = 60_000;
const SURRENDER_VOTE_DURATION_MS = 30_000;

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
  private lastChatAt = new Map<string, number>();
  /** sessionId → mute expiry ms (Date.now()-based). */
  private mutedUntil = new Map<string, number>();
  /** Player-facing @timeout / @surrender — see handle*Command below. */
  private teamTimeoutsUsed = new Map<string, number>();
  private teamTimeoutResumeAt: number | null = null;
  private surrenderVote: {
    team: string;
    yes: Set<string>;
    no: Set<string>;
    startedAt: number;
  } | null = null;
  private matchDurationMs = MATCH_DURATION_MS;
  private lobbyCountdownMs = LOBBY_COUNTDOWN_MS;
  private trapperEnabled = true;
  private maxRunners = 8;
  private livesPerRunner = 3;
  private trapCooldownSec = 5;
  private checkpointRespawn = true;
  private combatPhysOpts: MovementPhysicsOpts = {};
  /** Moving platform homes + last positions. */
  private platformMotion = new Map<
    string,
    import('../sim/moving-platforms.js').PlatformMotionState
  >();
  private matchElapsedMs = 0;

  /** True after a client successfully pushed the Active/MAIN map. */
  private customMapLoaded = false;

  onCreate() {
    this.setState(new RoomState());
    // Stream state at the sim rate (30 Hz) instead of Colyseus' 20 Hz default
    // so clients get a steady position feed and movement doesn't stutter.
    this.setPatchRate(TICK_DT_MS);
    this.state.modeTag = 'deathrun';
    // Soft lobby pad only — NEVER seed DEATHRUN_TRACK hazards here.
    // Those used to linger whenever loadCustomMap failed (non-host, late join, etc.)
    // and showed up as "hardcoded" saws/lasers on top of the Active custom map.
    this.state.platforms.push(
      ...createFromBlueprints([
        {
          x: SPAWN_X,
          y: 0,
          z: 0,
          width: 10,
          depth: 10,
          kind: 'solid',
          height: 0.25,
        },
      ])
    );
    this.obstacleTimers = [];
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

    this.onMessage('forceStart', (client) => {
      if (this.state.phase !== 'lobby') return;
      if (!this.adminSessions.has(client.sessionId)) return;
      if (this.state.players.size < 1) return;
      this.state.phase = 'countdown';
      this.state.countdownMs = this.lobbyCountdownMs;
      console.log(
        `[DeathrunRoom] admin forceStart (${this.state.players.size} player(s))`
      );
    });

    this.onMessage('reload', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.isAlive) return;
      tryStartReload(player, Date.now());
    });

    this.onMessage(
      'chat',
      (client, payload: { text?: string; scope?: 'all' | 'team' } | undefined) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        const muteExpiry = this.mutedUntil.get(client.sessionId);
        if (muteExpiry && muteExpiry > Date.now()) return;
        const text = sanitizeChatText(payload?.text);
        if (!text) return;
        const now = Date.now();
        const last = this.lastChatAt.get(client.sessionId) ?? 0;
        if (now - last < 1200) return;
        this.lastChatAt.set(client.sessionId, now);

        const scope: 'all' | 'team' = payload?.scope === 'team' ? 'team' : 'all';
        const msg = {
          sessionId: client.sessionId,
          username: player.username,
          text,
          scope,
          at: now,
        };

        if (scope === 'team') {
          // Deathrun "team" = same role (runners together); a solo trapper
          // only reaches themselves — acceptable, there's no one else on
          // their side to hear it anyway.
          for (const [sid, target] of this.state.players) {
            if (target.role === player.role) {
              this.clients.getById(sid)?.send('chat', msg);
            }
          }
        } else {
          this.broadcast('chat', msg);
        }

        const mention = detectStaffMention(text);
        if (mention) {
          void reportChatFlag({
            mode: 'deathrun',
            roomId: this.roomId,
            username: player.username,
            userId: player.userId,
            text,
            mention,
          });
        }

        const command = detectPlayerCommand(text);
        if (command === 'timeout') this.handleTimeoutCommand(player);
        else if (command === 'surrender') this.handleSurrenderCommand(player);
        else if (command === 'vote_yes') this.handleVoteCommand(player, true);
        else if (command === 'vote_no') this.handleVoteCommand(player, false);
      }
    );

    this.onMessage('adminKick', (client, payload: { targetSessionId?: string } | undefined) => {
      if (!this.adminSessions.has(client.sessionId)) return;
      const targetSessionId = payload?.targetSessionId;
      if (!targetSessionId || targetSessionId === client.sessionId) return;
      const target = this.clients.getById(targetSessionId);
      target?.leave(4000, 'kicked_by_admin');
    });

    this.onMessage(
      'adminMute',
      (client, payload: { targetSessionId?: string; minutes?: number } | undefined) => {
        if (!this.adminSessions.has(client.sessionId)) return;
        const targetSessionId = payload?.targetSessionId;
        if (!targetSessionId || targetSessionId === client.sessionId) return;
        if (!this.state.players.has(targetSessionId)) return;
        const minutes = Math.min(120, Math.max(1, Math.floor(payload?.minutes ?? 5)));
        this.mutedUntil.set(targetSessionId, Date.now() + minutes * 60_000);
      }
    );

    this.onMessage(
      'adminBan',
      async (client, payload: { targetSessionId?: string; reason?: string } | undefined) => {
        if (!this.adminSessions.has(client.sessionId)) return;
        const admin = this.state.players.get(client.sessionId);
        const targetSessionId = payload?.targetSessionId;
        if (!admin || !targetSessionId || targetSessionId === client.sessionId) return;
        const target = this.state.players.get(targetSessionId);
        if (!target) return;
        const result = await reportAdminBan({
          actorUserId: admin.userId,
          actorUsername: admin.username,
          targetUserId: target.userId,
          mode: 'deathrun',
          detail: payload?.reason,
        });
        if (result.ok) {
          this.clients.getById(targetSessionId)?.leave(4001, 'banned_by_admin');
        } else {
          console.error('[DeathrunRoom] adminBan failed:', result.error);
        }
      }
    );

    this.onMessage('activateAbility', (client, payload: { ability?: string } | undefined) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const now = Date.now();
      if (!activateAbility(player, payload?.ability, now)) return;
      if (payload?.ability) {
        let level = 0;
        try {
          level = JSON.parse(player.ability.levelsJson || '{}')[payload.ability] ?? 0;
        } catch {
          level = 0;
        }
        const stats = getBurstEffectStatsByKey(payload.ability, level);
        const radius = stats.kind === 'radius_damage' ? stats.radiusMeters || 0 : 0;
        const damage = stats.kind === 'radius_damage' ? stats.damage || 0 : 0;
        if (radius > 0 && damage > 0) {
          for (const target of this.state.players.values()) {
            if (target.sessionId === player.sessionId || !target.isAlive || target.hasFinished) continue;
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            if (Math.hypot(dx, dy) <= radius) {
              this.damagePlayer(target, damage);
            }
          }
        }
      }
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
          modeSettings?: Record<string, unknown>;
          combatSettings?: Record<string, unknown>;
        }
      ) => {
        if (this.state.phase !== 'lobby' && this.state.phase !== 'countdown') return;
        // First push: any client may apply the cloud Active map (all clients fetch the same doc).
        // After that: only host/admin can replace (anti-grief).
        const isStaffOrHost =
          this.adminSessions.has(client.sessionId) ||
          client.sessionId === this.hostSessionId;
        if (this.customMapLoaded && !isStaffOrHost) {
          console.warn(
            `[DeathrunRoom] loadCustomMap rejected for ${client.sessionId} (map already loaded; not host/admin)`
          );
          return;
        }
        this.bootstrapCustomMap(data, `client:${client.sessionId}`);
      }
    );

    void ensurePowerDefinitionsLoaded();

    void fetchActiveMapPayload('deathrun').then((active) => {
      if (!active || this.customMapLoaded) return;
      this.bootstrapCustomMap(
        active.payload as Parameters<DeathrunRoom['bootstrapCustomMap']>[0],
        `server:${active.name}`
      );
    });

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  /** Apply MAIN map payload from server fetch or client push (shared body). */
  private bootstrapCustomMap(
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
      modeSettings?: Record<string, unknown>;
      combatSettings?: Record<string, unknown>;
    },
    source = 'client',
    force = false
  ) {
    const platforms = data?.platforms;
    if (!Array.isArray(platforms) || platforms.length === 0) return;
    if (this.customMapLoaded && source.startsWith('server:') && !force) return;

    while (this.state.platforms.length > 0) this.state.platforms.pop();
    this.state.platforms.push(...createFromBlueprints(platforms));

    while (this.state.obstacles.length > 0) this.state.obstacles.pop();
    const hazards = Array.isArray(data?.obstacles) ? data.obstacles : [];
    if (hazards.length > 0) {
      this.state.obstacles.push(...createObstaclesFromBlueprints(hazards));
    }
    this.obstacleTimers = this.state.obstacles.map(() => 0);
    this.buttonArmRemaining.clear();
    this.customMapLoaded = true;
    this.platformMotion.clear();
    this.matchElapsedMs = 0;

    const settings = (data.modeSettings?.deathrun ?? data.modeSettings) as
      | Record<string, unknown>
      | undefined;
    if (settings && typeof settings === 'object') {
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
      if (typeof settings.livesPerRunner === 'number' && Number.isFinite(settings.livesPerRunner)) {
        this.livesPerRunner = Math.max(0, Math.floor(settings.livesPerRunner));
      }
      if (typeof settings.trapCooldownSec === 'number' && Number.isFinite(settings.trapCooldownSec)) {
        this.trapCooldownSec = Math.max(1, settings.trapCooldownSec);
      }
      if (typeof settings.checkpointRespawn === 'boolean') {
        this.checkpointRespawn = settings.checkpointRespawn;
      }
    }

    const cs = data?.combatSettings;
    if (cs && typeof cs === 'object') {
      this.combatPhysOpts = {
        gravity: typeof cs.gravity === 'number' ? cs.gravity : undefined,
        jumpVelocity: typeof cs.jumpVelocity === 'number' ? cs.jumpVelocity : undefined,
        doubleJumpVelocity: typeof cs.doubleJumpVelocity === 'number' ? cs.doubleJumpVelocity : undefined,
        doubleJumpEnabled: typeof cs.doubleJumpEnabled === 'boolean' ? cs.doubleJumpEnabled : undefined,
        jumpCutMult: typeof cs.jumpCutMult === 'number' ? cs.jumpCutMult : undefined,
        coyoteMs: typeof cs.coyoteMs === 'number' ? cs.coyoteMs : undefined,
        jumpBufferMs: typeof cs.jumpBufferMs === 'number' ? cs.jumpBufferMs : undefined,
        walkSpeed: typeof cs.walkSpeed === 'number' ? cs.walkSpeed : undefined,
        sprintMult: typeof cs.sprintMult === 'number' ? cs.sprintMult : undefined,
        crouchMult: typeof cs.crouchMult === 'number' ? cs.crouchMult : undefined,
        maxFallSpeed: typeof cs.maxFallSpeed === 'number' ? cs.maxFallSpeed : undefined,
        apexGravMult: typeof cs.apexGravMult === 'number' ? cs.apexGravMult : undefined,
        wallJumpEnabled: typeof cs.wallJumpEnabled === 'boolean' ? cs.wallJumpEnabled : undefined,
        wallJumpHorizVel: typeof cs.wallJumpHorizVel === 'number' ? cs.wallJumpHorizVel : undefined,
        wallJumpVertVel: typeof cs.wallJumpVertVel === 'number' ? cs.wallJumpVertVel : undefined,
        wallSlideGravMult: typeof cs.wallSlideGravMult === 'number' ? cs.wallSlideGravMult : undefined,
      };
    }

    this.customFinishes = Array.isArray(data?.finishes) ? data.finishes : [];
    this.customButtons = Array.isArray(data?.buttons) ? data.buttons : [];
    this.customActions = Array.isArray(data.actions) ? data.actions : [];
    this.customTeleports = Array.isArray(data?.teleports) ? data.teleports : [];
    if (Array.isArray(data.playerSpawns) && data.playerSpawns.length) {
      this.customRunnerSpawns = data.playerSpawns.map((s) => ({ ...s })).slice(0, this.maxRunners);
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
      `[DeathrunRoom] MAIN map loaded (${source}): ${platforms.length} platforms, ${hazards.length} hazards`
    );
  }

  onAuth(_client: Client, options: JoinOptions): GameJoinClaims {
    return authenticateJoin(options);
  }

  async onJoin(client: Client, options: JoinOptions) {
    const claims = claimsFromAuth(client.auth, options);
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (claims.isAdmin) this.adminSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = claims.userId || client.sessionId;
    player.username =
      claims.username || `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = claims.avatarUrl || '';
    const trusted = await fetchTrustedLoadout(player.userId);
    applyLoadoutToPlayer(player, trusted ?? options);
    applyAbilityStatsToPlayer(player, trusted?.abilityStatBonuses);
    applyAbilityLevelsToPlayer(player, trusted?.abilityLevels ?? null);
    this.applySpawnPosition(player, this.state.players.size);
    player.health = getMaxHealth(player);
    player.energy = getMaxEnergyFor(player);
    player.role = 'runner';
    player.bodyColorIndex = BODY_COLOR_NONE;

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
    this.lastChatAt.delete(client.sessionId);
    this.mutedUntil.delete(client.sessionId);
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
    if (this.state.adminPaused) {
      // Only a player-called @timeout has an auto-resume timestamp — an
      // admin pause from the website Live tab stays paused until the
      // admin explicitly resumes it.
      if (this.teamTimeoutResumeAt !== null && Date.now() >= this.teamTimeoutResumeAt) {
        this.state.adminPaused = false;
        this.teamTimeoutResumeAt = null;
        this.systemMessage('Timeout over — match resumed.');
      } else {
        return;
      }
    }
    if (
      this.surrenderVote &&
      Date.now() - this.surrenderVote.startedAt > SURRENDER_VOTE_DURATION_MS
    ) {
      this.systemMessage(
        `Surrender vote (${this.surrenderVote.team}) expired without a majority.`
      );
      this.surrenderVote = null;
    }
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
    player.health = getMaxHealth(player);
    player.energy = getMaxEnergyFor(player);
    player.isAlive = true;
    player.hasFinished = false;
    this.applySpawnPosition(player, laneIndex);
    player.vz = 0;
    player.isGrounded = true;
    player.isSprinting = false;
    player.isCrouching = false;
  }

  private resetMatchTelemetry(player: PlayerState) {
    player.kills = 0; player.deaths = 0;
    player.score = 0;
    player.distance = 0;
    player.xpEarned = 0;
    player.vpEarned = 0;
    player.kpDelta = 0;
  }

  private startRound() {
    const sessionIds = Array.from(this.state.players.keys());

    this.state.matchId = `${this.roomId}-${Date.now()}`;
    this.state.rewardsReady = false;

    if (!this.trapperEnabled || sessionIds.length === 1) {
      const colors = assignDeathrunColors(sessionIds, null);
      sessionIds.forEach((sessionId, i) => {
        const player = this.state.players.get(sessionId)!;
        player.role = 'runner';
        player.bodyColorIndex = colors.get(sessionId) ?? BODY_COLOR_NONE;
        this.resetPlayerOnSpawn(player, i);
        this.resetMatchTelemetry(player);
        this.simScratch.set(sessionId, createSimScratch());
      });
      this.state.trapperSessionId = '';
    } else {
      const trapperIndex = Math.floor(Math.random() * sessionIds.length);
      const trapperSessionId = sessionIds[trapperIndex];
      this.state.trapperSessionId = trapperSessionId;
      const colors = assignDeathrunColors(sessionIds, trapperSessionId);

      let runnerLaneIndex = 0;
      sessionIds.forEach((sessionId, i) => {
        const player = this.state.players.get(sessionId)!;
        player.role = sessionId === trapperSessionId ? 'trapper' : 'runner';
        player.bodyColorIndex = colors.get(sessionId) ?? BODY_COLOR_NONE;
        this.resetPlayerOnSpawn(
          player,
          player.role === 'runner' ? runnerLaneIndex++ : i
        );
        this.resetMatchTelemetry(player);
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
    this.matchElapsedMs = 0;
    this.platformMotion.clear();
  }

  private tickPlaying(dtMs: number) {
    this.state.matchTimeRemainingMs -= dtMs;
    this.matchElapsedMs += dtMs;

    const platformDeltas = tickMovingPlatforms(
      this.state.platforms,
      this.platformMotion,
      this.matchElapsedMs
    );
    this.tickObstacles(dtMs);
    this.tickPlayers(dtMs, platformDeltas);

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

  private tickPlayers(
    dtMs: number,
    platformDeltas: import('../sim/moving-platforms.js').PlatformDelta[] = []
  ) {
    const dtSeconds = dtMs / 1000;
    const now = Date.now();

    this.state.players.forEach((player, sessionId) => {
      const input = this.latestInputs.get(sessionId) ?? defaultInput();
      let scratch = this.simScratch.get(sessionId);
      if (!scratch) {
        scratch = createSimScratch();
        this.simScratch.set(sessionId, scratch);
      }

      applyPlatformCarry(player, scratch.supportPlatformId, platformDeltas);
      tickActiveAbilityTimers(player, now);

      applyMovement(
        player,
        input,
        dtSeconds,
        this.state.platforms,
        scratch,
        this.worldBounds,
        this.combatPhysOpts
      );

      finishReloadIfDue(player, now);

      if (player.role === 'runner' && player.isAlive && !player.hasFinished) {
        player.distance = Math.max(
          player.distance,
          Math.floor(Math.max(0, player.x - this.state.courseStartX))
        );
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
        if (this.checkpointRespawn && player.hasCheckpoint) {
          this.respawnAtCheckpoint(player);
          // Consume a life if finite lives are configured.
          if (this.livesPerRunner > 0) {
            player.score = Math.max(0, player.score - 1);
          }
        } else {
          if (player.isAlive) player.deaths = (player.deaths || 0) + 1;
          player.health = 0;
          player.isAlive = false;
        }
      }

      if (player.role === 'trapper' && player.isAlive && input.shootPressed) {
        if (player.weaponKind !== 'cosmetic') {
          const lastShot = this.lastShotAt.get(sessionId) ?? 0;
          const cooldown = player.weaponCooldownMs > 0 ? player.weaponCooldownMs : 350;
          if (now - lastShot >= cooldown) {
            if (tryConsumeShotAmmo(player, now)) {
              this.lastShotAt.set(sessionId, now);
              this.resolveTrapperShot(player);
            }
          }
        }
      }
    });
  }

  private resolveTrapperShot(trapper: PlayerState) {
    if (trapper.weaponKind === 'cosmetic') return;
    const range = trapper.weaponRange > 0 ? trapper.weaponRange : 14;
    const damage = trapper.weaponDamage > 0 ? trapper.weaponDamage : 25;
    const berserkDamage = Math.max(damage, 999);
    const cone = trapper.weaponConeRadians > 0 ? trapper.weaponConeRadians : 0.18;
    // Pick the CLOSEST target inside the cone, not just the first one found
    // in Map iteration order — otherwise a farther runner could "steal" a
    // hit that should've landed on someone standing closer to the trapper.
    let closest: PlayerState | null = null;
    let closestDistSq = Infinity;
    for (const target of this.state.players.values()) {
      if (target.role !== 'runner' || !target.isAlive || target.hasFinished) continue;
      if (
        !isHitByShot(trapper.x, trapper.y, trapper.aimAngle, target.x, target.y, range, cone, {
          shooterZ: trapper.z,
          aimPitch: trapper.aimPitch,
          targetZ: target.z,
        })
      ) {
        continue;
      }
      const dx = target.x - trapper.x;
      const dy = target.y - trapper.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closest = target;
      }
    }
    if (closest) this.damagePlayer(closest, isBerserkActive(trapper, Date.now()) ? berserkDamage : damage);
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
    if (isBerserkActive(player, Date.now())) {
      return;
    }
    const wasAlive = player.isAlive && player.health > 0;
    player.health = Math.max(0, player.health - amount);
    if (player.health <= 0) {
      if (wasAlive) {
        player.deaths = (player.deaths || 0) + 1;
        // Trapper gets a kill credit when eliminating a runner.
        if (player.role === 'runner') {
          for (const p of this.state.players.values()) {
            if (p.role === 'trapper' && p.isAlive) {
              p.kills = (p.kills || 0) + 1;
              break;
            }
          }
        }
      }
      player.isAlive = false;
    }
  }

  /**
   * Admin dashboard control surface — called via matchMaker.getLocalRoomById()
   * from the /admin/live-matches HTTP routes (server/src/index.ts), not a
   * Colyseus onMessage. There's no in-room client for these; the acting
   * admin is on the website, not necessarily connected to this match.
   */
  public adminPause(): void {
    this.state.adminPaused = true;
  }

  public adminResume(): void {
    this.state.adminPaused = false;
  }

  public adminCancelMatch(): void {
    if (this.state.phase === 'results') return;
    this.state.adminPaused = false;
    this.state.phase = 'results';
    this.state.wasCancelled = true;
    // No reportRewards() call — an admin-cancelled match never completed
    // organically, so no rewards are granted (players keep xpEarned/vpEarned
    // at their default 0).
  }

  public adminBroadcastMessage(text: string): void {
    this.state.adminMessage = text;
    this.state.adminMessageSeq += 1;
  }

  /** Server-authored info line, same 'chat' channel, distinct sender so
   * clients can style it differently from a real player's message. */
  private systemMessage(text: string): void {
    this.broadcast('chat', {
      sessionId: 'system',
      username: 'System',
      text,
      scope: 'all',
      at: Date.now(),
    });
  }

  private teamMembers(team: string): PlayerState[] {
    return Array.from(this.state.players.values()).filter((p) => p.role === team);
  }

  private handleTimeoutCommand(player: PlayerState): void {
    if (this.state.phase !== 'playing' || this.state.adminPaused) return;
    const team = player.role;
    const used = this.teamTimeoutsUsed.get(team) ?? 0;
    if (used >= MAX_TIMEOUTS_PER_TEAM) {
      this.systemMessage(`${team === 'trapper' ? 'Trapper' : 'Runners'} have no timeouts left.`);
      return;
    }
    this.teamTimeoutsUsed.set(team, used + 1);
    this.state.adminPaused = true;
    this.teamTimeoutResumeAt = Date.now() + TIMEOUT_DURATION_MS;
    const remaining = MAX_TIMEOUTS_PER_TEAM - used - 1;
    this.systemMessage(
      `${player.username} called a timeout (${remaining} left for ${team === 'trapper' ? 'Trapper' : 'Runners'}). Match paused for 60s.`
    );
  }

  private handleSurrenderCommand(player: PlayerState): void {
    if (this.state.phase !== 'playing') return;
    if (this.surrenderVote) {
      this.systemMessage('A surrender vote is already in progress.');
      return;
    }
    const team = player.role;
    const members = this.teamMembers(team);
    this.surrenderVote = {
      team,
      yes: new Set([player.sessionId]),
      no: new Set(),
      startedAt: Date.now(),
    };
    this.systemMessage(
      `${player.username} called for a surrender vote (${team === 'trapper' ? 'Trapper' : 'Runners'})! Type @yes or @no — needs a majority of ${members.length}.`
    );
    this.checkSurrenderVote();
  }

  private handleVoteCommand(player: PlayerState, yes: boolean): void {
    if (!this.surrenderVote || this.surrenderVote.team !== player.role) return;
    this.surrenderVote.yes.delete(player.sessionId);
    this.surrenderVote.no.delete(player.sessionId);
    (yes ? this.surrenderVote.yes : this.surrenderVote.no).add(player.sessionId);
    this.checkSurrenderVote();
  }

  /** Resolves immediately once either side reaches a strict majority of
   * the team's CURRENT roster (not just however many votes were cast, and
   * re-counted against current members each time in case someone left
   * mid-vote). */
  private checkSurrenderVote(): void {
    const vote = this.surrenderVote;
    if (!vote) return;
    const memberIds = new Set(this.teamMembers(vote.team).map((m) => m.sessionId));
    const yesCount = Array.from(vote.yes).filter((id) => memberIds.has(id)).length;
    const noCount = Array.from(vote.no).filter((id) => memberIds.has(id)).length;
    const needed = Math.floor(memberIds.size / 2) + 1;

    if (yesCount >= needed) {
      this.surrenderVote = null;
      const opposing: 'trapper' | 'runner' = vote.team === 'trapper' ? 'runner' : 'trapper';
      this.systemMessage(
        `Surrender vote passed — ${vote.team === 'trapper' ? 'Trapper' : 'Runners'} surrendered.`
      );
      // A surrender is a REAL conclusion (unlike admin cancel) — the
      // opposing side gets their normal win rewards via endRound's
      // existing reportRewards() call.
      this.endRound(opposing);
      return;
    }
    if (noCount >= needed) {
      this.surrenderVote = null;
      this.systemMessage('Surrender vote failed.');
    }
  }

  private endRound(winnerRole: 'trapper' | 'runner') {
    if (this.state.phase === 'results') return;
    this.state.phase = 'results';
    this.state.winnerRole = winnerRole;
    this.resultsElapsedMs = 0;

    for (const player of this.state.players.values()) {
      if (player.role === 'runner') {
        player.distance = Math.max(
          player.distance,
          Math.floor(Math.max(0, player.x - this.state.courseStartX))
        );
      }
      const outcome = displayDeathrunOutcome(winnerRole, player.role, player.isAlive);
      player.score =
        outcome === 'win'
          ? 100 + Math.floor(player.distance)
          : Math.max(0, Math.floor(player.distance * 0.35));
    }

    void this.reportRewards(winnerRole);
  }

  /** protected (not private) so DeathrunPracticeRoom can override and skip
   * real reward reporting entirely for solo map-editor Play Test runs. */
  protected async reportRewards(winnerRole: 'trapper' | 'runner') {
    const matchId = this.state.matchId || `${this.roomId}-${Date.now()}`;
    this.state.matchId = matchId;

    const players = Array.from(this.state.players.values()).map((p) => ({
      userId: p.userId,
      role: p.role,
      isAlive: p.isAlive,
      hasFinished: p.hasFinished,
      score: p.score,
      distance: p.distance,
      kills: p.kills,
      deaths: p.deaths,
    }));

    const awards = await reportMatchResults({
      matchId,
      mode: 'deathrun',
      winnerRole,
      players,
    });

    if (awards) {
      applyAwardsByUserId(this.state.players.values(), awards.players);
      this.state.rewardsReady = true;
    } else {
      // Local display-only path — client falls back to record* with matchId.
      for (const player of this.state.players.values()) {
        const outcome = displayDeathrunOutcome(
          winnerRole,
          player.role,
          player.isAlive
        );
        const reward = DISPLAY_DEATHRUN_REWARDS[outcome] ?? DISPLAY_DEATHRUN_REWARDS.loss;
        player.xpEarned = reward.xp;
        player.vpEarned = reward.vp;
        player.kpDelta = 0;
      }
      this.state.rewardsReady = false;
    }
  }

  private tickResults(dtMs: number) {
    this.resultsElapsedMs += dtMs;
    if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
      this.state.phase = 'lobby';
      this.state.countdownMs = 0;
      this.state.trapperSessionId = '';
      this.state.winnerRole = '';
      this.state.rewardsReady = false;
      Array.from(this.state.players.values()).forEach((player, index) => {
        player.role = 'runner';
        player.health = getMaxHealth(player);
        player.energy = getMaxEnergyFor(player);
        player.isAlive = true;
        player.hasFinished = false;
        this.resetMatchTelemetry(player);
        this.applySpawnPosition(player, index);
        player.vz = 0;
      });
      // Re-sync to whatever is currently published as Active — a room can live
      // across many rounds, so without this a map edit published mid-session
      // (e.g. taller walls) never reaches players until an admin manually
      // restarts Colyseus. Every new round now re-checks the cloud MAIN doc.
      void fetchActiveMapPayload('deathrun').then((active) => {
        if (!active) return;
        this.bootstrapCustomMap(
          active.payload as Parameters<DeathrunRoom['bootstrapCustomMap']>[0],
          `server:${active.name}`,
          true
        );
      });
    }
  }
}
