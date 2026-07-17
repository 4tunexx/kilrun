import { PlayerState } from '../schema/RoomState.js';
import {
  CROUCH_SPEED_MULTIPLIER,
  PLAYER_RADIUS,
  RUNNER_MOVE_SPEED,
  TRAPPER_MOVE_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants.js';

export interface PlayerInput {
  moveX: number; // -1..1, already camera-relative from the client
  moveY: number; // -1..1
  aimAngle: number; // radians
  crouch: boolean;
  shootPressed: boolean;
  interactPressed: boolean;
}

const EMPTY_INPUT: PlayerInput = {
  moveX: 0,
  moveY: 0,
  aimAngle: 0,
  crouch: false,
  shootPressed: false,
  interactPressed: false,
};

export function defaultInput(): PlayerInput {
  return { ...EMPTY_INPUT };
}

/** Server-authoritative movement integration -- the client's `moveX/moveY` is only ever treated as intent. */
export function applyMovement(player: PlayerState, input: PlayerInput, dtSeconds: number): void {
  if (!player.isAlive || player.hasFinished) return;

  const magnitude = Math.hypot(input.moveX, input.moveY);
  const normalizedX = magnitude > 1 ? input.moveX / magnitude : input.moveX;
  const normalizedY = magnitude > 1 ? input.moveY / magnitude : input.moveY;

  const baseSpeed = player.role === 'trapper' ? TRAPPER_MOVE_SPEED : RUNNER_MOVE_SPEED;
  const speed = input.crouch ? baseSpeed * CROUCH_SPEED_MULTIPLIER : baseSpeed;

  player.x = clamp(player.x + normalizedX * speed * dtSeconds, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(player.y + normalizedY * speed * dtSeconds, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
  player.aimAngle = input.aimAngle;
  player.isCrouching = input.crouch;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
