import { Client, Room } from 'colyseus';
import { ObstacleState, PlayerState, PlatformState, RoomState } from '../schema/RoomState.js';
import type { CustomMoveDef } from '../../../shared/custom-moves.js';
import { PadSpatialIndex } from '../../../shared/platform-spatial.js';
import {
  createFromBlueprints,
  createObstaclesFromBlueprints,
  type ObstacleBlueprint,
  type PlatformBlueprint,
} from '../sim/platforms.js';
import {
  HORDE_MIN_PLAYERS_TO_START,
  LOBBY_COUNTDOWN_MS,
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
  sanitizeInput,
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
import { nextHordeColor } from '../lib/body-colors.js';
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
import { fetchActiveMapPayload } from '../active-map.js';
import { RoomPluginRuntime } from '../plugin-runtime.js';
import { mergeShopPool } from '../plugin-catalog.js';
import { pluginRoomModeTag, publishedMapModeKey } from '../../../shared/plugin-source.js';
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
  steamId?: string;
  username?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  /** Admin OR moderator — eligible for the reserved staff join seat. */
  isStaff?: boolean;
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
  /** Stop healing above this percent of max HP; 0 or 100 = heal to full. */
  maxHealPercent?: number;
  damagePerTick?: number;
  /** Authored red-zone "instant kill" toggle, sent as 1/0. */
  instantKill?: number;
  reviveTimeMs?: number;
  /** Max players this pad may revive in one tick. */
  capacity?: number;
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
/** @timeout / @surrender player commands. */
const MAX_SQUAD_TIMEOUTS = 3;
const TIMEOUT_DURATION_MS = 60_000;
const SURRENDER_VOTE_DURATION_MS = 30_000;
/** Matches CompetitiveRoom's grace window — a WiFi blip mid-wave used to
 *  permanently eject the player instead of holding their seat, and if they
 *  were the last one alive, ended the match instantly with no chance to
 *  reconnect. */
const RECONNECT_WINDOW_SEC = 120;

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
  /** Base capacity (default 4) + 1 reserved staff-only seat — see the
   * `claims.isStaff` guard in onJoin. */
  maxClients = 5;
  private baseCapacity = 4;
  protected minPlayersToStart = HORDE_MIN_PLAYERS_TO_START;
  private padIndex = new PadSpatialIndex<PlatformState>();

  private latestInputs = new Map<string, PlayerInput>();
  private simScratch = new Map<string, PlayerSimScratch>();
  private lastObstacleHitAt = new Map<string, number>();
  private lastShotAt = new Map<string, number>();
  /** Edge-detects shootPressed for semi/bolt fire modes — see the fire loop
   *  below. Without this, holding the trigger fired a "semi-auto"/
   *  "bolt-action" weapon as fast as the cooldown allowed. */
  private wasShootHeld = new Map<string, boolean>();
  private lastHealAt = new Map<string, number>();
  private resultsElapsedMs = 0;
  private worldBounds: WorldBounds = { ...DEFAULT_WORLD_BOUNDS };
  private hostSessionId: string | null = null;
  private customMapLoaded = false;
  /** Practice rooms set false — never load/replace with published MAIN. */
  protected usePublishedActiveMap = true;
  private mapPlugins = new RoomPluginRuntime();
  private adminSessions = new Set<string>();
  /** Admin OR moderator sessions — eligible for the reserved staff join seat. */
  private staffSessions = new Set<string>();
  private lastChatAt = new Map<string, number>();
  /** sessionId → mute expiry ms (Date.now()-based). */
  private mutedUntil = new Map<string, number>();
  /** sessionId → Steam64 ID. Deliberately NOT a schema field — PlayerState
   * syncs to every client in the room, and Steam IDs are admin-only info
   * (see adminGetPlayerSteamId, used by the website's Live Matches panel). */
  private steamIdBySession = new Map<string, string>();
  /** Player-facing @timeout / @surrender. Horde is co-op (everyone is
   * role='survivor'), so there's a single squad-wide counter/vote, not a
   * per-team one like Deathrun/Competitive. */
  private squadTimeoutsUsed = 0;
  private squadTimeoutResumeAt: number | null = null;
  private surrenderVote: { yes: Set<string>; no: Set<string>; startedAt: number } | null = null;

  private playerSpawns: SpawnPoint[] = [];
  private monsterSpawnPoints: MonsterSpawnBlueprint[] = [];
  private waveAnchors: { waveNumber: number; difficultyMultiplier: number }[] = [];
  private healthFloors: PadZone[] = [];
  private redZones: PadZone[] = [];
  private revivePads: PadZone[] = [];
  private staticHazards: ObstacleBlueprint[] = [];
  private customButtons: ButtonZone[] = [];
  private customActions: ActionZone[] = [];
  private customTeleports: TeleportZone[] = [];
  private buttonArmRemaining = new Map<string, number>();
  private lastButtonPressAt = new Map<string, number>();
  private lastTeleportAt = new Map<string, number>();

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
  private combatPhysOpts: MovementPhysicsOpts = {};
  private platformMotion = new Map<string, PlatformMotionState>();
  private matchElapsedMs = 0;
  /** Authoritative shop pool from map shopSettings (empty = legacy freeform buy). */
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
  private creditsPerKill = 50;
  private creditsPerWaveClear = 100;

  onCreate() {
    this.setState(new RoomState());
    // Match state stream to the sim tick (30 Hz) for smooth movement.
    this.setPatchRate(TICK_DT_MS);
    this.state.modeTag = pluginRoomModeTag(this.roomName, 'horde');
    // Small default arena until MAIN map loads
    this.state.platforms.push(
      ...createFromBlueprints([
        { x: 0, y: 0, z: 0, width: 14, depth: 14, kind: 'solid', height: 0.25, topOnly: true },
      ])
    );
    this.padIndex.rebuild(this.state.platforms);
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

    this.onMessage('input', (client, input: unknown) => {
      if (!this.state.players.get(client.sessionId)) return;
      this.latestInputs.set(client.sessionId, {
        ...defaultInput(),
        ...this.latestInputs.get(client.sessionId),
        ...sanitizeInput(input),
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
      itemId?: string;
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

      let combatRaw: Record<string, unknown> = { ...preset };
      let price = 0;
      let weaponId = typeof preset.itemId === 'string' ? preset.itemId : '';
      let modelUrl = '';
      if (this.shopItems.length > 0) {
        const hit = weaponId
          ? this.shopItems.find((it) => it.id === weaponId && it.enabled !== false)
          : undefined;
        if (!hit) return;
        if (Array.isArray(hit.modes) && hit.modes.length && !hit.modes.includes('horde')) return;
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

        // Horde is co-op — everyone is on the same side, so "team" scope is
        // functionally identical to "all" here. Still honor the field the
        // client sent for a consistent message shape across modes.
        const scope: 'all' | 'team' = payload?.scope === 'team' ? 'team' : 'all';
        this.broadcast('chat', {
          sessionId: client.sessionId,
          username: player.username,
          text,
          scope,
          at: now,
        });

        const mention = detectStaffMention(text);
        if (mention) {
          void reportChatFlag({
            mode: 'horde',
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
      this.adminKickPlayer(targetSessionId);
    });

    this.onMessage(
      'adminMute',
      (client, payload: { targetSessionId?: string; minutes?: number } | undefined) => {
        if (!this.adminSessions.has(client.sessionId)) return;
        const targetSessionId = payload?.targetSessionId;
        if (!targetSessionId || targetSessionId === client.sessionId) return;
        this.adminMutePlayer(targetSessionId, payload?.minutes ?? 5);
      }
    );

    this.onMessage(
      'adminBan',
      async (client, payload: { targetSessionId?: string; reason?: string } | undefined) => {
        if (!this.adminSessions.has(client.sessionId)) return;
        const admin = this.state.players.get(client.sessionId);
        const targetSessionId = payload?.targetSessionId;
        if (!admin || !targetSessionId || targetSessionId === client.sessionId) return;
        const result = await this.adminBanPlayer(
          targetSessionId,
          { userId: admin.userId, username: admin.username },
          payload?.reason
        );
        if (!result.ok) {
          console.error('[HordeRoom] adminBan failed:', result.error);
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
        // Generic burst "radius_damage" dispatch — works for the original
        // Thunder Bolt power AND any custom power reusing this template.
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

    this.onMessage('buyPowerUp', (client, data: { powerUpId?: string }) => {
      const canBuy =
        this.state.phase === 'countdown' ||
        (this.state.phase === 'playing' && this.betweenWavesMs > 0 && this.waveBuyTimeMs > 0 &&
          this.betweenWavesMs <= this.waveBuyTimeMs);
      if (!canBuy) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const id = typeof data?.powerUpId === 'string' ? data.powerUpId : '';
      const hit = this.shopPowerUps.find((p) => p.id === id && p.enabled !== false);
      if (!hit) return;
      if (Array.isArray(hit.modes) && hit.modes.length && !hit.modes.includes('horde')) return;
      const price = Math.max(0, Number(hit.shopPrice) || 0);
      if (price > 0 && player.credits < price) return;
      if (price > 0) player.credits = Math.max(0, player.credits - price);
      const effect = String(hit.effect || hit.id);
      if (effect === 'heal') {
        player.health = Math.min(getMaxHealth(player), player.health + 50);
      } else if (effect === 'shield') {
        player.shieldHp = Math.min(100, (player.shieldHp || 0) + 50);
      } else if (effect === 'energy') {
        player.energy = getMaxEnergyFor(player);
      } else if (effect === 'speed' || effect === 'super_jump') {
        player.energy = getMaxEnergyFor(player);
        player.shieldHp = Math.min(100, (player.shieldHp || 0) + 15);
      }
    });

    this.onMessage('buyWeaponSkin', (client, data: { skinId?: string }) => {
      const canBuy =
        this.state.phase === 'countdown' ||
        (this.state.phase === 'playing' && this.betweenWavesMs > 0 && this.waveBuyTimeMs > 0 &&
          this.betweenWavesMs <= this.waveBuyTimeMs);
      if (!canBuy) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const id = typeof data?.skinId === 'string' ? data.skinId : '';
      const hit = this.shopSkins.find((s) => s.id === id && s.enabled !== false);
      if (!hit) return;
      if (Array.isArray(hit.modes) && hit.modes.length && !hit.modes.includes('horde')) return;
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
          this.baseCapacity = Math.max(1, Math.min(4, Math.floor(settings.maxPlayers)));
          // +1 reserved staff-only seat — see the claims.isStaff guard in onJoin.
          this.maxClients = this.baseCapacity + 1;
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

      const shopRaw = data?.shopSettings as {
        items?: unknown[];
        powerUps?: unknown[];
        skins?: unknown[];
        startingCredits?: number;
        creditsPerKill?: number;
        creditsPerWaveClear?: number;
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
      if (
        typeof shopRaw?.creditsPerWaveClear === 'number' &&
        Number.isFinite(shopRaw.creditsPerWaveClear)
      ) {
        this.creditsPerWaveClear = Math.max(0, shopRaw.creditsPerWaveClear);
      }
      for (const p of this.state.players.values()) {
        p.credits = this.startingCredits;
      }

      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(platforms));
      this.padIndex.rebuild(this.state.platforms);
      this.platformMotion.clear();
      this.matchElapsedMs = 0;

      this.staticHazards = Array.isArray(data?.obstacles)
        ? (data.obstacles as ObstacleBlueprint[])
        : [];
      this.rebuildStaticObstacles();

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
          customMoves: Array.isArray(data?.customMoves)
            ? (data.customMoves as unknown as CustomMoveDef[])
            : undefined,
        };
      }

      if (Array.isArray(data?.playerSpawns) && (data.playerSpawns as SpawnPoint[]).length) {
        this.playerSpawns = (data.playerSpawns as SpawnPoint[]).map((s) => ({ ...s }));
      } else if (data?.spawn) {
        this.playerSpawns = [{ ...(data.spawn as SpawnPoint) }];
      }

      this.monsterSpawnPoints = Array.isArray(data?.monsterSpawns)
        ? (data.monsterSpawns as MonsterSpawnBlueprint[]).map((m) => ({ ...m }))
        : this.monsterSpawnPoints;
      this.waveAnchors = Array.isArray(data?.waveAnchors)
        ? (data.waveAnchors as { waveNumber: number; difficultyMultiplier: number }[]).map((w) => ({
            ...w,
          }))
        : [];

      this.healthFloors = Array.isArray(data?.healthFloors)
        ? (data.healthFloors as PadZone[])
        : [];
      this.redZones = Array.isArray(data?.redZones) ? (data.redZones as PadZone[]) : [];
      this.revivePads = Array.isArray(data?.revivePads) ? (data.revivePads as PadZone[]) : [];
      this.customButtons = Array.isArray(data?.buttons) ? (data.buttons as ButtonZone[]) : [];
      this.customActions = Array.isArray(data?.actions) ? (data.actions as ActionZone[]) : [];
      this.customTeleports = Array.isArray(data?.teleports)
        ? (data.teleports as TeleportZone[])
        : [];
      this.buttonArmRemaining.clear();

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
      this.mapPlugins.load(data);
      this.shopItems = mergeShopPool(
        this.shopItems,
        this.mapPlugins.shopPool() as any
      );
    });

    void ensurePowerDefinitionsLoaded();

    this.syncActiveMapFromCloud();

    // Defense-in-depth alongside sanitizeInput above: no code path in the sim
    // should be able to throw here anymore, but there's no process-level
    // uncaughtException handler either — an uncaught throw in this callback
    // would otherwise crash the whole Node process, killing every room/match
    // on this server instance, not just this one. Skip the tick instead.
    this.setSimulationInterval(() => {
      try {
        this.update(TICK_DT_MS);
      } catch (err) {
        console.error('[HordeRoom] tick error — skipping frame', err);
      }
    }, TICK_DT_MS);
  }

  /**
   * Re-sync platforms/spawns/settings from the cloud Active map. Called at
   * room creation and again on every results→lobby round reset — a room can
   * live across many rounds, so without the second call a map republished
   * mid-session (taller walls, moved spawns) never reaches players until an
   * admin manually restarts Colyseus.
   */
  private syncActiveMapFromCloud(force = false) {
    if (!this.usePublishedActiveMap) return;
    void fetchActiveMapPayload(publishedMapModeKey(this.roomName)).then((active) => {
      if (!active) return;
      if (this.customMapLoaded && !force) return;
      const pads = active.payload.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(pads) || pads.length === 0) return;
      const data = active.payload;
      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(pads));
      this.padIndex.rebuild(this.state.platforms);
      this.platformMotion.clear();
      this.matchElapsedMs = 0;
      this.staticHazards = Array.isArray(data.obstacles)
        ? (data.obstacles as ObstacleBlueprint[])
        : [];
      this.rebuildStaticObstacles();
      if (Array.isArray(data.playerSpawns) && (data.playerSpawns as unknown[]).length) {
        this.playerSpawns = (data.playerSpawns as { x: number; y: number; z: number }[]).map(
          (s) => ({ ...s })
        );
      }
      if (Array.isArray(data.monsterSpawns)) {
        this.monsterSpawnPoints = data.monsterSpawns as MonsterSpawnBlueprint[];
      }
      this.waveAnchors = Array.isArray(data.waveAnchors)
        ? (data.waveAnchors as { waveNumber: number; difficultyMultiplier: number }[])
        : [];
      this.healthFloors = Array.isArray(data.healthFloors)
        ? (data.healthFloors as PadZone[])
        : [];
      this.redZones = Array.isArray(data.redZones) ? (data.redZones as PadZone[]) : [];
      this.revivePads = Array.isArray(data.revivePads)
        ? (data.revivePads as PadZone[])
        : [];
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
          customMoves: Array.isArray(data?.customMoves)
            ? (data.customMoves as unknown as CustomMoveDef[])
            : undefined,
        };
      }
      this.customMapLoaded = true;
      Array.from(this.state.players.values()).forEach((player, index) => {
        this.applySpawnPosition(player, index);
        player.vz = 0;
      });
      console.log(`[HordeRoom] MAIN map loaded from server (${active.name}): ${pads.length} pads`);
      const shopRaw = data.shopSettings as { items?: unknown[] } | undefined;
      if (shopRaw?.items && Array.isArray(shopRaw.items)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.shopItems = shopRaw.items.filter(
          (it) =>
            !!it && typeof it === 'object' && typeof (it as { id?: unknown }).id === 'string'
        ) as any;
      }
      this.mapPlugins.load(data as Record<string, unknown>);
      this.shopItems = mergeShopPool(
        this.shopItems,
        this.mapPlugins.shopPool() as any
      );
    });
  }

  onAuth(_client: Client, options: JoinOptions): GameJoinClaims {
    return authenticateJoin(options);
  }

  async onJoin(client: Client, options: JoinOptions) {
    const claims = claimsFromAuth(client.auth, options);

    // The last seat (maxClients = baseCapacity + 1) is reserved for staff —
    // regular players cap out at baseCapacity even though maxClients is higher.
    if (!claims.isStaff && this.state.players.size - this.staffSessions.size >= this.baseCapacity) {
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
    this.steamIdBySession.set(client.sessionId, claims.steamId || '');
    player.role = 'survivor';
    player.kp = claims.kp;
    const trusted = await fetchTrustedLoadout(player.userId);
    applyLoadoutToPlayer(player, trusted ?? options);
    applyAbilityStatsToPlayer(player, trusted?.abilityStatBonuses);
    applyAbilityLevelsToPlayer(player, trusted?.abilityLevels ?? null);
    player.health = getMaxHealth(player);
    player.energy = getMaxEnergyFor(player);
    this.applySpawnPosition(player, this.state.players.size);
    const usedColors = Array.from(this.state.players.values()).map((p) => p.bodyColorIndex);
    player.bodyColorIndex = nextHordeColor(usedColors);
    player.credits = this.startingCredits;

    this.state.players.set(client.sessionId, player);
    this.latestInputs.set(client.sessionId, defaultInput());
    this.simScratch.set(client.sessionId, createSimScratch());
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    // Unexpected drop (crash, network blip, tab kill) mid-wave — hold the
    // seat open so the player can rejoin, same grace window CompetitiveRoom
    // already has. Without this, HordeRoom permanently ejected on ANY
    // disconnect, and if the disconnecting player was the last one alive it
    // ended the match instantly — a WiFi blip could turn into an
    // unrecoverable loss with zero chance to reconnect.
    if (!consented && player && this.state.phase === 'playing') {
      try {
        await this.allowReconnection(client, RECONNECT_WINDOW_SEC);
        console.log(`[HordeRoom] ${player.username} reconnected`);
        return;
      } catch {
        // Window expired without a reconnect — fall through to full cleanup.
      }
    }

    this.state.players.delete(client.sessionId);
    this.latestInputs.delete(client.sessionId);
    this.simScratch.delete(client.sessionId);
    // lastObstacleHitAt is keyed `${sessionId}:${obstacleId}` (see the hit
    // check below), not bare sessionId — deleting by bare sessionId here was
    // dead code, a key that never existed. Every obstacle a player ever
    // touched leaked a permanent entry for the room instance's lifetime.
    const obstacleHitPrefix = `${client.sessionId}:`;
    for (const key of this.lastObstacleHitAt.keys()) {
      if (key.startsWith(obstacleHitPrefix)) this.lastObstacleHitAt.delete(key);
    }
    this.lastShotAt.delete(client.sessionId);
    this.wasShootHeld.delete(client.sessionId);
    this.adminSessions.delete(client.sessionId);
    this.staffSessions.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.mutedUntil.delete(client.sessionId);
    this.steamIdBySession.delete(client.sessionId);
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
      o.instantKill = !!zone.instantKill;
      o.damage = o.instantKill ? 9999 : zone.damagePerTick ?? 15;
      o.intervalMs = zone.intervalMs ?? 500;
      o.activeMs = 999999;
      o.alwaysActive = true;
      o.active = true;
      this.state.obstacles.push(o);
    }
  }

  private update(dtMs: number) {
    if (this.state.adminPaused) {
      if (this.squadTimeoutResumeAt !== null && Date.now() >= this.squadTimeoutResumeAt) {
        this.state.adminPaused = false;
        this.squadTimeoutResumeAt = null;
        this.systemMessage('Timeout over — match resumed.');
      } else {
        return;
      }
    }
    if (
      this.surrenderVote &&
      Date.now() - this.surrenderVote.startedAt > SURRENDER_VOTE_DURATION_MS
    ) {
      this.systemMessage('Surrender vote expired without a majority.');
      this.surrenderVote = null;
    }
    switch (this.state.phase) {
      case 'lobby':
        if (this.state.players.size >= this.minPlayersToStart) {
          this.state.phase = 'countdown';
          this.state.countdownMs = this.lobbyCountdownMs;
        }
        break;
      case 'countdown':
        this.state.countdownMs -= dtMs;
        this.state.buyPhaseMs = Math.max(0, this.state.countdownMs);
        if (this.state.countdownMs <= 0) this.startMatch();
        break;
      case 'playing':
        this.tickPlaying(dtMs);
        break;
      case 'results':
        this.state.buyPhaseMs = 0;
        this.resultsElapsedMs += dtMs;
        if (this.resultsElapsedMs >= RESULTS_DISPLAY_MS) {
          this.state.phase = 'lobby';
          this.state.winnerRole = '';
          this.state.wave = 0;
          this.state.monstersAlive = 0;
          this.state.rewardsReady = false;
          this.clearMonsters();
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
    this.matchKills = 0;
    this.state.teamKills = 0;
    this.state.wave = 0;
    this.state.winnerRole = '';
    this.state.matchId = `${this.roomId}-${Date.now()}`;
    this.state.rewardsReady = false;
    this.clearMonsters();

    Array.from(this.state.players.values()).forEach((player, i) => {
      player.role = 'survivor';
      player.health = getMaxHealth(player);
      player.energy = getMaxEnergyFor(player);
      player.isAlive = true;
      player.hasFinished = false;
      player.kills = 0; player.deaths = 0;
      player.killStreak = 0;
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
    this.matchElapsedMs = 0;
    this.platformMotion.clear();
    // Never reset before — this room cycles results -> lobby -> new match
    // without disposing, so the squad's 3-timeout budget (and any leftover
    // surrender vote) silently persisted and depleted across consecutive
    // matches hosted by the same room instance instead of resetting per-match.
    this.squadTimeoutsUsed = 0;
    this.surrenderVote = null;
    this.beginWave(this.startingWave);
  }

  /** Wave Anchor override for this wave number, on top of the mode-wide difficultyScale. */
  private waveDifficultyMult(wave: number): number {
    const anchor = this.waveAnchors.find((w) => w.waveNumber === wave);
    return anchor ? anchor.difficultyMultiplier : 1;
  }

  private beginWave(wave: number) {
    this.state.wave = wave;
    this.betweenWavesMs = 0;
    this.state.buyPhaseMs = 0;
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
          player.health = getMaxHealth(player);
          player.isAlive = true;
          this.applySpawnPosition(player, index);
        }
      });
    }

    const now = Date.now();
    const waveMult = this.waveDifficultyMult(wave);
    for (const point of points.length ? points : this.monsterSpawnPoints) {
      const base = point.countPerWave ?? 2;
      const scale = (1 + (wave - 1) * 0.35 * this.difficultyScale) * waveMult;
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
    const waveMult = this.waveDifficultyMult(this.state.wave);
    const waveScaling = (1 + (this.state.wave - 1) * 0.12 * this.difficultyScale) * waveMult;
    const stats = {
      hp: (point.hp && point.hp > 0 ? point.hp : base.hp * levelScale) * waveScaling,
      speed:
        point.speed && point.speed > 0
          ? point.speed
          : base.speed * (1 + (this.state.wave - 1) * 0.04 * this.difficultyScale) * waveMult,
      damage:
        point.damage && point.damage > 0
          ? point.damage
          : Math.round(
              base.damage *
                levelScale *
                (1 + (this.state.wave - 1) * 0.08 * this.difficultyScale) *
                waveMult
            ),
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
    obs.modelUrl = point.modelUrl ?? '';
    obs.modelId = point.modelId ?? '';
    obs.displayName = point.displayName ?? '';
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
    this.matchElapsedMs += dtMs;
    if (this.state.matchTimeRemainingMs <= 0) {
      this.endMatch('survivor');
      return;
    }

    this.state.motionElapsedMs = this.matchElapsedMs;
    const platformDeltas = tickMovingPlatforms(
      this.state.platforms,
      this.platformMotion,
      this.matchElapsedMs
    );
    this.padIndex.rebuild(this.state.platforms);
    this.tickSpawnQueue();
    this.tickMonsters(dtMs / 1000);
    this.tickButtonArming(dtMs);
    this.tickPlayers(dtMs, platformDeltas);
    this.tickPads();

    const alivePlayers = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    if (alivePlayers.length === 0) {
      this.endMatch('horde');
      return;
    }

    // A timed wave (waveTimeSec) used to jump straight to beginWave() the
    // instant its clock ran out, completely bypassing the "wave clear" block
    // below — the only place creditsPerWaveClear is granted and the
    // between-wave buy window opens. Any map using waveTimeSec had a
    // permanently dead economy: no wave-clear credits, no buy phase, ever.
    // Clearing monsters/queue here (mirroring what beginWave() itself does)
    // and falling into the shared block below fixes that while keeping the
    // "time's up, move on regardless of what's left alive" behavior.
    let waveClearedByTimer = false;
    if (this.waveTimeMs > 0) {
      this.waveElapsedMs += dtMs;
      if (this.waveElapsedMs >= this.waveTimeMs) {
        if (this.state.wave >= this.maxWaves) {
          this.endMatch('survivor');
          return;
        }
        waveClearedByTimer = true;
        this.clearMonsters();
        this.waveSpawnQueue = [];
      }
    }

    // Wave clear: queue empty and no monsters left (or the wave timer expired).
    if (
      waveClearedByTimer ||
      (this.waveSpawnQueue.every((q) => q.remaining <= 0) && this.monsters.length === 0)
    ) {
      if (this.state.wave >= this.maxWaves) {
        this.endMatch('survivor');
        return;
      }
      if (this.betweenWavesMs <= 0 && this.creditsPerWaveClear > 0) {
        for (const p of this.state.players.values()) {
          if (p.isAlive) p.credits = (p.credits || 0) + this.creditsPerWaveClear;
        }
      }
      this.betweenWavesMs += dtMs;
      // Buy window = first waveBuyTimeMs of intermission
      if (this.waveBuyTimeMs > 0 && this.betweenWavesMs <= this.waveBuyTimeMs) {
        this.state.buyPhaseMs = Math.max(0, this.waveBuyTimeMs - this.betweenWavesMs);
      } else {
        this.state.buyPhaseMs = 0;
      }
      if (this.betweenWavesMs >= this.waveClearPauseMs) {
        this.beginWave(this.state.wave + 1);
      }
    }
  }

  /** Decays button-armed obstacle activations. Mirrors DeathrunRoom.tickObstacles. */
  private tickButtonArming(dtMs: number) {
    for (const [id, remaining] of Array.from(this.buttonArmRemaining.entries())) {
      const next = remaining - dtMs;
      if (next <= 0) {
        this.buttonArmRemaining.delete(id);
        const obs = this.state.obstacles.find((o) => o.id === id);
        if (obs?.buttonControlled) obs.active = false;
        const door = this.state.platforms.find((p) => p.entityId === id && p.doorControlled);
        if (door) door.open = false;
      } else {
        this.buttonArmRemaining.set(id, next);
      }
    }
    for (const obstacle of this.state.obstacles) {
      if (obstacle.buttonControlled && this.buttonArmRemaining.has(obstacle.id)) {
        obstacle.active = true;
      }
    }
    for (const platform of this.state.platforms) {
      if (platform.doorControlled) {
        platform.open = this.buttonArmRemaining.has(platform.entityId);
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
      if (obs) {
        obs.active = true;
        const hold = zone.holdMs > 0 ? zone.holdMs : obs.activeMs || 1500;
        this.buttonArmRemaining.set(oid, hold);
        continue;
      }
      const door = this.state.platforms.find((p) => p.entityId === oid && p.doorControlled);
      if (door) {
        door.open = true;
        const hold = zone.holdMs > 0 ? zone.holdMs : 1500;
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

  private tickPlayers(dtMs: number, platformDeltas: PlatformDelta[] = []) {
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

      applyPlatformCarry(player, scratch.supportPlatformId, platformDeltas);
      tickActiveAbilityTimers(player, now);
      applyMovement(player, input, dtSeconds, this.padIndex.nearby(player.x, player.y), scratch, this.worldBounds, this.combatPhysOpts);
      if (scratch.fallDamageThisTick > 0) this.damagePlayer(player, scratch.fallDamageThisTick);
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
        const amount = obstacle.instantKill
          ? Math.max(player.health, 9999)
          : obstacle.damage > 0
            ? obstacle.damage
            : OBSTACLE_DAMAGE;
        this.damagePlayer(player, amount);
      }

      this.mapPlugins.tickPlayer(player, dtSeconds, now, (n) => this.damagePlayer(player, n));

      if (player.z < VOID_Z) {
        this.damagePlayer(player, 100);
      }

      const shootHeldNow = !!input.shootPressed;
      const wasShootHeld = this.wasShootHeld.get(sessionId) ?? false;
      this.wasShootHeld.set(sessionId, shootHeldNow);
      const canFire = shootHeldNow && (player.weaponFireMode === 'auto' || !wasShootHeld);
      if (canFire && player.weaponKind !== 'cosmetic') {
        const lastShot = this.lastShotAt.get(sessionId) ?? 0;
        const cooldown = player.weaponCooldownMs > 0 ? player.weaponCooldownMs : 350;
        if (now - lastShot >= cooldown) {
          if (!tryConsumeShotAmmo(player, now)) {
            // Empty / reloading — no shot.
          } else {
            this.lastShotAt.set(sessionId, now);
            this.resolveSurvivorShot(player, sessionId, !!input.aimHeld);
          }
        }
      }
    });
  }

  private tickPads() {
    const now = Date.now();
    // Authored "Max simultaneous revives" per pad — a pad with capacity 1 no
    // longer revives a whole downed squad standing on it in the same tick.
    const revivesUsed = new Map<string, number>();
    for (const player of this.state.players.values()) {
      if (!player.isAlive) {
        // Revive pad: standing teammate not required for MVP — auto revive if body on pad
        for (const pad of this.revivePads) {
          if (!this.isOnPad(player, pad)) continue;
          const capacity = Math.max(1, Math.round(pad.capacity ?? 1));
          const used = revivesUsed.get(pad.id) ?? 0;
          if (used >= capacity) continue;
          revivesUsed.set(pad.id, used + 1);
          player.health = Math.min(getMaxHealth(player), 60);
          player.isAlive = true;
          player.z = pad.z + 0.1;
          break;
        }
        continue;
      }
      for (const floor of this.healthFloors) {
        if (!this.isOnPad(player, floor)) continue;
        const key = `${player.sessionId}:${floor.id}`;
        const last = this.lastHealAt.get(key) ?? 0;
        const interval = floor.intervalMs ?? 500;
        if (now - last < interval) continue;
        const maxHealth = getMaxHealth(player);
        // Authored heal cap (percent of max HP). 0 means "no cap" per
        // EntityHealthFloor, and so does 100 — both heal to full.
        const percent = floor.maxHealPercent ?? 100;
        const ceiling =
          percent > 0 && percent < 100
            ? Math.min(maxHealth, Math.round((maxHealth * percent) / 100))
            : maxHealth;
        if (player.health >= ceiling) continue;
        this.lastHealAt.set(key, now);
        player.health = Math.min(ceiling, player.health + (floor.healPerTick ?? 8));
      }
    }
  }

  private isOnPad(player: PlayerState, pad: PadZone): boolean {
    const halfW = pad.width / 2 + PLAYER_RADIUS;
    const halfD = pad.depth / 2 + PLAYER_RADIUS;
    if (Math.abs(player.x - pad.x) > halfW || Math.abs(player.y - pad.y) > halfD) return false;
    return player.z >= pad.z - 0.5 && player.z <= pad.z + Math.max(pad.height, 1.2);
  }

  private resolveSurvivorShot(
    shooter: PlayerState,
    shooterSessionId: string,
    aimHeld = false
  ) {
    if (shooter.weaponKind === 'cosmetic') return;
    const range = shooter.weaponRange > 0 ? shooter.weaponRange : 14;
    const damage = weaponPelletDamage(shooter);
    const berserkDamage = Math.max(damage, 999);
    const cone = effectiveWeaponCone(shooter, aimHeld);
    const pellets = weaponPelletCount(shooter);
    const offsets = pelletAimOffsets(pellets, cone);

    // Accumulate damage per monster across pellets.
    const dmgById = new Map<string, { mon: MonsterSim; dmg: number }>();
    for (const off of offsets) {
      let best: MonsterSim | null = null;
      let bestDist = range;
      for (const mon of this.monsters) {
        if (
          !isTargetHitByPellet(shooter, mon, range, cone, off.yaw, off.pitch, {
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
      if (!best) continue;
      const shotDamage = isBerserkActive(shooter, Date.now()) ? berserkDamage : damage;
      const prev = dmgById.get(best.id);
      if (prev) prev.dmg += shotDamage;
      else dmgById.set(best.id, { mon: best, dmg: shotDamage });
    }

    for (const { mon, dmg } of dmgById.values()) {
      mon.hp -= dmg;
      this.sendHitFx(shooterSessionId, dmg, mon.x, mon.y, (mon.z ?? 0) + 1.4, 'monster');
      if (mon.hp <= 0) {
        this.killMonster(mon.id, shooterSessionId);
      }
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
        shooter.killStreak += 1;
        shooter.score = shooter.kills;
        shooter.credits = (shooter.credits || 0) + this.creditsPerKill;
      }
    }
  }

  private damagePlayer(player: PlayerState, amount: number) {
    if (isBerserkActive(player, Date.now())) {
      return;
    }
    let dmg = amount;
    if (player.shieldHp > 0) {
      const absorbed = Math.min(player.shieldHp, dmg);
      player.shieldHp -= absorbed;
      dmg -= absorbed;
    }
    if (dmg <= 0) return;
    const wasAlive = player.isAlive && player.health > 0;
    player.health = Math.max(0, player.health - dmg);
    if (player.health <= 0) {
      player.isAlive = false;
      if (wasAlive) {
        player.deaths = (player.deaths || 0) + 1;
        player.killStreak = 0;
      }
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
    this.clearMonsters();
    // No reportRewards() — admin-cancelled, not a real conclusion.
  }

  public adminBroadcastMessage(text: string): void {
    this.state.adminMessage = text;
    this.state.adminMessageSeq += 1;
  }

  /** Steam64 ID for a connected session — never synced via schema, see
   * steamIdBySession's declaration. Empty string if unknown/disconnected. */
  public adminGetPlayerSteamId(sessionId: string): string {
    return this.steamIdBySession.get(sessionId) ?? '';
  }

  /** Same kick used by the in-room X-panel's adminKick message, also callable
   * from the website's Live Matches panel with no in-room admin client
   * required. Returns false if the target isn't connected. */
  public adminKickPlayer(targetSessionId: string): boolean {
    const target = this.clients.getById(targetSessionId);
    if (!target) return false;
    target.leave(4000, 'kicked_by_admin');
    return true;
  }

  public adminMutePlayer(targetSessionId: string, minutes = 5): boolean {
    if (!this.state.players.has(targetSessionId)) return false;
    const clamped = Math.min(120, Math.max(1, Math.floor(minutes)));
    this.mutedUntil.set(targetSessionId, Date.now() + clamped * 60_000);
    return true;
  }

  public async adminBanPlayer(
    targetSessionId: string,
    actor: { userId: string; username: string },
    reason?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const target = this.state.players.get(targetSessionId);
    if (!target) return { ok: false, error: 'Player not found in this match' };
    const result = await reportAdminBan({
      actorUserId: actor.userId,
      actorUsername: actor.username,
      targetUserId: target.userId,
      mode: 'horde',
      detail: reason,
    });
    if (result.ok) {
      this.clients.getById(targetSessionId)?.leave(4001, 'banned_by_admin');
    }
    return result;
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

  private handleTimeoutCommand(player: PlayerState): void {
    if (this.state.phase !== 'playing' || this.state.adminPaused) return;
    if (this.squadTimeoutsUsed >= MAX_SQUAD_TIMEOUTS) {
      this.systemMessage('The squad has no timeouts left.');
      return;
    }
    this.squadTimeoutsUsed += 1;
    this.state.adminPaused = true;
    this.squadTimeoutResumeAt = Date.now() + TIMEOUT_DURATION_MS;
    const remaining = MAX_SQUAD_TIMEOUTS - this.squadTimeoutsUsed;
    this.systemMessage(
      `${player.username} called a timeout (${remaining} left). Match paused for 60s.`
    );
  }

  private handleSurrenderCommand(player: PlayerState): void {
    if (this.state.phase !== 'playing') return;
    if (this.surrenderVote) {
      this.systemMessage('A surrender vote is already in progress.');
      return;
    }
    const memberCount = this.state.players.size;
    this.surrenderVote = { yes: new Set([player.sessionId]), no: new Set(), startedAt: Date.now() };
    this.systemMessage(
      `${player.username} called for a surrender vote! Type @yes or @no — needs a majority of ${memberCount}.`
    );
    this.checkSurrenderVote();
  }

  private handleVoteCommand(player: PlayerState, yes: boolean): void {
    if (!this.surrenderVote) return;
    this.surrenderVote.yes.delete(player.sessionId);
    this.surrenderVote.no.delete(player.sessionId);
    (yes ? this.surrenderVote.yes : this.surrenderVote.no).add(player.sessionId);
    this.checkSurrenderVote();
  }

  private checkSurrenderVote(): void {
    const vote = this.surrenderVote;
    if (!vote) return;
    const memberIds = new Set(this.state.players.keys());
    const yesCount = Array.from(vote.yes).filter((id) => memberIds.has(id)).length;
    const noCount = Array.from(vote.no).filter((id) => memberIds.has(id)).length;
    const needed = Math.floor(memberIds.size / 2) + 1;

    if (yesCount >= needed) {
      this.surrenderVote = null;
      this.systemMessage('Surrender vote passed — the squad gave up.');
      // Real conclusion (unlike admin cancel) — endMatch's existing
      // reportRewards() still runs, granting the normal "loss" rewards.
      this.endMatch('horde');
      return;
    }
    if (noCount >= needed) {
      this.surrenderVote = null;
      this.systemMessage('Surrender vote failed.');
    }
  }

  private endMatch(winnerRole: 'survivor' | 'horde') {
    if (this.state.phase === 'results') return;
    this.state.phase = 'results';
    this.state.winnerRole = winnerRole;
    this.resultsElapsedMs = 0;
    this.clearMonsters();
    void this.reportRewards(winnerRole);
  }

  protected async reportRewards(winnerRole: 'survivor' | 'horde') {
    const matchId = this.state.matchId || `${this.roomId}-${Date.now()}`;
    this.state.matchId = matchId;
    const survived = winnerRole === 'survivor';
    const wavesCleared = Math.max(0, this.state.wave - (survived ? 0 : 1));

    const players = Array.from(this.state.players.values()).map((p) => ({
      userId: p.userId,
      role: p.role,
      isAlive: p.isAlive,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      wavesCleared,
    }));

    const awards = await reportMatchResults({
      matchId,
      mode: 'horde',
      pluginMode: publishedMapModeKey(this.roomName),
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
