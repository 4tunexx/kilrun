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
  type MovementPhysicsOpts,
  type PlayerInput,
  type PlayerSimScratch,
  type WorldBounds,
} from '../sim/movement.js';
import {
  applyPlatformCarry,
  tickMovingPlatforms,
  type PlatformDelta,
  type PlatformMotionState,
} from '../sim/moving-platforms.js';
import { isPlayerHitByObstacle } from '../sim/collision.js';
import {
  applyLoadoutToPlayer,
  sanitizeWeaponCombat,
  applySanitizedWeaponToPlayer,
  tryStartReload,
  finishReloadIfDue,
  tryConsumeShotAmmo,
} from '../sim/loadout.js';
import {
  effectiveWeaponCone,
  isTargetHitByPellet,
  pelletAimOffsets,
  weaponPelletCount,
  weaponPelletDamage,
} from '../sim/weapon-combat.js';
import { fetchTrustedLoadout } from '../trusted-loadout.js';
import { applyAbilityStatsToPlayer, getMaxHealth, getMaxEnergyFor } from '../sim/ability-stats.js';
import {
  activateAbility,
  applyAbilityLevelsToPlayer,
  isBerserkActive,
  tickActiveAbilityTimers,
} from '../sim/active-abilities.js';
import { getBurstEffectStatsByKey } from '../../../shared/ability-progression.js';
import { assignCompetitiveColor } from '../lib/body-colors.js';
import {
  authenticateJoin,
  claimsFromAuth,
  type GameJoinClaims,
} from '../join-token.js';
import {
  applyAwardsByUserId,
  displayCompetitiveOutcome,
  DISPLAY_COMPETITIVE_REWARDS,
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

const KP_DEFAULT = 1000;

interface JoinOptions {
  token?: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  /** Admin OR moderator — eligible for the reserved staff join seat. */
  isStaff?: boolean;
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
  maxPlayersPerTeam?: number;
  friendlyFire?: boolean;
  respawnInRound?: boolean;
}

interface PushPayloadSim {
  railId: string;
  blockId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  width: number;
  t: number;
  pushStrength: number;
  pushRadius: number;
  winEpsilon: number;
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

const RESULTS_DISPLAY_MS = 10000;
const ROUND_COUNTDOWN_MS = 4000;
const MAX_ROUNDS = 6;
const ROUND_TIME_MS = 120_000;
const DEFAULT_MM_WAIT_MS = 12_000;
const DEFAULT_MIN_SAME_RANK = 4;
/** @timeout / @surrender player commands. */
const MAX_TIMEOUTS_PER_TEAM = 3;
const TIMEOUT_DURATION_MS = 60_000;
const SURRENDER_VOTE_DURATION_MS = 30_000;

/**
 * Competitive 4v4 — best of 6 rounds (first to 4). Team elimination via hitscan.
 * Match rewards / KP are posted to Next.js via reportMatchResults when the match ends.
 */
export class CompetitiveRoom extends Room<RoomState> {
  /** Base capacity (maxPlayersPerTeam * 2) + 1 reserved staff-only seat —
   * see the `claims.isStaff` guard in onJoin. */
  maxClients = 9;

  private latestInputs = new Map<string, PlayerInput>();
  private simScratch = new Map<string, PlayerSimScratch>();
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  private resultsElapsedMs = 0;
  private worldBounds: WorldBounds = { ...DEFAULT_WORLD_BOUNDS };
  private hostSessionId: string | null = null;
  private customMapLoaded = false;
  private adminSessions = new Set<string>();
  /** Admin OR moderator sessions — eligible for the reserved staff join seat. */
  private staffSessions = new Set<string>();
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

  private teamASpawns: SpawnPoint[] = [];
  private teamBSpawns: SpawnPoint[] = [];
  private betweenRounds = false;
  private betweenRoundMs = 0;
  private matchStarted = false;
  private overtimeApplied = false;
  private pushPayloads: PushPayloadSim[] = [];
  private pushWinPending: 'team_a' | 'team_b' | null = null;
  private platformMotion = new Map<string, PlatformMotionState>();
  private matchElapsedMs = 0;

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
  private maxPlayersPerTeam = 3;
  private friendlyFire = false;
  private respawnInRound = false;
  private combatPhysOpts: MovementPhysicsOpts = {};
  private shopItems: Array<{
    id: string;
    kind?: string;
    damage?: number;
    range?: number;
    cooldownMs?: number;
    coneRadians?: number;
    shopPrice?: number;
    textureUrl?: string;
    modelUrl?: string;
    fireMode?: string;
    pellets?: number;
    adsZoomFov?: number;
    adsConeScale?: number;
    hipfireConeScale?: number;
    magSize?: number;
    reserveAmmo?: number;
    reloadMs?: number;
    enabled?: boolean;
    modes?: string[];
  }> = [];
  private shopPowerUps: Array<{
    id: string;
    shopPrice?: number;
    effect?: string;
    enabled?: boolean;
    modes?: string[];
  }> = [];
  private shopSkins: Array<{
    id: string;
    shopPrice?: number;
    textureUrl?: string;
    enabled?: boolean;
    modes?: string[];
  }> = [];
  private startingCredits = 500;
  private creditsPerKill = 75;
  private customButtons: ButtonZone[] = [];
  private customActions: ActionZone[] = [];
  private customTeleports: TeleportZone[] = [];
  private buttonArmRemaining = new Map<string, number>();
  private lastButtonPressAt = new Map<string, number>();
  private lastTeleportAt = new Map<string, number>();

  onCreate(options: JoinOptions = {}) {
    this.setState(new RoomState());
    // Match state stream to the sim tick (30 Hz) for smooth movement.
    this.setPatchRate(TICK_DT_MS);
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

    this.onMessage('buyWeapon', (client, preset: {
      itemId?: string;
      kind?: string;
      damage?: number;
      range?: number;
      cooldownMs?: number;
      coneRadians?: number;
    }) => {
      if (this.state.phase !== 'countdown') return;
      const buyRemaining = this.matchStarted
        ? this.state.countdownMs - this.roundCountdownMs
        : this.state.countdownMs;
      if (buyRemaining <= 0) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      let combatRaw: Record<string, unknown> = { ...preset };
      let price = 0;
      let weaponId = typeof preset.itemId === 'string' ? preset.itemId : '';
      let modelUrl = '';
      if (this.shopItems.length > 0) {
        const hit = weaponId
          ? this.shopItems.find((it) => it.id === weaponId && it.enabled !== false)
          : undefined;
        if (!hit) return;
        if (
          Array.isArray(hit.modes) &&
          hit.modes.length &&
          !hit.modes.includes('competitive')
        ) {
          return;
        }
        price = Math.max(0, Number(hit.shopPrice) || 0);
        if (price > 0 && player.credits < price) return;
        combatRaw = {
          kind: hit.kind,
          damage: hit.damage,
          range: hit.range,
          cooldownMs: hit.cooldownMs,
          coneRadians: hit.coneRadians,
          fireMode: hit.fireMode,
          pellets: hit.pellets,
          adsZoomFov: hit.adsZoomFov,
          adsConeScale: hit.adsConeScale,
          hipfireConeScale: hit.hipfireConeScale,
          magSize: hit.magSize,
          reserveAmmo: hit.reserveAmmo,
          reloadMs: hit.reloadMs,
        };
        weaponId = hit.id;
        modelUrl = typeof hit.modelUrl === 'string' ? hit.modelUrl : '';
      } else if (typeof (preset as { modelUrl?: string }).modelUrl === 'string') {
        modelUrl = (preset as { modelUrl?: string }).modelUrl || '';
      }

      const sanitized = sanitizeWeaponCombat(combatRaw);
      if (price > 0) player.credits = Math.max(0, player.credits - price);
      applySanitizedWeaponToPlayer(player, sanitized, { weaponId, modelUrl });
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
          // Team A / Team B — the mode this feature matters most for.
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
            mode: 'competitive',
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
          mode: 'competitive',
          detail: payload?.reason,
        });
        if (result.ok) {
          this.clients.getById(targetSessionId)?.leave(4001, 'banned_by_admin');
        } else {
          console.error('[CompetitiveRoom] adminBan failed:', result.error);
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
              this.damagePlayer(target, damage, player);
            }
          }
        }
      }
    });

    this.onMessage('buyPowerUp', (client, data: { powerUpId?: string }) => {
      if (this.state.phase !== 'countdown') return;
      const buyRemaining = this.matchStarted
        ? this.state.countdownMs - this.roundCountdownMs
        : this.state.countdownMs;
      if (buyRemaining <= 0) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const id = typeof data?.powerUpId === 'string' ? data.powerUpId : '';
      const hit = this.shopPowerUps.find((p) => p.id === id && p.enabled !== false);
      if (!hit) return;
      if (
        Array.isArray(hit.modes) &&
        hit.modes.length &&
        !hit.modes.includes('competitive')
      ) {
        return;
      }
      const price = Math.max(0, Number(hit.shopPrice) || 0);
      if (price > 0 && player.credits < price) return;
      if (price > 0) player.credits = Math.max(0, player.credits - price);
      const effect = String(hit.effect || hit.id);
      if (effect === 'heal') {
        player.health = Math.min(getMaxHealth(player), player.health + 50);
      } else if (effect === 'shield') {
        player.shieldHp = Math.min(100, (player.shieldHp || 0) + 50);
      } else if (effect === 'energy' || effect === 'speed' || effect === 'super_jump') {
        player.energy = 100;
        if (effect !== 'energy') {
          player.shieldHp = Math.min(100, (player.shieldHp || 0) + 15);
        }
      }
    });

    this.onMessage('buyWeaponSkin', (client, data: { skinId?: string }) => {
      if (this.state.phase !== 'countdown') return;
      const buyRemaining = this.matchStarted
        ? this.state.countdownMs - this.roundCountdownMs
        : this.state.countdownMs;
      if (buyRemaining <= 0) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const id = typeof data?.skinId === 'string' ? data.skinId : '';
      const hit = this.shopSkins.find((s) => s.id === id && s.enabled !== false);
      if (!hit) return;
      if (
        Array.isArray(hit.modes) &&
        hit.modes.length &&
        !hit.modes.includes('competitive')
      ) {
        return;
      }
      const price = Math.max(0, Number(hit.shopPrice) || 0);
      if (player.weaponSkinId === hit.id) return;
      if (price > 0 && player.credits < price) return;
      if (price > 0) player.credits = Math.max(0, player.credits - price);
      player.weaponSkinId = hit.id;
    });

    this.onMessage('loadCustomMap', (client, data: Record<string, unknown>) => {
      if (this.state.phase !== 'lobby' && this.state.phase !== 'countdown') return;
      const isStaffOrHost =
        this.adminSessions.has(client.sessionId) || client.sessionId === this.hostSessionId;
      if (this.customMapLoaded && !isStaffOrHost) return;

      const platforms = data?.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(platforms) || platforms.length === 0) return;
      this.customMapLoaded = true;

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
        if (
          typeof settings.maxPlayersPerTeam === 'number' &&
          Number.isFinite(settings.maxPlayersPerTeam)
        ) {
          this.maxPlayersPerTeam = Math.max(1, Math.min(8, Math.floor(settings.maxPlayersPerTeam)));
          // +1 reserved staff-only seat — see the claims.isStaff guard in onJoin.
          this.maxClients = this.maxPlayersPerTeam * 2 + 1;
        }
        if (typeof settings.friendlyFire === 'boolean') {
          this.friendlyFire = settings.friendlyFire;
        }
        if (typeof settings.respawnInRound === 'boolean') {
          this.respawnInRound = settings.respawnInRound;
        }
      }

      const shopRaw = data?.shopSettings as {
        items?: unknown[];
        powerUps?: unknown[];
        skins?: unknown[];
        startingCredits?: number;
        creditsPerKill?: number;
      } | undefined;
      if (shopRaw?.items && Array.isArray(shopRaw.items)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.shopItems = shopRaw.items.filter(
          (it) =>
            !!it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string'
        ) as any;
      }
      if (shopRaw?.powerUps && Array.isArray(shopRaw.powerUps)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.shopPowerUps = shopRaw.powerUps.filter(
          (it) =>
            !!it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string'
        ) as any;
      }
      if (shopRaw?.skins && Array.isArray(shopRaw.skins)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.shopSkins = shopRaw.skins.filter(
          (it) =>
            !!it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string'
        ) as any;
      }
      if (typeof shopRaw?.startingCredits === 'number' && Number.isFinite(shopRaw.startingCredits)) {
        this.startingCredits = Math.max(0, shopRaw.startingCredits);
      }
      if (typeof shopRaw?.creditsPerKill === 'number' && Number.isFinite(shopRaw.creditsPerKill)) {
        this.creditsPerKill = Math.max(0, shopRaw.creditsPerKill);
      }
      for (const p of this.state.players.values()) {
        p.credits = this.startingCredits;
      }

      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(platforms));
      this.platformMotion.clear();
      this.matchElapsedMs = 0;

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

      const payloads = data?.pushPayloads as PushPayloadSim[] | undefined;
      this.pushPayloads = Array.isArray(payloads)
        ? payloads.map((p) => ({
            ...p,
            t: typeof p.t === 'number' ? Math.min(1, Math.max(0, p.t)) : 0.5,
            pushStrength: Math.max(0.5, p.pushStrength ?? 3),
            pushRadius: Math.max(0.8, p.pushRadius ?? 1.8),
            winEpsilon: Math.max(0.02, p.winEpsilon ?? 0.08),
          }))
        : [];
      this.pushWinPending = null;

      this.customButtons = Array.isArray(data?.buttons) ? (data.buttons as ButtonZone[]) : [];
      this.customActions = Array.isArray(data?.actions) ? (data.actions as ActionZone[]) : [];
      this.customTeleports = Array.isArray(data?.teleports)
        ? (data.teleports as TeleportZone[])
        : [];
      this.buttonArmRemaining.clear();

      if (data.worldBounds) {
        this.worldBounds = { ...(data.worldBounds as WorldBounds) };
      }

      // Apply combat/physics overrides.
      const cs = data?.combatSettings as Record<string, unknown> | undefined;
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
          slideEnabled: typeof cs.slideEnabled === 'boolean' ? cs.slideEnabled : undefined,
          slideMult: typeof cs.slideMult === 'number' ? cs.slideMult : undefined,
          slideDurationMs: typeof cs.slideDurationMs === 'number' ? cs.slideDurationMs : undefined,
          slideCooldownMs: typeof cs.slideCooldownMs === 'number' ? cs.slideCooldownMs : undefined,
          wallJumpEnabled: typeof cs.wallJumpEnabled === 'boolean' ? cs.wallJumpEnabled : undefined,
          wallJumpHorizVel: typeof cs.wallJumpHorizVel === 'number' ? cs.wallJumpHorizVel : undefined,
          wallJumpVertVel: typeof cs.wallJumpVertVel === 'number' ? cs.wallJumpVertVel : undefined,
          wallSlideGravMult: typeof cs.wallSlideGravMult === 'number' ? cs.wallSlideGravMult : undefined,
        };
      }

      this.assignTeamsAndSpawn();
      console.log(
        `[CompetitiveRoom] map loaded: ${platforms.length} pads, A=${this.teamASpawns.length} B=${this.teamBSpawns.length}, push=${this.pushPayloads.length}`
      );
    });

    void ensurePowerDefinitionsLoaded();

    this.syncActiveMapFromCloud();

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
  }

  /**
   * Re-sync platforms/spawns/settings from the cloud Active map. Called at
   * room creation and again on every results→lobby round reset — a room can
   * live across many rounds, so without the second call a map republished
   * mid-session (taller walls, moved spawns) never reaches players until an
   * admin manually restarts Colyseus.
   */
  private syncActiveMapFromCloud(force = false) {
    void fetchActiveMapPayload('competitive').then((active) => {
      if (!active) return;
      if (this.customMapLoaded && !force) return;
      const pads = active.payload.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(pads) || pads.length === 0) return;
      const data = active.payload;
      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(pads));
      this.platformMotion.clear();
      this.matchElapsedMs = 0;
      while (this.state.obstacles.length > 0) this.state.obstacles.pop();
      const hazards = Array.isArray(data.obstacles)
        ? (data.obstacles as ObstacleBlueprint[])
        : [];
      if (hazards.length) {
        this.state.obstacles.push(...createObstaclesFromBlueprints(hazards));
      }
      const teamA = data.teamASpawns as { x: number; y: number; z: number }[] | undefined;
      const teamB = data.teamBSpawns as { x: number; y: number; z: number }[] | undefined;
      if (Array.isArray(teamA) && teamA.length) this.teamASpawns = teamA.map((s) => ({ ...s }));
      if (Array.isArray(teamB) && teamB.length) this.teamBSpawns = teamB.map((s) => ({ ...s }));
      const payloads = data.pushPayloads as typeof this.pushPayloads | undefined;
      this.pushPayloads = Array.isArray(payloads)
        ? payloads.map((p) => ({
            ...p,
            t: typeof p.t === 'number' ? Math.min(1, Math.max(0, p.t)) : 0.5,
            pushStrength: Math.max(0.5, p.pushStrength ?? 3),
            pushRadius: Math.max(0.8, p.pushRadius ?? 1.8),
            winEpsilon: Math.max(0.02, p.winEpsilon ?? 0.08),
          }))
        : [];
      this.pushWinPending = null;
      this.customButtons = Array.isArray(data.buttons) ? (data.buttons as ButtonZone[]) : [];
      this.customActions = Array.isArray(data.actions) ? (data.actions as ActionZone[]) : [];
      this.customTeleports = Array.isArray(data.teleports)
        ? (data.teleports as TeleportZone[])
        : [];
      this.buttonArmRemaining.clear();
      if (data.worldBounds) {
        this.worldBounds = { ...(data.worldBounds as WorldBounds) };
      }
      const cs = data.combatSettings as Record<string, unknown> | undefined;
      if (cs && typeof cs === 'object') {
        this.combatPhysOpts = {
          gravity: typeof cs.gravity === 'number' ? cs.gravity : undefined,
          jumpVelocity: typeof cs.jumpVelocity === 'number' ? cs.jumpVelocity : undefined,
          doubleJumpVelocity:
            typeof cs.doubleJumpVelocity === 'number' ? cs.doubleJumpVelocity : undefined,
          doubleJumpEnabled:
            typeof cs.doubleJumpEnabled === 'boolean' ? cs.doubleJumpEnabled : undefined,
          jumpCutMult: typeof cs.jumpCutMult === 'number' ? cs.jumpCutMult : undefined,
          coyoteMs: typeof cs.coyoteMs === 'number' ? cs.coyoteMs : undefined,
          jumpBufferMs: typeof cs.jumpBufferMs === 'number' ? cs.jumpBufferMs : undefined,
          walkSpeed: typeof cs.walkSpeed === 'number' ? cs.walkSpeed : undefined,
          sprintMult: typeof cs.sprintMult === 'number' ? cs.sprintMult : undefined,
          crouchMult: typeof cs.crouchMult === 'number' ? cs.crouchMult : undefined,
          maxFallSpeed: typeof cs.maxFallSpeed === 'number' ? cs.maxFallSpeed : undefined,
          apexGravMult: typeof cs.apexGravMult === 'number' ? cs.apexGravMult : undefined,
          slideEnabled: typeof cs.slideEnabled === 'boolean' ? cs.slideEnabled : undefined,
          slideMult: typeof cs.slideMult === 'number' ? cs.slideMult : undefined,
          slideDurationMs: typeof cs.slideDurationMs === 'number' ? cs.slideDurationMs : undefined,
          slideCooldownMs: typeof cs.slideCooldownMs === 'number' ? cs.slideCooldownMs : undefined,
          wallJumpEnabled: typeof cs.wallJumpEnabled === 'boolean' ? cs.wallJumpEnabled : undefined,
          wallJumpHorizVel: typeof cs.wallJumpHorizVel === 'number' ? cs.wallJumpHorizVel : undefined,
          wallJumpVertVel: typeof cs.wallJumpVertVel === 'number' ? cs.wallJumpVertVel : undefined,
          wallSlideGravMult:
            typeof cs.wallSlideGravMult === 'number' ? cs.wallSlideGravMult : undefined,
        };
      }
      this.customMapLoaded = true;
      this.assignTeamsAndSpawn();
      console.log(
        `[CompetitiveRoom] MAIN map loaded from server (${active.name}): ${pads.length} pads`
      );
    });
  }

  onAuth(_client: Client, options: JoinOptions): GameJoinClaims {
    return authenticateJoin(options);
  }

  async onJoin(client: Client, options: JoinOptions) {
    const claims = claimsFromAuth(client.auth, options);
    const ranked = this.state.modeTag === 'competitive_ranked';
    const allowed = !!(
      claims.isPremium ||
      claims.rankedAccess ||
      claims.isAdmin
    );
    if (ranked && !allowed) {
      throw new Error('Premium required for Ranked Competitive');
    }

    // The last seat (maxClients = maxPlayersPerTeam*2 + 1) is reserved for
    // staff — regular players cap out at maxPlayersPerTeam*2 even though
    // maxClients is higher.
    const baseCapacity = this.maxPlayersPerTeam * 2;
    if (!claims.isStaff && this.state.players.size - this.staffSessions.size >= baseCapacity) {
      throw new Error('Room is full');
    }

    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (claims.isAdmin) this.adminSessions.add(client.sessionId);
    if (claims.isStaff) this.staffSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = claims.userId || client.sessionId;
    player.username =
      claims.username || `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = claims.avatarUrl || '';
    player.kp = claims.kp;
    const trusted = await fetchTrustedLoadout(player.userId);
    // Competitive disallows body-replacement cosmetics (body/fullbody slots)
    // so Team A/B colors stay readable — small accessories still allowed.
    applyLoadoutToPlayer(player, trusted ?? options, { allowBodySkins: false });
    applyAbilityStatsToPlayer(player, trusted?.abilityStatBonuses);
    applyAbilityLevelsToPlayer(player, trusted?.abilityLevels ?? null);
    player.health = getMaxHealth(player);
    player.energy = getMaxEnergyFor(player);

    // Balance by current team sizes
    const aCount = Array.from(this.state.players.values()).filter((p) => p.role === 'team_a').length;
    const bCount = Array.from(this.state.players.values()).filter((p) => p.role === 'team_b').length;
    player.role = aCount <= bCount ? 'team_a' : 'team_b';
    player.bodyColorIndex = assignCompetitiveColor(player.role);

    this.applyTeamSpawn(player);
    player.credits = this.startingCredits;
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
    this.staffSessions.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.mutedUntil.delete(client.sessionId);
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
      player.bodyColorIndex = assignCompetitiveColor(player.role);
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
    if (this.state.adminPaused) {
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
        `Surrender vote (${this.surrenderVote.team === 'team_a' ? 'Team A' : 'Team B'}) expired without a majority.`
      );
      this.surrenderVote = null;
    }
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
        this.state.buyPhaseMs = this.matchStarted
          ? Math.max(0, this.state.countdownMs - this.roundCountdownMs)
          : Math.max(0, this.state.countdownMs);
        if (this.state.countdownMs <= 0) {
          if (!this.matchStarted) this.startMatch();
          else this.startRound();
        }
        break;
      case 'playing':
        this.state.buyPhaseMs = 0;
        if (this.betweenRounds) {
          this.betweenRoundMs -= dtMs;
          if (this.betweenRoundMs <= 0) {
            this.betweenRounds = false;
            this.state.phase = 'countdown';
            // Include buy window on every round, matching Map Editor buyTimeSec.
            this.state.countdownMs = this.roundCountdownMs + this.buyTimeMs;
            this.grantBuyPhaseCredits();
          }
          break;
        }
        this.tickPlaying(dtMs);
        break;
      case 'results':
        this.state.buyPhaseMs = 0;
        this.resultsElapsedMs += dtMs;
        if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
          this.matchStarted = false;
          this.state.phase = 'lobby';
          this.state.winnerRole = '';
          this.state.scoreA = 0;
          this.state.scoreB = 0;
          this.state.roundIndex = 0;
          this.state.rewardsReady = false;
          for (const player of this.state.players.values()) {
            player.kills = 0; player.deaths = 0;
            player.killStreak = 0;
            player.score = 0;
            player.distance = 0;
            player.xpEarned = 0;
            player.vpEarned = 0;
            player.kpDelta = 0;
          }
          this.syncActiveMapFromCloud(true);
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
    this.state.matchId = `${this.roomId}-${Date.now()}`;
    this.state.rewardsReady = false;
    this.assignTeamsAndSpawn();
    for (const player of this.state.players.values()) {
      player.kills = 0; player.deaths = 0;
      player.killStreak = 0;
      player.score = 0;
      player.distance = 0;
      player.xpEarned = 0;
      player.vpEarned = 0;
      player.kpDelta = 0;
    }
    this.state.phase = 'countdown';
    this.state.countdownMs = this.roundCountdownMs + this.buyTimeMs;
    this.grantBuyPhaseCredits();
  }

  private grantBuyPhaseCredits() {
    for (const p of this.state.players.values()) {
      p.credits = this.startingCredits;
    }
  }

  private startRound() {
    this.state.roundIndex += 1;
    this.betweenRounds = false;
    this.overtimeApplied = false;
    this.pushWinPending = null;
    this.state.phase = 'playing';
    this.state.matchTimeRemainingMs = this.roundTimeMs;
    this.matchElapsedMs = 0;
    this.platformMotion.clear();
    // Reset payload to mid-rail each round.
    for (const p of this.pushPayloads) {
      p.t = 0.5;
    }

    Array.from(this.state.players.values()).forEach((player) => {
      player.health = getMaxHealth(player);
      player.energy = getMaxEnergyFor(player);
      player.isAlive = true;
      player.hasFinished = false;
      this.applyTeamSpawn(player);
      player.vz = 0;
      this.simScratch.set(player.sessionId, createSimScratch());
    });
  }

  private tickPlaying(dtMs: number) {
    this.state.matchTimeRemainingMs -= dtMs;
    this.matchElapsedMs += dtMs;
    const platformDeltas = tickMovingPlatforms(
      this.state.platforms,
      this.platformMotion,
      this.matchElapsedMs
    );
    this.tickButtonArming(dtMs);
    this.tickPlayers(dtMs, platformDeltas);
    this.tickPushPayloads(dtMs / 1000);

    if (this.pushWinPending) {
      const winner = this.pushWinPending;
      this.pushWinPending = null;
      this.endRound(winner);
      return;
    }

    if (this.state.matchTimeRemainingMs <= 0) {
      if (!this.overtimeApplied && this.state.scoreA === this.state.scoreB && this.overtimeMs > 0) {
        this.overtimeApplied = true;
        this.state.matchTimeRemainingMs = this.overtimeMs;
        return;
      }
      // Prefer payload position when rails exist; otherwise alive-count.
      if (this.pushPayloads.length) {
        const avgT =
          this.pushPayloads.reduce((s, p) => s + p.t, 0) / this.pushPayloads.length;
        if (avgT <= 0.5) this.endRound('team_a');
        else this.endRound('team_b');
        return;
      }
      const aAlive = this.countAlive('team_a');
      const bAlive = this.countAlive('team_b');
      if (aAlive >= bAlive) this.endRound('team_a');
      else this.endRound('team_b');
      return;
    }

    this.checkRoundEnd();
  }

  /**
   * Payload objective: Team A pushes toward t→0 (their end), Team B toward t→1.
   * First team to reach their end wins the round — stops endless hide/draw.
   */
  private tickPushPayloads(dt: number) {
    if (!this.pushPayloads.length) return;
    const players = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    for (const payload of this.pushPayloads) {
      const alongX = Math.sin(payload.yaw);
      const alongY = Math.cos(payload.yaw);
      const half = payload.length * 0.5;
      const blockX = payload.x + alongX * (payload.t - 0.5) * payload.length;
      const blockY = payload.y + alongY * (payload.t - 0.5) * payload.length;
      let force = 0;
      for (const p of players) {
        const dx = p.x - blockX;
        const dy = p.y - blockY;
        const dist = Math.hypot(dx, dy);
        if (dist > payload.pushRadius) continue;
        // Push direction: Team A decreases t, Team B increases t.
        const dir = p.role === 'team_a' ? -1 : p.role === 'team_b' ? 1 : 0;
        if (!dir) continue;
        const falloff = 1 - dist / payload.pushRadius;
        force += dir * payload.pushStrength * falloff;
      }
      if (force !== 0) {
        payload.t = Math.min(1, Math.max(0, payload.t + (force * dt) / Math.max(1, half)));
      }
      if (payload.t <= payload.winEpsilon) {
        this.pushWinPending = 'team_a';
        return;
      }
      if (payload.t >= 1 - payload.winEpsilon) {
        this.pushWinPending = 'team_b';
        return;
      }
    }
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

  /**
   * Admin dashboard control surface — called via matchMaker.getLocalRoomById()
   * from the /admin/live-matches HTTP routes (server/src/index.ts).
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
    this.matchStarted = false;
    // No reportRewards() — admin-cancelled, not a real conclusion. Also
    // means no KP is touched — critical for Ranked, where a bogus loss
    // would otherwise cost players Elo they didn't actually lose.
  }

  public adminBroadcastMessage(text: string): void {
    this.state.adminMessage = text;
    this.state.adminMessageSeq += 1;
  }

  private endRound(winner: 'team_a' | 'team_b') {
    if (this.state.phase === 'results' || this.betweenRounds) return;

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
      this.finishMatch(matchWinner);
      return;
    }

    // Short pause then countdown for next round
    this.betweenRounds = true;
    this.betweenRoundMs = 2000;
  }

  /** Concludes the WHOLE match (not just a round) — shared by endRound's
   * normal score-threshold path and the @surrender vote, which must force
   * an immediate conclusion regardless of current round score. */
  private finishMatch(matchWinner: 'team_a' | 'team_b') {
    this.state.phase = 'results';
    this.state.winnerRole = matchWinner;
    this.resultsElapsedMs = 0;
    this.matchStarted = false;
    void this.reportRewards(matchWinner);
  }

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
      this.systemMessage(`${team === 'team_a' ? 'Team A' : 'Team B'} has no timeouts left.`);
      return;
    }
    this.teamTimeoutsUsed.set(team, used + 1);
    this.state.adminPaused = true;
    this.teamTimeoutResumeAt = Date.now() + TIMEOUT_DURATION_MS;
    const remaining = MAX_TIMEOUTS_PER_TEAM - used - 1;
    this.systemMessage(
      `${player.username} called a timeout (${remaining} left for ${team === 'team_a' ? 'Team A' : 'Team B'}). Match paused for 60s.`
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
      `${player.username} called for a surrender vote (${team === 'team_a' ? 'Team A' : 'Team B'})! Type @yes or @no — needs a majority of ${members.length}.`
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

  private checkSurrenderVote(): void {
    const vote = this.surrenderVote;
    if (!vote) return;
    const memberIds = new Set(this.teamMembers(vote.team).map((m) => m.sessionId));
    const yesCount = Array.from(vote.yes).filter((id) => memberIds.has(id)).length;
    const noCount = Array.from(vote.no).filter((id) => memberIds.has(id)).length;
    const needed = Math.floor(memberIds.size / 2) + 1;

    if (yesCount >= needed) {
      this.surrenderVote = null;
      const opposing: 'team_a' | 'team_b' = vote.team === 'team_a' ? 'team_b' : 'team_a';
      this.systemMessage(
        `Surrender vote passed — ${vote.team === 'team_a' ? 'Team A' : 'Team B'} surrendered.`
      );
      // Real conclusion (unlike admin cancel) — finishMatch's existing
      // reportRewards() still runs, including Ranked KP for the win/loss.
      this.finishMatch(opposing);
      return;
    }
    if (noCount >= needed) {
      this.surrenderVote = null;
      this.systemMessage('Surrender vote failed.');
    }
  }

  private avgEnemyKp(role: string): number {
    const enemyRole = role === 'team_a' ? 'team_b' : 'team_a';
    const enemies = Array.from(this.state.players.values()).filter(
      (p) => p.role === enemyRole
    );
    if (!enemies.length) return KP_DEFAULT;
    const sum = enemies.reduce(
      (acc, p) => acc + (typeof p.kp === 'number' ? p.kp : KP_DEFAULT),
      0
    );
    return sum / enemies.length;
  }

  private async reportRewards(matchWinner: 'team_a' | 'team_b') {
    const matchId = this.state.matchId || `${this.roomId}-${Date.now()}`;
    this.state.matchId = matchId;
    const ranked = this.state.modeTag === 'competitive_ranked';
    const queue = ranked ? 'ranked' : 'casual';
    const mode = ranked ? 'competitive_ranked' : 'competitive';

    const players = Array.from(this.state.players.values()).map((p) => {
      const team = p.role === 'team_b' ? 'team_b' : 'team_a';
      return {
        userId: p.userId,
        role: team,
        isAlive: p.isAlive,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        opponentAvgKp: this.avgEnemyKp(team),
        roundsWon: team === 'team_a' ? this.state.scoreA : this.state.scoreB,
        roundsLost: team === 'team_a' ? this.state.scoreB : this.state.scoreA,
      };
    });

    const awards = await reportMatchResults({
      matchId,
      mode,
      winnerRole: matchWinner,
      queue,
      room: { scoreA: this.state.scoreA, scoreB: this.state.scoreB },
      players,
    });

    if (awards) {
      applyAwardsByUserId(this.state.players.values(), awards.players);
      this.state.rewardsReady = true;
    } else {
      for (const player of this.state.players.values()) {
        const outcome = displayCompetitiveOutcome(matchWinner, player.role);
        const reward = DISPLAY_COMPETITIVE_REWARDS[outcome];
        player.xpEarned = reward.xp;
        player.vpEarned = reward.vp;
        player.kpDelta = 0;
      }
      this.state.rewardsReady = false;
    }
  }

  private roundsToWin() {
    return Math.floor(this.maxRounds / 2) + 1;
  }

  /** Decays button-armed obstacle activations. Mirrors DeathrunRoom.tickObstacles. */
  private tickButtonArming(dtMs: number) {
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
    for (const obstacle of this.state.obstacles) {
      if (obstacle.buttonControlled && this.buttonArmRemaining.has(obstacle.id)) {
        obstacle.active = true;
      }
    }
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

  private tickPlayers(dtMs: number, platformDeltas: PlatformDelta[] = []) {
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

      applyPlatformCarry(player, scratch.supportPlatformId, platformDeltas);
      tickActiveAbilityTimers(player, now);
      applyMovement(player, input, dtSeconds, this.state.platforms, scratch, this.worldBounds, this.combatPhysOpts);
      finishReloadIfDue(player, now);

      if (input.interactPressed) this.tryPressButtons(player, sessionId, now);
      this.tryTriggerActions(player, sessionId, now, input.interactPressed);
      this.tryTeleport(player, sessionId, now);

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
          if (tryConsumeShotAmmo(player, now)) {
            this.lastShotAt.set(sessionId, now);
            this.resolvePvPShot(player, !!input.aimHeld);
          }
        }
      }
    });
  }

  private resolvePvPShot(shooter: PlayerState, aimHeld = false) {
    if (shooter.weaponKind === 'cosmetic') return;
    const range = shooter.weaponRange > 0 ? shooter.weaponRange : 14;
    const damage = weaponPelletDamage(shooter);
    const berserkDamage = Math.max(damage, 999);
    const cone = effectiveWeaponCone(shooter, aimHeld);
    const pellets = weaponPelletCount(shooter);
    const offsets = pelletAimOffsets(pellets, cone);

    const dmgById = new Map<string, { target: PlayerState; dmg: number }>();
    for (const off of offsets) {
      let closest: PlayerState | null = null;
      let closestDistSq = Infinity;
      for (const target of this.state.players.values()) {
        if (!target.isAlive) continue;
        if (target.role === shooter.role && !this.friendlyFire) continue;
        if (target.sessionId === shooter.sessionId) continue;
        if (
          !isTargetHitByPellet(shooter, target, range, cone, off.yaw, off.pitch)
        ) {
          continue;
        }
        const dx = target.x - shooter.x;
        const dy = target.y - shooter.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closest = target;
        }
      }
      if (!closest) continue;
      const shotDamage = isBerserkActive(shooter, Date.now()) ? berserkDamage : damage;
      const prev = dmgById.get(closest.sessionId);
      if (prev) prev.dmg += shotDamage;
      else dmgById.set(closest.sessionId, { target: closest, dmg: shotDamage });
    }

    for (const { target, dmg } of dmgById.values()) {
      this.damagePlayer(target, dmg, shooter);
      this.sendHitFx(shooter.sessionId, dmg, target.x, target.y, (target.z ?? 0) + 1.4, 'player');
    }
  }

  /** Tells the ATTACKER's own client a hit landed (amount + world position)
   * so it can pop a floating damage number — a targeted send, not a
   * broadcast, since only the attacker needs to see their own hit numbers. */
  private sendHitFx(
    attackerSessionId: string | undefined,
    amount: number,
    x: number,
    y: number,
    z: number,
    kind: 'player' | 'monster' = 'player'
  ): void {
    if (!attackerSessionId || amount <= 0) return;
    this.clients.getById(attackerSessionId)?.send('hitFx', { x, y, z, amount: Math.round(amount), kind });
  }

  private damagePlayer(player: PlayerState, amount: number, shooter?: PlayerState) {
    if (isBerserkActive(player, Date.now())) {
      return;
    }
    const wasAlive = player.isAlive && player.health > 0;
    let dmg = amount;
    if (player.shieldHp > 0) {
      const absorbed = Math.min(player.shieldHp, dmg);
      player.shieldHp -= absorbed;
      dmg -= absorbed;
    }
    if (dmg > 0) player.health = Math.max(0, player.health - dmg);
    if (player.health <= 0) {
      if (wasAlive) {
        player.deaths = (player.deaths || 0) + 1;
        player.killStreak = 0;
      }
      if (this.respawnInRound) {
        // Respawn: send back to spawn point at full health after a brief moment.
        player.health = getMaxHealth(player);
        this.applyTeamSpawn(player);
        if (wasAlive && shooter && shooter.sessionId !== player.sessionId) {
          shooter.kills += 1;
          shooter.killStreak += 1;
          shooter.score = shooter.kills;
          shooter.credits = (shooter.credits || 0) + this.creditsPerKill;
        }
      } else {
        player.isAlive = false;
        if (wasAlive && shooter && shooter.sessionId !== player.sessionId) {
          shooter.kills += 1;
          shooter.killStreak += 1;
          shooter.score = shooter.kills;
          shooter.credits = (shooter.credits || 0) + this.creditsPerKill;
        }
      }
    }
  }
}
