/** Shared tuning values for the authoritative simulation. Keep every magic number here.
 *  Mirror horizontal / jump feel in `src/lib/platformer-sim.ts` (Play Test).
 */

export const TICK_RATE_HZ = 30;
export const TICK_DT_MS = 1000 / TICK_RATE_HZ;

export const MIN_PLAYERS_TO_START = 1;
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

export const PLAYER_RADIUS = 0.4;
/** Match visual avatar height (~1.8) with a slightly shorter collision capsule. */
export const PLAYER_HEIGHT = 1.7;

/** Quake / modern platformer horizontal movement (world units / second). */
export const MAX_GROUND_SPEED = 6.8;
export const SPRINT_MULTIPLIER = 1.42;
export const GROUND_ACCEL = 40;
export const GROUND_FRICTION = 18;
export const AIR_ACCEL = 14;
export const AIR_CONTROL = 0.88;
export const MAX_AIR_SPEED_MULT = 1.12;
export const CROUCH_SPEED_MULTIPLIER = 0.55;

/** Vertical platformer feel — Mario/Celeste-inspired coyote + apex hang. */
export const GRAVITY = 32;
/** Soften gravity near jump apex for floaty, readable arcs. */
export const APEX_GRAVITY_MULT = 0.52;
export const APEX_VZ_THRESHOLD = 2.2;
export const JUMP_VELOCITY = 10.4;
/** Multiply ascending vz when jump is released (variable jump height). */
export const JUMP_CUT_MULTIPLIER = 0.4;
export const COYOTE_TIME_MS = 125;
export const JUMP_BUFFER_MS = 150;
export const MAX_FALL_SPEED = 26;
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
export const JUMP_ENERGY_COST = 5;

export const RUNNER_MOVE_SPEED = MAX_GROUND_SPEED;
export const TRAPPER_MOVE_SPEED = MAX_GROUND_SPEED * 0.92;

export const OBSTACLE_DAMAGE = 40;
export const OBSTACLE_HIT_COOLDOWN_MS = 600;
/** Default vertical launch when landing on a jumpPad with boost=0. */
export const JUMP_PAD_BOOST = 14;

export const HITSCAN_RANGE = 14;
export const HITSCAN_DAMAGE = 25;
export const SHOOT_COOLDOWN_MS = 350;
