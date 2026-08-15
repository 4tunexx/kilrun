/**
 * Single source of truth for Foundry-style platformer tunables.
 * Imported by Colyseus (`server/src/sim/constants.ts`) and Play Test
 * (`src/lib/platformer-sim.ts`) so client/server feel cannot drift.
 */

export const TICK_RATE_HZ = 30;
export const TICK_DT_MS = 1000 / TICK_RATE_HZ;

/** Horizontal capsule radius — match visual CapsuleGeometry(0.35). */
export const PLAYER_RADIUS = 0.35;
/** Match visual avatar height (~1.8) with a slightly shorter collision capsule. */
export const PLAYER_HEIGHT = 1.7;

export const MAX_GROUND_SPEED = 5;
export const SPRINT_MULTIPLIER = 1.35;
export const GROUND_ACCEL = 80;
export const GROUND_FRICTION = 24;
export const AIR_ACCEL = 80;
export const AIR_CONTROL = 1;
export const MAX_AIR_SPEED_MULT = 1;
export const CROUCH_SPEED_MULTIPLIER = 0.55;

export const GRAVITY = 20;
export const APEX_GRAVITY_MULT = 1;
export const APEX_VZ_THRESHOLD = 0;
export const JUMP_VELOCITY = 10;
export const DOUBLE_JUMP_MOD = 1.25;
export const DOUBLE_JUMP_VELOCITY = JUMP_VELOCITY / DOUBLE_JUMP_MOD;
export const JUMP_CUT_MULTIPLIER = 0.5;
export const COYOTE_TIME_MS = 1000 / 6;
export const JUMP_BUFFER_MS = 200;
export const MAX_FALL_SPEED = 40;
export const LAND_SNAP_SLOW = 0.4;
export const LAND_SNAP_FAST = 0.7;
/** Soft vertical glue while grounded (m/s) — stepped ramps stay smooth. */
export const GROUND_FOLLOW_SPEED = 7;
export const LAND_STEP_CLIMB = 0.75;
export const LAND_STEP_DESCEND = 0.9;
// Forgives a tiny accidental overshoot off a platform edge without
// blocking deliberate walking/jumping off. 0.55 (half a meter) made edges
// nearly impossible to step off intentionally — you had to push way past
// the visible mesh before the game admitted you were falling.
export const LEDGE_ASSIST = 0.12;
export const COLLISION_SKIN = 0.02;
export const VOID_Z = -4;

export const WALL_JUMP_ENABLED_DEFAULT = false;
export const WALL_JUMP_HORIZ_VEL = 5;
export const WALL_JUMP_VERT_VEL = 9;
export const WALL_SLIDE_GRAV_MULT = 0.35;
export const WALL_JUMP_LOCKOUT_MS = 180;
export const WALL_JUMP_SAME_WALL_COOLDOWN_MS = 300;

export const MAX_ENERGY = 100;
export const ENERGY_DRAIN_RATE = 28;
export const ENERGY_REGEN_RATE = 18;
export const ENERGY_EXHAUSTED_THRESHOLD = 50;
export const ENERGY_EXHAUSTED_SPEED_MULT = 0.72;
export const JUMP_ENERGY_COST = 4;
/** Flat cost taken once when a slide successfully starts (on top of the
 * ongoing sprint drain already running while sliding). */
export const SLIDE_ENERGY_COST = 12;
export const FLIP_ENERGY_COST = 20;
export const FLIP_DURATION_MS = 700;
export const FLIP_COOLDOWN_MS = 1500;
/** Small vertical hop so a grounded flip reads as an actual jump-flip, not a
 * feet-planted animation. ~55% of a normal jump. */
export const FLIP_VELOCITY = JUMP_VELOCITY * 0.55;

export const JUMP_PAD_BOOST = 14;

export const HITSCAN_RANGE = 14;
export const HITSCAN_DAMAGE = 25;
export const SHOOT_COOLDOWN_MS = 350;
export const MELEE_MOVE_MULT = 0.5;
export const MELEE_DURATION_MS = 500;
