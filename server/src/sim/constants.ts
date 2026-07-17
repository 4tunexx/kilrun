/** Shared tuning values for the authoritative simulation. Keep every magic number here. */

export const TICK_RATE_HZ = 20;
export const TICK_DT_MS = 1000 / TICK_RATE_HZ;

export const MIN_PLAYERS_TO_START = 1;
export const LOBBY_COUNTDOWN_MS = 5000;
export const MATCH_DURATION_MS = 120_000;

export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 12;
export const FINISH_X = WORLD_WIDTH - 2;
export const SPAWN_X = 2;

export const PLAYER_RADIUS = 0.45;
export const RUNNER_MOVE_SPEED = 4.2; // world units / second
export const TRAPPER_MOVE_SPEED = 3.6;
export const CROUCH_SPEED_MULTIPLIER = 0.5;

export const OBSTACLE_DAMAGE = 40;
export const OBSTACLE_HIT_COOLDOWN_MS = 600;

export const HITSCAN_RANGE = 14;
export const HITSCAN_DAMAGE = 25;
export const SHOOT_COOLDOWN_MS = 350;
