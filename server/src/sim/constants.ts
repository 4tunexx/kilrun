/** Shared tuning values for the authoritative simulation. Keep every magic number here.
 *  Mirror horizontal / jump feel in `src/lib/platformer-sim.ts` (Play Test).
 *
 *  Movement feel ported from The Foundry (Godot) Prototype/Scripts/Player.gd:
 *  speed 5, gravity 20, jump 10, double jump 10/1.25, coyote 1/6s, buffer 0.2s,
 *  jump-cut ×0.5 on first jump only. Horizontal velocity is set directly (no Quake accel).
 */

export const TICK_RATE_HZ = 30;
export const TICK_DT_MS = 1000 / TICK_RATE_HZ;

export const MIN_PLAYERS_TO_START = 1;
/** Horde auto-starts when this many players are connected (admin can force sooner). */
export const HORDE_MIN_PLAYERS_TO_START = 4;
/** Competitive auto-starts when this many players are connected (admin can force sooner). */
export const COMPETITIVE_MIN_PLAYERS_TO_START = 2;
export const LOBBY_COUNTDOWN_MS = 5000;
export const MATCH_DURATION_MS = 180_000;

/** Track length (forward / depth axis). */
export const WORLD_WIDTH = 48;
/** Track width (lateral axis). */
export const WORLD_HEIGHT = 10;
export const FINISH_X = WORLD_WIDTH - 2;
export const SPAWN_X = 2;
export const SPAWN_Z = 0;

/** Horizontal capsule radius — match visual CapsuleGeometry(0.35) / Play Test sim. */
export const PLAYER_RADIUS = 0.35;
/** Match visual avatar height (~1.8) with a slightly shorter collision capsule. */
export const PLAYER_HEIGHT = 1.7;

/**
 * Foundry CharacterBody3D — direct wish * speed each frame (ground + air).
 * Sprint / crouch are Kilrun extras on top of base speed.
 */
export const MAX_GROUND_SPEED = 5;
export const SPRINT_MULTIPLIER = 1.35;
/** Unused by Foundry-style direct velocity; kept for ice conveyor blending. */
export const GROUND_ACCEL = 80;
export const GROUND_FRICTION = 24;
export const AIR_ACCEL = 80;
export const AIR_CONTROL = 1;
export const MAX_AIR_SPEED_MULT = 1;
export const CROUCH_SPEED_MULTIPLIER = 0.55;

/** Foundry: gravity 20, jump 10, double = jump / 1.25, cut ×0.5 on first jump. */
export const GRAVITY = 20;
/** Foundry has constant gravity (no apex hang). */
export const APEX_GRAVITY_MULT = 1;
export const APEX_VZ_THRESHOLD = 0;
export const JUMP_VELOCITY = 10;
/** Double jump impulse = JUMP_VELOCITY / DOUBLE_JUMP_MOD (Foundry double_jump_mod). */
export const DOUBLE_JUMP_MOD = 1.25;
export const DOUBLE_JUMP_VELOCITY = JUMP_VELOCITY / DOUBLE_JUMP_MOD;
/** Multiply ascending vz when jump is released (first jump only). */
export const JUMP_CUT_MULTIPLIER = 0.5;
/** coyote_time = 1/6 s */
export const COYOTE_TIME_MS = 1000 / 6;
/** jump_buffer_time = 0.2 s */
export const JUMP_BUFFER_MS = 200;
export const MAX_FALL_SPEED = 40;
export const LAND_SNAP_SLOW = 0.4;
export const LAND_SNAP_FAST = 0.7;
/** How far past a pad rim (beyond capsule) we still pull the player back on. */
export const LEDGE_ASSIST = 0.55;
/** Skin width for solid AABB push-out. */
export const COLLISION_SKIN = 0.02;
/** Below this height the runner falls into the void and is eliminated. */
export const VOID_Z = -4;

export const MAX_ENERGY = 100;
export const ENERGY_DRAIN_RATE = 28;
export const ENERGY_REGEN_RATE = 18;
export const ENERGY_EXHAUSTED_THRESHOLD = 50;
export const ENERGY_EXHAUSTED_SPEED_MULT = 0.72;
export const JUMP_ENERGY_COST = 4;

export const RUNNER_MOVE_SPEED = MAX_GROUND_SPEED;
export const TRAPPER_MOVE_SPEED = MAX_GROUND_SPEED * 0.92;

export const OBSTACLE_DAMAGE = 40;
export const OBSTACLE_HIT_COOLDOWN_MS = 600;
/** Default vertical launch when landing on a jumpPad with boost=0. */
export const JUMP_PAD_BOOST = 14;

/** Hitscan / melee aim from screen center (Foundry Camera.get_aim_point). */
export const HITSCAN_RANGE = 14;
export const HITSCAN_DAMAGE = 25;
export const SHOOT_COOLDOWN_MS = 350;
/** Foundry MeleeDurationTimer ≈ 0.5s; melee slows move to 0.5× while active. */
export const MELEE_MOVE_MULT = 0.5;
export const MELEE_DURATION_MS = 500;
