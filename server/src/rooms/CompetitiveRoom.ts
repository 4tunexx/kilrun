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
          this.maxClients = this.maxPlayersPerTeam * 2;
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

    void fetchActiveMapPayload('competitive').then((active) => {
      if (!active || this.customMapLoaded) return;
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

    this.setSimulationInterval(() => this.update(TICK_DT_MS), TICK_DT_MS);
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

    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    if (claims.isAdmin) this.adminSessions.add(client.sessionId);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.userId = claims.userId || client.sessionId;
    player.username =
      claims.username || `Player${client.sessionId.slice(0, 4)}`;
    player.avatarUrl = claims.avatarUrl || '';
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
      const shotDamage = isBerserkActive(shooter, Date.now()) ? berserkDamage : damage;
      const prev = dmgById.get(closest.sessionId);
      if (prev) prev.dmg += shotDamage;
      else dmgById.set(closest.sessionId, { target: closest, dmg: shotDamage });
    }

    for (const { target, dmg } of dmgById.values()) {
      this.damagePlayer(target, dmg, shooter);
    }
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
      if (wasAlive) player.deaths = (player.deaths || 0) + 1;
      if (this.respawnInRound) {
        // Respawn: send back to spawn point at full health after a brief moment.
        player.health = getMaxHealth(player);
        this.applyTeamSpawn(player);
        if (wasAlive && shooter && shooter.sessionId !== player.sessionId) {
          shooter.kills += 1;
          shooter.score = shooter.kills;
          shooter.credits = (shooter.credits || 0) + this.creditsPerKill;
        }
      } else {
        player.isAlive = false;
        if (wasAlive && shooter && shooter.sessionId !== player.sessionId) {
          shooter.kills += 1;
          shooter.score = shooter.kills;
          shooter.credits = (shooter.credits || 0) + this.creditsPerKill;
        }
      }
    }
  }
}
