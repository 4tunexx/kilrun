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
import {
  applyPlatformCarry,
  tickMovingPlatforms,
  type PlatformDelta,
  type PlatformMotionState,
} from '../sim/moving-platforms.js';
import { isPlayerHitByObstacle } from '../sim/collision.js';
import { applyLoadoutToPlayer } from '../sim/loadout.js';
import {
  effectiveWeaponCone,
  isTargetHitByPellet,
  pelletAimOffsets,
  weaponPelletCount,
  weaponPelletDamage,
} from '../sim/weapon-combat.js';
import { fetchTrustedLoadout } from '../trusted-loadout.js';
import { applyAbilityStatsToPlayer, getMaxHealth, getMaxEnergyFor } from '../sim/ability-stats.js';
    this.onMessage('activateAbility', (client, payload: { ability?: string } | undefined) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const now = Date.now();
      if (!activateAbility(player, payload?.ability, now)) return;
      if (payload?.ability === 'thunder') {
        let thunderLevel = 0;
        try {
          thunderLevel = JSON.parse(player.abilityLevelsJson || '{}').thunder ?? 0;
        } catch {
          thunderLevel = 0;
        }
        const stats = getThunderStats(thunderLevel);
        const radius = stats.radiusMeters || 0;
        const damage = stats.damage || 0;
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
          wallJumpEnabled: typeof cs.wallJumpEnabled === 'boolean' ? cs.wallJumpEnabled : undefined,
          wallJumpHorizVel: typeof cs.wallJumpHorizVel === 'number' ? cs.wallJumpHorizVel : undefined,
          wallJumpVertVel: typeof cs.wallJumpVertVel === 'number' ? cs.wallJumpVertVel : undefined,
          wallSlideGravMult: typeof cs.wallSlideGravMult === 'number' ? cs.wallSlideGravMult : undefined,
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

    void fetchActiveMapPayload('horde').then((active) => {
      if (!active || this.customMapLoaded) return;
      const pads = active.payload.platforms as PlatformBlueprint[] | undefined;
      if (!Array.isArray(pads) || pads.length === 0) return;
      const data = active.payload;
      while (this.state.platforms.length > 0) this.state.platforms.pop();
      this.state.platforms.push(...createFromBlueprints(pads));
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
        this.monsterSpawnPoints = data.monsterSpawns as typeof this.monsterSpawnPoints;
      }
      this.healthFloors = Array.isArray(data.healthFloors)
        ? (data.healthFloors as typeof this.healthFloors)
        : [];
      this.redZones = Array.isArray(data.redZones) ? (data.redZones as typeof this.redZones) : [];
      this.revivePads = Array.isArray(data.revivePads)
        ? (data.revivePads as typeof this.revivePads)
        : [];
      if (data.worldBounds) {
        this.worldBounds = { ...(data.worldBounds as typeof this.worldBounds) };
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
          wallJumpEnabled: typeof cs.wallJumpEnabled === 'boolean' ? cs.wallJumpEnabled : undefined,
          wallJumpHorizVel: typeof cs.wallJumpHorizVel === 'number' ? cs.wallJumpHorizVel : undefined,
          wallJumpVertVel: typeof cs.wallJumpVertVel === 'number' ? cs.wallJumpVertVel : undefined,
          wallSlideGravMult:
            typeof cs.wallSlideGravMult === 'number' ? cs.wallSlideGravMult : undefined,
        };
      }
      this.customMapLoaded = true;
      Array.from(this.state.players.values()).forEach((player, index) => {
        this.applySpawnPosition(player, index);
        player.vz = 0;
      });
      console.log(`[HordeRoom] MAIN map loaded from server (${active.name}): ${pads.length} pads`);
    });

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
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
    player.role = 'survivor';
    player.kp = claims.kp;
    const trusted = await fetchTrustedLoadout(player.userId);
    applyLoadoutToPlayer(player, trusted ?? options);
    applyAbilityStatsToPlayer(player, trusted?.abilityStatBonuses);
      tickActiveAbilityTimers(player, now);
      applyMovement(player, input, dtSeconds, this.state.platforms, scratch, this.worldBounds, this.combatPhysOpts);
      {
        const { finishReloadIfDue } = require('../sim/loadout.js') as typeof import('../sim/loadout.js');
        finishReloadIfDue(player, now);
      }

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
          const {
            tryConsumeShotAmmo,
          } = require('../sim/loadout.js') as typeof import('../sim/loadout.js');
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
    for (const player of this.state.players.values()) {
      if (!player.isAlive) {
        // Revive pad: standing teammate not required for MVP — auto revive if body on pad
        for (const pad of this.revivePads) {
          if (this.isOnPad(player, pad)) {
            player.health = Math.min(getMaxHealth(player), 60);
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
        player.health = Math.min(getMaxHealth(player), player.health + (floor.healPerTick ?? 8));
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
      const shotDamage = isBerserkActive(shooter, Date.now()) ? berserkDamage : damage;
      const prev = dmgById.get(best.id);
      if (prev) prev.dmg += shotDamage;
      else dmgById.set(best.id, { mon: best, dmg: shotDamage });
    }

    for (const { mon, dmg } of dmgById.values()) {
      mon.hp -= dmg;
      if (mon.hp <= 0) {
        this.killMonster(mon.id, shooterSessionId);
      }
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
      if (wasAlive) player.deaths = (player.deaths || 0) + 1;
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
      deaths: p.deaths,
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
